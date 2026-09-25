import type { Gallery } from '@/types';

export type GalleryMode = 'active' | 'archive';

export const galleryPath = (mode: GalleryMode) => mode === 'archive' ? '/archive' : '/gallery';

export const lastViewedKey = (mode: GalleryMode) =>
  mode === 'archive' ? 'lastViewedArchivedGalleryId' : 'lastViewedGalleryId';

export const filterGalleriesByMode = (
  galleries: Gallery[], archivedCourseIds: ReadonlySet<string>, mode: GalleryMode,
): Gallery[] => galleries.filter((gallery) =>
  (gallery.courseId !== '' && archivedCourseIds.has(gallery.courseId)) === (mode === 'archive'),
);

export const resolveGallerySelection = (
  galleries: Gallery[], urlId: string | null, savedId: string | null,
) => {
  const allowed = new Set(galleries.map((gallery) => gallery.id));
  if (urlId && allowed.has(urlId)) {
    return { galleryId: urlId, restoreSaved: false, clearUrl: false, clearSaved: false };
  }
  if (!urlId && savedId && allowed.has(savedId)) {
    return { galleryId: savedId, restoreSaved: true, clearUrl: false, clearSaved: false };
  }
  return {
    galleryId: null,
    restoreSaved: false,
    clearUrl: Boolean(urlId),
    clearSaved: Boolean(savedId && !allowed.has(savedId)),
  };
};
