'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'showcaseViewerMode';

export const useShowcaseViewerMode = () => {
  const [viewerMode, setViewerMode] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    setViewerMode(saved === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, viewerMode ? 'true' : 'false');
  }, [viewerMode]);

  return {
    viewerMode,
    setViewerMode,
  };
};
