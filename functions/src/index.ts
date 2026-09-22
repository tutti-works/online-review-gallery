import { onRequest } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Firestore, getFirestore, Query } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { google } from 'googleapis';
import { CloudTasksClient } from '@google-cloud/tasks';
import { initializeImport, checkImportCompletion } from './importController';
import { processFile } from './fileProcessor';
import {
  ALLOWED_CORS_ORIGINS,
  HttpAuthError,
  getSafeErrorCode,
  requireAdmin,
  requireGoogleOAuthToken,
  toImportStatusResponse,
} from './httpSecurity';
import type { Response } from 'express';

// エミュレーター環境の設定（initializeApp前に設定）
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
  console.log('🔧 Using Firebase Emulators');
}

initializeApp();

const tasksClient = new CloudTasksClient();

const sendAuthError = (response: Response, error: unknown): boolean => {
  if (!(error instanceof HttpAuthError)) {
    return false;
  }

  response.status(error.status).json({ error: error.code });
  return true;
};

const logSafeError = (operation: string, error: unknown, context: Record<string, unknown> = {}) => {
  console.error(operation, { ...context, errorCode: getSafeErrorCode(error) });
};

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
    cors: ALLOWED_CORS_ORIGINS,
  },
  async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

      const requester = await requireAdmin(request);
      const accessToken = requireGoogleOAuthToken(request);

      // ユーザーのトークンでOAuth2クライアントを作成
      const userAuth = new google.auth.OAuth2();
      userAuth.setCredentials({ access_token: accessToken });

      const { galleryId, classroomId, assignmentId } = request.body;

      if (!galleryId || !classroomId || !assignmentId) {
        response.status(400).json({
          error: 'Missing required parameters',
        });
        return;
      }

      // インポート処理を開始（非同期）
      const importJobId = await initializeImport(
        galleryId,
        classroomId,
        assignmentId,
        requester.email,
        userAuth, // ユーザー自身の認証情報を使用
        tasksClient
      );

      response.status(200).json({
        importJobId,
        message: 'Import job started',
      });
    } catch (error) {
      if (sendAuthError(response, error)) return;
      logSafeError('Import function error', error);
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

    console.log('Processing queued file', { importJobId, fileType });

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

      console.log('Queued file processed successfully', { importJobId });

      // ファイル処理完了後、インポート全体の完了状態をチェック
      await checkImportCompletion(importJobId);
    } catch (error) {
      logSafeError('Queued file processing error', error, { importJobId });

      // エラー時もインポート完了状態をチェック（他のファイルは完了している可能性があるため）
      try {
        await checkImportCompletion(importJobId);
      } catch (checkError) {
        logSafeError('Error checking import completion', checkError, { importJobId });
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
    cors: ALLOWED_CORS_ORIGINS,
  },
  async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.status(405).send('Method Not Allowed');
        return;
      }

      await requireAdmin(request);
      const { importJobId } = request.query;

      if (!importJobId) {
        response.status(400).json({
          error: 'Missing importJobId parameter',
        });
        return;
      }

      const importJobDoc = await getFirestore()
        .collection('importJobs')
        .doc(importJobId as string)
        .get();

      if (!importJobDoc.exists) {
        response.status(404).json({
          error: 'Import job not found',
        });
        return;
      }

      response.status(200).json(toImportStatusResponse(importJobDoc.data() || {}));
    } catch (error) {
      if (sendAuthError(response, error)) return;
      logSafeError('Get import status error', error);
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
    cors: ALLOWED_CORS_ORIGINS,
  },
  async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.status(405).send('Method Not Allowed');
        return;
      }
      await requireAdmin(request);

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
      if (sendAuthError(response, error)) return;
      logSafeError('Get courses error', error);

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
    cors: ALLOWED_CORS_ORIGINS,
  },
  async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.status(405).send('Method Not Allowed');
        return;
      }
      await requireAdmin(request);

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
      if (sendAuthError(response, error)) return;
      logSafeError('Get assignments error', error);
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
    cors: ALLOWED_CORS_ORIGINS,
  },
  async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

        await requireAdmin(request);
        const { artworkId } = request.body;

        if (!artworkId) {
          response.status(400).json({
            error: 'Missing required parameters',
          });
          return;
        }

        // Firestoreから作品情報を取得
        const artworkDoc = await getFirestore()
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
        const bucket = getStorage().bucket();
        const deletePromises: Promise<void>[] = [];

        for (const image of images) {
          let imagePath = typeof image.storagePath === 'string' ? image.storagePath : '';
          let thumbnailPath = typeof image.thumbnailPath === 'string' ? image.thumbnailPath : '';

          // 旧データはURLからパスを復元する
          if (!imagePath && typeof image.url === 'string' && image.url.includes('localhost:9199')) {
            const urlMatch = image.url.match(/o\/(.+?)\?/);
            if (urlMatch) {
              imagePath = decodeURIComponent(urlMatch[1]);
            }
          } else if (!imagePath && typeof image.url === 'string') {
            // 本番環境の場合
            const urlMatch = image.url.match(/storage\.googleapis\.com\/[^/]+\/(.+)$/);
            if (urlMatch) {
              imagePath = decodeURIComponent(urlMatch[1]);
            }
          }

          // サムネイルパス
          if (!thumbnailPath && typeof image.thumbnailUrl === 'string') {
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
        const likesSnapshot = await getFirestore()
          .collection('likes')
          .where('artworkId', '==', artworkId)
          .get();

        const likeDeletions = likesSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(likeDeletions);

        // ギャラリードキュメントのartworkCountをデクリメントし、artworks配列から削除
        const galleryId = artworkData?.galleryId;
        if (galleryId) {
          try {
            const galleryRef = getFirestore().collection('galleries').doc(galleryId);
            await galleryRef.update({
              artworkCount: FieldValue.increment(-1),
              artworks: FieldValue.arrayRemove(artworkId),
            });
            console.log(`Updated gallery ${galleryId}: decremented artworkCount and removed from artworks array`);
          } catch (galleryError) {
            console.error(`Failed to update gallery ${galleryId}:`, galleryError);
            // エラーでも作品削除は成功しているので続行
          }
        }

        console.log(`Successfully deleted artwork ${artworkId} and ${deletePromises.length} files`);

      response.status(200).json({
        message: 'Artwork deleted successfully',
        deletedFiles: deletePromises.length,
      });
    } catch (error) {
      if (sendAuthError(response, error)) return;
      logSafeError('Delete artwork error', error);
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

    const bucket = getStorage().bucket();
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
    cors: ALLOWED_CORS_ORIGINS,
  },
  async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

      await requireAdmin(request);
      const { galleryId } = request.body;

      if (!galleryId) {
        response.status(400).send('Bad Request: Missing galleryId in request body.');
        return;
      }

      console.log('Gallery data deletion initiated', { galleryId });

      const db = getFirestore();
      const bucket = getStorage().bucket();

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
      if (sendAuthError(response, error)) return;
      logSafeError('deleteGalleryData failed', error);
      response.status(500).json({
        error: 'Failed to delete gallery data.',
      });
    }
  }
);

// Firestoreのコレクションをバッチで削除するためのヘルパー関数
async function deleteCollection(db: Firestore, collectionPath: string, batchSize: number) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject).catch(reject);
  });
}

async function deleteQueryBatch(
  db: Firestore,
  query: Query,
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
    cors: ALLOWED_CORS_ORIGINS,
  },
  async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

      await requireAdmin(request);
      console.log('Data reset initiated');

      const db = getFirestore();
      const bucket = getStorage().bucket();

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
      if (sendAuthError(response, error)) return;
      logSafeError('deleteAllData failed', error);
      response.status(500).json({
        error: 'Failed to delete all data.',
      });
    }
  }
);

// 【第2世代】Cloud Function: ギャラリーのartworkCountを実際の作品数で同期
export const syncGalleryArtworkCount = onRequest(
  {
    region: 'asia-northeast1',
    memory: '512MiB',
    timeoutSeconds: 300,
    cors: ALLOWED_CORS_ORIGINS,
  },
  async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
      }

      await requireAdmin(request);
      const { galleryId } = request.body;
      const db = getFirestore();
      const results: Array<{
        galleryId: string;
        galleryTitle: string;
        oldCount: number;
        newCount: number;
        oldArtworksArrayLength: number | null;
      }> = [];

      // 特定のギャラリーを指定されている場合
      if (galleryId) {
        const galleryRef = db.collection('galleries').doc(galleryId);
        const galleryDoc = await galleryRef.get();

        if (!galleryDoc.exists) {
          response.status(404).json({ error: 'Gallery not found' });
          return;
        }

        const galleryData = galleryDoc.data()!;
        const oldCount = galleryData.artworkCount || 0;
        const oldArtworksArray = galleryData.artworks || null;
        const oldArtworksArrayLength = Array.isArray(oldArtworksArray) ? oldArtworksArray.length : null;

        // 実際の作品数をカウント
        const artworksSnapshot = await db.collection('artworks')
          .where('galleryId', '==', galleryId)
          .get();
        const actualCount = artworksSnapshot.size;

        // artworkCountを更新（artworks配列は放置）
        await galleryRef.update({
          artworkCount: actualCount,
        });

        results.push({
          galleryId,
          galleryTitle: galleryData.title || 'Untitled',
          oldCount,
          newCount: actualCount,
          oldArtworksArrayLength,
        });

        console.log(`Synced gallery ${galleryId}: ${oldCount} -> ${actualCount}`);
      } else {
        // 全ギャラリーを同期
        const galleriesSnapshot = await db.collection('galleries').get();

        for (const galleryDoc of galleriesSnapshot.docs) {
          const galleryData = galleryDoc.data();
          const oldCount = galleryData.artworkCount || 0;
          const oldArtworksArray = galleryData.artworks || null;
          const oldArtworksArrayLength = Array.isArray(oldArtworksArray) ? oldArtworksArray.length : null;

          // 実際の作品数をカウント
          const artworksSnapshot = await db.collection('artworks')
            .where('galleryId', '==', galleryDoc.id)
            .get();
          const actualCount = artworksSnapshot.size;

          // artworkCountを更新（artworks配列は放置）
          await galleryDoc.ref.update({
            artworkCount: actualCount,
          });

          results.push({
            galleryId: galleryDoc.id,
            galleryTitle: galleryData.title || 'Untitled',
            oldCount,
            newCount: actualCount,
            oldArtworksArrayLength,
          });

          console.log(`Synced gallery ${galleryDoc.id}: ${oldCount} -> ${actualCount}`);
        }
      }

      const message = galleryId
        ? `Successfully synced gallery ${galleryId}`
        : `Successfully synced ${results.length} galleries`;

      response.status(200).json({
        message,
        results,
      });

    } catch (error) {
      if (sendAuthError(response, error)) return;
      logSafeError('syncGalleryArtworkCount failed', error);
      response.status(500).json({
        error: 'Failed to sync gallery artwork count',
      });
    }
  }
);
