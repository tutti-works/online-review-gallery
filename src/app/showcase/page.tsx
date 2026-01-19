'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import withShowcaseAuth from '@/components/withShowcaseAuth';
import { useAuth } from '@/context/AuthContext';
import type { Artwork, Gallery, ShowcaseGallery } from '@/types';
import ShowcaseAccessGate from './components/ShowcaseAccessGate';
import { fetchArtworksByIds, getCoverImage } from '@/lib/showcaseData';
import { syncShowcaseGallery } from '@/lib/showcaseSync';
import { isShowcaseDomainAllowed } from '@/utils/showcaseAccess';
import { useShowcaseViewerMode } from '@/hooks/useShowcaseViewerMode';

type ShowcaseEntryBase = {
  gallery: Gallery;
  showcase: ShowcaseGallery;
  featuredArtworkId: string;
};

type ShowcaseEntry = ShowcaseEntryBase & {
  featuredArtwork: Artwork | null;
};

const mapGalleryDoc = (id: string, data: Record<string, any>): Gallery => {
  return {
    id,
    title: data.title,
    description: data.description,
    courseName: data.courseName || '',
    assignmentName: data.assignmentName || '',
    courseId: data.courseId || '',
    assignmentId: data.assignmentId || '',
    classroomId: data.classroomId || data.courseId || '',
    artworkCount: data.artworkCount || 0,
    createdBy: data.createdBy || '',
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
    lastImportAt: data.lastImportAt?.toDate ? data.lastImportAt.toDate() : data.lastImportAt,
  };
};

const ShowcaseHomePage = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ShowcaseEntry[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { viewerMode, setViewerMode } = useShowcaseViewerMode();

  const isAdmin = user?.role === 'admin';
  const isAllowed = isShowcaseDomainAllowed(user?.email);
  const canManage = isAdmin && !viewerMode;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const galleriesSnapshot = await getDocs(query(collection(db, 'galleries'), orderBy('createdAt', 'desc')));
      const fetchedGalleries = galleriesSnapshot.docs.map((doc) => mapGalleryDoc(doc.id, doc.data()));
      setGalleries(fetchedGalleries);

      const showcaseSnapshot = await getDocs(collection(db, 'showcaseGalleries'));
      const showcaseMap = new Map<string, ShowcaseGallery>();
      showcaseSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        showcaseMap.set(doc.id, {
          id: doc.id,
          displayTitle: data.displayTitle,
          featuredArtworkId: data.featuredArtworkId ?? null,
          curatedArtworkIds: Array.isArray(data.curatedArtworkIds) ? data.curatedArtworkIds : [],
          overviewImageUrl: data.overviewImageUrl,
          overviewImagePath: data.overviewImagePath,
          syncedAt: data.syncedAt?.toDate ? data.syncedAt.toDate() : data.syncedAt,
          updatedBy: data.updatedBy,
        });
      });

      const candidateEntries = fetchedGalleries
        .map((gallery) => {
          const showcase = showcaseMap.get(gallery.id);
          if (!showcase || !showcase.curatedArtworkIds || showcase.curatedArtworkIds.length === 0) {
            return null;
          }
          const curatedIds = showcase.curatedArtworkIds;
          let featuredId = showcase.featuredArtworkId;
          if (!featuredId || !curatedIds.includes(featuredId)) {
            featuredId = curatedIds[0] ?? null;
          }
          if (!featuredId) {
            return null;
          }
          return {
            gallery,
            showcase,
            featuredArtworkId: featuredId,
          };
        })
        .filter((entry): entry is ShowcaseEntryBase => entry !== null);

      const uniqueFeaturedIds = Array.from(new Set(candidateEntries.map((entry) => entry.featuredArtworkId)));
      const featuredArtworks = await fetchArtworksByIds(uniqueFeaturedIds);
      const featuredMap = new Map(featuredArtworks.map((artwork) => [artwork.id, artwork]));

      const resolvedEntries = candidateEntries.map((entry) => ({
        ...entry,
        featuredArtwork: entry.featuredArtworkId ? featuredMap.get(entry.featuredArtworkId) ?? null : null,
      }));

      setEntries(resolvedEntries);
    } catch (loadError) {
      console.error('[Showcase] Failed to load showcase data:', loadError);
      setError('専用ギャラリーの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed) {
      return;
    }
    void loadData();
  }, [isAllowed, loadData]);

  const handleSyncAll = async () => {
    if (!user?.email || syncing || !galleries.length || !isAllowed || !canManage) {
      return;
    }

    setSyncing(true);
    setSyncMessage(`全課題を更新中... 0 / ${galleries.length}`);
    const errors: string[] = [];

    for (let index = 0; index < galleries.length; index += 1) {
      const gallery = galleries[index];
      setSyncMessage(`全課題を更新中... ${index + 1} / ${galleries.length}（${gallery.assignmentName}）`);
      try {
        await syncShowcaseGallery(gallery.id, user.email);
      } catch (syncError) {
        console.error('[Showcase] Sync failed:', syncError);
        errors.push(gallery.assignmentName || gallery.id);
      }
    }

    if (errors.length > 0) {
      setError(`一部の課題で更新に失敗しました: ${errors.join(', ')}`);
    }

    setSyncMessage(null);
    setSyncing(false);
    void loadData();
  };

  const hasEntries = entries.length > 0;

  return (
    <ShowcaseAccessGate>
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">デザインテクノロジー発展1/2</h1>
              <p className="mt-1 text-sm text-gray-600">課題ごとに優秀作品が表示されます。</p>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-3">
                {canManage && (
                  <button
                    type="button"
                    onClick={handleSyncAll}
                    disabled={syncing}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    全課題を一括更新
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewerMode((prev) => !prev)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  閲覧モード: {viewerMode ? 'ON' : 'OFF'}
                </button>
              </div>
            )}
          </div>

          {syncMessage && (
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
              {syncMessage}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-56 animate-pulse rounded-lg bg-gray-200" />
              ))}
            </div>
          ) : !hasEntries ? (
            <div className="mt-10 rounded-lg border border-gray-200 bg-white px-6 py-10 text-center text-gray-600">
              まだ優秀作品が選定されている課題がありません。
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => {
                const displayTitle = entry.showcase.displayTitle?.trim() || entry.gallery.assignmentName;
                const featuredArtwork = entry.featuredArtwork;
                const coverImage = featuredArtwork ? getCoverImage(featuredArtwork) : null;

                return (
                  <Link
                    key={entry.gallery.id}
                    href={`/showcase/${entry.gallery.id}`}
                    className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="relative w-full bg-gray-100" style={{ aspectRatio: '420 / 297' }}>
                      {coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={coverImage.thumbnailUrl || coverImage.url}
                          alt={displayTitle}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-500">画像なし</div>
                      )}
                    </div>
                    <div className="p-4">
                      <h2 className="mt-1 text-base font-semibold text-gray-900">{displayTitle}</h2>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </ShowcaseAccessGate>
  );
};

export default withShowcaseAuth(ShowcaseHomePage, 'viewer');
