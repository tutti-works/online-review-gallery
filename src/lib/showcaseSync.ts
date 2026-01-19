import type { Artwork, ShowcaseGallery } from '@/types';
import { sortByStudentId } from '@/lib/artworkUtils';
import { normalizeArtworkDoc } from '@/lib/showcaseData';

export type ShowcaseSyncResult = {
  showcase: ShowcaseGallery;
  artworks: Artwork[];
};

export const syncShowcaseGallery = async (
  galleryId: string,
  userEmail: string,
): Promise<ShowcaseSyncResult> => {
  const { collection, doc, getDoc, getDocs, query, setDoc, where } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');

  const showcaseRef = doc(db, 'showcaseGalleries', galleryId);
  const showcaseSnapshot = await getDoc(showcaseRef);
  const existing = showcaseSnapshot.exists() ? showcaseSnapshot.data() : {};

  const artworksQuery = query(
    collection(db, 'artworks'),
    where('galleryId', '==', galleryId),
    where('likeCount', '>', 0),
  );
  const artworksSnapshot = await getDocs(artworksQuery);
  const artworks = artworksSnapshot.docs.map((docSnap) => normalizeArtworkDoc(docSnap.id, docSnap.data()));
  const sortedArtworks = sortByStudentId(artworks);

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

  return {
    showcase: {
      id: galleryId,
      ...existing,
      ...payload,
    },
    artworks: sortedArtworks,
  };
};
