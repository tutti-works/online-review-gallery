'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import withShowcaseAuth from '@/components/withShowcaseAuth';
import { useAuth } from '@/context/AuthContext';
import type { Artwork, Gallery, ShowcaseGallery } from '@/types';
import ShowcaseAccessGate from './components/ShowcaseAccessGate';
import { fetchArtworksByGalleryId, fetchArtworksByIds, getCoverImage } from '@/lib/showcaseData';
import { syncShowcaseGallery } from '@/lib/showcaseSync';
import { isShowcaseDomainAllowed } from '@/utils/showcaseAccess';
import { useShowcaseViewerMode } from '@/hooks/useShowcaseViewerMode';
import { mergeShowcaseArtworks } from '@/lib/showcaseMerge';

type ShowcaseEntryBase = {
  gallery: Gallery;
  showcase: ShowcaseGallery;
  featuredArtworkId: string;
};

type ShowcaseEntry = ShowcaseEntryBase & {
  featuredArtwork: Artwork | null;
};

type ShowcaseCardProps = {
  entry: ShowcaseEntry;
  canManage: boolean;
  updateCandidates: Gallery[];
  onUpdateSourceChange: (galleryId: string, nextSourceId: string) => void;
  savingOrder: boolean;
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
  const [updatingSourceId, setUpdatingSourceId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const { viewerMode, setViewerMode } = useShowcaseViewerMode();
  const initialLoadRef = useRef(true);
  const shouldDebugImages = process.env.NEXT_PUBLIC_SHOWCASE_IMAGE_DEBUG === 'true';
  const shouldDebugReads =
    process.env.NEXT_PUBLIC_FIRESTORE_READ_DEBUG === 'true' || shouldDebugImages;

  const isAdmin = user?.role === 'admin';
  const isAllowed = isShowcaseDomainAllowed(user?.email);
  const canManage = isAdmin && !viewerMode;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    document.title = 'GALLERY COLLECTION';
  }, []);

  const getClassroomKey = (gallery: Gallery): string =>
    gallery.classroomId || gallery.courseId;

  const loadData = useCallback(async () => {
    try {
      if (shouldDebugImages) {
        console.log('[Showcase] loadData start');
      }
      if (initialLoadRef.current) {
        setLoading(true);
      }
      setError(null);

      const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // Fetch existing galleries (base source)
      const galleriesSnapshot = await getDocs(query(collection(db, 'galleries'), orderBy('createdAt', 'desc')));
      const fetchedGalleries = galleriesSnapshot.docs.map((doc) => mapGalleryDoc(doc.id, doc.data()));
      setGalleries(fetchedGalleries);

      // Fetch showcase-specific data
      const showcaseSnapshot = await getDocs(collection(db, 'showcaseGalleries'));
      const showcaseMap = new Map<string, ShowcaseGallery>();
      showcaseSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        showcaseMap.set(doc.id, {
          id: doc.id,
          displayTitle: data.displayTitle,
          featuredArtworkId: data.featuredArtworkId ?? null,
          curatedArtworkIds: Array.isArray(data.curatedArtworkIds) ? data.curatedArtworkIds : [],
          updateSourceGalleryId: data.updateSourceGalleryId ?? null,
          displayOrder: typeof data.displayOrder === 'number' ? data.displayOrder : undefined,
          overviewImageUrl: data.overviewImageUrl,
          overviewImagePath: data.overviewImagePath,
          overviewImageThumbUrl: data.overviewImageThumbUrl,
          overviewImageThumbPath: data.overviewImageThumbPath,
          syncedAt: data.syncedAt?.toDate ? data.syncedAt.toDate() : data.syncedAt,
          updatedBy: data.updatedBy,
        });
      });

      // Join data
      const candidateEntries = fetchedGalleries
        .map((gallery) => {
          const showcase = showcaseMap.get(gallery.id);
          // Only show entries that have valid showcase data AND at least one curated artwork
          if (!showcase || !showcase.curatedArtworkIds || showcase.curatedArtworkIds.length === 0) {
            return null;
          }
          const curatedIds = showcase.curatedArtworkIds;
          let featuredId = showcase.featuredArtworkId;
          // Fallback to first artwork if featured is invalid
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

      const orderedEntries = [...candidateEntries].sort((a, b) => {
        const aOrder = typeof a.showcase.displayOrder === 'number' ? a.showcase.displayOrder : Number.POSITIVE_INFINITY;
        const bOrder = typeof b.showcase.displayOrder === 'number' ? b.showcase.displayOrder : Number.POSITIVE_INFINITY;
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        const aCreated = a.gallery.createdAt ? new Date(a.gallery.createdAt).getTime() : 0;
        const bCreated = b.gallery.createdAt ? new Date(b.gallery.createdAt).getTime() : 0;
        return bCreated - aCreated;
      });

      const updateSourceIds = Array.from(
        new Set(
          orderedEntries
            .map((entry) => entry.showcase.updateSourceGalleryId)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const updateSourcePairs = await Promise.all(
        updateSourceIds.map(async (sourceId) => {
          const updateArtworks = await fetchArtworksByGalleryId(sourceId);
          return [sourceId, updateArtworks] as const;
        }),
      );
      const updateSourceMap = new Map(updateSourcePairs);
      const updateSourceReadCount = updateSourcePairs.reduce((sum, [, artworks]) => sum + artworks.length, 0);

      // Fetch artworks for thumbnails
      const uniqueFeaturedIds = Array.from(new Set(orderedEntries.map((entry) => entry.featuredArtworkId)));
      const featuredArtworks = await fetchArtworksByIds(uniqueFeaturedIds);
      const featuredMap = new Map(featuredArtworks.map((artwork) => [artwork.id, artwork]));

      const resolvedEntries = orderedEntries.map((entry) => {
        const featuredArtwork = entry.featuredArtworkId ? featuredMap.get(entry.featuredArtworkId) ?? null : null;
        const updateSourceId = entry.showcase.updateSourceGalleryId;
        const updateArtworks = updateSourceId ? updateSourceMap.get(updateSourceId) : null;
        const mergedFeatured = featuredArtwork && updateArtworks
          ? mergeShowcaseArtworks([featuredArtwork], updateArtworks)[0] ?? featuredArtwork
          : featuredArtwork;

        return {
          ...entry,
          featuredArtwork: mergedFeatured,
        };
      });

      setEntries(resolvedEntries);
      if (shouldDebugImages) {
        console.log('[Showcase] loadData done', {
          entries: resolvedEntries.length,
          galleries: fetchedGalleries.length,
          updateSources: updateSourceIds.length,
        });
      }
      if (shouldDebugReads) {
        const galleriesRead = galleriesSnapshot.size;
        const showcaseRead = showcaseSnapshot.size;
        const featuredRead = uniqueFeaturedIds.length;
        const totalReads = galleriesRead + showcaseRead + featuredRead + updateSourceReadCount;
        console.log('[Showcase][Entry][Reads]', {
          galleries: galleriesRead,
          showcaseGalleries: showcaseRead,
          featuredArtworks: featuredRead,
          updateSourceArtworks: updateSourceReadCount,
          total: totalReads,
        });
      }
    } catch (loadError) {
      console.error('[Showcase] Failed to load showcase data:', loadError);
      setError('専用ギャラリーの読み込みに失敗しました。');
    } finally {
      setLoading(false);
      initialLoadRef.current = false;
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
      setSyncMessage(`更新中... ${index + 1} / ${galleries.length} : ${gallery.assignmentName}`);
      try {
      if (shouldDebugImages) {
        console.log('[Showcase] loadData start');
      }
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

  const persistEntryOrder = useCallback(
    async (nextEntries: ShowcaseEntry[]) => {
      if (!user?.email) {
        return;
      }

      const { doc, writeBatch } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const batch = writeBatch(db);

      nextEntries.forEach((entry, index) => {
        batch.set(
          doc(db, 'showcaseGalleries', entry.gallery.id),
          {
            displayOrder: index + 1,
            updatedBy: user.email,
          },
          { merge: true },
        );
      });

      await batch.commit();
    },
    [user?.email],
  );
  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canManage || savingOrder) {
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const activeId = String(active.id);
    const overId = String(over.id);
    const oldIndex = entries.findIndex((entry) => entry.gallery.id === activeId);
    const newIndex = entries.findIndex((entry) => entry.gallery.id === overId);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    const nextEntries = arrayMove(entries, oldIndex, newIndex);
    setEntries(nextEntries);
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: scrollX, behavior: 'auto' });
    });
    setSavingOrder(true);
    setError(null);
    try {
      if (shouldDebugImages) {
        console.log('[Showcase] loadData start');
      }
      await persistEntryOrder(nextEntries);
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, left: scrollX, behavior: 'auto' });
      });
    } catch (saveError) {
      console.error('[Showcase] Failed to save order:', saveError);
      setError('並び替えの保存に失敗しました。');
    } finally {
      setSavingOrder(false);
    }
  };

  const ShowcaseCardContent = ({
    entry,
    canManage,
    updateCandidates,
    onUpdateSourceChange,
    savingOrder,
  }: ShowcaseCardProps) => {
    const displayTitle = entry.showcase.displayTitle?.trim() || entry.gallery.assignmentName;
    const featuredArtwork = entry.featuredArtwork;
    const coverImage = featuredArtwork ? getCoverImage(featuredArtwork) : null;

    return (
      <>
        <Link
          href={`/showcase/${entry.gallery.id}`}
          className="block"
        >
          <div className="relative w-full overflow-hidden bg-[#1e1e1e]" style={{ aspectRatio: '420 / 297' }}>
            {coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImage.thumbnailUrl || coverImage.url}
                alt={displayTitle}
                className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-105 group-hover:opacity-80"
                onLoad={() => {
                  if (shouldDebugImages) {
                    console.log('[Showcase] thumbnail loaded', {
                      galleryId: entry.gallery.id,
                      url: coverImage.thumbnailUrl || coverImage.url,
                    });
                  }
                }}
                onError={() => {
                  if (shouldDebugImages) {
                    console.warn('[Showcase] thumbnail load error', {
                      galleryId: entry.gallery.id,
                      url: coverImage.thumbnailUrl || coverImage.url,
                    });
                  }
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-600 font-light tracking-widest">NO IMAGE</div>
            )}
            
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
          </div>
          
          <div className="mt-4 flex items-baseline justify-between border-b border-white/10 pb-2 transition-colors group-hover:border-white/40">
            <h2 className="font-serif text-lg font-light text-gray-200 group-hover:text-white transition-colors">
              {displayTitle}
            </h2>
            <span className="text-[10px] text-gray-600 group-hover:text-gray-400">
               VIEW DETAILS
            </span>
          </div>
        </Link>

        {canManage && (
          <div className="mt-3 text-xs text-gray-400">
            <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-gray-500">
              ＋更新用データのソースを選択
            </label>
            <select
              value={entry.showcase.updateSourceGalleryId ?? ''}
              onChange={(event) => void onUpdateSourceChange(entry.gallery.id, event.target.value)}
              disabled={savingOrder}
              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-xs text-gray-200 outline-none transition focus:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">（未設定）</option>
              {updateCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.assignmentName || candidate.title || candidate.id}
                </option>
              ))}
            </select>
          </div>
        )}
      </>
    );
  };

  const SortableShowcaseCard = ({
    entry,
    canManage,
    updateCandidates,
    onUpdateSourceChange,
    savingOrder,
  }: ShowcaseCardProps) => {
    const animateLayoutChanges: AnimateLayoutChanges = (args) => {
      if (args.isSorting || args.wasDragging) {
        return defaultAnimateLayoutChanges(args);
      }
      return false;
    };
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: entry.gallery.id,
      disabled: !canManage || savingOrder,
      animateLayoutChanges,
    });

    const fallbackTransition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
    const style = {
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? 'none' : (transition ?? fallbackTransition),
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`group relative will-change-transform ${isDragging ? 'opacity-80' : ''}`}
      >
        {canManage && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/50 text-[10px] text-gray-200 backdrop-blur-sm transition hover:border-white/30"
            aria-label="ドラッグして並び替え"
            title="ドラッグして並び替え"
          >
            ⋮⋮
          </button>
        )}
        <ShowcaseCardContent
          entry={entry}
          canManage={canManage}
          updateCandidates={updateCandidates}
          onUpdateSourceChange={onUpdateSourceChange}
          savingOrder={savingOrder}
        />
      </div>
    );
  };

  const handleUpdateSourceChange = async (galleryId: string, nextSourceId: string) => {
    if (!user?.email || !canManage || !isAllowed) {
      return;
    }

    setUpdatingSourceId(galleryId);
    setError(null);

    try {
      if (shouldDebugImages) {
        console.log('[Showcase] loadData start');
      }
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const updateSourceGalleryId = nextSourceId || null;

      await setDoc(
        doc(db, 'showcaseGalleries', galleryId),
        {
          updateSourceGalleryId,
          updatedBy: user.email,
        },
        { merge: true },
      );

      void loadData();
    } catch (saveError) {
      console.error('[Showcase] Failed to update source gallery:', saveError);
      setError('更新用データのソース保存に失敗しました。');
    } finally {
      setUpdatingSourceId(null);
    }
  };

  const hasEntries = entries.length > 0;

  return (
    <ShowcaseAccessGate>
      <main className="min-h-screen text-white pb-32">
         {/* Hero Header */}
         <section className="relative w-full px-6 py-20 text-center animate-fade-in">
             <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
             <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-gray-400 mb-4">
               Department of Architecture
             </p>
             <h1 className="font-serif text-4xl md:text-5xl font-thin tracking-wider" style={{ fontFamily: 'var(--font-serif)' }}>
               GALLERY COLLECTION
             </h1>
             <p className="mt-6 text-sm font-light text-gray-500 tracking-wide">
               Selected Outstanding Works
             </p>
         </section>

        <div className="mx-auto w-full max-w-[1400px] px-6">
          {/* Admin Tools Area */}
          {(syncMessage || error) && (
            <div className="mb-8 font-sans">
                {syncMessage && (
                    <div className="rounded border border-blue-500/30 bg-blue-900/20 px-4 py-3 text-sm text-blue-200 backdrop-blur-sm">
                    {syncMessage}
                    </div>
                )}
                {error && (
                    <div className="mt-2 rounded border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
                    {error}
                    </div>
                )}
            </div>
          )}

          {loading ? (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="aspect-[420/297] animate-pulse rounded bg-white/5" />
              ))}
            </div>
          ) : !hasEntries ? (
            <div className="mt-20 flex flex-col items-center justify-center text-center text-gray-500 font-light">
              <p className="text-lg">現在、公開されている展示はありません。</p>
              {canManage && (
                 <button
                    onClick={handleSyncAll}
                    disabled={syncing}
                    className="mt-6 border-b border-gray-600 pb-1 text-sm text-gray-400 transition hover:border-white hover:text-white"
                 >
                    管理者: データを同期する
                 </button>
              )}
            </div>
          ) : (
            <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
              {canManage ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  autoScroll={false}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={entries.map((entry) => entry.gallery.id)}
                    strategy={rectSortingStrategy}
                  >
                    {entries.map((entry, index) => {
                      const parentClassroomId = getClassroomKey(entry.gallery);
                      const updateCandidates = galleries
                        .filter((gallery) => {
                          if (gallery.id === entry.gallery.id) {
                            return false;
                          }
                          return getClassroomKey(gallery) === parentClassroomId;
                        })
                        .sort((a, b) => (a.assignmentName || '').localeCompare(b.assignmentName || ''));

                      return (
                        <SortableShowcaseCard
                          key={entry.gallery.id}
                          entry={entry}
                          canManage={canManage}
                          updateCandidates={updateCandidates}
                          onUpdateSourceChange={handleUpdateSourceChange}
                          savingOrder={savingOrder || updatingSourceId === entry.gallery.id}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              ) : (
                entries.map((entry, index) => {
                  const parentClassroomId = getClassroomKey(entry.gallery);
                  const updateCandidates = galleries
                    .filter((gallery) => {
                      if (gallery.id === entry.gallery.id) {
                        return false;
                      }
                      return getClassroomKey(gallery) === parentClassroomId;
                    })
                    .sort((a, b) => (a.assignmentName || '').localeCompare(b.assignmentName || ''));

                  return (
                    <div
                      key={entry.gallery.id}
                      className="group relative opacity-0 animate-fade-in-opacity"
                    >
                      <ShowcaseCardContent
                        entry={entry}
                        canManage={false}
                        updateCandidates={updateCandidates}
                        onUpdateSourceChange={handleUpdateSourceChange}
                        savingOrder={savingOrder}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Floating Admin Bar */}
        {isAdmin && (
            <div className="fixed bottom-8 right-8 z-50 flex items-center gap-4">
                 {/* Only show "Update All" if in Manage Mode */}
                 {canManage && (
                   <div className="flex items-center gap-4">
                     <div className="hidden text-[10px] uppercase tracking-[0.3em] text-gray-400 sm:block">
                       管理者のみ：カードは「⋮⋮」ハンドルドラッグで並び替え可能
                     </div>
                     <button
                       type="button"
                       onClick={handleSyncAll}
                       disabled={syncing}
                       className="glass-panel flex h-10 items-center gap-2 rounded-full px-5 text-xs font-medium text-white shadow-lg transition hover:bg-white/10 disabled:opacity-50"
                     >
                       <span className="h-2 w-2 rounded-full bg-green-500"></span>
                       全データを同期
                     </button>
                   </div>
                 )}
                 
                 <button
                   type="button"
                   onClick={() => setViewerMode((prev) => !prev)}
                   className={`glass-panel flex h-10 items-center gap-2 rounded-full px-5 text-xs font-medium shadow-lg transition ${viewerMode ? 'bg-blue-500/20 text-blue-200 border-blue-500/30' : 'text-gray-300 hover:bg-white/10'}`}
                 >
                   <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={viewerMode ? "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" : "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29"} />
                   </svg>
                   {viewerMode ? '閲覧モード中' : '管理者モード'}
                 </button>
            </div>
        )}
      </main>
    </ShowcaseAccessGate>
  );
};

export default withShowcaseAuth(ShowcaseHomePage, 'viewer');

