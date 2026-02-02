'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ArtworkModal from '@/components/ArtworkModal';
import withAuth from '@/components/withAuth';
import { useAuth } from '@/context/AuthContext';
import type { Artwork, LabelType } from '@/types';
import type { AnnotationSavePayload } from '@/components/AnnotationCanvas';
import { toDate } from '@/utils/date';
import GalleryEmptyState from './components/GalleryEmptyState';
import GalleryGrid from './components/GalleryGrid';
import GalleryHeader from './components/GalleryHeader';
import GalleryImportProgress from './components/GalleryImportProgress';
import { useGalleryArtworks } from './hooks/useGalleryArtworks';
import { useGalleryInitialization } from './hooks/useGalleryInitialization';
import { useImportProgress } from './hooks/useImportProgress';
import type { SortOption } from './types';
import { extractLinesFromStageJSON } from '@/utils/annotations';
import { sortBySubmissionDate, sortByStudentId, isIncomplete, filterCompleteArtworks, getStudentId } from '@/lib/artworkUtils';
import { getFunctionsBaseUrl } from '@/lib/functionsBaseUrl';

const removePageFromMap = <T,>(
  map: Record<string, T> | undefined,
  key: string,
): Record<string, T> | undefined => {
  if (!map) {
    return undefined;
  }
  const { [key]: _removed, ...rest } = map;
  return Object.keys(rest).length > 0 ? rest : undefined;
};

function GalleryPage() {
  const { user, logout } = useAuth();
  const { currentGalleryId, hasGalleries, isInitialized } = useGalleryInitialization();
  const { artworks, setArtworks, loading, error, setError: _setError, fetchArtworks } = useGalleryArtworks(
    currentGalleryId,
    isInitialized,
  );
  const handleImportCompleted = useCallback(() => {
    void fetchArtworks();
  }, [fetchArtworks]);
  const { importProgress } = useImportProgress({
    isInitialized,
    currentGalleryId,
    onImportCompleted: handleImportCompleted,
  });

  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('submittedAt-asc');
  const [selectedLabels, setSelectedLabels] = useState<LabelType[]>([]);
  const [totalLabelFilter, setTotalLabelFilter] = useState<number | null>(null);
  const [hideIncomplete, setHideIncomplete] = useState<boolean>(false);
  const [likedArtworkIds, setLikedArtworkIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isInitialized || user?.role !== 'admin' || !user?.email) {
      setLikedArtworkIds(new Set());
      return;
    }

    let isActive = true;
    const fetchLikedArtworks = async () => {
      try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');

        const likesQuery = query(collection(db, 'likes'), where('userEmail', '==', user.email));
        const querySnapshot = await getDocs(likesQuery);
        const likedIds = querySnapshot.docs
          .map((doc) => doc.data().artworkId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);

        if (isActive) {
          setLikedArtworkIds(new Set(likedIds));
        }
      } catch (error) {
        console.error('[Gallery] Fetch likes error:', error);
      }
    };

    void fetchLikedArtworks();
    return () => {
      isActive = false;
    };
  }, [isInitialized, user?.email, user?.role]);

  const sortedArtworks = useMemo(() => {
    switch (sortOption) {
      case 'submittedAt-desc': {
        const sorted = sortBySubmissionDate(artworks);
        return sorted.reverse();
      }
      case 'submittedAt-asc':
        return sortBySubmissionDate(artworks);
      case 'email-asc':
        return sortByStudentId(artworks);
      case 'email-desc': {
        const sorted = sortByStudentId(artworks);
        return sorted.reverse();
      }
      default:
        return [...artworks];
    }
  }, [artworks, sortOption]);

  const filteredArtworks = useMemo(() => {
    let result = sortedArtworks;

    // hideIncompleteフィルター
    if (hideIncomplete) {
      result = filterCompleteArtworks(result);
    }

    // 合計ラベルフィルター
    if (totalLabelFilter !== null) {
      result = result.filter((artwork) => {
        const labels = artwork.labels ?? [];
        const total = labels
          .map((label) => {
            const match = /-(\d+)$/.exec(label);
            return match ? Number(match[1]) : 0;
          })
          .reduce((sum, value) => sum + value, 0);

        return total === totalLabelFilter;
      });
    }

    // 個別ラベルフィルター
    if (selectedLabels.length > 0) {
      result = result.filter((artwork) => {
        const artworkLabels = artwork.labels || [];
        return selectedLabels.some((label) => artworkLabels.includes(label));
      });
    }

    return result;
  }, [sortedArtworks, totalLabelFilter, selectedLabels, hideIncomplete]);

  const incompleteCount = useMemo(() => {
    return sortedArtworks.filter(isIncomplete).length;
  }, [sortedArtworks]);

  const isTotalLabelFilterActive = totalLabelFilter !== null;

  const toggleLabelFilter = (label: LabelType) => {
    if (isTotalLabelFilterActive) {
      return;
    }

    setSelectedLabels((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]));
  };

  const handleTotalLabelFilterChange = (value: string) => {
    if (value === '') {
      setTotalLabelFilter(null);
      return;
    }

    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      setTotalLabelFilter(parsed);
      setSelectedLabels([]);
    }
  };

  const handleLike = async (artworkId: string) => {
    if (user?.role !== 'admin' || !user?.email) return;

    try {
      const { doc, getDoc, setDoc, deleteDoc, collection, updateDoc, increment } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const likeId = `${artworkId}_${user.email.replace(/[.@]/g, '_')}`;
      const likeRef = doc(db, 'likes', likeId);
      const likeDoc = await getDoc(likeRef);
      const alreadyLiked = likeDoc.exists();

      if (alreadyLiked) {
        await deleteDoc(likeRef);
        const artworkRef = doc(db, 'artworks', artworkId);
        await updateDoc(artworkRef, {
          likeCount: increment(-1),
        });

        setArtworks((prev) =>
          prev.map((artwork) =>
            artwork.id === artworkId
              ? { ...artwork, likeCount: Math.max(0, artwork.likeCount - 1) }
              : artwork,
          ),
        );

        if (selectedArtwork?.id === artworkId) {
          setSelectedArtwork((prev) => (prev ? { ...prev, likeCount: Math.max(0, prev.likeCount - 1) } : null));
        }
      } else {
        await setDoc(likeRef, {
          id: likeId,
          artworkId,
          userEmail: user.email,
          createdAt: new Date(),
        });

        const artworkRef = doc(db, 'artworks', artworkId);
        await updateDoc(artworkRef, {
          likeCount: increment(1),
        });

        setArtworks((prev) =>
          prev.map((artwork) =>
            artwork.id === artworkId ? { ...artwork, likeCount: artwork.likeCount + 1 } : artwork,
          ),
        );

        if (selectedArtwork?.id === artworkId) {
          setSelectedArtwork((prev) => (prev ? { ...prev, likeCount: prev.likeCount + 1 } : null));
        }
      }

      setLikedArtworkIds((prev) => {
        const next = new Set(prev);
        if (alreadyLiked) {
          next.delete(artworkId);
        } else {
          next.add(artworkId);
        }
        return next;
      });
    } catch (error) {
      console.error('Like error:', error);
      alert('いいねの処理に失敗しました');
    }
  };

  const handleComment = async (artworkId: string, comment: string) => {
    if (user?.role !== 'admin' || !user?.email) return;

    try {
      const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const newComment = {
        id: crypto.randomUUID(),
        content: comment,
        authorName: user.displayName,
        authorEmail: user.email,
        createdAt: new Date(),
      };

      const artworkRef = doc(db, 'artworks', artworkId);
      await updateDoc(artworkRef, {
        comments: arrayUnion(newComment),
      });

      setArtworks((prev) =>
        prev.map((artwork) =>
          artwork.id === artworkId ? { ...artwork, comments: [...artwork.comments, newComment] } : artwork,
        ),
      );

      if (selectedArtwork?.id === artworkId) {
        setSelectedArtwork((prev) => (prev ? { ...prev, comments: [...prev.comments, newComment] } : null));
      }
    } catch (error) {
      console.error('Comment error:', error);
      alert('コメントの投稿に失敗しました');
    }
  };

  const handleDelete = async (artworkId: string) => {
    if (user?.role !== 'admin' || !user?.email) return;

    try {
      const functionsBaseUrl = getFunctionsBaseUrl();
      const response = await fetch(`${functionsBaseUrl}/deleteArtwork`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          artworkId,
          userEmail: user.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '削除に失敗しました');
      }

      const data = await response.json();
      console.log(`Deleted ${data.deletedFiles} files from Storage`);

      // Cloud Function側でギャラリーのartworkCountとartworks配列を更新するので、ここでは不要

      setArtworks((prev) => prev.filter((artwork) => artwork.id !== artworkId));
      setSelectedArtwork((prev) => (prev && prev.id === artworkId ? null : prev));

      alert('作品を削除しました');
    } catch (error) {
      console.error('Delete error:', error);
      alert(`作品の削除に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  };

  const handleToggleLabel = async (artworkId: string, label: LabelType) => {
    if (user?.role !== 'admin') return;

    try {
      const { doc, updateDoc, arrayUnion, arrayRemove } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const artwork = artworks.find((item) => item.id === artworkId);
      const currentLabels = artwork?.labels || [];
      const hasLabel = currentLabels.includes(label);

      const artworkRef = doc(db, 'artworks', artworkId);
      await updateDoc(artworkRef, {
        labels: hasLabel ? arrayRemove(label) : arrayUnion(label),
      });

      setArtworks((prev) =>
        prev.map((item) =>
          item.id === artworkId
            ? {
                ...item,
                labels: hasLabel ? (item.labels || []).filter((entry) => entry !== label) : [...(item.labels || []), label],
              }
            : item,
        ),
      );

      if (selectedArtwork?.id === artworkId) {
        setSelectedArtwork((prev) =>
          prev
            ? {
                ...prev,
                labels: hasLabel ? (prev.labels || []).filter((entry) => entry !== label) : [...(prev.labels || []), label],
              }
            : null,
        );
      }
    } catch (error) {
      console.error('Label toggle error:', error);
      alert('ラベルの更新に失敗しました');
    }
  };

  const handleSaveAnnotation = async (
    artworkId: string,
    pageNumber: number,
    annotation: AnnotationSavePayload | null,
  ) => {
    if (user?.role !== 'admin' || !user?.email) return;

    const pageKey = String(pageNumber);

    try {
      const { doc, updateDoc, arrayRemove, deleteField } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const artworkRef = doc(db, 'artworks', artworkId);
      const artwork = artworks.find((item) => item.id === artworkId);
      const currentAnnotations = artwork?.annotations || [];
      const existingAnnotation = currentAnnotations.find((ann) => ann.pageNumber === pageNumber);

      if (annotation) {
        const lines = extractLinesFromStageJSON(annotation.data);
        const updatedAt = new Date();
        const newAnnotation = {
          pageNumber,
          data: annotation.data,
          width: annotation.width,
          height: annotation.height,
          updatedAt,
          updatedBy: user.email,
        };
        const newPageEntry = {
          lines,
          width: annotation.width,
          height: annotation.height,
          updatedAt,
          updatedBy: user.email,
        };

        const updatePayload: Record<string, unknown> = {
          [`annotationsMap.${pageKey}`]: newPageEntry,
        };
        if (existingAnnotation) {
          updatePayload.annotations = arrayRemove(existingAnnotation);
        }

        await updateDoc(artworkRef, updatePayload);


        setArtworks((prev) =>
          prev.map((item) => {
            if (item.id !== artworkId) {
              return item;
            }
            const filteredAnnotations = (item.annotations || []).filter((ann) => ann.pageNumber !== pageNumber);
            const nextMap = {
              ...(item.annotationsMap || {}),
              [pageKey]: newPageEntry,
            };
            return {
              ...item,
              annotations: [...filteredAnnotations, newAnnotation],
              annotationsMap: nextMap,
            };
          }),
        );

        if (selectedArtwork?.id === artworkId) {
          setSelectedArtwork((prev) => {
            if (!prev) {
              return null;
            }
            const filteredAnnotations = (prev.annotations || []).filter((ann) => ann.pageNumber !== pageNumber);
            const nextMap = {
              ...(prev.annotationsMap || {}),
              [pageKey]: newPageEntry,
            };
            return {
              ...prev,
              annotations: [...filteredAnnotations, newAnnotation],
              annotationsMap: nextMap,
            };
          });
        }
      } else {
        const updatePayload: Record<string, unknown> = {
          [`annotationsMap.${pageKey}`]: deleteField(),
        };
        if (existingAnnotation) {
          updatePayload.annotations = arrayRemove(existingAnnotation);
        }

        await updateDoc(artworkRef, updatePayload);


        setArtworks((prev) =>
          prev.map((item) => {
            if (item.id !== artworkId) {
              return item;
            }
            const filteredAnnotations = (item.annotations || []).filter((ann) => ann.pageNumber !== pageNumber);
            const nextMap = removePageFromMap(item.annotationsMap, pageKey);
            return {
              ...item,
              annotations: filteredAnnotations,
              annotationsMap: nextMap,
            };
          }),
        );

        if (selectedArtwork?.id === artworkId) {
          setSelectedArtwork((prev) => {
            if (!prev) {
              return null;
            }
            const filteredAnnotations = (prev.annotations || []).filter((ann) => ann.pageNumber !== pageNumber);
            const nextMap = removePageFromMap(prev.annotationsMap, pageKey);
            return {
              ...prev,
              annotations: filteredAnnotations,
              annotationsMap: nextMap,
            };
          });
        }
      }
    } catch (error) {
      console.error('[GalleryPage] Save annotation error:', error);
      alert('注釈の保存に失敗しました');
      throw error;
    }
  };

  const handleLoginClick = async () => {
    try {
      await logout();
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/login';
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="mt-4 text-gray-600">ギャラリーを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <GalleryHeader
        userRole={user?.role}
        selectedLabels={selectedLabels}
        isTotalLabelFilterActive={isTotalLabelFilterActive}
        onToggleLabelFilter={toggleLabelFilter}
        totalLabelFilter={totalLabelFilter}
        onTotalLabelFilterChange={handleTotalLabelFilterChange}
        sortOption={sortOption}
        onSortOptionChange={(option) => setSortOption(option)}
        hideIncomplete={hideIncomplete}
        onHideIncompleteChange={setHideIncomplete}
        incompleteCount={incompleteCount}
        onLoginClick={handleLoginClick}
      />

      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <GalleryImportProgress importProgress={importProgress} />

        {error && (
          <div className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {filteredArtworks.length === 0 ? (
          <GalleryEmptyState
            hasGalleries={hasGalleries}
            currentGalleryId={currentGalleryId}
            userRole={user?.role}
          />
        ) : (
          <GalleryGrid
            artworks={filteredArtworks}
            onSelectArtwork={setSelectedArtwork}
            likedArtworkIds={likedArtworkIds}
            canLike={user?.role === 'admin'}
            onLike={handleLike}
          />
        )}
      </main>

      {selectedArtwork && (
        <ArtworkModal
          artwork={selectedArtwork}
          artworks={filteredArtworks}
          currentIndex={filteredArtworks.findIndex((a) => a.id === selectedArtwork.id)}
          onNavigate={(newArtwork) => setSelectedArtwork(newArtwork)}
          isOpen={true}
          onClose={() => setSelectedArtwork(null)}
          onLike={handleLike}
          onComment={handleComment}
          onDelete={handleDelete}
          onToggleLabel={handleToggleLabel}
          onSaveAnnotation={handleSaveAnnotation}
          userRole={user?.role || 'viewer'}
          isLiked={likedArtworkIds.has(selectedArtwork.id)}
        />
      )}
    </div>
  );
}

export default withAuth(GalleryPage, 'guest');
