'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnnotationCanvasHandle,
  AnnotationSavePayload,
  AnnotationSaveReason,
} from '@/components/AnnotationCanvas';
import type { Artwork, LabelType } from '@/types';
import ArtworkViewer from './artwork-modal/ArtworkViewer';
import ArtworkSidebar from './artwork-modal/ArtworkSidebar';
import { convertLinesToStageJSON } from '@/utils/annotations';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { isIncomplete, getStatusText } from '@/lib/artworkUtils';
import { isReadOnlyMode, dispatchReadOnlyToast } from '@/lib/readOnlyMode';

interface ArtworkModalProps {
  artwork: Artwork;
  artworks: Artwork[];
  currentIndex: number;
  onNavigate: (artwork: Artwork) => void;
  isOpen: boolean;
  onClose: () => void;
  onLike?: (artworkId: string) => void;
  onComment?: (artworkId: string, comment: string) => Promise<void>;
  onDelete?: (artworkId: string) => Promise<void>;
  onToggleLabel?: (artworkId: string, label: LabelType) => void;
  onSaveAnnotation?: (artworkId: string, pageNumber: number, annotation: AnnotationSavePayload | null) => Promise<void>;
  userRole: string;
  isLiked?: boolean;
}

const ArtworkModal = ({
  artwork,
  artworks,
  currentIndex,
  onNavigate,
  isOpen,
  onClose,
  onLike,
  onComment,
  onDelete,
  onToggleLabel,
  onSaveAnnotation,
  userRole,
  isLiked,
}: ArtworkModalProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);
  const [annotationDirty, setAnnotationDirty] = useState(false);
  const [annotationOverlayVisible, setAnnotationOverlayVisible] = useState(true);
  const annotationCanvasRef = useRef<AnnotationCanvasHandle | null>(null);
  const { isOnline } = useNetworkStatus();

  const requestAutoSave = useCallback(
    async (reason: AnnotationSaveReason) => {
      if (!showAnnotation || !annotationDirty) {
        return true;
      }

      const handle = annotationCanvasRef.current;
      if (!handle) {
        console.warn('[ArtworkModal] Annotation canvas ref is unavailable for auto-save.');
        return false;
      }

      try {
        await handle.save({ reason });
        const latestHandle = annotationCanvasRef.current;
        if (latestHandle?.hasDirtyChanges()) {
          console.warn('[ArtworkModal] Auto-save completed but dirty flag remains. Proceeding anyway.');
        }
        setAnnotationDirty(false);
        return true;
      } catch (error) {
        console.error('[ArtworkModal] Auto-save failed:', error);
        return false;
      }
    },
    [annotationDirty, setAnnotationDirty, showAnnotation],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setCurrentPage(0);
    setIsSidebarOpen(false);
    setShowAnnotation(false);
    setAnnotationDirty(false);
    setAnnotationOverlayVisible(true);
  }, [artwork.id, isOpen]);

  const currentImage = artwork.images[currentPage] ?? artwork.images[0];

  const currentFileName = useMemo(() => {
    if (!currentImage) {
      return artwork.title;
    }
    return (
      currentImage.sourceFileName?.trim() ||
      artwork.files?.find((file) => file.id === currentImage.sourceFileId)?.name ||
      artwork.title
    );
  }, [artwork.files, artwork.title, currentImage]);

  const currentPageNumber = currentImage?.pageNumber ?? currentPage + 1;

  const currentAnnotation = useMemo(() => {
    const pageKey = String(currentPageNumber);

    const mapAnnotation = artwork.annotationsMap?.[pageKey];
    if (mapAnnotation) {
      return {
        data: convertLinesToStageJSON(mapAnnotation.lines || [], mapAnnotation.width, mapAnnotation.height),
        width: mapAnnotation.width,
        height: mapAnnotation.height,
      };
    }

    const legacyAnnotation =
      artwork.annotations?.find((annotation) => annotation.pageNumber === currentPageNumber) ?? null;
    if (legacyAnnotation) {
      return {
        data: legacyAnnotation.data,
        width: legacyAnnotation.width,
        height: legacyAnnotation.height,
      };
    }

    return null;
  }, [artwork.annotations, artwork.annotationsMap, currentPageNumber]);

  const handlePageChange = useCallback(
    async (index: number) => {
      if (index === currentPage) {
        return;
      }

      if (showAnnotation && annotationDirty) {
        const success = await requestAutoSave('page-change');
        if (!success) {
          return;
        }
      }

      setCurrentPage(index);
      setAnnotationDirty(false);
    },
    [annotationDirty, currentPage, requestAutoSave, showAnnotation],
  );

  const handleArtworkChange = useCallback(
    async (direction: 'prev' | 'next') => {
      if (showAnnotation && annotationDirty) {
        const success = await requestAutoSave('artwork-change');
        if (!success) {
          return;
        }
      }

      const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex >= 0 && newIndex < artworks.length) {
        onNavigate(artworks[newIndex]);
        setCurrentPage(0);
        setAnnotationDirty(false);
      }
    },
    [annotationDirty, artworks, currentIndex, onNavigate, requestAutoSave, showAnnotation],
  );

  const handleToggleOverlayVisibility = useCallback(() => {
    setAnnotationOverlayVisible((prev) => !prev);
  }, []);

  const handleSaveAnnotation = async (payload: AnnotationSavePayload | null) => {
    if (!onSaveAnnotation) return;

    setIsSavingAnnotation(true);
    try {
      await onSaveAnnotation(artwork.id, currentPageNumber, payload);
      setAnnotationDirty(false);
    } catch (error) {
      console.error('[ArtworkModal] Save failed:', error);
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;

      if (!online) {
        alert('オフラインのため注釈を保存できませんでした。オンライン復帰後に再度保存してください。');
      } else if (error instanceof Error && error.message) {
        alert(`注釈の保存に失敗しました。\n詳細: ${error.message}`);
      } else {
        alert('注釈の保存に失敗しました。時間をおいて再度お試しください。');
      }
    } finally {
      setIsSavingAnnotation(false);
    }
  };

  const toggleAnnotationMode = useCallback(async () => {
    if (showAnnotation) {
      const success = await requestAutoSave('mode-exit');
      if (!success) {
        return;
      }
      setShowAnnotation(false);
      setAnnotationDirty(false);
      setIsSidebarOpen(false);
      return;
    }

    setShowAnnotation(true);
    setIsSidebarOpen(false);
  }, [requestAutoSave, showAnnotation]);

  const handleLike = () => {
    onLike?.(artwork.id);
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    if (isReadOnlyMode()) {
      dispatchReadOnlyToast('【本番データ保護】プレビューモードのため作品の削除は無効化されています');
      return;
    }

    const confirmMessage = incomplete
      ? `${artwork.studentName}の作品を削除してもよろしいですか？\n\nこの操作は取り消せません。`
      : `${artwork.studentName}の作品「${artwork.title}」を削除してもよろしいですか？\n\nこの操作は取り消せません。`;

    if (!confirm(confirmMessage)) {
      return;
    }

    await onDelete(artwork.id);
    onClose();
  };

  const handleToggleLabel = (label: LabelType) => {
    onToggleLabel?.(artwork.id, label);
  };

  const handleComment = async (comment: string) => {
    if (!onComment) return;
    await onComment(artwork.id, comment);
  };

  if (!isOpen) {
    return null;
  }

  const incomplete = isIncomplete(artwork);

  return (
    <div className="fixed inset-0 z-50 bg-[#06080e]/95 backdrop-blur-xl animate-fade-in">
      <div className="flex h-full w-full p-2 sm:p-4">
        <div className="relative flex h-full w-full overflow-hidden rounded-2xl bg-[#0b0f17] border border-white/[0.08] shadow-2xl flex-col">
          {!isOnline && (
            <div className="border-b border-amber-500/20 bg-amber-950/40 px-4 py-2 text-xs text-amber-200">
              オフラインモードです。注釈の保存はオンライン復帰後に再実行してください。
            </div>
          )}
          <div className="flex flex-1 overflow-hidden">
            {incomplete ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-[#0b0f17] p-8 relative">
                {/* 閉じるボタン */}
                <button
                  onClick={onClose}
                  className="absolute left-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 shadow-lg backdrop-blur-md transition-all active:scale-95"
                  title="閉じる"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {/* 削除ボタン（管理者のみ） */}
                {userRole === 'admin' && onDelete && (
                  <button
                    onClick={handleDelete}
                    className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 shadow-lg backdrop-blur-md transition-all active:scale-95"
                    title="この作品を削除"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}

                <div className="max-w-md text-center">
                  <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 border border-white/10 text-orange-400">
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">{getStatusText(artwork)}</h2>
                  <p className="text-sm text-slate-400 mb-6">
                    {artwork.status === 'not_submitted'
                      ? 'この学生は課題を提出していません。'
                      : artwork.status === 'error' && artwork.errorReason === 'unsupported_format'
                      ? 'サポートされていないファイル形式が提出されました。'
                      : 'ファイル処理中にエラーが発生しました。'}
                  </p>
                  <div className="bg-[#121826] rounded-xl p-5 border border-white/10 text-left">
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">学生名</dt>
                        <dd className="text-sm font-medium text-slate-200 mt-0.5">{artwork.studentName}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">メールアドレス</dt>
                        <dd className="text-sm font-medium text-slate-200 mt-0.5">{artwork.studentEmail}</dd>
                      </div>
                      {artwork.status === 'error' && artwork.files && artwork.files.length > 0 && (
                        <div>
                          <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">提出ファイル</dt>
                          <dd className="text-sm text-slate-300 mt-0.5">
                            {artwork.files.map((file, i) => (
                              <div key={i} className="text-xs font-mono">{file.name}</div>
                            ))}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>

                {/* 下部コントロールバー */}
                <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center space-x-3 rounded-full bg-[#121826]/90 border border-white/10 px-4 py-2 backdrop-blur-md shadow-2xl">
                  <button
                    onClick={() => handleArtworkChange('prev')}
                    disabled={currentIndex === 0}
                    className="rounded-lg p-1.5 text-slate-300 hover:text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-20"
                    title="前の作品"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="min-w-[80px] text-center text-xs font-mono font-medium text-slate-300">
                    作品 {currentIndex + 1} / {artworks.length}
                  </span>
                  <button
                    onClick={() => handleArtworkChange('next')}
                    disabled={currentIndex === artworks.length - 1}
                    className="rounded-lg p-1.5 text-slate-300 hover:text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-20"
                    title="次の作品"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <ArtworkViewer
                  artwork={artwork}
                  currentPage={currentPage}
                  currentImage={currentImage}
                  currentFileName={currentFileName}
                  showAnnotation={showAnnotation}
                  userRole={userRole}
                  currentAnnotation={currentAnnotation}
                  isSavingAnnotation={isSavingAnnotation}
                  annotationCanvasRef={annotationCanvasRef}
                  annotationOverlayVisible={annotationOverlayVisible}
                  onToggleOverlay={handleToggleOverlayVisibility}
                  onClose={onClose}
                  onPageChange={handlePageChange}
                  onSaveAnnotation={handleSaveAnnotation}
                  onAnnotationDirtyChange={setAnnotationDirty}
                  currentArtworkIndex={currentIndex}
                  totalArtworks={artworks.length}
                  onArtworkChange={handleArtworkChange}
                />

                <ArtworkSidebar
                  artwork={artwork}
                  userRole={userRole}
                  isOpen={isSidebarOpen}
                  onToggle={() => setIsSidebarOpen((prev) => !prev)}
                  currentFileName={currentFileName}
                  currentPageNumber={currentPageNumber}
                  currentAnnotation={currentAnnotation}
                  showAnnotation={showAnnotation}
                  annotationDirty={annotationDirty}
                  onToggleAnnotationMode={toggleAnnotationMode}
                  onLike={handleLike}
                  onDelete={handleDelete}
                  onToggleLabel={handleToggleLabel}
                  onComment={handleComment}
                  isLiked={isLiked}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArtworkModal;

