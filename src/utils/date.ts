type FirestoreTimestampLike = {
  toDate?: () => Date;
};

export type DateLike = Date | string | number | FirestoreTimestampLike | null | undefined;

/**
 * 文字列・Date どちらでも受け取り Date インスタンスを返す共通変換ヘルパー。
 * Firestore Timestamp など toDate() が無い値も安全に扱うためのガード。
 */
export const toDate = (value: DateLike): Date => {
  if (value === null || value === undefined) {
    return new Date(NaN);
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate();
  }

  return new Date(value as string | number);
};
