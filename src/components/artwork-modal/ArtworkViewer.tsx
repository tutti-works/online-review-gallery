'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import type { AnnotationSavePayload } from '@/components/AnnotationCanvas';
import type { Artwork } from '@/types';
import { usePanZoom } from './usePanZoom';

const AnnotationCanvas = dynamic(() => import('@/components/AnnotationCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
    </div>
  ),
});

type ArtworkViewerProps = {
  artwork: Artwork;
  currentPage: number;
  currentImage: Artwork['images'][number];
  currentFileName: string;
  showAnnotation: boolean;
  userRole: string;
  currentAnnotation: {
    data: string;
    width: number;
    height: number;
  } | null;
  isSavingAnnotation: boolean;
  onClose: () => void;
  onPageChange: (index: number) => void;
  onSaveAnnotation: (payload: AnnotationSavePayload | null) => Promise<void>;
  onAnnotationDirtyChange: (dirty: boolean) => void;
};

const ArtworkViewer = ({
  artwork,
  currentPage,
  currentImage,
  currentFileName,
  showAnnotation,
  userRole,
  currentAnnotation,
  isSavingAnnotation,
  onClose,
  onPageChange,
  onSaveAnnotation,
  onAnnotationDirtyChange,
}: ArtworkViewerProps) => {
  const {
    zoom,
    panPosition,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDragStart,
    handleZoomIn,
    handleZoomOut,
    resetZoom,
  } = usePanZoom();

  return (
    <div className="relative flex flex-1 flex-col bg-gray-100">
      <button
        onClick={onClose}
        className="absolute left-4 top-4 z-10 rounded-full bg-white p-2 shadow-lg transition-colors hover:bg-gray-100"
      >
        <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {showAnnotation ? (
          <div className="h-full w-full p-8">
            <AnnotationCanvas
              imageUrl={currentImage.url}
              initialAnnotation={
                currentAnnotation
                  ? {
                      data: currentAnnotation.data,
                      width: currentAnnotation.width,
                      height: currentAnnotation.height,
                    }
                  : null
              }
              editable={userRole === 'admin'}
              onSave={onSaveAnnotation}
              onDirtyChange={onAnnotationDirtyChange}
              saving={isSavingAnnotation}
            />
          </div>
        ) : (
          <div
            className="h-full w-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          >
            <div
              className="flex h-full w-full items-center justify-center p-8 transition-transform duration-200 ease-out"
              style={{
                transform: `scale(${zoom}) translate(${panPosition.x / zoom}px, ${panPosition.y / zoom}px)`,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentImage.url}
                alt={`${currentFileName} - Page ${currentPage + 1}`}
                className="max-h-full max-w-full select-none object-contain"
                draggable={false}
                onDragStart={handleDragStart}
              />
            </div>
          </div>
        )}

        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center space-x-4 rounded-full bg-gray-700 bg-opacity-70 px-3 py-1 backdrop-blur-sm transition-all duration-300 ease-in-out">
          {artwork.images.length > 1 && (
            <>
              <button
                onClick={() => onPageChange(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className="rounded-lg p-2 text-white transition-colors hover:bg-white hover:bg-opacity-20 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                title="前のページ"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="min-w-[60px] text-center text-sm font-medium text-white">
                {currentPage + 1} / {artwork.images.length}
              </span>
              <button
                onClick={() => onPageChange(Math.min(artwork.images.length - 1, currentPage + 1))}
                disabled={currentPage === artwork.images.length - 1}
                className="rounded-lg p-2 text-white transition-colors hover:bg-white hover:bg-opacity-20 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                title="次のページ"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="h-6 w-px bg-white bg-opacity-30" />
            </>
          )}

          <button
            onClick={handleZoomOut}
            className="rounded-lg p-2 text-white transition-colors hover:bg-white hover:bg-opacity-20"
            title="縮小"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
            </svg>
          </button>
          <span className="min-w-[50px] text-center text-sm font-medium text-white">{Math.round(zoom * 100)}%</span>
          <button
            onClick={handleZoomIn}
            className="rounded-lg p-2 text-white transition-colors hover:bg-white hover:bg-opacity-20"
            title="拡大"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={resetZoom}
            className="ml-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white hover:bg-opacity-20"
            title="リセット"
          >
            リセット
          </button>
        </div>
      </div>

      {artwork.images.length > 1 && (
        <div className="border-t border-gray-200 bg-white p-3">
          <div className="flex space-x-2 overflow-x-auto">
            {artwork.images.map((image, index) => (
              <button
                key={image.id}
                onClick={() => onPageChange(index)}
                className={`h-14 w-20 flex-shrink-0 overflow-hidden rounded border-2 transition-all ${
                  currentPage === index ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Image
                  src={image.thumbnailUrl || image.url}
                  alt={`Page ${index + 1} thumbnail`}
                  width={80}
                  height={56}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtworkViewer;
