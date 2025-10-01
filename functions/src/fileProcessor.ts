import sharp from 'sharp';
const pdf2pic = require('pdf2pic');
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';

interface ProcessedImage {
  id: string;
  url: string;
  pageNumber: number;
  width: number;
  height: number;
  thumbnailUrl?: string;
}

// ファイルサイズ制限（バイト）
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_PDF_PAGES = 50; // PDFの最大ページ数

// 画像最適化設定
// A3サイズ横向き（420mm×297mm）を全画面表示しても綺麗に見えるサイズ（200 DPI相当）
// 計算: 420mm ÷ 25.4mm × 200 DPI = 3,307px ≈ 3400px
const OPTIMIZED_IMAGE_SIZE = 3400; // 長辺の最大サイズ（px）
const THUMBNAIL_WIDTH = 420; // サムネイル幅（A3比率）
const THUMBNAIL_HEIGHT = 297; // サムネイル高さ（A3比率）
const IMAGE_QUALITY = 85; // JPEG品質（0-100）

export async function processFile(
  importJobId: string,
  tempFilePath: string,
  fileName: string,
  fileType: string,
  studentName: string,
  studentEmail: string,
  galleryId: string,
  originalFileUrl: string,
  submittedAt?: string
): Promise<void> {
  const db = admin.firestore();
  const storage = admin.storage();
  const bucket = storage.bucket();

  // tempFilePathの検証
  if (!tempFilePath || tempFilePath.trim() === '') {
    const error = new Error(`Invalid tempFilePath: "${tempFilePath}" for file: ${fileName}`);
    console.error(error.message);
    await db.collection('importJobs').doc(importJobId).update({
      errorFiles: FieldValue.arrayUnion(fileName || 'unknown_file'),
    });
    throw error;
  }

  const tempFile = bucket.file(tempFilePath);

  try {
    console.log(`Processing file: ${fileName} for student: ${studentName} from ${tempFilePath}`);

    // ファイルの存在確認（本番環境での同期問題対策）
    const [exists] = await tempFile.exists();
    if (!exists) {
      console.error(`File not found in storage: ${tempFilePath}`);
      // ファイルが存在しない場合、リトライしても無駄なのでエラーとして記録して終了
      await db.collection('importJobs').doc(importJobId).update({
        errorFiles: FieldValue.arrayUnion(fileName),
        processedFiles: FieldValue.increment(1), // カウントを増やして完了判定に含める
      });
      console.log(`Marked file as error and incremented processedFiles: ${fileName}`);
      return; // throwせずにreturnすることでCloud Tasksのリトライを防ぐ
    }

    // Firebase Storageからファイルをダウンロード
    const [fileBuffer] = await tempFile.download();

    // ファイルサイズチェック
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    console.log(`File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    // ファイルタイプに応じて処理
    let processedImages: ProcessedImage[];
    if (fileType === 'image') {
      processedImages = await processImageFile(fileBuffer, fileName, storage, galleryId);
    } else if (fileType === 'pdf') {
      processedImages = await processPdfFile(fileBuffer, fileName, storage, galleryId, MAX_PDF_PAGES);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    // アートワークをFirestoreに保存
    const artworkId = db.collection('artworks').doc().id;
    const artwork = {
      id: artworkId,
      title: fileName,
      originalFileUrl,
      thumbnailUrl: processedImages[0]?.thumbnailUrl || '', // フロントエンド表示用のトップレベルサムネイル
      images: processedImages,
      fileType,
      studentName,
      studentEmail,
      submittedAt: submittedAt ? Timestamp.fromDate(new Date(submittedAt)) : FieldValue.serverTimestamp(),
      classroomId: '', // importControllerから取得する必要がある場合は追加
      assignmentId: '', // importControllerから取得する必要がある場合は追加
      likeCount: 0,
      comments: [],
      createdAt: FieldValue.serverTimestamp(),
      importedBy: importJobId,
    };

    await db.collection('artworks').doc(artworkId).set(artwork);

    // インポートジョブの進捗を更新
    await db.collection('importJobs').doc(importJobId).update({
      processedFiles: FieldValue.increment(1),
    });

    // 一時ファイルを削除
    await tempFile.delete();

    console.log(`Successfully processed file: ${fileName} and deleted temp file.`);

  } catch (error) {
    console.error(`Error processing file ${fileName}:`, error);

    // エラー時も一時ファイルを削除
    try {
      const exists = (await tempFile.exists())[0];
      if (exists) {
        await tempFile.delete();
        console.log(`Deleted temp file after error: ${tempFilePath}`);
      }
    } catch (deleteError) {
      console.error(`Failed to delete temp file ${tempFilePath}:`, deleteError);
    }

    // エラーログを記録
    await db.collection('importJobs').doc(importJobId).update({
      errorFiles: FieldValue.arrayUnion(tempFilePath),
    });

    throw error;
  }
}

async function processImageFile(
  imageBuffer: Buffer,
  fileName: string,
  storage: admin.storage.Storage,
  galleryId: string
): Promise<ProcessedImage[]> {

  const bucket = storage.bucket();
  const imageId = uuidv4();
  const fileExtension = '.jpg';

  // 画像を最適化（A3全画面表示対応: 2400px）
  const optimizedBuffer = await sharp(imageBuffer)
    .resize(OPTIMIZED_IMAGE_SIZE, OPTIMIZED_IMAGE_SIZE, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({
      quality: IMAGE_QUALITY,
      progressive: true
    })
    .toBuffer();

  // メタデータを取得
  const metadata = await sharp(optimizedBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // サムネイルを生成（A3比率: 420×297px）
  const thumbnailBuffer = await sharp(imageBuffer)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 80 })
    .toBuffer();

  // Firebase Storageにアップロード
  const imagePath = `galleries/${galleryId}/images/${imageId}${fileExtension}`;
  const thumbnailPath = `galleries/${galleryId}/thumbnails/${imageId}${fileExtension}`;

  const [imageFile, thumbnailFile] = await Promise.all([
    bucket.file(imagePath),
    bucket.file(thumbnailPath)
  ]);

  await Promise.all([
    imageFile.save(optimizedBuffer, {
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          originalName: fileName,
          galleryId,
        }
      }
    }),
    thumbnailFile.save(thumbnailBuffer, {
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          originalName: fileName,
          galleryId,
          thumbnail: 'true',
        }
      }
    })
  ]);

  // エミュレーター環境判定
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

  let imageUrl: string;
  let thumbnailUrl: string;

  if (isEmulator) {
    // エミュレーター環境: localhost URLを使用
    imageUrl = `http://localhost:9199/v0/b/${bucket.name}/o/${encodeURIComponent(imagePath)}?alt=media`;
    thumbnailUrl = `http://localhost:9199/v0/b/${bucket.name}/o/${encodeURIComponent(thumbnailPath)}?alt=media`;
    console.log(`🔧 Emulator Storage URL: ${imageUrl}`);
  } else {
    // 本番環境: 公開URLを使用
    await Promise.all([
      imageFile.makePublic(),
      thumbnailFile.makePublic()
    ]);
    imageUrl = `https://storage.googleapis.com/${bucket.name}/${imagePath}`;
    thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbnailPath}`;
  }

  return [{
    id: imageId,
    url: imageUrl,
    pageNumber: 1,
    width,
    height,
    thumbnailUrl,
  }];
}

async function processPdfFile(
  pdfBuffer: Buffer,
  fileName: string,
  storage: admin.storage.Storage,
  galleryId: string,
  maxPages?: number
): Promise<ProcessedImage[]> {

  const bucket = storage.bucket();
  const processedImages: ProcessedImage[] = [];
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

  // エミュレーター環境ではPDF処理をスキップ
  if (isEmulator) {
    console.warn(`⚠️ PDF processing skipped in emulator mode: ${fileName}`);
    console.warn('PDF processing requires GraphicsMagick which is not available in Windows emulator environment');
    console.warn('PDF processing will work in production (Cloud Functions with Linux environment)');
    throw new Error('PDF processing is not supported in emulator mode. Please deploy to production to test PDF files, or test with image files instead.');
  }

  try {
    // PDFを画像に変換（A3サイズ対応: 200 DPI相当）
    const convertOptions = {
      density: 200,
      saveFilename: 'page',
      savePath: '/tmp',
      format: 'jpeg',
      width: OPTIMIZED_IMAGE_SIZE,
      height: OPTIMIZED_IMAGE_SIZE,
    };

    const converter = pdf2pic.fromBuffer(pdfBuffer, convertOptions);
    const pages = await converter.bulk(-1);

    const pageLimit = maxPages || 50;
    if (pages.length > pageLimit) {
      throw new Error(`PDF has too many pages: ${pages.length} (max: ${pageLimit}). Please split the PDF or reduce page count.`);
    }

    console.log(`Processing PDF with ${pages.length} pages...`);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNumber = i + 1;
      const imageId = uuidv4();

      if (!page.buffer) continue;

      // 画像を最適化
      const optimizedBuffer = await sharp(page.buffer)
        .resize(OPTIMIZED_IMAGE_SIZE, OPTIMIZED_IMAGE_SIZE, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: IMAGE_QUALITY,
          progressive: true
        })
        .toBuffer();

      const metadata = await sharp(optimizedBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      // サムネイルを生成（1ページ目のみ）
      let thumbnailUrl: string | undefined;
      if (pageNumber === 1) {
        const thumbnailBuffer = await sharp(page.buffer)
          .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        const thumbnailPath = `galleries/${galleryId}/thumbnails/${imageId}.jpg`;
        const thumbnailFile = bucket.file(thumbnailPath);

        await thumbnailFile.save(thumbnailBuffer, {
          metadata: {
            contentType: 'image/jpeg',
            metadata: {
              originalName: fileName,
              galleryId,
              pageNumber: pageNumber.toString(),
              thumbnail: 'true',
            }
          }
        });

        await thumbnailFile.makePublic();
        thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbnailPath}`;
      }

      // メイン画像をアップロード
      const imagePath = `galleries/${galleryId}/images/${imageId}.jpg`;
      const imageFile = bucket.file(imagePath);

      await imageFile.save(optimizedBuffer, {
        metadata: {
          contentType: 'image/jpeg',
          metadata: {
            originalName: fileName,
            galleryId,
            pageNumber: pageNumber.toString(),
          }
        }
      });

      let imageUrl: string;
      if (isEmulator) {
        imageUrl = `http://localhost:9199/v0/b/${bucket.name}/o/${encodeURIComponent(imagePath)}?alt=media`;
      } else {
        await imageFile.makePublic();
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${imagePath}`;
      }

      processedImages.push({
        id: imageId,
        url: imageUrl,
        pageNumber,
        width,
        height,
        thumbnailUrl,
      });
    }

    return processedImages;

  } catch (error) {
    console.error('PDF processing error:', error);
    throw new Error(`Failed to process PDF: ${error}`);
  }
}