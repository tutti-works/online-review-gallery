const ALLOWED_PREFIXES = ['galleries/', 'showcase/'] as const;

const normalizeStoragePath = (value: string): string | null => {
  const path = value.replace(/^\/+/, '');
  if (!path || path.includes('..') || !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return null;
  }
  return path;
};

export const storagePathFromUrl = (rawUrl?: string): string | null => {
  if (!rawUrl) {
    return null;
  }

  try {
    if (rawUrl.startsWith('gs://')) {
      const withoutScheme = rawUrl.slice('gs://'.length);
      const slashIndex = withoutScheme.indexOf('/');
      return slashIndex >= 0 ? normalizeStoragePath(decodeURIComponent(withoutScheme.slice(slashIndex + 1))) : null;
    }

    const url = new URL(rawUrl);
    if (url.hostname === 'storage.googleapis.com') {
      const pathParts = url.pathname.replace(/^\/+/, '').split('/');
      return pathParts.length > 1
        ? normalizeStoragePath(decodeURIComponent(pathParts.slice(1).join('/')))
        : null;
    }

    if (url.hostname === 'firebasestorage.googleapis.com' || url.hostname === 'localhost') {
      const objectMarker = '/o/';
      const markerIndex = url.pathname.indexOf(objectMarker);
      return markerIndex >= 0
        ? normalizeStoragePath(decodeURIComponent(url.pathname.slice(markerIndex + objectMarker.length)))
        : null;
    }
  } catch {
    return null;
  }

  return null;
};

export const resolveStoragePath = (storagePath?: string, legacyUrl?: string): string | null =>
  (storagePath ? normalizeStoragePath(storagePath) : null) ?? storagePathFromUrl(legacyUrl);

export const isStorageBackedUrl = (url?: string): boolean => storagePathFromUrl(url) !== null;
