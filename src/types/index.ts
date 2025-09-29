export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'viewer';
  googleAccessToken?: string; // Google API呼び出し用のアクセストークン
}

export interface Artwork {
  id: string;
  title: string;
  description?: string;
  originalFileUrl: string; // Google Drive上の元ファイル
  images: ArtworkImage[]; // Firebase Storage上の変換済み画像配列
  fileType: 'image' | 'pdf';
  studentName: string;
  studentEmail: string;
  submittedAt: Date | string;
  classroomId: string;
  assignmentId: string;
  likeCount: number;
  comments: Comment[];
  createdAt: Date | string;
  importedBy: string; // インポート実行者
}

export interface ArtworkImage {
  id: string;
  url: string; // Firebase Storage URL
  pageNumber: number; // PDFの場合のページ番号（画像の場合は1）
  width: number;
  height: number;
  thumbnailUrl?: string; // サムネイル画像URL
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