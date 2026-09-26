export const isLocalPreview = () =>
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW === 'true';

export function blockPreviewWrite(): boolean {
  if (!isLocalPreview()) return false;
  window.alert('プレビューのため変更は保存されません。');
  return true;
}
