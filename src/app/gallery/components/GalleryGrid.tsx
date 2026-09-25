'use client';

import LabelBadge from '@/components/labels/LabelBadge';
import AuthenticatedStorageImage from '@/components/AuthenticatedStorageImage';
import type { Artwork } from '@/types';
import { isIncomplete, getStatusText } from '@/lib/artworkUtils';

type GalleryGridProps = {
  artworks: Artwork[];
  onSelectArtwork: (artwork: Artwork) => void;
  likedArtworkIds: Set<string>;
  canLike: boolean;
  onLike?: (artworkId: string) => void;
};

const GridContainer = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-5 sm:gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
    {children}
  </div>
);

const GalleryGrid = ({ artworks, onSelectArtwork, likedArtworkIds, canLike, onLike }: GalleryGridProps) => {
  if (artworks.length === 0) {
    return null;
  }

  return (
    <GridContainer>
      {artworks.map((artwork) => {
        const incomplete = isIncomplete(artwork);
        const hasImages = artwork.images && artwork.images.length > 0;
        const isLiked = likedArtworkIds.has(artwork.id);

        const handleLikeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          if (!canLike || !onLike) {
            return;
          }
          onLike(artwork.id);
        };

        // 不完全な作品または画像がない場合
        if (incomplete || !hasImages) {
          return (
            <div key={artwork.id} className="group">
              <div
                className="cursor-pointer overflow-hidden rounded-2xl bg-[#111726]/60 backdrop-blur-md border border-white/[0.06] hover:border-white/20 transition-all duration-300 hover:shadow-2xl"
                onClick={() => onSelectArtwork(artwork)}
              >
                <div
                  className="relative w-full bg-slate-900/80 flex flex-col items-center justify-center p-6 text-center border-b border-white/[0.06]"
                  style={{ aspectRatio: '420 / 297' }}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-white/10 flex items-center justify-center mb-2.5 text-slate-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-slate-400 px-2 line-clamp-2">
                    {incomplete ? getStatusText(artwork) : '画像なし'}
                  </p>
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-300 group-hover:text-white transition-colors">
                      {artwork.studentName}
                    </p>
                    {artwork.labels && artwork.labels.length > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {artwork.labels.map((label) => (
                          <LabelBadge key={label} label={label} className="h-4 w-4" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        const coverImage = artwork.images[0];

        return (
          <div key={artwork.id} className="group">
            <div
              className="cursor-pointer overflow-hidden rounded-2xl bg-[#111726]/80 backdrop-blur-md border border-white/[0.08] hover:border-orange-500/40 transition-all duration-300 hover:shadow-[0_16px_36px_rgba(0,0,0,0.6)] hover:-translate-y-1"
              onClick={() => onSelectArtwork(artwork)}
            >
              {/* Image Preview with Zoom on hover */}
              <div className="relative w-full overflow-hidden bg-slate-950" style={{ aspectRatio: '420 / 297' }}>
                <AuthenticatedStorageImage
                  storagePath={coverImage.thumbnailPath || coverImage.storagePath}
                  legacyUrl={coverImage.thumbnailUrl || coverImage.url}
                  alt={artwork.title}
                  width={420}
                  height={297}
                  className="h-full w-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
                  loading="lazy"
                />

                {/* Subtle vignette gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f17]/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                {/* Late tag */}
                {artwork.isLate && (
                  <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-amber-500/90 backdrop-blur-md text-black text-[10px] font-bold tracking-wider uppercase shadow-md">
                    遅延提出
                  </div>
                )}

                {/* Multiple pages indicator */}
                {artwork.images.length > 1 && (
                  <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[11px] font-medium border border-white/10">
                    <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    <span>{artwork.images.length}P</span>
                  </div>
                )}
              </div>

              {/* Card Meta */}
              <div className="p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-200 group-hover:text-orange-400 transition-colors">
                      {artwork.studentName}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 text-xs text-slate-400 flex-shrink-0">
                    {/* Labels */}
                    {artwork.labels && artwork.labels.length > 0 && (
                      <div className="flex items-center gap-1">
                        {artwork.labels.map((label) => (
                          <LabelBadge key={label} label={label} className="h-4 w-4" />
                        ))}
                      </div>
                    )}

                    {/* Likes */}
                    {canLike ? (
                      <button
                        type="button"
                        onClick={handleLikeClick}
                        className={`flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md ${
                          isLiked ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400 hover:text-rose-400 hover:bg-white/[0.04]'
                        }`}
                        aria-pressed={isLiked}
                        aria-label={isLiked ? 'いいねを取り消す' : 'いいねする'}
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill={isLiked ? 'currentColor' : 'none'}
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
                        <span className="font-medium text-[11px]">{artwork.likeCount}</span>
                      </button>
                    ) : (
                      <span className={`flex items-center gap-1 ${isLiked ? 'text-rose-400' : 'text-slate-400'}`}>
                        <svg
                          className="h-3.5 w-3.5"
                          fill={isLiked ? 'currentColor' : 'none'}
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
                        <span className="font-medium text-[11px]">{artwork.likeCount}</span>
                      </span>
                    )}

                    {/* Comments Count */}
                    <span className="flex items-center gap-1 text-slate-400">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      <span className="font-medium text-[11px]">{artwork.comments.length}</span>
                    </span>
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
