import { processFile } from './fileProcessor';
import { checkImportCompletion } from './importController';
import { Request, Response } from 'express';

// Cloud Tasks からの HTTP リクエストを処理する関数
export async function processFileTaskHttp(req: Request, res: Response): Promise<void> {
  try {
    // Cloud Tasks からのペイロードを取得
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
    } = req.body;

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

      res.status(200).send({ success: true, message: `File processed: ${fileName}` });
    } catch (error) {
      console.error(`File processing error for ${fileName}:`, error);

      // エラー時もインポート完了状態をチェック（他のファイルは完了している可能性があるため）
      try {
        await checkImportCompletion(importJobId);
      } catch (checkError) {
        console.error('Error checking import completion:', checkError);
      }

      // processFile内でエラーは既に処理されているため、
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
