import * as admin from 'firebase-admin';
import { google, Auth } from 'googleapis';
import { CloudTasksClient } from '@google-cloud/tasks';
import { FieldValue } from 'firebase-admin/firestore';
import { processFile } from './fileProcessor';

export async function initializeImport(
  galleryId: string,
  classroomId: string,
  assignmentId: string,
  userEmail: string,
  auth: Auth.OAuth2Client | Auth.GoogleAuth,
  tasksClient: CloudTasksClient
): Promise<string> {
  const db = admin.firestore();

  // インポートジョブを作成
  const importJobRef = db.collection('importJobs').doc();
  const importJob = {
    id: importJobRef.id,
    galleryId,
    classroomId,
    assignmentId,
    status: 'pending',
    progress: 0,
    totalFiles: 0,
    processedFiles: 0,
    errorFiles: [],
    createdBy: userEmail,
    createdAt: FieldValue.serverTimestamp(),
  };

  await importJobRef.set(importJob);

  // バックグラウンドで提出物の取得とタスクキューへの投入を開始
  try {
    await importJobRef.update({ status: 'processing' });

    const classroom = google.classroom({ version: 'v1', auth });

    // 課題の提出物を取得
    const submissionsResponse = await classroom.courses.courseWork.studentSubmissions.list({
      courseId: classroomId,
      courseWorkId: assignmentId,
      states: ['TURNED_IN', 'RETURNED'],
    });

    const submissions = submissionsResponse.data.studentSubmissions || [];

    // デバッグ: submissions 全体をログ出力
    console.log(`📊 Total submissions count: ${submissions.length}`);
    if (submissions.length > 0) {
      console.log('=== FIRST SUBMISSION OBJECT ===');
      console.log(JSON.stringify(submissions[0], null, 2));
      console.log('================================');
    } else {
      console.log('⚠️ No submissions found');
      console.log('Response:', JSON.stringify(submissionsResponse.data, null, 2));
    }

    let totalFiles = 0;
    const tasks: Array<{
      tempFilePath: string;
      fileName: string;
      fileType: string;
      studentName: string;
      studentEmail: string;
      originalFileUrl: string;
      submittedAt: string;
      isLate: boolean;
    }> = [];

    // 各提出物からファイル情報を収集
    for (const submission of submissions) {
      // デバッグ: submission オブジェクト全体をログ出力
      console.log('=== SUBMISSION OBJECT ===');
      console.log(JSON.stringify(submission, null, 2));
      console.log('========================');

      if (!submission.assignmentSubmission?.attachments) continue;

      // 学生情報を取得
      let studentName = 'Unknown Student';
      let studentEmail = '';
      if (submission.userId) {
        try {
          const userProfile = await classroom.userProfiles.get({ userId: submission.userId });
          if (userProfile.data) {
            studentName = userProfile.data.name?.fullName || submission.userId;
            studentEmail = userProfile.data.emailAddress || '';
          }
        } catch (error) {
          console.warn(`Failed to fetch user profile for ${submission.userId}:`, error);
          studentName = submission.userId || 'Unknown Student';
        }
      }

      // 提出日時を取得（updateTimeまたはcreationTime）
      const submittedAt = submission.updateTime || submission.creationTime || new Date().toISOString();

      // 遅延提出かどうかを取得
      const isLate = submission.late || false;

      // 各添付ファイルを処理対象に追加
      for (const attachment of submission.assignmentSubmission.attachments) {
        if (!attachment.driveFile?.id) continue;

        const drive = google.drive({ version: 'v3', auth });
        const fileMetadata = await drive.files.get({
          fileId: attachment.driveFile.id,
          fields: 'id,name,mimeType,webViewLink',
        });

        const file = fileMetadata.data;
        if (!file.id || !file.name || !file.mimeType) continue;

        const fileType = file.mimeType.startsWith('image/') ? 'image' :
                        file.mimeType === 'application/pdf' ? 'pdf' : null;

        if (!fileType) {
          console.log(`Skipping unsupported file type: ${file.mimeType}`);
          continue;
        }

        try {
          const fileResponse = await drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'arraybuffer' }
          );
          const fileBuffer = Buffer.from(fileResponse.data as ArrayBuffer);

          const bucket = admin.storage().bucket();
          const tempFilePath = `unprocessed/${importJobRef.id}/${file.id}-${file.name}`;
          const tempFile = bucket.file(tempFilePath);
          await tempFile.save(fileBuffer, { contentType: file.mimeType });

          tasks.push({
            tempFilePath,
            fileName: file.name,
            fileType,
            studentName,
            studentEmail,
            originalFileUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
            submittedAt,
            isLate,
          });

          totalFiles++;

        } catch (err) {
          console.error(`Failed to download file ${file.name} from Drive:`, err);
          await importJobRef.update({
            errorFiles: FieldValue.arrayUnion(file.id),
          });
        }
      }
    }

    await importJobRef.update({ totalFiles, progress: 5 });

    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

    if (isEmulator) {
      console.log(`🔧 Emulator mode: Processing ${tasks.length} files directly`);
      for (const task of tasks) {
        try {
          await processFile(
            importJobRef.id,
            task.tempFilePath,
            task.fileName,
            task.fileType,
            task.studentName,
            task.studentEmail,
            galleryId,
            task.originalFileUrl,
            task.submittedAt,
            task.isLate
          );
        } catch (error) {
          console.error(`❌ Failed to process file ${task.fileName}:`, error);
          await importJobRef.update({
            errorFiles: FieldValue.arrayUnion(task.tempFilePath),
          });
        }
      }
      await checkImportCompletion(importJobRef.id);
    } else {
      const projectId = JSON.parse(process.env.FIREBASE_CONFIG!).projectId;
      const region = 'asia-northeast1';
      const queueName = 'file-processing-queue';
      const parent = tasksClient.queuePath(projectId, region, queueName);

      const taskPromises = tasks.map(async (task, index) => {
        const payload = {
          importJobId: importJobRef.id,
          tempFilePath: task.tempFilePath,
          fileName: task.fileName,
          fileType: task.fileType,
          studentName: task.studentName,
          studentEmail: task.studentEmail,
          galleryId,
          originalFileUrl: task.originalFileUrl,
          submittedAt: task.submittedAt,
          isLate: task.isLate,
        };

        const serviceAccountEmail = '816131605069-compute@developer.gserviceaccount.com';

        // Cloud Run URLを環境変数から取得、なければCloud Functionsのデフォルトを使用
        const processFileTaskUrl = process.env.PROCESS_FILE_TASK_URL ||
          `https://${region}-${projectId}.cloudfunctions.net/processFileTask`;

        const request = {
          parent,
          task: {
            httpRequest: {
              httpMethod: 'POST' as const,
              url: processFileTaskUrl,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(JSON.stringify(payload)),
              oidcToken: { serviceAccountEmail },
            },
            scheduleTime: { seconds: Math.floor(Date.now() / 1000) + 10 + (index * 2) },
          },
        };

        try {
          await tasksClient.createTask(request);
        } catch (error) {
          console.error(`Failed to create task for file ${task.fileName}:`, error);
          await importJobRef.update({
            errorFiles: FieldValue.arrayUnion(task.tempFilePath),
          });
        }
      });

      await Promise.all(taskPromises);
      console.log(`Created ${tasks.length} processing tasks for import job ${importJobRef.id}`);
    }

    await importJobRef.update({ progress: 10 });

  } catch (error) {
    console.error('Import initialization error:', error);
    await importJobRef.update({
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error during initialization',
      completedAt: FieldValue.serverTimestamp(),
    });
    throw error;
  }

  return importJobRef.id;
}

export async function checkImportCompletion(importJobId: string): Promise<void> {
  const db = admin.firestore();
  const importJobRef = db.collection('importJobs').doc(importJobId);

  try {
    const importJobDoc = await importJobRef.get();
    if (!importJobDoc.exists) throw new Error('Import job not found');

    const importJob = importJobDoc.data()!;
    if (importJob.status === 'completed' || importJob.status === 'error') return;

    const { totalFiles, processedFiles, errorFiles } = importJob;
    const completedFiles = processedFiles + (errorFiles?.length || 0);

    if (completedFiles >= totalFiles) {
      await importJobRef.update({
        status: 'completed',
        progress: 100,
        completedAt: FieldValue.serverTimestamp(),
      });
      console.log(`Import job ${importJobId} completed: ${processedFiles}/${totalFiles} files processed successfully`);
      await finalizeGallery(importJob.galleryId, importJobId);
    } else {
      const progress = Math.min(95, Math.floor((completedFiles / totalFiles) * 85) + 10);
      await importJobRef.update({ progress });
    }
  } catch (error) {
    console.error('Error checking import completion:', error);
  }
}

async function finalizeGallery(galleryId: string, importJobId: string): Promise<void> {
  const db = admin.firestore();
  try {
    const artworksSnapshot = await db.collection('artworks').where('importedBy', '==', importJobId).get();
    const artworkIds = artworksSnapshot.docs.map(doc => doc.id);

    if (artworkIds.length > 0) {
      await db.collection('galleries').doc(galleryId).update({
        artworks: FieldValue.arrayUnion(...artworkIds),
        updatedAt: FieldValue.serverTimestamp(),
        lastImportAt: FieldValue.serverTimestamp(),
      });
      console.log(`Gallery ${galleryId} finalized with ${artworkIds.length} artworks`);
    } else {
      console.log(`Gallery ${galleryId} has no artworks to add (all files failed)`);
      await db.collection('galleries').doc(galleryId).update({
        updatedAt: FieldValue.serverTimestamp(),
        lastImportAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('Error finalizing gallery:', error);
  }
}