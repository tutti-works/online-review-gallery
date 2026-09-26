import { isLocalPreview } from './localPreview';

export const previewFetch: typeof fetch = (input, init) => {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase();
  if (isLocalPreview() && method !== 'GET' && method !== 'HEAD') {
    return Promise.reject(new Error('プレビューのため変更は保存されません。'));
  }
  return fetch(input, init);
};
