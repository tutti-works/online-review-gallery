'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'next/navigation';

type UseGalleryInitializationResult = {
  currentGalleryId: string | null;
  setCurrentGalleryId: Dispatch<SetStateAction<string | null>>;
  hasGalleries: boolean;
  isInitialized: boolean;
};

export const useGalleryInitialization = (): UseGalleryInitializationResult => {
  const searchParams = useSearchParams();
  const [currentGalleryId, setCurrentGalleryId] = useState<string | null>(null);
  const [hasGalleries, setHasGalleries] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const shouldDebugReads =
    process.env.NEXT_PUBLIC_FIRESTORE_READ_DEBUG === 'true' ||
    process.env.NEXT_PUBLIC_SHOWCASE_IMAGE_DEBUG === 'true';

  useEffect(() => {
    const initializeGalleryId = async () => {
      if (typeof window === 'undefined') return;

      // URL パラメータを優先してギャラリーを決定
      const params = new URLSearchParams(window.location.search);
      const urlGalleryId = params.get('galleryId');

      if (urlGalleryId) {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const galleryDoc = await getDoc(doc(db, 'galleries', urlGalleryId));
          if (shouldDebugReads) {
            console.log('[Gallery][Reads]', {
              source: 'url',
              galleryId: urlGalleryId,
              galleryDoc: 1,
              total: 1,
            });
          }

          if (galleryDoc.exists()) {
            setCurrentGalleryId(urlGalleryId);
            localStorage.setItem('lastViewedGalleryId', urlGalleryId);
            setIsInitialized(true);
            return;
          }

          localStorage.removeItem('lastViewedGalleryId');
          window.history.replaceState({}, '', '/gallery');
        } catch (error) {
          console.error('[Gallery] Failed to check URL gallery:', error);
          localStorage.removeItem('lastViewedGalleryId');
          window.history.replaceState({}, '', '/gallery');
        }
      }

      // URL に無ければ localStorage を参照
      const savedGalleryId = localStorage.getItem('lastViewedGalleryId');
      if (savedGalleryId) {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const galleryDoc = await getDoc(doc(db, 'galleries', savedGalleryId));
          if (shouldDebugReads) {
            console.log('[Gallery][Reads]', {
              source: 'saved',
              galleryId: savedGalleryId,
              galleryDoc: 1,
              total: 1,
            });
          }

          if (galleryDoc.exists()) {
            setCurrentGalleryId(savedGalleryId);
            window.history.replaceState({}, '', `/gallery?galleryId=${savedGalleryId}`);
            setIsInitialized(true);
            return;
          }

          localStorage.removeItem('lastViewedGalleryId');
        } catch (error) {
          console.error('[Gallery] Failed to check saved gallery:', error);
          localStorage.removeItem('lastViewedGalleryId');
        }
      }

      // ギャラリーが存在するかを確認
      try {
        const { collection, query, getDocs, limit } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const galleriesQuery = query(collection(db, 'galleries'), limit(1));
        const galleriesSnapshot = await getDocs(galleriesQuery);
        if (shouldDebugReads) {
          console.log('[Gallery][Reads]', {
            source: 'presence-check',
            galleryDocs: galleriesSnapshot.size,
            total: galleriesSnapshot.size,
          });
        }

        if (galleriesSnapshot.empty) {
          setHasGalleries(false);
          setCurrentGalleryId(null);
        } else {
          setHasGalleries(true);
          setCurrentGalleryId(null);
        }
      } catch (error) {
        console.error('[Gallery] Failed to check galleries:', error);
        setHasGalleries(false);
        setCurrentGalleryId(null);
      } finally {
        setIsInitialized(true);
      }
    };

    void initializeGalleryId();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const urlGalleryId = searchParams.get('galleryId');
    if (urlGalleryId && urlGalleryId !== currentGalleryId) {
      setCurrentGalleryId(urlGalleryId);
      localStorage.setItem('lastViewedGalleryId', urlGalleryId);
    }
  }, [searchParams, isInitialized, currentGalleryId]);

  return {
    currentGalleryId,
    setCurrentGalleryId,
    hasGalleries,
    isInitialized,
  };
};
