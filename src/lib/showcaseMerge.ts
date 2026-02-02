import type { Artwork } from '@/types';
import { getStudentId, isSubmitted } from '@/lib/artworkUtils';

const normalizeStudentKey = (value: string): string => value.trim().toLowerCase();

export const mergeShowcaseArtworks = (
  baseArtworks: Artwork[],
  updateArtworks: Artwork[],
): Artwork[] => {
  if (!updateArtworks.length) {
    return baseArtworks;
  }

  const updateMap = new Map<string, Artwork>();
  updateArtworks.forEach((artwork) => {
    if (!isSubmitted(artwork)) {
      return;
    }
    const key = normalizeStudentKey(getStudentId(artwork));
    updateMap.set(key, artwork);
  });

  return baseArtworks.map((baseArtwork) => {
    const key = normalizeStudentKey(getStudentId(baseArtwork));
    const updateArtwork = updateMap.get(key);
    if (!updateArtwork) {
      return baseArtwork;
    }

    return {
      ...baseArtwork,
      ...updateArtwork,
      id: baseArtwork.id,
      galleryId: baseArtwork.galleryId,
      classroomId: baseArtwork.classroomId,
      assignmentId: baseArtwork.assignmentId,
    };
  });
};
