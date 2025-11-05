import { Artwork } from '@/types';

/**
 * 作品が提出済み状態かどうかを判定
 */
export function isSubmitted(artwork: Artwork): boolean {
  return artwork.status === 'submitted';
}

/**
 * 作品が未提出状態かどうかを判定
 */
export function isNotSubmitted(artwork: Artwork): boolean {
  return artwork.status === 'not_submitted';
}

/**
 * 作品がエラー状態かどうかを判定
 */
export function isError(artwork: Artwork): boolean {
  return artwork.status === 'error';
}

/**
 * 作品が不完全状態（未提出またはエラー）かどうかを判定
 */
export function isIncomplete(artwork: Artwork): boolean {
  return isNotSubmitted(artwork) || isError(artwork);
}

/**
 * 作品の状態に応じた表示テキストを取得
 */
export function getStatusText(artwork: Artwork): string {
  if (isNotSubmitted(artwork)) {
    return '未提出';
  }
  if (isError(artwork)) {
    if (artwork.errorReason === 'unsupported_format') {
      return 'エラー: サポートされていない形式';
    }
    if (artwork.errorReason === 'processing_error') {
      return 'エラー: 処理失敗';
    }
    return 'エラー';
  }
  return '';
}

/**
 * 学籍番号を取得（存在しない場合はメールアドレスから推測）
 */
export function getStudentId(artwork: Artwork): string {
  if (artwork.studentId) {
    return artwork.studentId;
  }
  // メールアドレスから学籍番号を推測（例: s1234567@example.com → s1234567）
  const match = artwork.studentEmail.match(/^([^@]+)/);
  return match ? match[1] : artwork.studentEmail;
}

/**
 * 作品を提出日時順でソート（未提出・エラーは末尾に学籍番号順）
 */
export function sortBySubmissionDate(artworks: Artwork[]): Artwork[] {
  return [...artworks].sort((a, b) => {
    const aSubmitted = isSubmitted(a);
    const bSubmitted = isSubmitted(b);

    // 両方とも提出済み: 提出日時順
    if (aSubmitted && bSubmitted) {
      const aDate = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bDate = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return aDate - bDate;
    }

    // aが提出済み、bが未提出・エラー: aを先に
    if (aSubmitted && !bSubmitted) {
      return -1;
    }

    // aが未提出・エラー、bが提出済み: bを先に
    if (!aSubmitted && bSubmitted) {
      return 1;
    }

    // 両方とも未提出・エラー: 学籍番号順
    return getStudentId(a).localeCompare(getStudentId(b));
  });
}

/**
 * 作品を学籍番号順でソート
 */
export function sortByStudentId(artworks: Artwork[]): Artwork[] {
  return [...artworks].sort((a, b) => {
    return getStudentId(a).localeCompare(getStudentId(b));
  });
}

/**
 * 作品をフィルタリング（不完全作品を除外）
 */
export function filterCompleteArtworks(artworks: Artwork[]): Artwork[] {
  return artworks.filter(artwork => !isIncomplete(artwork));
}
