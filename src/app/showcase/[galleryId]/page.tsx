'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import withShowcaseAuth from '@/components/withShowcaseAuth';
import { useAuth } from '@/context/AuthContext';
import type { Artwork, Gallery, ShowcaseGallery } from '@/types';
import ShowcaseAccessGate from '../components/ShowcaseAccessGate';
import ShowcaseArtworkModal from '../components/ShowcaseArtworkModal';
import { fetchArtworksByIds, getCoverImage } from '@/lib/showcaseData';
import { sortByStudentId } from '@/lib/artworkUtils';
import { syncShowcaseGallery } from '@/lib/showcaseSync';
import { isShowcaseDomainAllowed } from '@/utils/showcaseAccess';
import { useShowcaseViewerMode } from '@/hooks/useShowcaseViewerMode';

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
        overviewImageUrl: showcaseData.overviewImageUrl,
        overviewImagePath: showcaseData.overviewImagePath,
        syncedAt: showcaseData.syncedAt?.toDate ? showcaseData.syncedAt.toDate() : showcaseData.syncedAt,
        updatedBy: showcaseData.updatedBy,
      };
      setShowcase(nextShowcase);
      setTitleInput(nextShowcase.displayTitle || nextGallery?.assignmentName || '');

      if (nextShowcase.curatedArtworkIds && nextShowcase.curatedArtworkIds.length > 0) {
        const fetchedArtworks = await fetchArtworksByIds(nextShowcase.curatedArtworkIds);
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
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Link
                href="/showcase"
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                課題一覧へ戻る
              </Link>
              <h1 className="text-2xl font-semibold text-gray-900">{displayTitle}</h1>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-3">
                {canManage && (
                  <button
                    type="button"
                    onClick={handleSyncGallery}
                    disabled={syncing}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    この課題を更新
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

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {canManage && (
            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-gray-700">課題名</label>
                <input
                  value={titleInput}
                  onChange={(event) => setTitleInput(event.target.value)}
                  placeholder={gallery?.assignmentName || '課題名を入力'}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={savingTitle}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  課題名を保存
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-56 animate-pulse rounded-lg bg-gray-200" />
              ))}
            </div>
          ) : sortedArtworks.length === 0 ? (
            <div className="mt-10 rounded-lg border border-gray-200 bg-white px-6 py-10 text-center text-gray-600">
              まだ優秀作品が選定されていません。
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {showcase?.overviewImageUrl && (
                <button
                  type="button"
                  onClick={() => setOverviewModalOpen(true)}
                  className="group col-span-1 overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="relative w-full bg-gray-100" style={{ aspectRatio: '420 / 297' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={showcase.overviewImageUrl}
                      alt={`${displayTitle} 概要`}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="p-4">
                    <span className="text-sm font-semibold text-gray-800">課題概要</span>
                  </div>
                </button>
              )}

              {canManage && !showcase?.overviewImageUrl && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingOverview}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-600 hover:border-gray-400"
                  style={{ aspectRatio: '420 / 297' }}
                >
                  <span className="text-base font-semibold">課題概要をアップロード</span>
                  <span className="text-xs">A3画像を追加</span>
                </button>
              )}

              {sortedArtworks.map((artwork, index) => {
                const coverImage = getCoverImage(artwork);
                const isFeatured = artwork.id === resolvedFeaturedId;
                return (
                  <div
                    key={artwork.id}
                    className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <button type="button" onClick={() => setSelectedIndex(index)} className="w-full text-left">
                      <div className="relative w-full bg-gray-100" style={{ aspectRatio: '420 / 297' }}>
                        {coverImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={coverImage.thumbnailUrl || coverImage.url}
                            alt={artwork.title || artwork.studentName}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-gray-500">画像なし</div>
                        )}
                        {canManage && isFeatured && (
                          <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-gray-800">
                            最優秀
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">{artwork.studentName}</p>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void handleSelectFeatured(artwork.id)}
                            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                          >
                            最優秀に指定
                          </button>
                        )}
                      </div>
                    </div>
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

        {overviewModalOpen && showcase?.overviewImageUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
            <button
              type="button"
              onClick={() => setOverviewModalOpen(false)}
              className="absolute left-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-lg transition hover:bg-white"
              title="閉じる"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={showcase.overviewImageUrl}
              alt={`${displayTitle} 概要`}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        )}
      </main>
    </ShowcaseAccessGate>
  );
};

export default withShowcaseAuth(ShowcaseGalleryPage, 'viewer');
