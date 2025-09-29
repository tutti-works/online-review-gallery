"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeImport = initializeImport;
exports.checkImportCompletion = checkImportCompletion;
const admin = require("firebase-admin");
const googleapis_1 = require("googleapis");
async function initializeImport(galleryId, classroomId, assignmentId, userEmail, auth, tasksClient) {
    var _a, _b, _c;
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
        createdAt: admin.firestore.Timestamp.now(),
    };
    await importJobRef.set(importJob);
    // バックグラウンドで提出物の取得とタスクキューへの投入を開始
    try {
        await importJobRef.update({ status: 'processing' });
        const classroom = googleapis_1.google.classroom({ version: 'v1', auth });
        // 課題の提出物を取得
        const submissionsResponse = await classroom.courses.courseWork.studentSubmissions.list({
            courseId: classroomId,
            courseWorkId: assignmentId,
            states: ['SUBMITTED', 'RETURNED'],
        });
        const submissions = submissionsResponse.data.studentSubmissions || [];
        let totalFiles = 0;
        const tasks = [];
        // 各提出物からファイル情報を収集
        for (const submission of submissions) {
            if (!((_a = submission.assignmentSubmission) === null || _a === void 0 ? void 0 : _a.attachments))
                continue;
            // 学生情報を取得
            const studentProfile = await classroom.userProfiles.get({
                userId: submission.userId,
            });
            const studentName = ((_b = studentProfile.data.name) === null || _b === void 0 ? void 0 : _b.fullName) || 'Unknown Student';
            const studentEmail = studentProfile.data.emailAddress || '';
            // 各添付ファイルを処理対象に追加
            for (const attachment of submission.assignmentSubmission.attachments) {
                if (!((_c = attachment.driveFile) === null || _c === void 0 ? void 0 : _c.id))
                    continue;
                const drive = googleapis_1.google.drive({ version: 'v3', auth });
                const fileMetadata = await drive.files.get({
                    fileId: attachment.driveFile.id,
                    fields: 'id,name,mimeType',
                });
                const file = fileMetadata.data;
                if (!file.name || !file.mimeType)
                    continue;
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
        // Cloud Tasksにファイル処理タスクを投入
        const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
        const region = 'asia-northeast1'; // 日本リージョン
        const queueName = 'file-processing-queue';
        const parent = tasksClient.queuePath(projectId, region, queueName);
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
                        httpMethod: 'POST',
                        url: `https://${region}-${projectId}.cloudfunctions.net/processFileTask`,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: Buffer.from(JSON.stringify(payload)),
                    },
                    // スケジュール: 少しずつずらして並列処理の負荷を分散
                    scheduleTime: {
                        seconds: Math.floor(Date.now() / 1000) + (index * 2), // 2秒間隔
                    },
                },
            };
            try {
                await tasksClient.createTask(request);
                console.log(`Task created for file: ${task.fileName}`);
            }
            catch (error) {
                console.error(`Failed to create task for file ${task.fileName}:`, error);
                // タスク作成失敗もエラーファイルに記録
                await importJobRef.update({
                    errorFiles: admin.firestore.FieldValue.arrayUnion(task.fileId),
                });
            }
        });
        await Promise.all(taskPromises);
        console.log(`Created ${tasks.length} processing tasks for import job ${importJobRef.id}`);
        // 進捗を10%に更新（タスク投入完了）
        await importJobRef.update({
            progress: 10,
        });
    }
    catch (error) {
        console.error('Import initialization error:', error);
        // エラー状態に更新
        await importJobRef.update({
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error during initialization',
            completedAt: admin.firestore.Timestamp.now(),
        });
        throw error;
    }
    return importJobRef.id;
}
// インポート完了チェック関数
async function checkImportCompletion(importJobId) {
    const db = admin.firestore();
    const importJobRef = db.collection('importJobs').doc(importJobId);
    try {
        const importJobDoc = await importJobRef.get();
        if (!importJobDoc.exists) {
            throw new Error('Import job not found');
        }
        const importJob = importJobDoc.data();
        if (importJob.status === 'completed' || importJob.status === 'error') {
            return; // すでに完了
        }
        const { totalFiles, processedFiles, errorFiles } = importJob;
        const completedFiles = processedFiles + ((errorFiles === null || errorFiles === void 0 ? void 0 : errorFiles.length) || 0);
        if (completedFiles >= totalFiles) {
            // 全ファイル処理完了
            await importJobRef.update({
                status: 'completed',
                progress: 100,
                completedAt: admin.firestore.Timestamp.now(),
            });
            console.log(`Import job ${importJobId} completed: ${processedFiles}/${totalFiles} files processed successfully`);
            // ギャラリーの最終更新を実行
            await finalizeGallery(importJob.galleryId, importJobId);
        }
        else {
            // 進捗を更新
            const progress = Math.min(95, Math.floor((completedFiles / totalFiles) * 85) + 10);
            await importJobRef.update({
                progress,
                processedFiles,
            });
        }
    }
    catch (error) {
        console.error('Error checking import completion:', error);
    }
}
// ギャラリー最終処理
async function finalizeGallery(galleryId, importJobId) {
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
            updatedAt: admin.firestore.Timestamp.now(),
            lastImportAt: admin.firestore.Timestamp.now(),
        });
        console.log(`Gallery ${galleryId} finalized with ${artworkIds.length} artworks`);
    }
    catch (error) {
        console.error('Error finalizing gallery:', error);
    }
}
//# sourceMappingURL=importController.js.map