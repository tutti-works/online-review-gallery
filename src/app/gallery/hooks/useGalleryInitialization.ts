'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { filterGalleriesByMode, galleryPath, lastViewedKey, resolveGallerySelection, type GalleryMode } from '@/lib/courseArchive';
import { fetchArchivedCourseIds, fetchGalleries } from '@/lib/galleryData';
import type { Gallery } from '@/types';

export const useGalleryInitialization = (mode: GalleryMode) => {
  const searchParams = useSearchParams();
  const [currentGalleryId, setCurrentGalleryId] = useState<string | null>(null);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const [allGalleries, archivedCourseIds] = await Promise.all([
          fetchGalleries(), fetchArchivedCourseIds(),
        ]);
        if (!active) return;
        const available = filterGalleriesByMode(allGalleries, archivedCourseIds, mode);
        setGalleries(available);
        const path = galleryPath(mode);
        const key = lastViewedKey(mode);
        const urlId = new URLSearchParams(window.location.search).get('galleryId');
        const savedId = localStorage.getItem(key);
        const selection = resolveGallerySelection(available, urlId, savedId);
        setCurrentGalleryId(selection.galleryId);
        if (urlId && selection.galleryId === urlId) localStorage.setItem(key, urlId);
        if (selection.restoreSaved && selection.galleryId) {
          window.history.replaceState({}, '', `${path}?galleryId=${encodeURIComponent(selection.galleryId)}`);
        }
        if (selection.clearSaved) localStorage.removeItem(key);
        if (selection.clearUrl) window.history.replaceState({}, '', path);
      } catch (error) {
        if (!active) return;
        console.error('[Gallery] Failed to load galleries or archives:', error);
        setLoadError('ギャラリーの一覧を読み込めませんでした。再読み込みしてください。');
        setCurrentGalleryId(null);
      } finally {
        if (active) setIsInitialized(true);
      }
    };
    void initialize();
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    if (!isInitialized || loadError) return;
    const urlId = new URLSearchParams(window.location.search).get('galleryId');
    if (!urlId) {
      if (currentGalleryId) setCurrentGalleryId(null);
      return;
    }
    if (galleries.some((gallery) => gallery.id === urlId)) {
      if (urlId !== currentGalleryId) {
        setCurrentGalleryId(urlId);
        localStorage.setItem(lastViewedKey(mode), urlId);
      }
    } else {
      setCurrentGalleryId(null);
      window.history.replaceState({}, '', galleryPath(mode));
    }
  }, [searchParams, isInitialized, currentGalleryId, galleries, mode, loadError]);

  return {
    currentGalleryId,
    galleries,
    hasGalleries: galleries.length > 0,
    isInitialized,
    loadError,
  };
};
