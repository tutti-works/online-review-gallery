import type { Artwork, ArtworkAnnotationLine, ArtworkAnnotationPage } from '@/types';

const toFiniteNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const toNumberArray = (values: unknown): number[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.reduce<number[]>((acc, value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) {
      acc.push(parsed);
    }
    return acc;
  }, []);
};

const normalizeAnnotationsMap = (rawMap: unknown): Record<string, ArtworkAnnotationPage> | undefined => {
  if (!rawMap || typeof rawMap !== 'object') {
    return undefined;
  }

  return Object.entries(rawMap as Record<string, unknown>).reduce<Record<string, ArtworkAnnotationPage>>(
    (acc, [key, value]) => {
      if (!value || typeof value !== 'object') {
        return acc;
      }
      const pageData = value as Record<string, any>;
      const rawLines = Array.isArray(pageData.lines) ? pageData.lines : [];
      const lines: ArtworkAnnotationLine[] = rawLines.map((line: any) => ({
        id: typeof line?.id === 'string' ? line.id : `line-${Math.random().toString(16).slice(2)}`,
        tool: line?.tool === 'erase' ? 'erase' : 'draw',
        points: toNumberArray(line?.points),
        stroke: typeof line?.stroke === 'string' ? line.stroke : '#000000',
        strokeWidth: (() => {
          const value = toFiniteNumber(line?.strokeWidth);
          return value > 0 ? value : 1;
        })(),
        x: toFiniteNumber(line?.x),
        y: toFiniteNumber(line?.y),
      }));
      acc[key] = {
        lines,
        width: toFiniteNumber(pageData.width),
        height: toFiniteNumber(pageData.height),
        updatedAt: pageData.updatedAt?.toDate ? pageData.updatedAt.toDate() : pageData.updatedAt,
        updatedBy: pageData.updatedBy,
      };
      return acc;
    },
    {},
  );
};

export const normalizeArtworkDoc = (id: string, data: Record<string, any>): Artwork => {
  return {
    id,
    title: data.title || '',
    description: data.description,
    galleryId: data.galleryId || '',
    status: data.status || 'submitted',
    errorReason: data.errorReason,
    files: data.files || [],
    images: data.images || [],
    studentName: data.studentName || '',
    studentEmail: data.studentEmail || '',
    studentId: data.studentId,
    submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate() : data.submittedAt,
    isLate: data.isLate || false,
    classroomId: data.classroomId || '',
    assignmentId: data.assignmentId || '',
    likeCount: data.likeCount || 0,
    labels: data.labels || [],
    comments: (data.comments || []).map((comment: any) => ({
      ...comment,
      createdAt: comment.createdAt?.toDate ? comment.createdAt.toDate() : comment.createdAt,
    })),
    annotations: (data.annotations || []).map((annotation: any) => ({
      ...annotation,
      updatedAt: annotation.updatedAt?.toDate ? annotation.updatedAt.toDate() : annotation.updatedAt,
    })),
    annotationsMap: normalizeAnnotationsMap(data.annotationsMap),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
    importedBy: data.importedBy || '',
  };
};

export const getCoverImage = (artwork: Artwork): Artwork['images'][number] | null => {
  if (!artwork.images || artwork.images.length === 0) {
    return null;
  }
  return artwork.images.reduce<Artwork['images'][number]>((best, current) => {
    const bestPage = best.pageNumber ?? Number.MAX_SAFE_INTEGER;
    const currentPage = current.pageNumber ?? Number.MAX_SAFE_INTEGER;
    return currentPage < bestPage ? current : best;
  }, artwork.images[0]);
};

export const fetchArtworksByIds = async (ids: string[]): Promise<Artwork[]> => {
  if (!ids.length) {
    return [];
  }
  const { doc, getDoc } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');

  const snapshots = await Promise.all(ids.map((id) => getDoc(doc(db, 'artworks', id))));
  const artworks: Artwork[] = [];
  snapshots.forEach((snap, index) => {
    if (!snap.exists()) {
      return;
    }
    const data = snap.data();
    artworks.push(normalizeArtworkDoc(ids[index], data));
  });

  return artworks;
};

export const fetchArtworksByGalleryId = async (galleryId: string): Promise<Artwork[]> => {
  if (!galleryId) {
    return [];
  }

  const { collection, getDocs, query, where } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');

  const snapshot = await getDocs(query(collection(db, 'artworks'), where('galleryId', '==', galleryId)));
  return snapshot.docs.map((docSnap) => normalizeArtworkDoc(docSnap.id, docSnap.data()));
};
