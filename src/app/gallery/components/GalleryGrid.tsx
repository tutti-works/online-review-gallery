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
          <article key={artwork.id} className="exhibition-card">
            <button
              className="exhibition-cover"
              onClick={() => onSelectArtwork(artwork)}
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
              <button
                className="exhibition-card-title"
                onClick={() => onSelectArtwork(artwork)}
                title={artwork.title}
              >
                {artwork.title}
              </button>
              <div className="exhibition-card-author">
                <span aria-hidden="true">
                  {artwork.studentName.slice(0, 1)}
                </span>
                {artwork.studentName}
                {artwork.isLate && (
                  <small className="text-amber-700">期限後提出</small>
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
                      onClick={() => onLike(artwork.id)}
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
