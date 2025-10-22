'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AnnotationSavePayload } from '@/components/AnnotationCanvas';
import type { Artwork, LabelType } from '@/types';
import ArtworkViewer from './artwork-modal/ArtworkViewer';
import ArtworkSidebar from './artwork-modal/ArtworkSidebar';

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setCurrentPage(0);
    setIsSidebarOpen(false);
    setShowAnnotation(false);
    setAnnotationDirty(false);
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

  const rawAnnotation = artwork.annotations?.find((annotation) => annotation.pageNumber === currentPageNumber) ?? null;

  const currentAnnotation = rawAnnotation
    ? {
        data: rawAnnotation.data,
        width: rawAnnotation.width,
        height: rawAnnotation.height,
      }
    : null;

  const handleSaveAnnotation = async (payload: AnnotationSavePayload | null) => {
    if (!onSaveAnnotation) return;

    setIsSavingAnnotation(true);
    try {
      await onSaveAnnotation(artwork.id, currentPageNumber, payload);
      setAnnotationDirty(false);
    } catch (error) {
      console.error('Failed to save annotation:', error);
      alert('注釈の保存に失敗しました');
    } finally {
      setIsSavingAnnotation(false);
    }
  };

  const toggleAnnotationMode = () => {
    if (showAnnotation && annotationDirty) {
      if (!confirm('未保存の変更があります。注釈モードを終了しますか？')) {
        return;
      }
    }
    setShowAnnotation((prev) => !prev);
    setAnnotationDirty(false);
  };

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
            onClose={onClose}
            onPageChange={setCurrentPage}
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
