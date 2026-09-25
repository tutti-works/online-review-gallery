'use client';

import { isReadOnlyMode, dispatchReadOnlyToast } from '@/lib/readOnlyMode';

export default function ReadOnlyBadge() {
  const readOnly = isReadOnlyMode();

  if (!readOnly) return null;

  return (
    <button
      onClick={() => dispatchReadOnlyToast()}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors shadow-sm select-none"
      title="本番データ保護モードが有効です（クリックで詳細）"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
      <span>Read-Only Mode</span>
    </button>
  );
}
