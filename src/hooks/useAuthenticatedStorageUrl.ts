'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBlob, ref } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { storage } from '@/lib/firebase';
import { isStorageBackedUrl, resolveStoragePath } from '@/lib/storageObject';

type StorageSource = {
  storagePath?: string;
  legacyUrl?: string;
};

type AuthenticatedStorageUrl = {
  url: string | null;
  loading: boolean;
  error: Error | null;
};

export const useAuthenticatedStorageUrl = ({
  storagePath,
  legacyUrl,
}: StorageSource): AuthenticatedStorageUrl => {
  const { user } = useAuth();
  const resolvedPath = useMemo(
    () => resolveStoragePath(storagePath, legacyUrl),
    [legacyUrl, storagePath],
  );
  const directUrl = !resolvedPath && legacyUrl && !isStorageBackedUrl(legacyUrl) ? legacyUrl : null;
  const [state, setState] = useState<AuthenticatedStorageUrl>({
    url: directUrl,
    loading: Boolean(resolvedPath),
    error: null,
  });

  useEffect(() => {
    if (!resolvedPath) {
      setState({ url: directUrl, loading: false, error: null });
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setState({ url: null, loading: true, error: null });

    getBlob(ref(storage, resolvedPath))
      .then((blob) => {
        if (!active) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        const normalizedError = error instanceof Error ? error : new Error('Storage image fetch failed');
        setState({ url: null, loading: false, error: normalizedError });
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [directUrl, resolvedPath, user?.uid]);

  return state;
};
