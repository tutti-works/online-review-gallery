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

interface ArtworkModalProps {
  artwork: Artwork;
  isOpen: boolean;
  onClose: () => void;
  onLike?: (artworkId: string) => void;
  onComment?: (artworkId: string, comment: string) => Promise<void>;
  onDelete?: (artworkId: string) => Promise<void>;
  onToggleLabel?: (artworkId: string, label: LabelType) => void;
  onSaveAnnotation?: (artworkId: string, pageNumber: number, annotation: AnnotationSavePayload | null) => Promise<void>;
  userRole: string;
}

const ArtworkModal = ({
  artwork,
  isOpen,
  onClose,
  onLike,
  onComment,
  onDelete,
  onToggleLabel,
  onSaveAnnotation,
  userRole,
}: ArtworkModalProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);
  const [annotationDirty, setAnnotationDirty] = useState(false);
  const [annotationOverlayVisible, setAnnotationOverlayVisible] = useState(true);
  const annotationCanvasRef = useRef<AnnotationCanvasHandle | null>(null);

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

  const currentAnnotation = useMemo<AnnotationSavePayload | null>(() => {
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
    return legacyAnnotation
      ? {
          data: legacyAnnotation.data,
          width: legacyAnnotation.width,
          height: legacyAnnotation.height,
        }
      : null;
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
      console.error('Failed to save annotation:', error);
      alert('注釈�E保存に失敗しました');
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

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90">
      <div className="flex h-full w-full p-4">
        <div className="relative flex h-full w-full overflow-hidden rounded-lg bg-white shadow-2xl">
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
          />
        </div>
      </div>
    </div>
  );
};

export default ArtworkModal;

