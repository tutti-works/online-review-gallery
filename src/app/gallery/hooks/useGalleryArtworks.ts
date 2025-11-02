'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { Artwork, ArtworkAnnotationLine, ArtworkAnnotationPage } from '@/types';

type UseGalleryArtworksResult = {
  artworks: Artwork[];
  setArtworks: Dispatch<SetStateAction<Artwork[]>>;
  loading: boolean;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  fetchArtworks: () => Promise<void>;
};

export const useGalleryArtworks = (
  currentGalleryId: string | null,
  isInitialized: boolean,
): UseGalleryArtworksResult => {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArtworks = useCallback(async () => {
    try {
      if (!currentGalleryId) {
        setArtworks([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { collection, query, getDocs, orderBy, where } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const artworksQuery = query(
        collection(db, 'artworks'),
        where('galleryId', '==', currentGalleryId),
        orderBy('createdAt', 'desc'),
      );

      const querySnapshot = await getDocs(artworksQuery);

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

      const fetchedArtworks: Artwork[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();

        const annotationsMap = data.annotationsMap
          ? Object.entries(data.annotationsMap).reduce<Record<string, ArtworkAnnotationPage>>((acc, [key, value]) => {
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
            }, {})
          : undefined;

        return {
          id: doc.id,
          title: data.title || '',
          description: data.description,
          galleryId: data.galleryId || '',
          files: data.files || [],
          images: data.images || [],
          studentName: data.studentName || '',
          studentEmail: data.studentEmail || '',
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
          annotationsMap,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          importedBy: data.importedBy || '',
        };
      });

      setArtworks(fetchedArtworks);
    } catch (err) {
      console.error('[Gallery] Fetch artworks error:', err);
      setError('作品の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [currentGalleryId]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    void fetchArtworks();
  }, [isInitialized, fetchArtworks]);

  return {
    artworks,
    setArtworks,
    loading,
    error,
    setError,
    fetchArtworks,
  };
};
