export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'viewer' | 'guest';
  googleAccessToken?: string; // Google API呼び出し用のアクセストークン
}

export type LabelType =
  | 'red-1'
  | 'red-2'
  | 'red-3'
  | 'red-4'
  | 'red-5'
  | 'blue-1'
  | 'blue-2'
  | 'blue-3'
  | 'blue-4'
  | 'blue-5';

export interface Artwork {
  id: string;
  title: string; // "{studentName}の提出物"
  description?: string;
  galleryId: string; // どのギャラリーに属するか
  files: SubmittedFile[]; // 提出された元ファイル情報（複数対応）
  images: ArtworkImage[]; // Firebase Storage上の変換済み画像配列（全ファイルの全ページ統合）
  studentName: string;
  studentEmail: string;
  submittedAt: Date | string;
  isLate: boolean; // 提出期限に遅れたかどうか
  classroomId: string;
  assignmentId: string;
  likeCount: number;
  labels: LabelType[]; // 管理者が設定できるラベル
  comments: Comment[];
  annotations?: ArtworkAnnotation[]; // 作品への注釈データ
  createdAt: Date | string;
  importedBy: string; // インポート実行者
}

export interface SubmittedFile {
  id: string; // Google Drive File ID
  name: string; // ファイル名（例: "file1.pdf"）
  type: 'image' | 'pdf';
  originalFileUrl: string; // Google Drive上の元ファイルURL
  mimeType: string; // 元のMIMEタイプ
}

export interface ArtworkImage {
  id: string;
  url: string; // Firebase Storage URL
  pageNumber: number; // 全ファイル通しのページ番号（1から開始）
  width: number;
  height: number;
  thumbnailUrl?: string; // サムネイル画像URL
  sourceFileId: string; // どのファイルから生成されたか（SubmittedFile.id）
  sourceFileName: string; // 元ファイル名
}

export interface Comment {
  id: string;
  content: string;
  authorName: string;
  authorEmail: string;
  createdAt: Date | string;
}

export interface Like {
  id: string;
  artworkId: string;
  userEmail: string;
  createdAt: Date | string;
}

export interface Gallery {
  id: string;
  title?: string; // 旧形式との互換性のため残す
  description?: string;
  courseName: string; // 授業名（例: "デザイン基礎"）
  assignmentName: string; // 課題名（例: "第1回課題：ロゴデザイン"）
  courseId: string;
  assignmentId: string;
  classroomId: string; // 旧形式との互換性のため残す
  artworkCount: number; // 作品数（キャッシュ）
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastImportAt?: Date | string;
  artworks?: Artwork[]; // 旧形式との互換性のため残す（使用しない）
}

export interface ImportJob {
  id: string;
  galleryId: string;
  classroomId: string;
  assignmentId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number; // 0-100
  totalFiles: number;
  processedFiles: number;
  errorFiles: string[];
  createdBy: string;
  createdAt: Date | string;
  completedAt?: Date;
  errorMessage?: string;
}

export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  description?: string;
}

export interface CourseAssignment {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  dueDate?: Date | string;
  maxPoints?: number;
}

export interface ArtworkAnnotation {
  pageNumber: number; // 作品内のページ番号（1から開始）
  data: string; // Fabric.jsのJSONデータ（文字列化）
  width: number; // 注釈作成時のキャンバス幅
  height: number; // 注釈作成時のキャンバス高さ
  updatedAt: Date | string; // 更新日時
  updatedBy?: string; // 更新者のメールアドレス
}