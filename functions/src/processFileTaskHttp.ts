import { processMultipleFiles } from './fileProcessor';
import { checkImportCompletion } from './importController';
import { Request, Response } from 'express';

// Cloud Tasks からの HTTP リクエストを処理する関数
export async function processFileTaskHttp(req: Request, res: Response): Promise<void> {
  try {
    // Cloud Tasks からのペイロードを取得
    const {
      importJobId,
      studentName,
      studentEmail,
      studentId = '',
      submittedAt,
      isLate,
      files,
      galleryId,
      classroomId,
      assignmentId,
      existingArtworkId,
    } = req.body;

    console.log(`Processing submission for ${studentName} with ${files?.length || 0} files`);

    try {
      await processMultipleFiles(
        importJobId,
        studentName,
        studentEmail,
        studentId,
        submittedAt,
        isLate,
        files,
        galleryId,
        classroomId,
        assignmentId,
        existingArtworkId
      );

      console.log(`Submission processed successfully for ${studentName}`);

      // ファイル処理完了後、インポート全体の完了状態をチェック
      await checkImportCompletion(importJobId);

      res.status(200).send({ success: true, message: `Submission processed for ${studentName}` });
    } catch (error) {
      console.error(`Submission processing error for ${studentName}:`, error);

      // エラー時もインポート完了状態をチェック（他のファイルは完了している可能性があるため）
      try {
        await checkImportCompletion(importJobId);
      } catch (checkError) {
        console.error('Error checking import completion:', checkError);
      }

      // processMultipleFiles内でエラーは既に処理されているため、
      // 200を返してCloud Tasksにリトライさせない
      res.status(200).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        note: 'Error logged in Firestore, task marked as completed to prevent retry'
      });
    }
  } catch (error) {
    console.error('Invalid request:', error);
    res.status(400).send({
      success: false,
      error: 'Invalid request payload'
    });
  }
}
