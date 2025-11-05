import { IMAGE_CACHE_CONFIG } from '@/config/imageCache';

type CachedImage = {
  image: HTMLImageElement;
  bitmap: ImageBitmap | null;
  size: number;
  lastAccess: number;
};

type PendingLoad = Promise<CachedImage>;

const isBrowser = typeof window !== 'undefined';

class ImageCacheManager {
  private cache = new Map<string, CachedImage>();
  private pending = new Map<string, PendingLoad>();
  private currentMemory = 0;

  constructor(private readonly maxMemoryBytes: number, private readonly debug: boolean) {}

  async get(cacheKey: string, url: string): Promise<CachedImage> {
    if (!isBrowser) {
      throw new Error('ImageCacheManager can only be used in the browser');
    }

    const existing = this.cache.get(cacheKey);
    if (existing) {
      existing.lastAccess = Date.now();
      if (this.debug) {
        console.log('[ImageCache] HIT', cacheKey, this.formatMemory());
      }
      return existing;
    }

    const pendingLoad = this.pending.get(cacheKey);
    if (pendingLoad) {
      const result = await pendingLoad;
      result.lastAccess = Date.now();
      return result;
    }

    const loadPromise = this.loadAndStore(cacheKey, url);
    this.pending.set(cacheKey, loadPromise);
    try {
      const result = await loadPromise;
      result.lastAccess = Date.now();
      return result;
    } finally {
      this.pending.delete(cacheKey);
    }
  }

  invalidate(cacheKey: string): void {
    const entry = this.cache.get(cacheKey);
    if (!entry) return;
    this.evict(cacheKey, entry);
    if (this.debug) {
      console.log('[ImageCache] Invalidated key', cacheKey, this.formatMemory());
    }
  }

  invalidateArtwork(artworkId: string): void {
    const prefix = `${artworkId}:`;
    const keysToRemove: string[] = [];
    this.cache.forEach((_entry, key) => {
      if (key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach((key) => {
      const entry = this.cache.get(key);
      if (entry) {
        this.evict(key, entry);
      }
    });
    if (this.debug) {
      console.log('[ImageCache] Invalidated artwork', artworkId, this.formatMemory());
    }
  }

  clear(): void {
    const keysToRemove: string[] = [];
    this.cache.forEach((_entry, key) => {
      keysToRemove.push(key);
    });
    keysToRemove.forEach((key) => {
      const entry = this.cache.get(key);
      if (entry) {
        this.evict(key, entry);
      }
    });
    this.cache.clear();
    if (this.debug) {
      console.log('[ImageCache] Cleared cache', this.formatMemory());
    }
  }

  private async loadAndStore(cacheKey: string, url: string): Promise<CachedImage> {
    const image = await this.loadImage(url);
    const bitmap = await this.createBitmap(image);
    const size = this.estimateSize(bitmap ?? image);
    await this.ensureCapacity(size);

    const entry: CachedImage = {
      image,
      bitmap,
      size,
      lastAccess: Date.now(),
    };

    this.cache.set(cacheKey, entry);
    this.currentMemory += size;

    if (this.debug) {
      console.log('[ImageCache] MISS', cacheKey, this.formatMemory(), `(+${this.formatBytes(size)})`);
    }

    return entry;
  }

  private async ensureCapacity(requiredSize: number): Promise<void> {
    if (requiredSize > this.maxMemoryBytes) {
      // Image alone exceeds max capacity; still attempt to cache by clearing all
      this.clear();
      return;
    }

    while (this.currentMemory + requiredSize > this.maxMemoryBytes && this.cache.size > 0) {
      const oldestKey = this.findOldestKey();
      if (!oldestKey) break;
      const entry = this.cache.get(oldestKey);
      if (!entry) {
        this.cache.delete(oldestKey);
        continue;
      }
      this.evict(oldestKey, entry);
    }
  }

  private findOldestKey(): string | null {
    let result: [string, number] | null = null;
    this.cache.forEach((entry, key) => {
      if (result === null || entry.lastAccess < result[1]) {
        result = [key, entry.lastAccess];
      }
    });
    return result ? result[0] : null;
  }

  private evict(key: string, entry: CachedImage): void {
    if (entry.bitmap && typeof entry.bitmap.close === 'function') {
      try {
        entry.bitmap.close();
      } catch {
        // ignore
      }
    }
    this.cache.delete(key);
    this.currentMemory = Math.max(0, this.currentMemory - entry.size);
  }

  private estimateSize(source: ImageBitmap | HTMLImageElement): number {
    const width =
      'width' in source && typeof source.width === 'number' && source.width > 0
        ? source.width
        : (source as HTMLImageElement).naturalWidth || (source as HTMLImageElement).width || 0;
    const height =
      'height' in source && typeof source.height === 'number' && source.height > 0
        ? source.height
        : (source as HTMLImageElement).naturalHeight || (source as HTMLImageElement).height || 0;
    if (width === 0 || height === 0) {
      return 0;
    }
    return width * height * 4; // RGBA
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (error) => reject(error);
      img.src = url;
    });
  }

  private async createBitmap(image: HTMLImageElement): Promise<ImageBitmap | null> {
    if (typeof createImageBitmap === 'undefined') {
      return null;
    }
    try {
      return await createImageBitmap(image);
    } catch (error) {
      if (this.debug) {
        console.warn('[ImageCache] createImageBitmap failed', error);
      }
      return null;
    }
  }

  private formatMemory(): string {
    return `${this.formatBytes(this.currentMemory)}/${this.formatBytes(this.maxMemoryBytes)}`;
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${bytes}B`;
  }
}

export const imageCacheManager = new ImageCacheManager(IMAGE_CACHE_CONFIG.maxMemoryBytes, IMAGE_CACHE_CONFIG.debug);

export type CachedImageResult = Awaited<ReturnType<ImageCacheManager['get']>>;
