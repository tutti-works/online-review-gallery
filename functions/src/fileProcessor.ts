import * as sharp from 'sharp';
const pdf2pic = require('pdf2pic');
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { google, Auth } from 'googleapis';
import { checkImportCompletion } from './importController';

interface ProcessedImage {
  id: string;
  url: string;
  pageNumber: number;
  width: number;
  height: number;
  thumbnailUrl?: string;
}

export async function processFile(
  importJobId: string,
  fileId: string,
  fileName: string,
  fileType: string,
  studentName: string,
  studentEmail: string,
  galleryId: string,
  auth: Auth.GoogleAuth
): Promise<void> {
  const db = admin.firestore();
  const storage = admin.storage();

  try {
    console.log(`Processing file: ${fileName} for student: ${studentName}`);

    // Google Driveからファイルをダウンロード
    const drive = google.drive({ version: 'v3', auth });
    const fileResponse = await drive.files.get({
      fileId,
      alt: 'media',
    }, { responseType: 'arraybuffer' });

    const fileBuffer = Buffer.from(fileResponse.data as ArrayBuffer);

    // ファイルタイプに応じて処理
    let processedImages: ProcessedImage[];
    if (fileType === 'image') {
      processedImages = await processImageFile(fileBuffer, fileName, storage, galleryId);
    } else if (fileType === 'pdf') {
      processedImages = await processPdfFile(fileBuffer, fileName, storage, galleryId);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    // アートワークをFirestoreに保存
    const artworkId = db.collection('artworks').doc().id;
    const artwork = {
      id: artworkId,
      title: fileName,
      originalFileUrl: `https://drive.google.com/file/d/${fileId}/view`,
      images: processedImages,
      fileType,
      studentName,
      studentEmail,
      submittedAt: admin.firestore.Timestamp.now(),
      classroomId: '', // importControllerから取得する必要がある場合は追加
      assignmentId: '', // importControllerから取得する必要がある場合は追加
      likeCount: 0,
      comments: [],
      createdAt: admin.firestore.Timestamp.now(),
      importedBy: importJobId,
    };

    await db.collection('artworks').doc(artworkId).set(artwork);

    // インポートジョブの進捗を更新
    await db.collection('importJobs').doc(importJobId).update({
      processedFiles: admin.firestore.FieldValue.increment(1),
    });

    // 完了チェックを実行
    await checkImportCompletion(importJobId);

    console.log(`Successfully processed file: ${fileName}`);

  } catch (error) {
    console.error(`Error processing file ${fileName}:`, error);

    // エラーログを記録
    await db.collection('importJobs').doc(importJobId).update({
      errorFiles: admin.firestore.FieldValue.arrayUnion(fileId),
    });

    // 完了チェックを実行（エラーでも進捗を更新）
    await checkImportCompletion(importJobId);

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

  // 画像を最適化
  const optimizedBuffer = await sharp(imageBuffer)
    .resize(1920, 1920, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({
      quality: 85,
      progressive: true
    })
    .toBuffer();

  // メタデータを取得
  const metadata = await sharp(optimizedBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // サムネイルを生成
  const thumbnailBuffer = await sharp(imageBuffer)
    .resize(400, 400, {
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

  // 公開URLを取得
  await Promise.all([
    imageFile.makePublic(),
    thumbnailFile.makePublic()
  ]);

  const imageUrl = `https://storage.googleapis.com/${bucket.name}/${imagePath}`;
  const thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbnailPath}`;

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
  galleryId: string
): Promise<ProcessedImage[]> {

  const bucket = storage.bucket();
  const processedImages: ProcessedImage[] = [];

  try {
    // PDFを画像に変換
    const convertOptions = {
      density: 150, // DPI
      saveFilename: 'page',
      savePath: '/tmp',
      format: 'jpeg',
      width: 1920,
      height: 1920,
    };

    const converter = pdf2pic.fromBuffer(pdfBuffer, convertOptions);
    const pages = await converter.bulk(-1); // 全ページを変換

    // 各ページを処理
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNumber = i + 1;
      const imageId = uuidv4();

      if (!page.buffer) continue;

      // 画像を最適化
      const optimizedBuffer = await sharp(page.buffer)
        .resize(1920, 1920, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: 85,
          progressive: true
        })
        .toBuffer();

      // メタデータを取得
      const metadata = await sharp(optimizedBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      // サムネイルを生成（1ページ目のみ）
      let thumbnailUrl: string | undefined;
      if (pageNumber === 1) {
        const thumbnailBuffer = await sharp(page.buffer)
          .resize(400, 400, {
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

      await imageFile.makePublic();
      const imageUrl = `https://storage.googleapis.com/${bucket.name}/${imagePath}`;

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