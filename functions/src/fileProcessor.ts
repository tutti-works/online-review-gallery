import sharp from 'sharp';
const pdf2pic = require('pdf2pic');
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { google, Auth } from 'googleapis';
import { FieldValue } from 'firebase-admin/firestore';

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
  auth: Auth.GoogleAuth | Auth.OAuth2Client
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
      submittedAt: FieldValue.serverTimestamp(),
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

    console.log(`Successfully processed file: ${fileName}`);

  } catch (error) {
    console.error(`Error processing file ${fileName}:`, error);

    // エラーログを記録
    await db.collection('importJobs').doc(importJobId).update({
      errorFiles: FieldValue.arrayUnion(fileId),
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
  galleryId: string
): Promise<ProcessedImage[]> {

  const bucket = storage.bucket();
  const processedImages: ProcessedImage[] = [];

  // エミュレーター環境ではPDF処理をスキップ（pdf2picがWindows環境で動作しないため）
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  if (isEmulator) {
    console.warn(`⚠️ PDF processing skipped in emulator mode: ${fileName}`);
    console.warn('PDF processing requires GraphicsMagick/ImageMagick which is not available in Windows emulator environment');
    throw new Error('PDF processing is not supported in emulator mode. Please test with image files instead.');
  }

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

        // エミュレーター環境ではmakePublicを呼ばない
        if (isEmulator) {
          thumbnailUrl = `http://localhost:9199/v0/b/${bucket.name}/o/${encodeURIComponent(thumbnailPath)}?alt=media`;
        } else {
          await thumbnailFile.makePublic();
          thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbnailPath}`;
        }
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