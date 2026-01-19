'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Artwork } from '@/types';

type ShowcaseArtworkModalProps = {
  artworks: Artwork[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
};

const ShowcaseArtworkModal = ({ artworks, currentIndex, onNavigate, onClose }: ShowcaseArtworkModalProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  const artwork = artworks[currentIndex];
  const images = artwork?.images ?? [];
  const currentImage = images[currentPage] ?? images[0];

  useEffect(() => {
    setCurrentPage(0);
  }, [currentIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          onNavigate(currentIndex - 1);
        }
      } else if (event.key === 'ArrowRight') {
        if (currentIndex < artworks.length - 1) {
          onNavigate(currentIndex + 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [artworks.length, currentIndex, onClose, onNavigate]);

  const pageLabel = useMemo(() => {
    if (!images.length) {
      return '';
    }
    return `${currentPage + 1} / ${images.length}`;
  }, [currentPage, images.length]);

  if (!artwork) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90">
      <div className="flex h-full w-full flex-col">
        <button
          onClick={onClose}
          className="absolute left-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-lg transition hover:bg-white"
          title="閉じる"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-1 items-center justify-center px-6 py-10 min-h-0">
          {currentImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentImage.url}
              alt={artwork.title || artwork.studentName}
              className="max-h-[calc(100vh-220px)] max-w-[95vw] object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-gray-800 text-gray-200">
              画像がありません
            </div>
          )}
        </div>

        <div className="mx-auto mb-6 flex items-center gap-4 rounded-full bg-gray-800/80 px-4 py-2 text-white">
          <button
            type="button"
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="rounded-full p-2 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            title="前の作品"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium">
            作品 {currentIndex + 1} / {artworks.length}
          </span>
          <button
            type="button"
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={currentIndex === artworks.length - 1}
            className="rounded-full p-2 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            title="次の作品"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {images.length > 1 && (
            <>
              <div className="h-6 w-px bg-white/30" />
              <button
                type="button"
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className="rounded-full p-2 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                title="前のページ"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs">{pageLabel}</span>
              <button
                type="button"
                onClick={() => setCurrentPage(Math.min(images.length - 1, currentPage + 1))}
                disabled={currentPage === images.length - 1}
                className="rounded-full p-2 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                title="次のページ"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShowcaseArtworkModal;
