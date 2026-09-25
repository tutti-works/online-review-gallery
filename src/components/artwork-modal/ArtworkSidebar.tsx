'use client';

import { useState, type FormEvent } from 'react';
import LabelBadge from '@/components/labels/LabelBadge';
import { LABEL_DEFINITIONS } from '@/constants/labels';
import type { Artwork, LabelType } from '@/types';
import { toDate } from '@/utils/date';

type ArtworkSidebarProps = {
  artwork: Artwork;
  userRole: string;
  isOpen: boolean;
  onToggle: () => void;
  currentFileName: string;
  currentPageNumber: number;
  currentAnnotation: {
    data: string;
    width: number;
    height: number;
  } | null;
  showAnnotation: boolean;
  annotationDirty: boolean;
  onToggleAnnotationMode: () => Promise<void> | void;
  onLike?: () => void;
  onDelete?: () => Promise<void>;
  onToggleLabel?: (label: LabelType) => void;
  onComment?: (comment: string) => Promise<void>;
  isLiked?: boolean;
};

const ArtworkSidebar = ({
  artwork,
  userRole,
  isOpen,
  onToggle,
  currentFileName,
  currentPageNumber,
  currentAnnotation,
  showAnnotation,
  annotationDirty,
  onToggleAnnotationMode,
  onLike,
  onDelete,
  onToggleLabel,
  onComment,
  isLiked,
}: ArtworkSidebarProps) => {
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = userRole === 'admin';
  const isViewer = userRole === 'viewer';
  const liked = Boolean(isLiked);

  const handleLike = () => {
    if (!isAdmin || !onLike) return;
    onLike();
  };

  const handleDelete = async () => {
    if (!isAdmin || !onDelete) return;

    if (!confirm('この作品を削除してもよろしいですか？この操作は取り消せません。')) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete();
    } catch (error) {
      console.error('Delete error:', error);
      alert('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCommentSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !onComment) return;

    const trimmed = commentText.trim();
    if (!trimmed) {
      return;
    }

    setIsSubmittingComment(true);
    try {
      await onComment(trimmed);
      setCommentText('');
    } catch (error) {
      console.error('Comment submission error:', error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute right-0 top-1/2 z-20 flex h-12 w-8 -translate-y-1/2 items-center justify-center rounded-l-xl bg-[#121826]/95 border-l border-t border-b border-white/10 text-slate-400 hover:text-white shadow-xl backdrop-blur-md transition-colors"
        style={{
          transform: `translateY(-50%) translateX(${isOpen ? '-320px' : '0px'})`,
          transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        title={isOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
        aria-expanded={isOpen}
      >
        <svg
          className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-0' : '-rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Sidebar Drawer */}
      <div
        className="absolute right-0 top-0 z-10 flex h-full w-[320px] flex-col border-l border-white/[0.08] bg-[#0c101b]/95 backdrop-blur-2xl shadow-2xl transition-transform duration-300"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div className="border-b border-white/[0.08] p-5">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400 mb-1">
            Artwork Details
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">{artwork.studentName}</h3>
          <p className="mt-1 text-xs text-slate-300 truncate font-mono">{currentFileName}</p>
          <div className="mt-3 space-y-1 text-[11px] text-slate-400">
            <p className="truncate">{artwork.studentEmail}</p>
            <div className="flex items-center justify-between text-slate-500 font-mono">
              <span>提出: {toDate(artwork.submittedAt).toLocaleDateString('ja-JP')}</span>
              <span>P.{currentPageNumber}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Actions: Like & Delete */}
          <div className="space-y-3">
            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleLike}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 ${
                    liked
                      ? 'border-rose-500/40 bg-rose-500/20 text-rose-300'
                      : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200'
                  }`}
                >
                  <svg
                    className={`h-4 w-4 ${liked ? 'text-rose-400' : 'text-slate-400'}`}
                    fill={liked ? 'currentColor' : 'none'}
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                  <span>いいね ({artwork.likeCount})</span>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 px-3.5 py-2 text-xs font-semibold transition active:scale-95 disabled:opacity-40"
                >
                  {isDeleting ? '削除中...' : '削除'}
                </button>
              </div>
            )}

            {isViewer && (
              <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/10 p-3 text-xs text-slate-300">
                <svg
                  className={`h-4 w-4 ${liked ? 'text-rose-400' : 'text-slate-400'}`}
                  fill={liked ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
                <span>いいね {artwork.likeCount}</span>
              </div>
            )}
          </div>

          {/* Labels Selection */}
          {isAdmin && onToggleLabel && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">レビューラベル</h4>
              <div className="grid grid-cols-5 gap-2 p-2 rounded-xl bg-slate-900/60 border border-white/10">
                {LABEL_DEFINITIONS.map((label) => {
                  const isActive = artwork.labels?.includes(label.type);
                  return (
                    <button
                      key={label.type}
                      onClick={() => onToggleLabel(label.type)}
                      title={label.type}
                      aria-label={`${label.type.split('-')[0]} ${label.symbol}点を${isActive ? '解除' : '選択'}`}
                      aria-pressed={isActive}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
                        isActive
                          ? `${label.bgColor} border-white shadow-md scale-105`
                          : 'border-white/5 bg-slate-800/40 hover:border-white/20 text-slate-400'
                      }`}
                    >
                      <LabelBadge label={label.type} isActive={isActive} className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Annotation Mode */}
          {isAdmin && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">画面注釈ツール</h4>
              <button
                onClick={() => void onToggleAnnotationMode()}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all active:scale-95 shadow-md ${
                  showAnnotation
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-500/25 ring-2 ring-orange-500/40'
                    : 'bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-slate-200'
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
                <span>{showAnnotation ? '注釈モード終了' : 'ペンで画面に注釈を描く'}</span>
              </button>
              {currentAnnotation && !showAnnotation && (
                <p className="text-[11px] text-orange-400/80 font-mono">✓ このページには注釈があります</p>
              )}
              {annotationDirty && showAnnotation && (
                <p className="text-[11px] text-amber-400 font-mono animate-pulse">● 未保存の描画があります</p>
              )}
            </div>
          )}

          {/* Comments Section */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">コメント</h4>
              <span className="text-xs text-slate-500 font-mono">{artwork.comments.length}件</span>
            </div>

            {isAdmin && onComment && (
              <form onSubmit={handleCommentSubmit} className="space-y-2">
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="講評コメントを入力..."
                  rows={3}
                  className="block w-full resize-none rounded-xl border border-white/10 bg-[#121826] px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 shadow-inner focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || isSubmittingComment}
                  className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 shadow-md"
                >
                  {isSubmittingComment ? '送信中...' : 'コメントを送信'}
                </button>
              </form>
            )}

            <div className="space-y-2.5">
              {artwork.comments.length > 0 ? (
                artwork.comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl bg-[#121826]/70 border border-white/[0.06] p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-orange-400">{comment.authorName}</span>
                      <span className="text-slate-500 font-mono">
                        {toDate(comment.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 font-mono text-center py-4">まだコメントはありません</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ArtworkSidebar;
