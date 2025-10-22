'use client';

import { useCallback, useMemo, useState } from 'react';
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

  const sortedArtworks = useMemo(() => {
    const sorted = [...artworks];

    switch (sortOption) {
      case 'submittedAt-desc':
        return sorted.sort((a, b) => toDate(b.submittedAt).getTime() - toDate(a.submittedAt).getTime());
      case 'submittedAt-asc':
        return sorted.sort((a, b) => toDate(a.submittedAt).getTime() - toDate(b.submittedAt).getTime());
      case 'email-asc':
        return sorted.sort((a, b) => {
          const emailA = a.studentEmail.split('@')[0].toLowerCase();
          const emailB = b.studentEmail.split('@')[0].toLowerCase();
          return emailA.localeCompare(emailB);
        });
      case 'email-desc':
        return sorted.sort((a, b) => {
          const emailA = a.studentEmail.split('@')[0].toLowerCase();
          const emailB = b.studentEmail.split('@')[0].toLowerCase();
          return emailB.localeCompare(emailA);
        });
      default:
        return sorted;
    }
  }, [artworks, sortOption]);

  const filteredArtworks = useMemo(() => {
    if (totalLabelFilter !== null) {
      return sortedArtworks.filter((artwork) => {
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

    if (selectedLabels.length === 0) {
      return sortedArtworks;
    }

    return sortedArtworks.filter((artwork) => {
      const artworkLabels = artwork.labels || [];
      return selectedLabels.some((label) => artworkLabels.includes(label));
    });
  }, [sortedArtworks, totalLabelFilter, selectedLabels]);

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

      if (likeDoc.exists()) {
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
      const functionsBaseUrl = process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL || 'http://localhost:5001';
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

    try {
      const { doc, updateDoc, arrayUnion, arrayRemove } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const artworkRef = doc(db, 'artworks', artworkId);
      const artwork = artworks.find((item) => item.id === artworkId);
      const currentAnnotations = artwork?.annotations || [];
      const existingAnnotation = currentAnnotations.find((ann) => ann.pageNumber === pageNumber);

      if (annotation) {
        const newAnnotation = {
          pageNumber,
          data: annotation.data,
          width: annotation.width,
          height: annotation.height,
          updatedAt: new Date(),
          updatedBy: user.email,
        };

        if (existingAnnotation) {
          await updateDoc(artworkRef, {
            annotations: arrayRemove(existingAnnotation),
          });
        }

        await updateDoc(artworkRef, {
          annotations: arrayUnion(newAnnotation),
        });

        setArtworks((prev) =>
          prev.map((item) =>
            item.id === artworkId
              ? {
                  ...item,
                  annotations: [
                    ...(item.annotations || []).filter((ann) => ann.pageNumber !== pageNumber),
                    newAnnotation,
                  ],
                }
              : item,
          ),
        );

        if (selectedArtwork?.id === artworkId) {
          setSelectedArtwork((prev) =>
            prev
              ? {
                  ...prev,
                  annotations: [
                    ...(prev.annotations || []).filter((ann) => ann.pageNumber !== pageNumber),
                    newAnnotation,
                  ],
                }
              : null,
          );
        }
      } else if (existingAnnotation) {
        await updateDoc(artworkRef, {
          annotations: arrayRemove(existingAnnotation),
        });

        setArtworks((prev) =>
          prev.map((item) =>
            item.id === artworkId
              ? {
                  ...item,
                  annotations: (item.annotations || []).filter((ann) => ann.pageNumber !== pageNumber),
                }
              : item,
          ),
        );

        if (selectedArtwork?.id === artworkId) {
          setSelectedArtwork((prev) =>
            prev
              ? {
                  ...prev,
                  annotations: (prev.annotations || []).filter((ann) => ann.pageNumber !== pageNumber),
                }
              : null,
          );
        }
      }
    } catch (error) {
      console.error('Save annotation error:', error);
      alert('注釈の保存に失敗しました');
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
          <GalleryGrid artworks={filteredArtworks} onSelectArtwork={setSelectedArtwork} />
        )}
      </main>

      {selectedArtwork && (
        <ArtworkModal
          artwork={selectedArtwork}
          isOpen={true}
          onClose={() => setSelectedArtwork(null)}
          onLike={handleLike}
          onComment={handleComment}
          onDelete={handleDelete}
          onToggleLabel={handleToggleLabel}
          onSaveAnnotation={handleSaveAnnotation}
          userRole={user?.role || 'viewer'}
        />
      )}
    </div>
  );
}

export default withAuth(GalleryPage, 'guest');
