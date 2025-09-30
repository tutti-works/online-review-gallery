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
    // Google Classroom API の正しい状態値:
    // TURNED_IN: 提出済み
    // RETURNED: 返却済み
    const submissionsResponse = await classroom.courses.courseWork.studentSubmissions.list({
      courseId: classroomId,
      courseWorkId: assignmentId,
      states: ['TURNED_IN', 'RETURNED'],
    });

    const submissions = submissionsResponse.data.studentSubmissions || [];
    let totalFiles = 0;
    const tasks: Array<{
      fileId: string;
      fileName: string;
      fileType: string;
      studentName: string;
      studentEmail: string;
    }> = [];

    // 各提出物からファイル情報を収集
    for (const submission of submissions) {
      if (!submission.assignmentSubmission?.attachments) continue;

      // 学生情報を取得（userProfiles APIを使用）
      let studentName = 'Unknown Student';
      let studentEmail = '';

      try {
        if (submission.userId) {
          const userProfile = await classroom.userProfiles.get({
            userId: submission.userId,
          });

          if (userProfile.data) {
            studentName = userProfile.data.name?.fullName || submission.userId;
            studentEmail = userProfile.data.emailAddress || '';
          }
        }
      } catch (error) {
        // userProfiles.getが失敗した場合は、userIdをそのまま使用
        console.warn(`Failed to fetch user profile for ${submission.userId}:`, error);
        studentName = submission.userId || 'Unknown Student';
        studentEmail = submission.userId || '';
      }

      // 各添付ファイルを処理対象に追加
      for (const attachment of submission.assignmentSubmission.attachments) {
        if (!attachment.driveFile?.id) continue;

        const drive = google.drive({ version: 'v3', auth });
        const fileMetadata = await drive.files.get({
          fileId: attachment.driveFile.id,
          fields: 'id,name,mimeType',
        });

        const file = fileMetadata.data;
        if (!file.name || !file.mimeType) continue;

        // ファイルタイプを判定
        const fileType = file.mimeType.startsWith('image/') ? 'image' :
                        file.mimeType === 'application/pdf' ? 'pdf' : null;

        if (!fileType) {
          console.log(`Skipping unsupported file type: ${file.mimeType}`);
          continue;
        }

        tasks.push({
          fileId: attachment.driveFile.id,
          fileName: file.name,
          fileType,
          studentName,
          studentEmail,
        });

        totalFiles++;
      }
    }

    // ファイル総数を更新
    await importJobRef.update({
      totalFiles,
      progress: 5,
    });

    // エミュレーター環境判定
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

    if (isEmulator) {
      // エミュレーター環境: 直接ファイル処理を実行（Cloud Tasks不使用）
      console.log(`🔧 Emulator mode: Processing ${tasks.length} files directly`);

      // 各ファイルを順次処理（本番環境のように並列処理はしない）
      for (const task of tasks) {
        try {
          console.log(`Processing file: ${task.fileName}`);
          await processFile(
            importJobRef.id,
            task.fileId,
            task.fileName,
            task.fileType,
            task.studentName,
            task.studentEmail,
            galleryId,
            auth
          );
          console.log(`✅ Successfully processed: ${task.fileName}`);
        } catch (error) {
          console.error(`❌ Failed to process file ${task.fileName}:`, error);
          await importJobRef.update({
            errorFiles: FieldValue.arrayUnion(task.fileId),
          });
        }
      }

      console.log(`Processed ${tasks.length} files in emulator mode`);

      // エミュレーター環境では手動で完了チェックを実行
      await checkImportCompletion(importJobRef.id);
    } else {
      // 本番環境: Cloud Tasksを使用
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
      const region = 'asia-northeast1';
      const queueName = 'file-processing-queue';

      const parent = tasksClient.queuePath(projectId!, region, queueName);

      // 各ファイルを個別のタスクとしてキューに投入
      const taskPromises = tasks.map(async (task, index) => {
        const payload = {
          importJobId: importJobRef.id,
          fileId: task.fileId,
          fileName: task.fileName,
          fileType: task.fileType,
          studentName: task.studentName,
          studentEmail: task.studentEmail,
          galleryId,
        };

        const request = {
          parent,
          task: {
            httpRequest: {
              httpMethod: 'POST' as const,
              url: `https://${region}-${projectId}.cloudfunctions.net/processFileTask`,
              headers: {
                'Content-Type': 'application/json',
              },
              body: Buffer.from(JSON.stringify(payload)),
            },
            scheduleTime: {
              seconds: Math.floor(Date.now() / 1000) + (index * 2),
            },
          },
        };

        try {
          await tasksClient.createTask(request);
          console.log(`Task created for file: ${task.fileName}`);
        } catch (error) {
          console.error(`Failed to create task for file ${task.fileName}:`, error);
          await importJobRef.update({
            errorFiles: FieldValue.arrayUnion(task.fileId),
          });
        }
      });

      await Promise.all(taskPromises);
      console.log(`Created ${tasks.length} processing tasks for import job ${importJobRef.id}`);
    }

    // 進捗を10%に更新（タスク投入完了）
    await importJobRef.update({
      progress: 10,
    });

  } catch (error) {
    console.error('Import initialization error:', error);

    // エラー状態に更新
    await importJobRef.update({
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error during initialization',
      completedAt: FieldValue.serverTimestamp(),
    });

    throw error;
  }

  return importJobRef.id;
}

// インポート完了チェック関数
export async function checkImportCompletion(importJobId: string): Promise<void> {
  const db = admin.firestore();
  const importJobRef = db.collection('importJobs').doc(importJobId);

  try {
    const importJobDoc = await importJobRef.get();
    if (!importJobDoc.exists) {
      throw new Error('Import job not found');
    }

    const importJob = importJobDoc.data()!;

    if (importJob.status === 'completed' || importJob.status === 'error') {
      return; // すでに完了
    }

    const { totalFiles, processedFiles, errorFiles } = importJob;
    const completedFiles = processedFiles + (errorFiles?.length || 0);

    if (completedFiles >= totalFiles) {
      // 全ファイル処理完了
      await importJobRef.update({
        status: 'completed',
        progress: 100,
        completedAt: FieldValue.serverTimestamp(),
      });

      console.log(`Import job ${importJobId} completed: ${processedFiles}/${totalFiles} files processed successfully`);

      // ギャラリーの最終更新を実行
      await finalizeGallery(importJob.galleryId, importJobId);
    } else {
      // 進捗を更新
      const progress = Math.min(95, Math.floor((completedFiles / totalFiles) * 85) + 10);
      await importJobRef.update({
        progress,
        processedFiles,
      });
    }

  } catch (error) {
    console.error('Error checking import completion:', error);
  }
}

// ギャラリー最終処理
async function finalizeGallery(galleryId: string, importJobId: string): Promise<void> {
  const db = admin.firestore();

  try {
    // インポートされた全アートワークを取得
    const artworksSnapshot = await db
      .collection('artworks')
      .where('importedBy', '==', importJobId)
      .get();

    const artworkIds = artworksSnapshot.docs.map(doc => doc.id);

    // ギャラリーにアートワークIDリストを更新
    await db.collection('galleries').doc(galleryId).update({
      artworks: artworkIds,
      updatedAt: FieldValue.serverTimestamp(),
      lastImportAt: FieldValue.serverTimestamp(),
    });

    console.log(`Gallery ${galleryId} finalized with ${artworkIds.length} artworks`);

  } catch (error) {
    console.error('Error finalizing gallery:', error);
  }
}