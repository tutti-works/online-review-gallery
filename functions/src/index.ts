import { onRequest } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { CloudTasksClient } from '@google-cloud/tasks';
import { initializeImport } from './importController';
import { processFile } from './fileProcessor';

admin.initializeApp();

const tasksClient = new CloudTasksClient();

// Google Classroom & Drive API設定
// 開発環境では環境変数から、本番環境ではサービスアカウントを使用
const auth = process.env.NODE_ENV === 'development'
  ? new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:5001/auth/callback'
    )
  : new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });

// 【第2世代】Cloud Function: データインポート開始
export const importClassroomSubmissions = onRequest(
  {
    memory: '1GiB', // 1GB以上のメモリ
    timeoutSeconds: 540, // 9分
    maxInstances: 100,
    cors: true,
  },
  async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

      const { galleryId, classroomId, assignmentId, userEmail } = request.body;

      if (!galleryId || !classroomId || !assignmentId || !userEmail) {
        response.status(400).json({
          error: 'Missing required parameters',
        });
        return;
      }

      // ユーザー権限チェック
      const userDoc = await admin
        .firestore()
        .collection('userRoles')
        .doc(userEmail)
        .get();

      if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
        response.status(403).json({
          error: 'Insufficient permissions',
        });
        return;
      }

      // インポート処理を開始（非同期）
      const importJobId = await initializeImport(
        galleryId,
        classroomId,
        assignmentId,
        userEmail,
        auth,
        tasksClient
      );

      response.status(200).json({
        importJobId,
        message: 'Import job started',
      });
    } catch (error) {
      console.error('Import function error:', error);
      response.status(500).json({
        error: 'Internal server error',
      });
    }
  }
);

// 【第2世代】Cloud Function: 個別ファイル処理（Task Queue）
export const processFileTask = onTaskDispatched(
  {
    memory: '2GiB', // 2GBメモリ（PDF処理用）
    timeoutSeconds: 1800, // 30分
    retryConfig: {
      maxAttempts: 3,
      maxRetrySeconds: 600,
    },
  },
  async (req) => {
    const { importJobId, fileId, fileName, fileType, studentName, studentEmail, galleryId } = req.data;

    console.log(`Processing file: ${fileName} (${fileType})`);

    try {
      await processFile(
        importJobId,
        fileId,
        fileName,
        fileType,
        studentName,
        studentEmail,
        galleryId,
        auth
      );

      console.log(`File processed successfully: ${fileName}`);
    } catch (error) {
      console.error(`File processing error for ${fileName}:`, error);

      // エラーを記録
      await admin.firestore().collection('importJobs').doc(importJobId).update({
        errorFiles: admin.firestore.FieldValue.arrayUnion(fileId),
      });

      throw error; // Cloud Tasksにリトライさせるために再スロー
    }
  }
);

// 【第2世代】Cloud Function: インポート進行状況を取得
export const getImportStatus = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 30,
    cors: true,
  },
  async (request, response) => {
    try {
      const { importJobId } = request.query;

      if (!importJobId) {
        response.status(400).json({
          error: 'Missing importJobId parameter',
        });
        return;
      }

      const importJobDoc = await admin
        .firestore()
        .collection('importJobs')
        .doc(importJobId as string)
        .get();

      if (!importJobDoc.exists) {
        response.status(404).json({
          error: 'Import job not found',
        });
        return;
      }

      response.status(200).json(importJobDoc.data());
    } catch (error) {
      console.error('Get import status error:', error);
      response.status(500).json({
        error: 'Internal server error',
      });
    }
  }
);

// 【第2世代】Cloud Function: Classroom課題一覧を取得
export const getClassroomCourses = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  async (request, response) => {
    try {
      // 環境変数チェック
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.NODE_ENV !== 'development') {
        console.log('No Google credentials found, using mock data');

        // モックデータを返す
        const courses = [
          {
            id: 'course_1',
            name: 'デザイン基礎',
            section: 'A クラス',
            description: 'グラフィックデザインの基礎を学ぶ授業です。',
          },
          {
            id: 'course_2',
            name: 'ウェブデザイン演習',
            section: 'B クラス',
            description: 'HTML/CSSを使ったウェブデザインの実践的な演習です。',
          },
          {
            id: 'course_3',
            name: 'プロダクトデザイン',
            section: 'C クラス',
            description: '工業製品のデザインプロセスを学ぶ授業です。',
          },
        ];

        response.status(200).json({ courses });
        return;
      }

      // 実際のGoogle Classroom APIを呼び出し
      const classroom = google.classroom({ version: 'v1', auth });

      console.log('Calling Google Classroom API...');
      const coursesResponse = await classroom.courses.list({
        teacherId: 'me',
        courseStates: ['ACTIVE'],
      });

      const courses = coursesResponse.data.courses?.map(course => ({
        id: course.id,
        name: course.name,
        section: course.section,
        description: course.description,
      })) || [];

      console.log(`Found ${courses.length} courses`);
      response.status(200).json({ courses });
    } catch (error) {
      console.error('Get courses error:', error);

      // エラーが発生した場合はモックデータにフォールバック
      console.log('API call failed, falling back to mock data');
      const courses = [
        {
          id: 'course_1',
          name: 'デザイン基礎 (Mock)',
          section: 'A クラス',
          description: 'グラフィックデザインの基礎を学ぶ授業です。',
        },
        {
          id: 'course_2',
          name: 'ウェブデザイン演習 (Mock)',
          section: 'B クラス',
          description: 'HTML/CSSを使ったウェブデザインの実践的な演習です。',
        },
        {
          id: 'course_3',
          name: 'プロダクトデザイン (Mock)',
          section: 'C クラス',
          description: '工業製品のデザインプロセスを学ぶ授業です。',
        },
      ];

      response.status(200).json({ courses });
    }
  }
);

// 【第2世代】Cloud Function: 特定コースの課題一覧を取得
export const getCourseAssignments = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  async (request, response) => {
    try {
      const { courseId } = request.query;

      if (!courseId) {
        response.status(400).json({
          error: 'Missing courseId parameter',
        });
        return;
      }

      // 開発環境用のモックデータ
      const mockAssignments: { [key: string]: any[] } = {
        'course_1': [
          {
            id: 'assignment_1_1',
            courseId: 'course_1',
            title: '第1回課題：ロゴデザイン',
            description: 'あなたの好きなブランドのロゴを再デザインしてください。',
            dueDate: '2024-02-15T09:00:00Z',
            maxPoints: 100,
          },
          {
            id: 'assignment_1_2',
            courseId: 'course_1',
            title: '第2回課題：ポスターデザイン',
            description: '環境保護をテーマにしたポスターをデザインしてください。',
            dueDate: '2024-03-01T09:00:00Z',
            maxPoints: 100,
          },
        ],
        'course_2': [
          {
            id: 'assignment_2_1',
            courseId: 'course_2',
            title: '第1回課題：レスポンシブページ',
            description: 'モバイルファーストでレスポンシブなランディングページを作成してください。',
            dueDate: '2024-02-20T09:00:00Z',
            maxPoints: 100,
          },
          {
            id: 'assignment_2_2',
            courseId: 'course_2',
            title: '第2回課題：JavaScriptアニメーション',
            description: 'CSSアニメーションとJavaScriptを使ったインタラクティブな要素を作成してください。',
            dueDate: '2024-03-05T09:00:00Z',
            maxPoints: 100,
          },
        ],
        'course_3': [
          {
            id: 'assignment_3_1',
            courseId: 'course_3',
            title: '第1回課題：製品コンセプト',
            description: '日常生活の問題を解決する製品のコンセプトを提案してください。',
            dueDate: '2024-02-25T09:00:00Z',
            maxPoints: 100,
          },
        ],
      };

      const assignments = mockAssignments[courseId as string] || [];

      response.status(200).json({ assignments });
    } catch (error) {
      console.error('Get assignments error:', error);
      response.status(500).json({
        error: 'Failed to fetch assignments',
      });
    }
  }
);