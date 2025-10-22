'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { Artwork } from '@/types';

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

      const fetchedArtworks: Artwork[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();
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
