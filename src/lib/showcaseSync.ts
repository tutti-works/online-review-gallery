import type { Artwork, ShowcaseGallery } from '@/types';
import { sortByStudentId } from '@/lib/artworkUtils';
import { fetchArtworksByGalleryId, normalizeArtworkDoc } from '@/lib/showcaseData';
import { mergeShowcaseArtworks } from '@/lib/showcaseMerge';

export type ShowcaseSyncResult = {
  showcase: ShowcaseGallery;
  artworks: Artwork[];
};

export const syncShowcaseGallery = async (
  galleryId: string,
  userEmail: string,
): Promise<ShowcaseSyncResult> => {
  const shouldDebugReads =
    process.env.NEXT_PUBLIC_FIRESTORE_READ_DEBUG === 'true' ||
    process.env.NEXT_PUBLIC_SHOWCASE_IMAGE_DEBUG === 'true';
  const { collection, doc, getDoc, getDocs, query, setDoc, where } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');

  const showcaseRef = doc(db, 'showcaseGalleries', galleryId);
  const showcaseSnapshot = await getDoc(showcaseRef);
  const existing = showcaseSnapshot.exists() ? showcaseSnapshot.data() : {};
  const updateSourceGalleryId = existing.updateSourceGalleryId ?? null;

  const artworksQuery = query(
    collection(db, 'artworks'),
    where('galleryId', '==', galleryId),
    where('likeCount', '>', 0),
  );
  const artworksSnapshot = await getDocs(artworksQuery);
  const artworks = artworksSnapshot.docs.map((docSnap) => normalizeArtworkDoc(docSnap.id, docSnap.data()));
  const sortedArtworks = sortByStudentId(artworks);
  let mergedArtworks = sortedArtworks;
  let updateSourceReadCount = 0;

  if (updateSourceGalleryId) {
    const updateArtworks = await fetchArtworksByGalleryId(updateSourceGalleryId);
    updateSourceReadCount = updateArtworks.length;
    mergedArtworks = mergeShowcaseArtworks(sortedArtworks, updateArtworks);
  }

  const curatedArtworkIds = sortedArtworks.map((artwork) => artwork.id);
  let featuredArtworkId: string | null = existing.featuredArtworkId ?? null;
  if (!featuredArtworkId || !curatedArtworkIds.includes(featuredArtworkId)) {
    featuredArtworkId = curatedArtworkIds[0] ?? null;
  }

  const payload = {
    curatedArtworkIds,
    featuredArtworkId,
    syncedAt: new Date(),
    updatedBy: userEmail,
  };

  await setDoc(showcaseRef, payload, { merge: true });

  if (shouldDebugReads) {
    const totalReads = 1 + artworksSnapshot.size + updateSourceReadCount;
    console.log('[Showcase][Sync][Reads]', {
      galleryId,
      showcaseDoc: 1,
      curatedArtworks: artworksSnapshot.size,
      updateSourceArtworks: updateSourceReadCount,
      total: totalReads,
    });
  }

  return {
    showcase: {
      id: galleryId,
      ...existing,
      ...payload,
      updateSourceGalleryId,
    },
    artworks: mergedArtworks,
  };
};
