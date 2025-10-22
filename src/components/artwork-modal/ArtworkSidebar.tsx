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
  onToggleAnnotationMode: () => void;
  onLike?: () => void;
  onDelete?: () => Promise<void>;
  onToggleLabel?: (label: LabelType) => void;
  onComment?: (comment: string) => Promise<void>;
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
}: ArtworkSidebarProps) => {
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = userRole === 'admin';
  const isViewer = userRole === 'viewer';

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
      <button
        onClick={onToggle}
        className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-l-lg bg-white p-2 shadow-lg transition-all hover:bg-gray-50"
        style={{
          right: isOpen ? '310px' : '0px',
          transition: 'right 300ms ease-in-out',
        }}
        title={isOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
      >
        <svg
          className="h-5 w-5 text-gray-600 transition-transform"
          style={{
            transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 300ms ease-in-out',
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div
        className="absolute right-0 top-0 z-10 flex h-full w-[310px] flex-col border-l border-gray-200 bg-white transition-transform duration-300 ease-in-out"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div className="border-b border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900">{artwork.studentName}</h3>
          <p className="mt-1 text-sm text-gray-600">{currentFileName}</p>
          <p className="mt-1 text-xs text-gray-400">{artwork.studentEmail}</p>
          <p className="mt-1 text-xs text-gray-400">
            提出日: {toDate(artwork.submittedAt).toLocaleString('ja-JP')}
          </p>
          <p className="mt-1 text-xs text-gray-400">ページ: {currentPageNumber}</p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="space-y-3">
            {isAdmin && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleLike}
                  className="flex flex-1 items-center justify-center space-x-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? '削除中...' : '削除'}
                </button>
              </div>
            )}

            {isViewer && (
              <div className="flex items-center space-x-2 rounded-md bg-gray-50 p-3 text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

          {isAdmin && onToggleLabel && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900">ラベル</h4>
              <div className="grid grid-cols-5 gap-2">
                {LABEL_DEFINITIONS.map((label) => {
                  const isActive = artwork.labels?.includes(label.type);
                  return (
                    <button
                      key={label.type}
                      onClick={() => onToggleLabel(label.type)}
                      className={`flex h-8 w-8 items-center justify-center rounded border transition-colors ${
                        isActive ? `${label.bgColor} border-gray-300` : 'border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <LabelBadge label={label.type} isActive={isActive} className="h-5 w-5 text-sm" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900">注釈</h4>
              <button
                onClick={onToggleAnnotationMode}
                className={`flex w-full items-center justify-center space-x-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  showAnnotation
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
                <span>{showAnnotation ? '注釈モード終了' : '注釈モード開始'}</span>
              </button>
              {currentAnnotation && !showAnnotation && (
                <p className="text-xs text-gray-500">このページには注釈があります。</p>
              )}
              {annotationDirty && showAnnotation && (
                <p className="text-xs text-orange-600">未保存の変更があります。</p>
              )}
            </div>
          )}

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">コメント</h4>

            {isAdmin && onComment && (
              <form onSubmit={handleCommentSubmit} className="space-y-3">
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="コメントを入力してください..."
                  rows={4}
                  className="block w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || isSubmittingComment}
                  className="w-full rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingComment ? '送信中...' : 'コメントを投稿'}
                </button>
              </form>
            )}

            <div className="space-y-3">
              {artwork.comments.length > 0 ? (
                artwork.comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg bg-gray-50 p-3">
                    <div className="mb-1 flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">{comment.authorName}</span>
                      <span className="text-xs text-gray-500">
                        {toDate(comment.createdAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{comment.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">まだコメントはありません。</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ArtworkSidebar;
