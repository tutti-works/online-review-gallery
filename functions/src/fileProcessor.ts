import sharp from 'sharp';
const pdf2pic = require('pdf2pic');
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getSafeErrorCode } from './httpSecurity';

const logSafeError = (operation: string, error: unknown, context: Record<string, unknown> = {}) => {
  console.error(operation, { ...context, errorCode: getSafeErrorCode(error) });
};

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
  submittedAt?: string,
  isLate?: boolean
): Promise<void> {
  const db = admin.firestore();
  const storage = admin.storage();
  const bucket = storage.bucket();

  // tempFilePathの検証
  if (!tempFilePath || tempFilePath.trim() === '') {
    const error = new Error(`Invalid tempFilePath: "${tempFilePath}" for file: ${fileName}`);
    console.error('Invalid temporary file path', { importJobId, errorCode: 'invalid_temp_file_path' });
    await db.collection('importJobs').doc(importJobId).update({
      errorFiles: FieldValue.arrayUnion(fileName || 'unknown_file'),
    });
    throw error;
  }

  const tempFile = bucket.file(tempFilePath);

  try {
    console.log('Processing file', { importJobId, fileType });

    // ファイルの存在確認（本番環境での同期問題対策）
    const [exists] = await tempFile.exists();
    if (!exists) {
      console.error('Temporary file not found in storage', { importJobId, errorCode: 'file_not_found' });
      // ファイルが存在しない場合、リトライしても無駄なのでエラーとして記録して終了
      await db.collection('importJobs').doc(importJobId).update({
        errorFiles: FieldValue.arrayUnion(fileName),
        processedFiles: FieldValue.increment(1), // カウントを増やして完了判定に含める
      });
      console.log('Marked file as error and incremented processedFiles', { importJobId });
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
    console.log(`Saving artwork to Firestore with ${processedImages.length} images`);

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
      isLate: isLate || false, // 提出期限に遅れたかどうか
      classroomId: '', // importControllerから取得する必要がある場合は追加
      assignmentId: '', // importControllerから取得する必要がある場合は追加
      likeCount: 0,
      labels: [],
      comments: [],
      createdAt: FieldValue.serverTimestamp(),
      importedBy: importJobId,
    };

    await db.collection('artworks').doc(artworkId).set(artwork);
    console.log(`✅ Artwork saved to Firestore: ${artworkId}`);

    // インポートジョブの進捗を更新
    await db.collection('importJobs').doc(importJobId).update({
      processedFiles: FieldValue.increment(1),
    });

    // 一時ファイルを削除
    await tempFile.delete();

    console.log('Successfully processed file and deleted temporary file', { importJobId });

  } catch (error) {
    logSafeError('Error processing file', error, { importJobId, fileType });

    // エラー時も一時ファイルを削除
    try {
      const exists = (await tempFile.exists())[0];
      if (exists) {
        await tempFile.delete();
        console.log('Deleted temporary file after error', { importJobId });
      }
    } catch (deleteError) {
      logSafeError('Failed to delete a temporary file', deleteError, { importJobId });
    }

    // エラーログを記録 & processedFilesをインクリメント（完了判定のため）
    // throwせずにreturnすることで、Cloud Tasksの無限リトライを防ぐ
    const errorInfo = {
      fileName,
      studentName,
      studentEmail,
      fileType,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };

    await db.collection('importJobs').doc(importJobId).update({
      errorFiles: FieldValue.arrayUnion(fileName),
      errorDetails: FieldValue.arrayUnion(errorInfo),
      processedFiles: FieldValue.increment(1), // エラー時もカウントを増やす
    });

    console.log('Marked file as error and incremented processedFiles', { importJobId });

    // エラー情報は既にFirestoreに記録済みなのでthrowしない
    // これによりCloud Tasksがリトライせず、次のタスクに進む
    return;
  }
}

async function processImageFile(
  imageBuffer: Buffer,
  fileName: string,
  storage: admin.storage.Storage,
  galleryId: string,
  startPageNumber?: number
): Promise<ProcessedImage[]> {

  const bucket = storage.bucket();
  const imageId = uuidv4();
  const fileExtension = '.webp';

  // 画像を最適化（A3全画面表示対応: 2400px）
  const optimizedBuffer = await sharp(imageBuffer)
    .resize(OPTIMIZED_IMAGE_SIZE, OPTIMIZED_IMAGE_SIZE, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({
      quality: IMAGE_QUALITY
    })
    .toBuffer();

  // メタデータを取得
  const metadata = await sharp(optimizedBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // サムネイルを生成（全体で1ページ目のみ）
  const globalPageNumber = startPageNumber || 1;
  let thumbnailUrl: string | undefined;
  let thumbnailBuffer: Buffer | undefined;

  if (globalPageNumber === 1) {
    thumbnailBuffer = await sharp(imageBuffer)
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 80 })
      .toBuffer();
  }

  // Firebase Storageにアップロード
  const imagePath = `galleries/${galleryId}/images/${imageId}${fileExtension}`;
  const imageFile = bucket.file(imagePath);

  await imageFile.save(optimizedBuffer, {
    metadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000', // 1年間ブラウザキャッシュ
      metadata: {
        originalName: fileName,
        galleryId,
      }
    }
  });

  // エミュレーター環境判定
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

  let imageUrl: string;

  if (isEmulator) {
    // エミュレーター環境: localhost URLを使用
    imageUrl = `http://localhost:9199/v0/b/${bucket.name}/o/${encodeURIComponent(imagePath)}?alt=media`;
  } else {
    // 本番環境: 公開URLを使用
    await imageFile.makePublic();
    imageUrl = `https://storage.googleapis.com/${bucket.name}/${imagePath}`;
  }

  // サムネイルのアップロードとURL生成（1ページ目のみ）
  if (thumbnailBuffer) {
    const thumbnailPath = `galleries/${galleryId}/thumbnails/${imageId}${fileExtension}`;
    const thumbnailFile = bucket.file(thumbnailPath);

    await thumbnailFile.save(thumbnailBuffer, {
      metadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000', // 1年間ブラウザキャッシュ
        metadata: {
          originalName: fileName,
          galleryId,
          thumbnail: 'true',
        }
      }
    });

    if (isEmulator) {
      thumbnailUrl = `http://localhost:9199/v0/b/${bucket.name}/o/${encodeURIComponent(thumbnailPath)}?alt=media`;
    } else {
      await thumbnailFile.makePublic();
      thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbnailPath}`;
    }
  }

  const imageData: any = {
    id: imageId,
    url: imageUrl,
    pageNumber: 1,
    width,
    height,
  };

  // thumbnailUrlがある場合のみ追加
  if (thumbnailUrl) {
    imageData.thumbnailUrl = thumbnailUrl;
  }

  return [imageData];
}

async function processPdfFile(
  pdfBuffer: Buffer,
  fileName: string,
  storage: admin.storage.Storage,
  galleryId: string,
  maxPages?: number,
  startPageNumber?: number
): Promise<ProcessedImage[]> {

  const bucket = storage.bucket();
  const processedImages: ProcessedImage[] = [];
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

  // エミュレーター環境ではPDF処理をスキップ
  if (isEmulator) {
    console.warn('⚠️ PDF processing skipped in emulator mode');
    console.warn('PDF processing requires GraphicsMagick which is not available in Windows emulator environment');
    console.warn('PDF processing will work in production (Cloud Functions with Linux environment)');
    throw new Error('PDF processing is not supported in emulator mode. Please deploy to production to test PDF files, or test with image files instead.');
  }

  try {
    // 一時ファイル名を一意にするためのプレフィックス
    const uniquePrefix = `pdf-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // PDFを画像に変換（3400x2404px）
    // pdf2picはWebPをサポートしていないため、一旦JPEGに変換してからSharpでWebPに変換
    // PNGだとメモリ使用量が大きくSegmentation Faultが発生するため、JPEGを使用
    const convertOptions = {
      density: 200,
      saveFilename: uniquePrefix,
      savePath: '/tmp',
      format: 'jpeg',
      width: 3400,
      height: 2404,
    };

    const converter = pdf2pic.fromBuffer(pdfBuffer, convertOptions);

    let pages;
    try {
      pages = await converter.bulk(-1);
    } catch (conversionError) {
      // GraphicsMagick/Ghostscriptのクラッシュを検出
      logSafeError('PDF conversion failed', conversionError);
      throw new Error(`PDF conversion failed. The PDF may be corrupt, encrypted, or too complex for processing: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`);
    }

    const pageLimit = maxPages || 50;
    if (pages.length > pageLimit) {
      throw new Error(`PDF has too many pages: ${pages.length} (max: ${pageLimit}). Please split the PDF or reduce page count.`);
    }

    console.log(`Processing PDF with ${pages.length} pages...`);
    if (pages.length > 0) {
      console.log(`Page 0 keys:`, Object.keys(pages[0]));
    }

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNumber = i + 1;
      const globalPageNumber = (startPageNumber || 1) + i; // 全体での通しページ番号
      const imageId = uuidv4();

      if (!page.path) {
        console.warn(`⚠️ Page ${pageNumber} has no path, skipping`);
        continue;
      }

      console.log(`Processing PDF page ${pageNumber}/${pages.length}`);

      // 一時ファイルから画像を読み込み
      const fs = require('fs');
      const pageBuffer = fs.readFileSync(page.path);

      // PDF変換後のサイズを確認
      const originalMetadata = await sharp(pageBuffer).metadata();
      console.log(`Original PDF page size: ${originalMetadata.width}x${originalMetadata.height}`);

      // 画像を最適化
      const optimizedBuffer = await sharp(pageBuffer)
        .resize(OPTIMIZED_IMAGE_SIZE, OPTIMIZED_IMAGE_SIZE, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({
          quality: IMAGE_QUALITY
        })
        .toBuffer();

      const metadata = await sharp(optimizedBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      console.log(`Optimized size: ${width}x${height}`);

      // サムネイルを生成（全体で1ページ目のみ）
      let thumbnailUrl: string | undefined;
      if (globalPageNumber === 1) {
        const thumbnailBuffer = await sharp(pageBuffer)
          .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
            fit: 'inside', // 縦横比を保持（クロップしない）
            withoutEnlargement: true
          })
          .webp({ quality: 80 })
          .toBuffer();

        const thumbnailPath = `galleries/${galleryId}/thumbnails/${imageId}.webp`;
        const thumbnailFile = bucket.file(thumbnailPath);

        await thumbnailFile.save(thumbnailBuffer, {
          metadata: {
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000', // 1年間ブラウザキャッシュ
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
      const imagePath = `galleries/${galleryId}/images/${imageId}.webp`;
      const imageFile = bucket.file(imagePath);

      await imageFile.save(optimizedBuffer, {
        metadata: {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000', // 1年間ブラウザキャッシュ
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

      const imageData: any = {
        id: imageId,
        url: imageUrl,
        pageNumber,
        width,
        height,
      };

      // thumbnailUrlがある場合のみ追加（undefinedを避ける）
      if (thumbnailUrl) {
        imageData.thumbnailUrl = thumbnailUrl;
      }

      processedImages.push(imageData);

      console.log(`✅ PDF page ${pageNumber} processed`);

      // 一時ファイルを削除
      try {
        fs.unlinkSync(page.path);
        console.log('Deleted temporary PDF page');
      } catch (err) {
        console.warn('Failed to delete a temporary PDF page', { errorCode: getSafeErrorCode(err) });
      }
    }

    console.log(`PDF processing complete: ${processedImages.length} images generated`);
    return processedImages;

  } catch (error) {
    logSafeError('PDF processing error', error);
    throw new Error(`Failed to process PDF: ${error}`);
  }
}

// 複数ファイルを1つのartworkとして処理
export async function processMultipleFiles(
  importJobId: string,
  studentName: string,
  studentEmail: string,
  studentId: string,
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
  assignmentId: string,
  existingArtworkId?: string
): Promise<void> {
  const db = admin.firestore();
  const storage = admin.storage();
  const bucket = storage.bucket();

  console.log('Processing submission files', { importJobId, fileCount: files.length });

  const artworksCollection = db.collection('artworks');
  const isOverwrite = Boolean(existingArtworkId);
  const artworkRef = existingArtworkId
    ? artworksCollection.doc(existingArtworkId)
    : artworksCollection.doc();
  const artworkId = artworkRef.id;

  try {
    const allImages: any[] = [];
    const submittedFiles: any[] = [];
    let currentPageNumber = 1;

    // 各ファイルを処理
    for (const file of files) {
      const tempFile = bucket.file(file.tempFilePath);
      const [exists] = await tempFile.exists();

      if (!exists) {
        console.error('Temporary file not found', { importJobId, errorCode: 'file_not_found' });
        await db.collection('importJobs').doc(importJobId).update({
          errorFiles: FieldValue.arrayUnion(file.name),
          processedFiles: FieldValue.increment(1),
        });
        continue;
      }

      // ファイルをダウンロード
      const [fileBuffer] = await tempFile.download();

      // ファイルサイズチェック
      if (fileBuffer.length > MAX_FILE_SIZE) {
        console.error('File exceeds size limit', {
          importJobId,
          errorCode: 'file_too_large',
          sizeBytes: fileBuffer.length,
        });
        await db.collection('importJobs').doc(importJobId).update({
          errorFiles: FieldValue.arrayUnion(file.name),
          processedFiles: FieldValue.increment(1),
        });
        continue;
      }

      // ファイル情報を保存
      submittedFiles.push({
        id: file.id,
        name: file.name,
        type: file.type,
        originalFileUrl: file.originalFileUrl,
        mimeType: file.mimeType,
      });

      // ファイルタイプに応じて処理
      let processedImages: any[];
      if (file.type === 'image') {
        processedImages = await processImageFile(fileBuffer, file.name, storage, galleryId, currentPageNumber);
      } else if (file.type === 'pdf') {
        processedImages = await processPdfFile(fileBuffer, file.name, storage, galleryId, MAX_PDF_PAGES, currentPageNumber);
      } else {
        console.error(`Unsupported file type: ${file.type}`);
        continue;
      }

      // ページ番号を振り直して、sourceFileIdとsourceFileNameを追加
      for (const image of processedImages) {
        allImages.push({
          ...image,
          pageNumber: currentPageNumber++,
          sourceFileId: file.id,
          sourceFileName: file.name,
        });
      }

      // 一時ファイルを削除
      try {
        await tempFile.delete();
        console.log('Deleted temporary file', { importJobId });
      } catch (deleteError) {
        console.warn('Failed to delete a temporary file', {
          importJobId,
          errorCode: getSafeErrorCode(deleteError),
        });
      }
    }

    if (allImages.length === 0) {
      // 画像が1つも処理できなかった場合、エラー作品として保存
      console.error('No images processed; creating error artwork', { importJobId });

      const errorArtwork = {
        id: artworkId,
        title: `${studentName}の提出物`,
        galleryId,
        status: 'error' as const,
        errorReason: 'unsupported_format' as const,
        files: submittedFiles,
        images: [],
        studentName,
        studentEmail,
        studentId: studentId || undefined,
        submittedAt: new Date(submittedAt),
        isLate,
        classroomId,
        assignmentId,
        likeCount: 0,
        labels: [],
        comments: [],
        createdAt: new Date(),
        importedBy: importJobId,
      };

      await artworkRef.set(errorArtwork);
      console.log(`⚠️ ${isOverwrite ? 'Updated existing error artwork' : 'Error artwork created'} (unsupported format)`, {
        importJobId,
        artworkId,
      });

      // ギャラリーのカウントを更新
      const galleryUpdate: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!isOverwrite) {
        galleryUpdate.artworkCount = FieldValue.increment(1);
      }
      await db.collection('galleries').doc(galleryId).update(galleryUpdate);

      await db.collection('importJobs').doc(importJobId).update({
        errorFiles: FieldValue.arrayUnion(...files.map(f => f.name)),
        processedFiles: FieldValue.increment(1),
      });
      return;
    }

    // 正常な作品として保存
    const artwork = {
      id: artworkId,
      title: `${studentName}の提出物`,
      galleryId,
      status: 'submitted' as const,
      files: submittedFiles,
      images: allImages,
      studentName,
      studentEmail,
      studentId: studentId || undefined,
      submittedAt: new Date(submittedAt),
      isLate,
      classroomId,
      assignmentId,
      likeCount: 0,
      labels: [],
      comments: [],
      createdAt: new Date(),
      importedBy: importJobId,
    };

    await artworkRef.set(artwork);
    console.log(isOverwrite ? '🔄 Updated artwork' : '✅ Artwork created', {
      importJobId,
      artworkId,
      imageCount: allImages.length,
      fileCount: files.length,
    });

    // galleryのartworkCountをインクリメント（再利用時はカウント維持）
    const galleryUpdate: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!isOverwrite) {
      galleryUpdate.artworkCount = FieldValue.increment(1);
    }
    await db.collection('galleries').doc(galleryId).update(galleryUpdate);

    // 処理完了をカウント
    await db.collection('importJobs').doc(importJobId).update({
      processedFiles: FieldValue.increment(1),
    });

  } catch (error) {
    logSafeError('Error processing submission files', error, { importJobId });

    // エラーが発生した場合もエラー作品として保存
    try {
      const errorArtwork = {
        id: artworkRef.id,
        title: `${studentName}の提出物`,
        galleryId,
        status: 'error' as const,
        errorReason: 'processing_error' as const,
        files: files.map(f => ({
          id: f.id,
          name: f.name,
          type: f.type,
          originalFileUrl: f.originalFileUrl,
          mimeType: f.mimeType,
        })),
        images: [],
        studentName,
        studentEmail,
        studentId: studentId || undefined,
        submittedAt: new Date(submittedAt),
        isLate,
        classroomId,
        assignmentId,
        likeCount: 0,
        labels: [],
        comments: [],
        createdAt: new Date(),
        importedBy: importJobId,
      };

      await artworkRef.set(errorArtwork);
      console.log(`⚠️ ${isOverwrite ? 'Updated existing error artwork' : 'Error artwork created'} (processing error)`, {
        importJobId,
        artworkId: artworkRef.id,
      });

      // ギャラリーのカウントを更新
      const galleryUpdate: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!isOverwrite) {
        galleryUpdate.artworkCount = FieldValue.increment(1);
      }
      await db.collection('galleries').doc(galleryId).update(galleryUpdate);
    } catch (saveError) {
      logSafeError('Failed to save an error artwork', saveError, { importJobId });
    }

    await db.collection('importJobs').doc(importJobId).update({
      errorFiles: FieldValue.arrayUnion(...files.map(f => f.name)),
      processedFiles: FieldValue.increment(1),
    });

    // エラーをthrowせずに正常終了（処理は継続）
    console.log('Continuing import process after submission error', { importJobId });
  }
}
