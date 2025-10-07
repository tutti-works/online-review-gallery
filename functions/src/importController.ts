import * as admin from 'firebase-admin';
import { google, Auth, classroom_v1 } from 'googleapis';
import { CloudTasksClient } from '@google-cloud/tasks';
import { FieldValue } from 'firebase-admin/firestore';
import { processMultipleFiles } from './fileProcessor';

const STUDENT_SUBMISSION_STATES = [
  'RETURNED',
  'TURNED_IN',
  'RECLAIMED_BY_STUDENT',
  'CREATED',
  'NEW',
] as const;

async function listStudentSubmissions(
  classroom: classroom_v1.Classroom,
  courseId: string,
  courseWorkId: string,
  states: readonly string[] = STUDENT_SUBMISSION_STATES,
): Promise<classroom_v1.Schema$StudentSubmission[]> {
  const results: classroom_v1.Schema$StudentSubmission[] = [];
  let pageToken: string | undefined;

  do {
    const normalizedStates = states.filter((state): state is string => typeof state === 'string' && state.length > 0);

    const response = await classroom.courses.courseWork.studentSubmissions.list({
      courseId,
      courseWorkId,
      states: normalizedStates.length ? normalizedStates : undefined,
      pageToken,
      pageSize: 100,
    });

    const { data } = response;
    if (data.studentSubmissions?.length) {
      results.push(...data.studentSubmissions);
    }

    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return results;
}

export async function initializeImport(
  galleryId: string,
  classroomId: string,
  assignmentId: string,
  userEmail: string,
  auth: Auth.OAuth2Client | Auth.GoogleAuth,
  tasksClient: CloudTasksClient
): Promise<string> {
  const db = admin.firestore();

  // galleriesコレクションを作成/更新
  await ensureGalleryExists(galleryId, classroomId, assignmentId, userEmail, auth);

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

    // 課題の提出物を取得（全ステータスを対象にページング取得）
    const submissions = await listStudentSubmissions(classroom, classroomId, assignmentId);

    // デバッグ: submissions 全体をログ出力
    console.log(`📊 Total submissions count: ${submissions.length}`);
    if (submissions.length > 0) {
      console.log('=== FIRST SUBMISSION OBJECT ===');
      console.log(JSON.stringify(submissions[0], null, 2));
      console.log('================================');
    } else {
      console.log('⚠️ No submissions found');
    }

    // 学生ごとにファイルをグループ化するためのMap
    const submissionsByStudent = new Map<string, {
      studentName: string;
      studentEmail: string;
      submittedAt: string;
      isLate: boolean;
      files: Array<{
        id: string;
        name: string;
        type: 'image' | 'pdf';
        mimeType: string;
        originalFileUrl: string;
        tempFilePath: string;
      }>;
    }>();

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

      // 学生ごとにグループ化
      if (!submissionsByStudent.has(studentEmail)) {
        submissionsByStudent.set(studentEmail, {
          studentName,
          studentEmail,
          submittedAt,
          isLate,
          files: [],
        });
      }

      const studentSubmission = submissionsByStudent.get(studentEmail)!;

      // 各添付ファイルをダウンロードしてStorageに保存
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

          // 学生のファイルリストに追加
          studentSubmission.files.push({
            id: file.id,
            name: file.name,
            type: fileType,
            mimeType: file.mimeType,
            originalFileUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
            tempFilePath,
          });

        } catch (err) {
          console.error(`Failed to download file ${file.name} from Drive:`, err);
          await importJobRef.update({
            errorFiles: FieldValue.arrayUnion(file.id),
          });
        }
      }
    }

    // 学生提出物（複数ファイルをまとめたもの）をタスクとして作成
    const tasks: Array<{
      studentName: string;
      studentEmail: string;
      submittedAt: string;
      isLate: boolean;
      files: Array<{
        id: string;
        name: string;
        type: 'image' | 'pdf';
        mimeType: string;
        originalFileUrl: string;
        tempFilePath: string;
      }>;
    }> = Array.from(submissionsByStudent.values());

    const totalFileCount = tasks.reduce((sum, task) => sum + task.files.length, 0);
    const totalSubmissions = tasks.length; // 学生提出数（タスク数）
    console.log(`📦 Grouped ${totalFileCount} files into ${totalSubmissions} student submissions`);

    // totalFilesは学生提出数（タスク数）をセット
    await importJobRef.update({ totalFiles: totalSubmissions, progress: 5 });

    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

    if (isEmulator) {
      console.log(`🔧 Emulator mode: Processing ${tasks.length} student submissions directly`);
      for (const task of tasks) {
        try {
          await processStudentSubmission(
            importJobRef.id,
            task.studentName,
            task.studentEmail,
            task.submittedAt,
            task.isLate,
            task.files,
            galleryId,
            classroomId,
            assignmentId
          );
        } catch (error) {
          console.error(`❌ Failed to process submission for ${task.studentName}:`, error);
          await importJobRef.update({
            errorFiles: FieldValue.arrayUnion(...task.files.map(f => f.tempFilePath)),
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
          studentName: task.studentName,
          studentEmail: task.studentEmail,
          submittedAt: task.submittedAt,
          isLate: task.isLate,
          files: task.files,
          galleryId,
          classroomId,
          assignmentId,
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
          console.error(`Failed to create task for ${task.studentName}:`, error);
          await importJobRef.update({
            errorFiles: FieldValue.arrayUnion(...task.files.map(f => f.tempFilePath)),
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
    if (importJob.status === 'completed' || importJob.status === 'error') {
      console.log(`Import job ${importJobId} already ${importJob.status}, skipping completion check`);
      return;
    }

    const { totalFiles, processedFiles, errorFiles } = importJob;
    const errorCount = errorFiles?.length || 0;
    const completedSubmissions = processedFiles + errorCount;

    console.log(`📊 Import progress: ${completedSubmissions}/${totalFiles} submissions (${processedFiles} success, ${errorCount} errors)`);

    if (completedSubmissions >= totalFiles) {
      await importJobRef.update({
        status: 'completed',
        progress: 100,
        completedAt: FieldValue.serverTimestamp(),
      });
      console.log(`✅ Import job ${importJobId} completed: ${processedFiles}/${totalFiles} submissions processed successfully`);
      if (errorCount > 0) {
        console.log(`⚠️ ${errorCount} files failed`);
      }
      await finalizeGallery(importJob.galleryId, importJobId);
    } else {
      const progress = Math.min(95, Math.floor((completedSubmissions / totalFiles) * 85) + 10);
      await importJobRef.update({ progress });
      console.log(`⏳ Import progress updated: ${progress}%`);
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

// galleriesコレクションを作成または更新
async function ensureGalleryExists(
  galleryId: string,
  classroomId: string,
  assignmentId: string,
  userEmail: string,
  auth: Auth.OAuth2Client | Auth.GoogleAuth
): Promise<void> {
  const db = admin.firestore();
  const galleryRef = db.collection('galleries').doc(galleryId);
  const galleryDoc = await galleryRef.get();

  if (galleryDoc.exists) {
    const existingData = galleryDoc.data();

    // 既存のギャラリーでcourseName/assignmentNameがない場合は追加
    if (!existingData?.courseName || !existingData?.assignmentName) {
      console.log(`Gallery ${galleryId} exists but missing course/assignment names, fetching...`);

      try {
        const classroom = google.classroom({ version: 'v1', auth });

        // 授業情報を取得
        const courseResponse = await classroom.courses.get({ id: classroomId });
        const courseName = courseResponse.data.name || 'コース名未設定';

        // 課題情報を取得
        const assignmentResponse = await classroom.courses.courseWork.get({
          courseId: classroomId,
          id: assignmentId,
        });
        const assignmentName = assignmentResponse.data.title || '課題名未設定';

        await galleryRef.update({
          courseName,
          assignmentName,
          courseId: classroomId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Gallery ${galleryId} updated with course/assignment names`);
      } catch (error) {
        console.error(`Failed to fetch course/assignment info for ${galleryId}:`, error);
        await galleryRef.update({
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      // 既存のギャラリーの場合は更新日時のみ更新
      await galleryRef.update({
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`Gallery ${galleryId} already exists, updated timestamp`);
    }
    return;
  }

  // 新規ギャラリーの場合、Google Classroom APIから授業名と課題名を取得
  console.log(`Creating new gallery ${galleryId}...`);

  try {
    const classroom = google.classroom({ version: 'v1', auth });

    // 授業情報を取得
    const courseResponse = await classroom.courses.get({ id: classroomId });
    const courseName = courseResponse.data.name || 'コース名未設定';

    // 課題情報を取得
    const assignmentResponse = await classroom.courses.courseWork.get({
      courseId: classroomId,
      id: assignmentId,
    });
    const assignmentName = assignmentResponse.data.title || '課題名未設定';

    // galleriesコレクションに新規ドキュメントを作成
    await galleryRef.set({
      id: galleryId,
      courseName,
      assignmentName,
      courseId: classroomId, // courseIdとしても保存
      assignmentId,
      classroomId, // 旧互換性のため
      artworkCount: 0,
      createdBy: userEmail,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Gallery created: ${courseName} > ${assignmentName}`);
  } catch (error) {
    console.error('Failed to fetch course/assignment info from Google Classroom:', error);

    // API取得失敗時はデフォルト値で作成
    await galleryRef.set({
      id: galleryId,
      courseName: 'Unknown Course',
      assignmentName: 'Unknown Assignment',
      courseId: classroomId,
      assignmentId,
      classroomId,
      artworkCount: 0,
      createdBy: userEmail,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`⚠️ Gallery created with default values (API error)`);
  }
}

// 学生の提出物（複数ファイル）を1つのartworkとして処理
async function processStudentSubmission(
  importJobId: string,
  studentName: string,
  studentEmail: string,
  submittedAt: string,
  isLate: boolean,
  files: Array<{
    id: string;
    name: string;
    type: 'image' | 'pdf';
    mimeType: string;
    originalFileUrl: string;
    tempFilePath: string;
  }>,
  galleryId: string,
  classroomId: string,
  assignmentId: string
): Promise<void> {
  console.log(`Processing submission for ${studentName} with ${files.length} files`);

  await processMultipleFiles(
    importJobId,
    studentName,
    studentEmail,
    submittedAt,
    isLate,
    files,
    galleryId,
    classroomId,
    assignmentId
  );
}
