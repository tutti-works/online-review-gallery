const parseBytes = (input: string | undefined, fallback: number): number => {
  if (!input) return fallback;
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return fallback;

  const match = /^(\d+(?:\.\d+)?)(mb|kb|gb)?$/.exec(trimmed);
  if (!match) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const unit = match[2];
  switch (unit) {
    case 'gb':
      return value * 1024 * 1024 * 1024;
    case 'mb':
      return value * 1024 * 1024;
    case 'kb':
      return value * 1024;
    default:
      return value;
  }
};

const DEFAULT_MAX_MEMORY_BYTES = 200 * 1024 * 1024; // 200MB

export const IMAGE_CACHE_CONFIG = {
  maxMemoryBytes: parseBytes(process.env.NEXT_PUBLIC_IMAGE_CACHE_MAX_MEMORY, DEFAULT_MAX_MEMORY_BYTES),
  debug: process.env.NEXT_PUBLIC_IMAGE_CACHE_DEBUG === 'true',
} as const;

export type ImageCacheConfig = typeof IMAGE_CACHE_CONFIG;
