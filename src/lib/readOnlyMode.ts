/**
 * Read-Only Mode (UI Preview Mode) Helper
 * 
 * 本番Firebaseに接続しながらローカルでUIを安全に確認するための保護機能。
 * NEXT_PUBLIC_READ_ONLY_MODE=true の場合、Firestoreの書き込みや
 * 破壊的Functions呼び出しをフロントエンドで安全にブロックします。
 */

export const isReadOnlyMode = (): boolean => {
  return process.env.NEXT_PUBLIC_READ_ONLY_MODE === 'true';
};

export const READ_ONLY_NOTICE_MESSAGE =
  '【本番データ保護モード】データの作成・更新・削除・同期は安全に無効化されています。';

export const dispatchReadOnlyToast = (customMessage?: string) => {
  if (typeof window === 'undefined') return;
  const message = customMessage || READ_ONLY_NOTICE_MESSAGE;
  window.dispatchEvent(
    new CustomEvent('app:toast', {
      detail: {
        type: 'warning',
        message,
        duration: 4000,
      },
    })
  );
};
