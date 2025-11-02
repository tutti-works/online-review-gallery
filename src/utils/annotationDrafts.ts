import type { AnnotationSavePayload } from '@/components/annotation-canvas/types';

const DRAFT_PREFIX = 'annotation-draft';
const DRAFT_INDEX_KEY = `${DRAFT_PREFIX}:index`;
const MAX_ENTRIES = 8;
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

type DraftRecord = {
  artworkId: string;
  pageNumber: number;
  payload: AnnotationSavePayload;
  savedAt: number;
};

type DraftIndexEntry = {
  key: string;
  savedAt: number;
};

const isBrowserEnvironment = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const getStorage = () => {
  if (!isBrowserEnvironment()) {
    return null;
  }
  return window.localStorage;
};

const makeKey = (artworkId: string, pageNumber: number) => `${DRAFT_PREFIX}:${artworkId}:${pageNumber}`;

const readIndex = (storage: Storage): DraftIndexEntry[] => {
  try {
    const raw = storage.getItem(DRAFT_INDEX_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => ({
        key: typeof entry?.key === 'string' ? entry.key : '',
        savedAt: typeof entry?.savedAt === 'number' ? entry.savedAt : 0,
      }))
      .filter((entry) => entry.key);
  } catch (error) {
    console.warn('[AnnotationDrafts] Failed to parse index', error);
    return [];
  }
};

const writeIndex = (storage: Storage, index: DraftIndexEntry[]) => {
  try {
    storage.setItem(DRAFT_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.warn('[AnnotationDrafts] Failed to write index', error);
  }
};

const getSerializedSize = (value: unknown): number => {
  try {
    const serialized = JSON.stringify(value);
    return new TextEncoder().encode(serialized).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};

const pruneIndex = (storage: Storage, index: DraftIndexEntry[]): DraftIndexEntry[] => {
  if (index.length <= MAX_ENTRIES) {
    return index;
  }
  const sorted = [...index].sort((a, b) => a.savedAt - b.savedAt);
  while (sorted.length > MAX_ENTRIES) {
    const entry = sorted.shift();
    if (entry) {
      storage.removeItem(entry.key);
    }
  }
  return sorted;
};

export const saveAnnotationDraft = (
  artworkId: string,
  pageNumber: number,
  payload: AnnotationSavePayload,
): { saved: boolean; reason?: string } => {
  const storage = getStorage();
  if (!storage) {
    return { saved: false, reason: 'UNAVAILABLE' };
  }

  const record: DraftRecord = {
    artworkId,
    pageNumber,
    payload,
    savedAt: Date.now(),
  };

  const size = getSerializedSize(record);
  if (size > MAX_SIZE_BYTES) {
    console.warn('[AnnotationDrafts] Draft too large to store', { artworkId, pageNumber, size });
    return { saved: false, reason: 'SIZE_LIMIT' };
  }

  const key = makeKey(artworkId, pageNumber);

  try {
    storage.setItem(key, JSON.stringify(record));
    let index = readIndex(storage).filter((entry) => entry.key !== key);
    index.push({ key, savedAt: record.savedAt });
    index = pruneIndex(storage, index);
    writeIndex(storage, index);
    return { saved: true };
  } catch (error) {
    console.error('[AnnotationDrafts] Failed to save draft', error);
    return { saved: false, reason: 'UNKNOWN' };
  }
};

export const loadAnnotationDraft = (
  artworkId: string,
  pageNumber: number,
): (DraftRecord & { key: string }) | null => {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const key = makeKey(artworkId, pageNumber);
  const raw = storage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const record = JSON.parse(raw) as Partial<DraftRecord>;
    if (!record || typeof record !== 'object') {
      return null;
    }
    if (!record.payload || typeof record.savedAt !== 'number') {
      return null;
    }
    return {
      key,
      artworkId,
      pageNumber,
      payload: record.payload,
      savedAt: record.savedAt,
    };
  } catch (error) {
    console.warn('[AnnotationDrafts] Failed to parse draft', error);
    return null;
  }
};

export const clearAnnotationDraft = (artworkId: string, pageNumber: number): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const key = makeKey(artworkId, pageNumber);
  storage.removeItem(key);

  const index = readIndex(storage).filter((entry) => entry.key !== key);
  writeIndex(storage, index);
};

export const listAnnotationDrafts = (): DraftRecord[] => {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const index = readIndex(storage);
  const drafts: DraftRecord[] = [];
  index.forEach((entry) => {
    const raw = storage.getItem(entry.key);
    if (!raw) {
      return;
    }
    try {
      const record = JSON.parse(raw) as DraftRecord;
      if (record && record.payload) {
        drafts.push(record);
      }
    } catch (error) {
      console.warn('[AnnotationDrafts] Failed to parse draft entry', error);
    }
  });
  return drafts;
};
