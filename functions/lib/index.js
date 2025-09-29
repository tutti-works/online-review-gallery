"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCourseAssignments = exports.getClassroomCourses = exports.getImportStatus = exports.processFileTask = exports.importClassroomSubmissions = void 0;
const https_1 = require("firebase-functions/v2/https");
const tasks_1 = require("firebase-functions/v2/tasks");
const admin = require("firebase-admin");
const googleapis_1 = require("googleapis");
const tasks_2 = require("@google-cloud/tasks");
const importController_1 = require("./importController");
const fileProcessor_1 = require("./fileProcessor");
admin.initializeApp();
const tasksClient = new tasks_2.CloudTasksClient();
// Google Classroom & Drive API設定
const auth = new googleapis_1.google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
    ],
});
// 【第2世代】Cloud Function: データインポート開始
exports.importClassroomSubmissions = (0, https_1.onRequest)({
    memory: '1GiB', // 1GB以上のメモリ
    timeoutSeconds: 540, // 9分
    maxInstances: 100,
    cors: true,
}, async (request, response) => {
    var _a;
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
        if (!userDoc.exists || ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
            response.status(403).json({
                error: 'Insufficient permissions',
            });
            return;
        }
        // インポート処理を開始（非同期）
        const importJobId = await (0, importController_1.initializeImport)(galleryId, classroomId, assignmentId, userEmail, auth, tasksClient);
        response.status(200).json({
            importJobId,
            message: 'Import job started',
        });
    }
    catch (error) {
        console.error('Import function error:', error);
        response.status(500).json({
            error: 'Internal server error',
        });
    }
});
// 【第2世代】Cloud Function: 個別ファイル処理（Task Queue）
exports.processFileTask = (0, tasks_1.onTaskDispatched)({
    memory: '2GiB', // 2GBメモリ（PDF処理用）
    timeoutSeconds: 1800, // 30分
    retryConfig: {
        maxAttempts: 3,
        maxRetrySeconds: 600,
    },
}, async (req) => {
    const { importJobId, fileId, fileName, fileType, studentName, studentEmail, galleryId } = req.data;
    console.log(`Processing file: ${fileName} (${fileType})`);
    try {
        await (0, fileProcessor_1.processFile)(importJobId, fileId, fileName, fileType, studentName, studentEmail, galleryId, auth);
        console.log(`File processed successfully: ${fileName}`);
    }
    catch (error) {
        console.error(`File processing error for ${fileName}:`, error);
        // エラーを記録
        await admin.firestore().collection('importJobs').doc(importJobId).update({
            errorFiles: admin.firestore.FieldValue.arrayUnion(fileId),
        });
        throw error; // Cloud Tasksにリトライさせるために再スロー
    }
});
// 【第2世代】Cloud Function: インポート進行状況を取得
exports.getImportStatus = (0, https_1.onRequest)({
    memory: '512MiB',
    timeoutSeconds: 30,
    cors: true,
}, async (request, response) => {
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
            .doc(importJobId)
            .get();
        if (!importJobDoc.exists) {
            response.status(404).json({
                error: 'Import job not found',
            });
            return;
        }
        response.status(200).json(importJobDoc.data());
    }
    catch (error) {
        console.error('Get import status error:', error);
        response.status(500).json({
            error: 'Internal server error',
        });
    }
});
// 【第2世代】Cloud Function: Classroom課題一覧を取得
exports.getClassroomCourses = (0, https_1.onRequest)({
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
}, async (request, response) => {
    try {
        // 開発環境用のモックデータ
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
    }
    catch (error) {
        console.error('Get courses error:', error);
        response.status(500).json({
            error: 'Failed to fetch courses',
        });
    }
});
// 【第2世代】Cloud Function: 特定コースの課題一覧を取得
exports.getCourseAssignments = (0, https_1.onRequest)({
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
}, async (request, response) => {
    try {
        const { courseId } = request.query;
        if (!courseId) {
            response.status(400).json({
                error: 'Missing courseId parameter',
            });
            return;
        }
        // 開発環境用のモックデータ
        const mockAssignments = {
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
        const assignments = mockAssignments[courseId] || [];
        response.status(200).json({ assignments });
    }
    catch (error) {
        console.error('Get assignments error:', error);
        response.status(500).json({
            error: 'Failed to fetch assignments',
        });
    }
});
//# sourceMappingURL=index.js.map