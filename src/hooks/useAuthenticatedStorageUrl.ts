'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBlob, ref } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { isLocalPreview } from '@/lib/localPreview';
import { auth, storage } from '@/lib/firebase';
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

    const fetchImage = async () => {
      if (!isLocalPreview()) return getBlob(ref(storage, resolvedPath));
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('画像を見るにはログインしてください。');
      const response = await fetch('/api/preview/storage?path=' + encodeURIComponent(resolvedPath), {
        headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error('画像の取得に失敗しました (' + response.status + ')');
      return response.blob();
    };
    fetchImage()
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
