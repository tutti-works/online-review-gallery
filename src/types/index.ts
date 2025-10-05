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
  title: string;
  description?: string;
  classroomId: string;
  assignmentId: string;
  createdBy: string;
  createdAt: Date | string;
  artworks: Artwork[];
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