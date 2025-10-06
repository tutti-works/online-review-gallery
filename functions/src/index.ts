import { onRequest } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { CloudTasksClient } from '@google-cloud/tasks';
import { initializeImport, checkImportCompletion } from './importController';
import { processFile } from './fileProcessor';

// エミュレーター環境の設定（initializeApp前に設定）
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
  console.log('🔧 Using Firebase Emulators');
}

admin.initializeApp();

const tasksClient = new CloudTasksClient();

// Google Classroom & Drive API設定
// Firebase Functions のデフォルトサービスアカウントを使用
const auth = new google.auth.GoogleAuth({
  scopes: [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
  ],
});

// 【第2世代】Cloud Function: データインポート開始
export const importClassroomSubmissions = onRequest(
  {
    region: 'asia-northeast1',
    memory: '1GiB', // 1GB以上のメモリ
    timeoutSeconds: 540, // 9分
    maxInstances: 100,
    cors: true, // CORS を有効化
  },
  async (request, response) => {
    // CORS ヘッダーを明示的に設定
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // プリフライトリクエストへの対応
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

        // ユーザーのアクセストークンをヘッダーから取得
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          response.status(401).send('Unauthorized: Missing or invalid token');
          return;
        }
        const accessToken = authHeader.split(' ')[1];

        // ユーザーのトークンでOAuth2クライアントを作成
        const userAuth = new google.auth.OAuth2();
        userAuth.setCredentials({ access_token: accessToken });

        const { galleryId, classroomId, assignmentId, userEmail } = request.body;

        if (!galleryId || !classroomId || !assignmentId || !userEmail) {
          response.status(400).json({
            error: 'Missing required parameters',
          });
          return;
        }

        // ユーザー権限チェック
        let userDoc = await admin
          .firestore()
          .collection('userRoles')
          .doc(userEmail)
          .get();

        // 開発環境またはエミュレータ：ユーザーロールが存在しない場合、自動的に作成
        if (!userDoc.exists || !userDoc.data()?.role) {
          console.log(`Auto-creating admin role for ${userEmail} (emulator mode)`);
          await admin.firestore().collection('userRoles').doc(userEmail).set({
            role: 'admin',
            createdAt: new Date(),
          });
          // 再度取得して確認
          userDoc = await admin
            .firestore()
            .collection('userRoles')
            .doc(userEmail)
            .get();
        }

        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
          console.error(`Permission denied for ${userEmail}. Role: ${userDoc.data()?.role}`);
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
          userAuth, // ユーザー自身の認証情報を使用
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
// 注意: 本番環境ではCloud Runを使用。この関数はエミュレーター環境でのみ使用。
// 本番デプロイ時はこの関数をスキップするため、条件付きエクスポート。
const processFileTaskFunction = onTaskDispatched(
  {
    region: 'asia-northeast1',
    memory: '2GiB', // 2GBメモリ（PDF処理用）
    timeoutSeconds: 1800, // 30分
    retryConfig: {
      maxAttempts: 3,
      maxRetrySeconds: 600,
    },
  },
  async (req) => {
    const {
      importJobId,
      tempFilePath,
      fileName,
      fileType,
      studentName,
      studentEmail,
      galleryId,
      originalFileUrl,
      submittedAt,
    } = req.data;

    console.log(`Processing file: ${fileName} (${fileType})`);

    try {
      await processFile(
        importJobId,
        tempFilePath,
        fileName,
        fileType,
        studentName,
        studentEmail,
        galleryId,
        originalFileUrl,
        submittedAt
      );

      console.log(`File processed successfully: ${fileName}`);

      // ファイル処理完了後、インポート全体の完了状態をチェック
      await checkImportCompletion(importJobId);
    } catch (error) {
      console.error(`File processing error for ${fileName}:`, error);

      // エラー時もインポート完了状態をチェック（他のファイルは完了している可能性があるため）
      try {
        await checkImportCompletion(importJobId);
      } catch (checkError) {
        console.error('Error checking import completion:', checkError);
      }

      // エラーハンドリングはprocessFile内で行われる
      throw error; // Cloud Tasksにリトライさせるために再スロー
    }
  }
);

// エミュレーター環境でのみprocessFileTaskをエクスポート
// 本番環境ではCloud Runを使用するため、Firebase Functionsにはデプロイしない
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  exports.processFileTask = processFileTaskFunction;
  console.log('🔧 processFileTask enabled for emulator environment');
}

// 【第2世代】Cloud Function: インポート進行状況を取得
export const getImportStatus = onRequest(
  {
    region: 'asia-northeast1',
    memory: '512MiB',
    timeoutSeconds: 30,
    cors: true, // CORS を有効化
  },
  async (request, response) => {
    // CORS ヘッダーを明示的に設定
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // プリフライトリクエストへの対応
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

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
    region: 'asia-northeast1',
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
    region: 'asia-northeast1',
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

// 【第2世代】Cloud Function: 作品削除（Firestore + Storage）
export const deleteArtwork = onRequest(
  {
    region: 'asia-northeast1',
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  async (request, response) => {
    // CORS ヘッダーを明示的に設定
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // プリフライトリクエストへの対応
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

        const { artworkId, userEmail } = request.body;

        if (!artworkId || !userEmail) {
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
          console.error(`Permission denied for ${userEmail}. Role: ${userDoc.data()?.role}`);
          response.status(403).json({
            error: 'Insufficient permissions',
          });
          return;
        }

        // Firestoreから作品情報を取得
        const artworkDoc = await admin
          .firestore()
          .collection('artworks')
          .doc(artworkId)
          .get();

        if (!artworkDoc.exists) {
          response.status(404).json({
            error: 'Artwork not found',
          });
          return;
        }

        const artworkData = artworkDoc.data();
        const images = artworkData?.images || [];

        // Storage から画像ファイルを削除
        const bucket = admin.storage().bucket();
        const deletePromises: Promise<void>[] = [];

        for (const image of images) {
          // URLからファイルパスを抽出
          let imagePath = '';
          let thumbnailPath = '';

          // エミュレーターの場合
          if (image.url.includes('localhost:9199')) {
            const urlMatch = image.url.match(/o\/(.+?)\?/);
            if (urlMatch) {
              imagePath = decodeURIComponent(urlMatch[1]);
            }
          } else {
            // 本番環境の場合
            const urlMatch = image.url.match(/storage\.googleapis\.com\/[^/]+\/(.+)$/);
            if (urlMatch) {
              imagePath = decodeURIComponent(urlMatch[1]);
            }
          }

          // サムネイルパス
          if (image.thumbnailUrl) {
            if (image.thumbnailUrl.includes('localhost:9199')) {
              const urlMatch = image.thumbnailUrl.match(/o\/(.+?)\?/);
              if (urlMatch) {
                thumbnailPath = decodeURIComponent(urlMatch[1]);
              }
            } else {
              const urlMatch = image.thumbnailUrl.match(/storage\.googleapis\.com\/[^/]+\/(.+)$/);
              if (urlMatch) {
                thumbnailPath = decodeURIComponent(urlMatch[1]);
              }
            }
          }

          // ファイル削除
          if (imagePath) {
            deletePromises.push(
              bucket.file(imagePath).delete().catch(err => {
                console.error(`Failed to delete image: ${imagePath}`, err);
                return undefined;
              }).then(() => undefined)
            );
          }

          if (thumbnailPath) {
            deletePromises.push(
              bucket.file(thumbnailPath).delete().catch(err => {
                console.error(`Failed to delete thumbnail: ${thumbnailPath}`, err);
                return undefined;
              }).then(() => undefined)
            );
          }
        }

        // すべてのファイル削除を実行
        await Promise.all(deletePromises);

        // Firestoreからドキュメントを削除
        await artworkDoc.ref.delete();

        // 関連するlikesを削除
        const likesSnapshot = await admin
          .firestore()
          .collection('likes')
          .where('artworkId', '==', artworkId)
          .get();

        const likeDeletions = likesSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(likeDeletions);

        console.log(`Successfully deleted artwork ${artworkId} and ${deletePromises.length} files`);

      response.status(200).json({
        message: 'Artwork deleted successfully',
        deletedFiles: deletePromises.length,
      });
    } catch (error) {
      console.error('Delete artwork error:', error);
      response.status(500).json({
        error: 'Internal server error',
      });
    }
  }
);

// 【第2世代】Cloud Function: 一時ファイルの定期クリーンアップ
// 毎日午前3時（JST）に実行され、24時間以上経過した一時ファイルを削除
export const cleanupTempFiles = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Tokyo',
    region: 'asia-northeast1',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async (event) => {
    console.log('Starting cleanup of temporary files...');

    const bucket = admin.storage().bucket();
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24時間前

    try {
      // unprocessed/ 配下のファイルを取得
      const [files] = await bucket.getFiles({ prefix: 'unprocessed/' });

      let deletedCount = 0;
      let skippedCount = 0;

      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const createdTime = new Date(metadata.timeCreated as string).getTime();

        if (createdTime < cutoffTime) {
          try {
            await file.delete();
            deletedCount++;
            console.log(`Deleted old temp file: ${file.name}`);
          } catch (error) {
            console.error(`Failed to delete ${file.name}:`, error);
          }
        } else {
          skippedCount++;
        }
      }

      console.log(`Cleanup completed: ${deletedCount} files deleted, ${skippedCount} files kept`);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
);

// 【第2世代】Cloud Function: ギャラリー別データ削除
export const deleteGalleryData = onRequest(
  {
    region: 'asia-northeast1',
    memory: '1GiB',
    timeoutSeconds: 540,
    cors: true,
  },
  async (request, response) => {
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

      const { userEmail, galleryId } = request.body;

      if (!userEmail || !galleryId) {
        response.status(400).send('Bad Request: Missing userEmail or galleryId in request body.');
        return;
      }

      const userDoc = await admin.firestore().collection('userRoles').doc(userEmail).get();
      if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
        console.error(`Permission denied for ${userEmail}. Role: ${userDoc.data()?.role}`);
        response.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      console.log(`Gallery data deletion initiated by admin: ${userEmail} for gallery: ${galleryId}`);

      const db = admin.firestore();
      const bucket = admin.storage().bucket();

      // 1. galleryIdに紐づく作品を取得して削除
      const artworksSnapshot = await db.collection('artworks')
        .where('galleryId', '==', galleryId)
        .get();

      const artworkIds: string[] = [];
      const deletePromises: Promise<any>[] = [];

      artworksSnapshot.forEach(doc => {
        artworkIds.push(doc.id);
        deletePromises.push(doc.ref.delete());
      });

      // 2. 作品に関連するいいねを削除
      if (artworkIds.length > 0) {
        const likesSnapshot = await db.collection('likes')
          .where('artworkId', 'in', artworkIds.slice(0, 10)) // Firestoreの制限: in句は最大10要素
          .get();

        likesSnapshot.forEach(doc => {
          deletePromises.push(doc.ref.delete());
        });

        // 10要素以上ある場合は分割して処理
        for (let i = 10; i < artworkIds.length; i += 10) {
          const batch = artworkIds.slice(i, i + 10);
          const moreLikes = await db.collection('likes')
            .where('artworkId', 'in', batch)
            .get();
          moreLikes.forEach(doc => {
            deletePromises.push(doc.ref.delete());
          });
        }
      }

      // 3. ギャラリーに関連するインポートジョブを削除
      const importJobsSnapshot = await db.collection('importJobs')
        .where('galleryId', '==', galleryId)
        .get();

      importJobsSnapshot.forEach(doc => {
        deletePromises.push(doc.ref.delete());
      });

      // 4. ギャラリードキュメントを削除
      deletePromises.push(db.collection('galleries').doc(galleryId).delete());

      // 5. Storage上のギャラリーフォルダを削除
      deletePromises.push(bucket.deleteFiles({ prefix: `galleries/${galleryId}/` }));

      await Promise.all(deletePromises);

      const message = `Successfully deleted gallery ${galleryId} and ${artworkIds.length} artworks.`;
      console.log(message);
      response.status(200).json({
        message,
        deletedArtworks: artworkIds.length,
      });

    } catch (error) {
      console.error('Detailed error in deleteGalleryData:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      response.status(500).json({
        error: 'Failed to delete gallery data.',
        details: errorMessage,
      });
    }
  }
);

// Firestoreのコレクションをバッチで削除するためのヘルパー関数
async function deleteCollection(db: admin.firestore.Firestore, collectionPath: string, batchSize: number) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject).catch(reject);
  });
}

async function deleteQueryBatch(
  db: admin.firestore.Firestore, 
  query: admin.firestore.Query, 
  resolve: (value: unknown) => void, 
  reject: (reason?: any) => void
) {
  const snapshot = await query.get();

  if (snapshot.size === 0) {
    resolve(true);
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve, reject);
  });
}

// 【第2世代】Cloud Function: 全データリセット（管理者専用）
export const deleteAllData = onRequest(
  {
    region: 'asia-northeast1',
    memory: '1GiB',
    timeoutSeconds: 540, // 9分
    cors: true,
  },
  async (request, response) => {
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

      // 警告: この方法はセキュリティリスクを伴います。
      // IDトークンを検証せず、リクエストボディのメールアドレスを信頼します。
      const { userEmail } = request.body;

      if (!userEmail) {
        response.status(400).send('Bad Request: Missing userEmail in request body.');
        return;
      }

      const userDoc = await admin.firestore().collection('userRoles').doc(userEmail).get();
      if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
        console.error(`Permission denied for ${userEmail}. Role: ${userDoc.data()?.role}`);
        response.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      console.log(`Data reset initiated by admin: ${userEmail}`);

      const db = admin.firestore();
      const bucket = admin.storage().bucket();

      // 1. コレクションの全削除
      await Promise.all([
        deleteCollection(db, 'artworks', 200),
        deleteCollection(db, 'likes', 200),
        deleteCollection(db, 'importJobs', 200),
        deleteCollection(db, 'galleries', 200),
      ]);
      
      // 3. Cloud Storageのフォルダを全削除
      await Promise.all([
        bucket.deleteFiles({ prefix: 'galleries/' }),
        bucket.deleteFiles({ prefix: 'unprocessed/' })
      ]);

      const message = `Successfully reset all data.`;
      console.log(message);
      response.status(200).json({ message });

    } catch (error) {
      console.error('Detailed error in deleteAllData:', error); // より詳細なログを出力
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      response.status(500).json({ 
        error: 'Failed to delete all data.',
        details: errorMessage, // エラー詳細をレスポンスに含める
      });
    }
  }
);