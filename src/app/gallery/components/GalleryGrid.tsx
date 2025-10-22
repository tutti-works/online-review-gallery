'use client';

import Image from 'next/image';
import LabelBadge from '@/components/labels/LabelBadge';
import type { Artwork } from '@/types';

type GalleryGridProps = {
  artworks: Artwork[];
  onSelectArtwork: (artwork: Artwork) => void;
};

const GridContainer = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
    {children}
  </div>
);

const GalleryGrid = ({ artworks, onSelectArtwork }: GalleryGridProps) => {
  if (artworks.length === 0) {
    return null;
  }

  return (
    <GridContainer>
      {artworks.map((artwork) => {
        if (!artwork.images || artwork.images.length === 0) {
          return null;
        }

        const coverImage = artwork.images[0];

        return (
          <div key={artwork.id} className="break-inside-avoid">
            <div
              className="cursor-pointer overflow-hidden rounded-lg bg-white shadow-sm transition-shadow hover:shadow-md"
              onClick={() => onSelectArtwork(artwork)}
            >
              <div className="relative w-full" style={{ aspectRatio: '420 / 297' }}>
                <Image
                  src={coverImage.thumbnailUrl || coverImage.url}
                  alt={artwork.title}
                  width={420}
                  height={297}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <p className="truncate text-sm font-medium text-gray-900">{artwork.studentName}</p>
                  <div className="ml-2 flex flex-shrink-0 items-center space-x-2 text-xs text-gray-500">
                    {artwork.labels && artwork.labels.length > 0 && (
                      <div className="flex items-center space-x-0.5">
                        {artwork.labels.map((label) => (
                          <LabelBadge key={label} label={label} />
                        ))}
                      </div>
                    )}
                    {artwork.isLate && (
                      <span className="flex items-center text-orange-500" title="提出期限に遅れています">
                        ⚠️
                      </span>
                    )}
                    <span className="flex items-center">
                      <svg className="mr-0.5 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                      {artwork.likeCount}
                    </span>
                    <span className="flex items-center">
                      <svg className="mr-0.5 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      {artwork.comments.length}
                    </span>
                    {artwork.images.length > 1 && (
                      <span className="flex items-center">
                        <svg className="mr-0.5 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                          />
                        </svg>
                        {artwork.images.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </GridContainer>
  );
};

export default GalleryGrid;
