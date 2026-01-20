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
  const [showControls, setShowControls] = useState(true);
  const artwork = artworks[currentIndex];
  const images = artwork?.images ?? [];
  const currentImage = images[currentPage] ?? images[0];
  const title = artwork?.title || artwork?.studentName || '';

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

  // Auto-hide controls after inaction
  useEffect(() => {
      let timeout: NodeJS.Timeout;
      const resetTimeout = () => {
          setShowControls(true);
          clearTimeout(timeout);
          timeout = setTimeout(() => setShowControls(false), 3000);
      };
      
      window.addEventListener('mousemove', resetTimeout);
      resetTimeout();
      
      return () => {
          window.removeEventListener('mousemove', resetTimeout);
          clearTimeout(timeout);
      };
  }, []);

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
    <div className="fixed inset-0 z-[100] bg-black animate-fade-in">
      <div className="flex h-full w-full flex-col relative text-white">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className={`absolute right-6 top-6 z-20 text-white/50 hover:text-white transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
          title="閉じる"
        >
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Main Image Area */}
        <div className="flex flex-1 items-center justify-center p-4 md:p-10 min-h-0">
          {currentImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentImage.url}
              alt={title}
              className="max-h-full max-w-full object-contain shadow-2xl transition-transform duration-500"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-500 font-light">
              NO IMAGE
            </div>
          )}
        </div>

        {/* Navigation Overlays (Invisible Catch Areas) */}
        {currentIndex > 0 && (
          <button
            className="absolute inset-y-0 left-0 w-20 z-10 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center bg-gradient-to-r from-black/50 to-transparent"
            onClick={() => onNavigate(currentIndex - 1)}
          >
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {currentIndex < artworks.length - 1 && (
          <button
            className="absolute inset-y-0 right-0 w-20 z-10 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center bg-gradient-to-l from-black/50 to-transparent"
            onClick={() => onNavigate(currentIndex + 1)}
          >
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Bottom Metadata Bar */}
        <div className={`absolute bottom-0 inset-x-0 p-8 pt-20 bg-gradient-to-t from-black via-black/80 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
            <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 md:gap-12">
                <div className="text-center md:text-left">
                    <h2 className="font-serif text-2xl md:text-3xl font-light mb-1">{artwork.studentName}</h2>
                    {/* {artwork.title && <p className="text-gray-400 font-light text-sm">{artwork.title}</p>} */}
                </div>

                <div className="flex items-center gap-6">
                     {/* Image Pagination (if multiple) */}
                     {images.length > 1 && (
                        <div className="flex items-center gap-4 bg-white/10 rounded-full px-4 py-2 backdrop-blur-md">
                            <button
                                type="button"
                                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                                disabled={currentPage === 0}
                                className="text-white/70 hover:text-white disabled:opacity-30"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <span className="text-xs font-mono">{pageLabel}</span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage(Math.min(images.length - 1, currentPage + 1))}
                                disabled={currentPage === images.length - 1}
                                className="text-white/70 hover:text-white disabled:opacity-30"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                     )}

                     <div className="text-xs text-gray-500 font-mono">
                        {currentIndex + 1} / {artworks.length}
                     </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ShowcaseArtworkModal;
