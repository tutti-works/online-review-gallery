'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'showcaseViewerMode';

export const useShowcaseViewerMode = () => {
  const [viewerMode, setViewerMode] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

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
