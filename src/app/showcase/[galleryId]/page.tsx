'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import withShowcaseAuth from '@/components/withShowcaseAuth';
import { useAuth } from '@/context/AuthContext';
import type { Artwork, Gallery, ShowcaseGallery } from '@/types';
import ShowcaseAccessGate from '../components/ShowcaseAccessGate';
import ShowcaseArtworkModal from '../components/ShowcaseArtworkModal';
import { fetchArtworksByGalleryId, fetchArtworksByIds, getCoverImage } from '@/lib/showcaseData';
import { sortByStudentId } from '@/lib/artworkUtils';
import { syncShowcaseGallery } from '@/lib/showcaseSync';
import { isShowcaseDomainAllowed } from '@/utils/showcaseAccess';
import { useShowcaseViewerMode } from '@/hooks/useShowcaseViewerMode';
import { mergeShowcaseArtworks } from '@/lib/showcaseMerge';

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

const ShowcaseGalleryPage = () => {
  const params = useParams();
  const galleryId = typeof params?.galleryId === 'string' ? params.galleryId : '';
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isAllowed = isShowcaseDomainAllowed(user?.email);
  const { viewerMode, setViewerMode } = useShowcaseViewerMode();
  const canManage = isAdmin && !viewerMode;

  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseGallery | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [uploadingOverview, setUploadingOverview] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [overviewModalOpen, setOverviewModalOpen] = useState(false);
  const [reuploadConfirmOpen, setReuploadConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedArtworks = useMemo(() => sortByStudentId(artworks), [artworks]);

  const resolvedFeaturedId = useMemo(() => {
    if (showcase?.featuredArtworkId && sortedArtworks.some((artwork) => artwork.id === showcase.featuredArtworkId)) {
      return showcase.featuredArtworkId;
    }
    return sortedArtworks[0]?.id ?? null;
  }, [showcase?.featuredArtworkId, sortedArtworks]);

  const loadData = useCallback(async () => {
    if (!galleryId) {
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const gallerySnapshot = await getDoc(doc(db, 'galleries', galleryId));
      const nextGallery = gallerySnapshot.exists() ? mapGalleryDoc(gallerySnapshot.id, gallerySnapshot.data()) : null;
      setGallery(nextGallery);

      const showcaseSnapshot = await getDoc(doc(db, 'showcaseGalleries', galleryId));
      const showcaseData = showcaseSnapshot.exists() ? showcaseSnapshot.data() : {};
      const nextShowcase: ShowcaseGallery = {
        id: galleryId,
        displayTitle: showcaseData.displayTitle,
        featuredArtworkId: showcaseData.featuredArtworkId ?? null,
        curatedArtworkIds: Array.isArray(showcaseData.curatedArtworkIds) ? showcaseData.curatedArtworkIds : [],
        updateSourceGalleryId: showcaseData.updateSourceGalleryId ?? null,
        overviewImageUrl: showcaseData.overviewImageUrl,
        overviewImagePath: showcaseData.overviewImagePath,
        syncedAt: showcaseData.syncedAt?.toDate ? showcaseData.syncedAt.toDate() : showcaseData.syncedAt,
        updatedBy: showcaseData.updatedBy,
      };
      setShowcase(nextShowcase);
      setTitleInput(nextShowcase.displayTitle || nextGallery?.assignmentName || '');

      if (nextShowcase.curatedArtworkIds && nextShowcase.curatedArtworkIds.length > 0) {
        let fetchedArtworks = await fetchArtworksByIds(nextShowcase.curatedArtworkIds);
        if (nextShowcase.updateSourceGalleryId) {
          const updateArtworks = await fetchArtworksByGalleryId(nextShowcase.updateSourceGalleryId);
          fetchedArtworks = mergeShowcaseArtworks(fetchedArtworks, updateArtworks);
        }
        setArtworks(fetchedArtworks);
      } else {
        setArtworks([]);
      }
    } catch (loadError) {
      console.error('[Showcase] Failed to load gallery:', loadError);
      setError('課題詳細の読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [galleryId]);

  useEffect(() => {
    if (!isAllowed) {
      return;
    }
    void loadData();
  }, [isAllowed, loadData]);

  const handleSyncGallery = async () => {
    if (!user?.email || syncing || !isAllowed || !canManage) {
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      const result = await syncShowcaseGallery(galleryId, user.email);
      setShowcase(result.showcase);
      setArtworks(result.artworks);
    } catch (syncError) {
      console.error('[Showcase] Sync failed:', syncError);
      setError('課題の更新に失敗しました。');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!user?.email || !canManage || savingTitle || !isAllowed) {
      return;
    }
    setSavingTitle(true);
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const trimmed = titleInput.trim();

      await setDoc(
        doc(db, 'showcaseGalleries', galleryId),
        {
          displayTitle: trimmed,
          updatedBy: user.email,
        },
        { merge: true },
      );
      setShowcase((prev) => (prev ? { ...prev, displayTitle: trimmed } : prev));
    } catch (saveError) {
      console.error('[Showcase] Failed to save title:', saveError);
      setError('課題名の保存に失敗しました。');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleSelectFeatured = async (artworkId: string) => {
    if (!user?.email || !canManage || !isAllowed) {
      return;
    }
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      await setDoc(
        doc(db, 'showcaseGalleries', galleryId),
        { featuredArtworkId: artworkId, updatedBy: user.email },
        { merge: true },
      );
      setShowcase((prev) => (prev ? { ...prev, featuredArtworkId: artworkId } : prev));
    } catch (selectError) {
      console.error('[Showcase] Failed to set featured artwork:', selectError);
      setError('最優秀作品の更新に失敗しました。');
    }
  };

  const handleOverviewUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user?.email || !canManage || !isAllowed) {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingOverview(true);
    setError(null);
    try {
      const { ref, uploadBytes, getDownloadURL, deleteObject } = await import('firebase/storage');
      const { doc, setDoc } = await import('firebase/firestore');
      const { db, storage } = await import('@/lib/firebase');

      const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const path = `showcase/${galleryId}/overview-${Date.now()}.${extension}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await setDoc(
        doc(db, 'showcaseGalleries', galleryId),
        {
          overviewImageUrl: url,
          overviewImagePath: path,
          updatedBy: user.email,
        },
        { merge: true },
      );

      const previousPath = showcase?.overviewImagePath;
      if (previousPath && previousPath !== path) {
        deleteObject(ref(storage, previousPath)).catch((deleteError) => {
          console.warn('[Showcase] Failed to delete previous overview image:', deleteError);
        });
      }

      setShowcase((prev) =>
        prev
          ? {
              ...prev,
              overviewImageUrl: url,
              overviewImagePath: path,
            }
          : prev,
      );

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (uploadError) {
      console.error('[Showcase] Overview upload failed:', uploadError);
      setError('課題概要画像のアップロードに失敗しました。');
    } finally {
      setUploadingOverview(false);
    }
  };

  const displayTitle = showcase?.displayTitle?.trim() || gallery?.assignmentName || '課題詳細';

  return (
    <ShowcaseAccessGate>
      <main className="min-h-screen text-white pb-32">
        <div className="mx-auto w-full max-w-[1400px] px-6 py-12">
            {/* Header / Nav */}
            <div className="mb-12 flex flex-col gap-4">
              <Link
                href="/showcase"
                className="inline-flex items-center gap-2 text-xs font-light tracking-widest text-gray-400 hover:text-white mb-2 transition-colors uppercase"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Collection
              </Link>
              
              {canManage ? (
                 <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <input
                      value={titleInput}
                      onChange={(event) => setTitleInput(event.target.value)}
                      placeholder="課題名を入力"
                      className="flex-1 bg-transparent text-3xl font-serif text-white placeholder-gray-600 focus:outline-none focus:border-b focus:border-white/30 transition-colors"
                      style={{ fontFamily: 'var(--font-serif)' }}
                    />
                    <button
                        type="button"
                        onClick={handleSaveTitle}
                        disabled={savingTitle}
                        className="text-xs text-gray-400 hover:text-white whitespace-nowrap"
                    >
                        {savingTitle ? '保存中...' : 'タイトルを保存'}
                    </button>
                    {/* Hidden sync button here for admin convenience? No, keep it in floating bar */}
                 </div>
              ) : (
                <h1 className="font-serif text-3xl md:text-4xl text-white font-light" style={{ fontFamily: 'var(--font-serif)' }}>
                  {displayTitle}
                </h1>
              )}
            </div>

          {error && (
            <div className="mb-8 rounded border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="aspect-[420/297] animate-pulse rounded bg-white/5" />
              ))}
            </div>
          ) : sortedArtworks.length === 0 ? (
            <div className="mt-20 flex flex-col items-center justify-center text-center text-gray-500 font-light">
              <p className="text-lg">まだ優秀作品が選定されていません。</p>
            </div>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {/* Overview Panel (Always first) */}
              <div
                  className="relative overflow-hidden bg-[#1e1e1e] group"
                  style={{ aspectRatio: '420 / 297' }}
              >
                 {showcase?.overviewImageUrl ? (
                    <button
                        type="button"
                        onClick={() => setOverviewModalOpen(true)}
                        className="h-full w-full block"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={showcase.overviewImageUrl}
                            alt="課題概要"
                            className="h-full w-full object-cover transition duration-700 group-hover:scale-105 group-hover:opacity-90"
                        />
                        <div className="absolute bottom-0 left-0 p-4 bg-gradient-to-t from-black/80 to-transparent w-full">
                            <span className="text-white font-serif text-lg tracking-widest">OVERVIEW</span>
                        </div>
                    </button>
                 ) : (
                   <div className="flex h-full w-full flex-col items-center justify-center border border-white/10 text-gray-500">
                      <span className="text-xs tracking-widest">OVERVIEW PANEL</span>
                   </div>
                 )}

                 {/* Admin Controls for Overview */}
                 {canManage && (
                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         {showcase?.overviewImageUrl ? (
                            <button
                                type="button"
                                onClick={() => setReuploadConfirmOpen(true)}
                                className="bg-black/60 hover:bg-black text-white p-2 rounded-full backdrop-blur-sm transition"
                                title="概要画像を再アップロード"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                            </button>
                         ) : (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-white text-black px-4 py-2 rounded-full text-xs font-bold shadow-lg hover:bg-gray-200 transition"
                            >
                                Upload Image
                            </button>
                         )}
                    </div>
                 )}
              </div>

              {/* Artworks */}
              {sortedArtworks.map((artwork, index) => {
                const coverImage = getCoverImage(artwork);
                const isFeatured = artwork.id === resolvedFeaturedId;
                return (
                  <div
                    key={artwork.id}
                    className="group relative animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      className="block w-full overflow-hidden bg-[#1e1e1e]"
                      style={{ aspectRatio: '420 / 297' }}
                    >
                        {coverImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={coverImage.thumbnailUrl || coverImage.url}
                            alt={artwork.title || artwork.studentName}
                            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-gray-600 font-light">NO IMAGE</div>
                        )}
                        
                        {/* Hover Info */}
                        <div className="absolute inset-0 flex flex-col justify-end p-4 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                             <p className="text-white text-sm font-medium">{artwork.studentName}</p>
                             {/* {artwork.title && <p className="text-gray-300 text-xs truncate">{artwork.title}</p>} */}
                        </div>

                        {/* Featured Badge */}
                        {isFeatured && (
                          <div className="absolute top-3 left-3 flex items-center gap-1 bg-yellow-500/90 text-black text-[10px] font-bold px-2 py-1 rounded shadow-sm backdrop-blur-md">
                             <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                             </svg>
                             BEST
                          </div>
                        )}
                    </button>

                    {/* Admin Controls for Artwork */}
                    {canManage && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             {!isFeatured && (
                                <button
                                  type="button"
                                  onClick={() => void handleSelectFeatured(artwork.id)}
                                  className="bg-black/60 hover:bg-yellow-600 hover:text-white text-gray-300 px-3 py-1 rounded-full text-[10px] backdrop-blur-sm transition border border-white/20"
                                >
                                  最優秀に指定
                                </button>
                             )}
                        </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleOverviewUpload}
            className="hidden"
          />
        </div>

        {selectedIndex !== null && (
          <ShowcaseArtworkModal
            artworks={sortedArtworks}
            currentIndex={selectedIndex}
            onNavigate={(index) => setSelectedIndex(index)}
            onClose={() => setSelectedIndex(null)}
          />
        )}

        {/* Overview Modal */}
        {overviewModalOpen && showcase?.overviewImageUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 animate-fade-in">
            <button
              type="button"
              onClick={() => setOverviewModalOpen(false)}
              className="absolute right-6 top-6 z-10 text-white/50 hover:text-white transition"
              title="閉じる"
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={showcase.overviewImageUrl}
              alt={`${displayTitle} 概要`}
              className="max-h-full max-w-full object-contain shadow-2xl"
            />
          </div>
        )}

        {/* Confirmation Modal */}
        {reuploadConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 animate-fade-in">
            <div className="glass-panel w-full max-w-md rounded-xl p-8 shadow-2xl text-center">
              <h2 className="text-xl font-medium text-white">画像の上書き確認</h2>
              <p className="mt-4 text-sm text-gray-300 leading-relaxed">
                既存の課題概要画像は削除され、新しい画像に置き換わります。<br/>
                よろしいですか？
              </p>
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setReuploadConfirmOpen(false)}
                  className="rounded-full border border-gray-600 px-6 py-2 text-sm text-gray-300 hover:bg-white hover:text-black transition"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReuploadConfirmOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="rounded-full bg-white px-6 py-2 text-sm font-medium text-black hover:bg-gray-200 transition"
                >
                  実行する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Admin Bar */}
        {isAdmin && (
            <div className="fixed bottom-8 right-8 z-50 flex items-center gap-4">
                 {/* Only show "Update This" if in Manage Mode */}
                 {canManage && (
                   <button
                     type="button"
                     onClick={handleSyncGallery}
                     disabled={syncing}
                     className="glass-panel flex h-10 items-center gap-2 rounded-full px-5 text-xs font-medium text-white shadow-lg transition hover:bg-white/10 disabled:opacity-50"
                   >
                     <span className="h-2 w-2 rounded-full bg-green-500"></span>
                     この課題を更新
                   </button>
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

export default withShowcaseAuth(ShowcaseGalleryPage, 'viewer');
