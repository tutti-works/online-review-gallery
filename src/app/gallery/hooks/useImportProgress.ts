'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getFunctionsBaseUrl } from '@/lib/functionsBaseUrl';

export type ImportProgress = {
  importJobId: string;
  galleryId: string;
  status: string;
  progress: number;
  processedFiles: number;
  totalFiles: number;
};

type UseImportProgressOptions = {
  isInitialized: boolean;
  currentGalleryId: string | null;
  onImportCompleted: () => void;
};

type UseImportProgressResult = {
  importProgress: ImportProgress | null;
  setImportProgress: Dispatch<SetStateAction<ImportProgress | null>>;
};

export const useImportProgress = ({
  isInitialized,
  currentGalleryId,
  onImportCompleted,
}: UseImportProgressOptions): UseImportProgressResult => {
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

  useEffect(() => {
    if (!isInitialized) return;

    const activeImportStr = typeof window !== 'undefined' ? localStorage.getItem('activeImportJob') : null;
    if (!activeImportStr) {
      return;
    }

    try {
      const activeImport = JSON.parse(activeImportStr) as {
        importJobId: string;
        galleryId: string;
        startedAt: string;
      };

      const { importJobId, galleryId, startedAt } = activeImport;
      const startTime = new Date(startedAt).getTime();
      if (Date.now() - startTime > 30 * 60 * 1000) {
        localStorage.removeItem('activeImportJob');
        return;
      }

      const functionsBaseUrl = getFunctionsBaseUrl();
      const checkProgress = setInterval(async () => {
        try {
          const response = await fetch(`${functionsBaseUrl}/getImportStatus?importJobId=${importJobId}`);
          if (response.ok) {
            const data = await response.json();
            setImportProgress({
              importJobId,
              galleryId,
              status: data.status,
              progress: data.progress,
              processedFiles: data.processedFiles,
              totalFiles: data.totalFiles,
            });

            if (data.status === 'completed' || data.status === 'error') {
              clearInterval(checkProgress);
              localStorage.removeItem('activeImportJob');
              setImportProgress(null);
              onImportCompleted();
            }
          } else if (response.status === 404) {
            clearInterval(checkProgress);
            localStorage.removeItem('activeImportJob');
            setImportProgress(null);
          }
        } catch (error) {
          console.error('Progress check error:', error);
        }
      }, 3000);

      return () => clearInterval(checkProgress);
    } catch (error) {
      console.error('Error checking active import:', error);
      localStorage.removeItem('activeImportJob');
    }
  }, [isInitialized, currentGalleryId, onImportCompleted]);

  return { importProgress, setImportProgress };
};
