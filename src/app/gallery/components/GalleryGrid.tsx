'use client';
import { Heart, MessageCircle } from 'lucide-react';
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
export default function GalleryGrid({
  artworks,
  onSelectArtwork,
  likedArtworkIds,
  canLike,
  onLike,
}: GalleryGridProps) {
  return (
    <div className="exhibition-grid">
      {artworks.map((artwork) => {
        const cover = artwork.images?.[0];
        const incomplete = isIncomplete(artwork);
        const liked = likedArtworkIds.has(artwork.id);
        return (
          <article
            key={artwork.id}
            className="exhibition-card"
            onClick={() => onSelectArtwork(artwork)}
          >
            <button
              className="exhibition-cover"
              aria-label={artwork.studentName + 'の作品を開く'}
            >
              {cover && !incomplete ? (
                <AuthenticatedStorageImage
                  storagePath={cover.thumbnailPath || cover.storagePath}
                  legacyUrl={cover.thumbnailUrl || cover.url}
                  alt={artwork.title}
                  width={420}
                  height={297}
                  loading="lazy"
                />
              ) : (
                <p className="text-sm text-gray-500">
                  {incomplete ? getStatusText(artwork) : '画像なし'}
                </p>
              )}
              {artwork.images.length > 1 && (
                <span>{artwork.images.length} PAGES</span>
              )}
            </button>
            <div className="exhibition-card-info">
              <div className="exhibition-card-name">
                <span
                  className="exhibition-card-title"
                  title={artwork.studentName}
                >
                  {artwork.studentName}
                </span>
                {artwork.isLate && (
                  <span
                    className="exhibition-card-late"
                    title="提出期限に遅れています"
                    aria-label="提出期限に遅れています"
                  >
                    ⚠️
                  </span>
                )}
              </div>
              <div className="exhibition-card-bottom">
                <div className="exhibition-labels">
                  {artwork.labels?.map((label) => (
                    <LabelBadge key={label} label={label} />
                  ))}
                </div>
                <div className="exhibition-card-stats">
                  {canLike && onLike ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onLike(artwork.id);
                      }}
                      aria-pressed={liked}
                      aria-label={liked ? 'いいねを取り消す' : 'いいねする'}
                    >
                      <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
                      {artwork.likeCount}
                    </button>
                  ) : (
                    <span>
                      <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
                      {artwork.likeCount}
                    </span>
                  )}
                  <span aria-label={artwork.comments.length + '件のコメント'}>
                    <MessageCircle size={14} />
                    {artwork.comments.length}
                  </span>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
