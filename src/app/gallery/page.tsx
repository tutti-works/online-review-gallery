'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import withAuth from '@/components/withAuth';
import type { Artwork } from '@/types';
import Image from 'next/image';

// 日付変換ヘルパー関数
const toDate = (dateValue: Date | string): Date => {
  return typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
};

interface ArtworkModalProps {
  artwork: Artwork;
  isOpen: boolean;
  onClose: () => void;
  onLike?: (artworkId: string) => void;
  onComment?: (artworkId: string, comment: string) => void;
  onDelete?: (artworkId: string) => void;
  userRole: string;
}

function ArtworkModal({ artwork, isOpen, onClose, onLike, onComment, onDelete, userRole }: ArtworkModalProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [zoom, setZoom] = useState(1); // 画像のズーム倍率
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 }); // 画像のパン位置
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  if (!isOpen) return null;

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3)); // 最大3倍
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5)); // 最小0.5倍
  };

  const resetZoom = () => {
    setZoom(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - panPosition.x,
        y: e.clientY - panPosition.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPanPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleLike = () => {
    if (onLike && userRole === 'admin') {
      onLike(artwork.id);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !onComment || userRole !== 'admin') return;

    setIsSubmittingComment(true);
    try {
      await onComment(artwork.id, commentText.trim());
      setCommentText('');
    } catch (error) {
      console.error('Comment submission error:', error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || userRole !== 'admin') return;

    if (!confirm('この作品を削除してもよろしいですか？この操作は取り消せません。')) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(artwork.id);
      onClose();
    } catch (error) {
      console.error('Delete error:', error);
      alert('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90">
      {/* 全画面モーダル（周囲に隙間） */}
      <div className="h-full w-full p-4 flex">
        <div className="bg-white rounded-lg shadow-2xl w-full h-full flex overflow-hidden">

          {/* 左側: 画像表示エリア */}
          <div className="flex-1 flex flex-col bg-gray-100 relative">
            {/* 閉じるボタン（左上） */}
            <button
              onClick={onClose}
              className="absolute top-4 left-4 z-10 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 画像表示エリア */}
            <div
              className="flex-1 overflow-hidden flex items-center justify-center relative"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
            >
              <div
                className="transition-transform duration-200 ease-out w-full h-full flex items-center justify-center p-8"
                style={{
                  transform: `scale(${zoom}) translate(${panPosition.x / zoom}px, ${panPosition.y / zoom}px)`,
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
              >
                <img
                  src={artwork.images[currentPage].url}
                  alt={`${artwork.title} - Page ${currentPage + 1}`}
                  className="max-w-full max-h-full object-contain select-none pointer-events-none"
                  draggable={false}
                  onDragStart={handleDragStart}
                />
              </div>

              {/* 半透明グレーゾーンでのコントロール（画像の上に重ねて下部中央に配置） */}
              <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-700 bg-opacity-70 rounded-full px-3 py-1 flex items-center space-x-4 backdrop-blur-sm">
                {/* ページナビゲーション */}
                {artwork.images.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                      className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      title="前のページ"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm text-white font-medium min-w-[60px] text-center">
                      {currentPage + 1} / {artwork.images.length}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(artwork.images.length - 1, currentPage + 1))}
                      disabled={currentPage === artwork.images.length - 1}
                      className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      title="次のページ"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <div className="w-px h-6 bg-white bg-opacity-30"></div>
                  </>
                )}

                {/* ズームコントロール */}
                <button
                  onClick={handleZoomOut}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                  title="縮小"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-sm text-white font-medium min-w-[50px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                  title="拡大"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={resetZoom}
                  className="ml-2 px-3 py-1.5 text-xs font-medium text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                  title="リセット"
                >
                  リセット
                </button>
              </div>
            </div>

            {/* ページサムネイル */}
            {artwork.images.length > 1 && (
              <div className="bg-white border-t border-gray-200 p-3">
                <div className="flex space-x-2 overflow-x-auto">
                  {artwork.images.map((image, index) => (
                    <button
                      key={image.id}
                      onClick={() => setCurrentPage(index)}
                      className={`flex-shrink-0 w-20 h-14 rounded border-2 overflow-hidden transition-all ${
                        currentPage === index ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Image
                        src={image.thumbnailUrl || image.url}
                        alt={`Page ${index + 1} thumbnail`}
                        width={80}
                        height={56}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右側: サイドバー（310px固定幅） */}
          <div className="w-[310px] bg-white flex flex-col border-l border-gray-200">
            {/* サイドバーヘッダー */}
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{artwork.studentName}</h3>
              <p className="text-sm text-gray-600 mt-1">{artwork.title}</p>
              <p className="text-xs text-gray-400 mt-1">
                {artwork.studentEmail}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                提出日: {toDate(artwork.submittedAt).toLocaleString('ja-JP')}
              </p>
            </div>

            {/* サイドバーコンテンツ（スクロール可能） */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* いいねボタン・削除ボタン */}
              <div className="space-y-3">
                {userRole === 'admin' && (
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleLike}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      <span>いいね ({artwork.likeCount})</span>
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? '削除中...' : '削除'}
                    </button>
                  </div>
                )}

                {userRole === 'viewer' && (
                  <div className="flex items-center space-x-2 text-gray-600 p-3 bg-gray-50 rounded-md">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <span>いいね {artwork.likeCount}</span>
                  </div>
                )}
              </div>

              {/* コメントセクション */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">コメント</h4>

                {/* コメント入力フォーム（管理者のみ） */}
                {userRole === 'admin' && (
                  <form onSubmit={handleCommentSubmit} className="space-y-3">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="コメントを入力してください..."
                      rows={4}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-none"
                    />
                    <button
                      type="submit"
                      disabled={!commentText.trim() || isSubmittingComment}
                      className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingComment ? '送信中...' : 'コメントを投稿'}
                    </button>
                  </form>
                )}

                {/* コメント一覧 */}
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {artwork.comments.length > 0 ? (
                    artwork.comments.map((comment) => (
                      <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {comment.authorName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {toDate(comment.createdAt).toLocaleString('ja-JP')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{comment.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">まだコメントはありません。</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type SortOption = 'submittedAt-desc' | 'submittedAt-asc' | 'email-asc' | 'email-desc';

function GalleryPage() {
  const { user, logout } = useAuth();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('submittedAt-desc');
  const [importProgress, setImportProgress] = useState<{
    importJobId: string;
    galleryId: string;
    status: string;
    progress: number;
    processedFiles: number;
    totalFiles: number;
  } | null>(null);

  useEffect(() => {
    fetchArtworks();

    // localStorageから進行中のインポートジョブを確認
    const activeImportStr = localStorage.getItem('activeImportJob');
    if (!activeImportStr) return;

    try {
      const activeImport = JSON.parse(activeImportStr);
      const { importJobId, galleryId, startedAt } = activeImport;

      // 開始から30分以上経過していたらクリア
      const startTime = new Date(startedAt).getTime();
      if (Date.now() - startTime > 30 * 60 * 1000) {
        localStorage.removeItem('activeImportJob');
        return;
      }

      // 進捗を監視
      const functionsBaseUrl = process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL || 'http://localhost:5001';
      const checkProgress = setInterval(async () => {
        try {
          const response = await fetch(`${functionsBaseUrl}/getImportStatus?importJobId=${importJobId}`);
          if (response.ok) {
            const data = await response.json();
            console.log('[Gallery] Import progress update:', data);
            setImportProgress({
              importJobId,
              galleryId,
              status: data.status,
              progress: data.progress,
              processedFiles: data.processedFiles,
              totalFiles: data.totalFiles,
            });

            if (data.status === 'completed' || data.status === 'error') {
              console.log('[Gallery] Import finished, clearing interval and localStorage');
              clearInterval(checkProgress);
              localStorage.removeItem('activeImportJob');
              setImportProgress(null);
              // 完了したら作品リストを再取得
              fetchArtworks();
            }
          } else {
            console.error('[Gallery] Failed to fetch import status:', response.status);
            // 404の場合はインポートジョブが存在しないので、localStorageをクリア
            if (response.status === 404) {
              console.log('[Gallery] Import job not found, clearing localStorage');
              clearInterval(checkProgress);
              localStorage.removeItem('activeImportJob');
              setImportProgress(null);
            }
          }
        } catch (err) {
          console.error('Progress check error:', err);
        }
      }, 3000);

      // クリーンアップ
      return () => clearInterval(checkProgress);
    } catch (err) {
      console.error('Error checking active import:', err);
      localStorage.removeItem('activeImportJob');
    }
  }, []);

  const fetchArtworks = async () => {
    try {
      const { collection, query, getDocs, orderBy } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // Firestoreから全作品を取得（作成日時順）
      const artworksQuery = query(
        collection(db, 'artworks'),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(artworksQuery);
      const fetchedArtworks: Artwork[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || '',
          description: data.description,
          originalFileUrl: data.originalFileUrl || '',
          images: data.images || [],
          fileType: data.fileType || 'image',
          studentName: data.studentName || '',
          studentEmail: data.studentEmail || '',
          submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate() : data.submittedAt,
          classroomId: data.classroomId || '',
          assignmentId: data.assignmentId || '',
          likeCount: data.likeCount || 0,
          comments: (data.comments || []).map((comment: any) => ({
            ...comment,
            createdAt: comment.createdAt?.toDate ? comment.createdAt.toDate() : comment.createdAt,
          })),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          importedBy: data.importedBy || '',
        };
      });

      setArtworks(fetchedArtworks);
    } catch (err) {
      setError('作品の読み込みに失敗しました');
      console.error('Fetch artworks error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 並び替えされた作品リストを取得
  const getSortedArtworks = () => {
    const sorted = [...artworks];

    switch (sortOption) {
      case 'submittedAt-desc':
        return sorted.sort((a, b) => {
          const dateA = toDate(a.submittedAt).getTime();
          const dateB = toDate(b.submittedAt).getTime();
          return dateB - dateA; // 新しい順
        });
      case 'submittedAt-asc':
        return sorted.sort((a, b) => {
          const dateA = toDate(a.submittedAt).getTime();
          const dateB = toDate(b.submittedAt).getTime();
          return dateA - dateB; // 古い順
        });
      case 'email-asc':
        return sorted.sort((a, b) => {
          const emailA = a.studentEmail.split('@')[0].toLowerCase();
          const emailB = b.studentEmail.split('@')[0].toLowerCase();
          return emailA.localeCompare(emailB); // A→Z
        });
      case 'email-desc':
        return sorted.sort((a, b) => {
          const emailA = a.studentEmail.split('@')[0].toLowerCase();
          const emailB = b.studentEmail.split('@')[0].toLowerCase();
          return emailB.localeCompare(emailA); // Z→A
        });
      default:
        return sorted;
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
        // いいねを削除
        await deleteDoc(likeRef);

        // アートワークのいいね数を減らす
        const artworkRef = doc(db, 'artworks', artworkId);
        await updateDoc(artworkRef, {
          likeCount: increment(-1)
        });

        // 楽観的更新
        setArtworks(prev => prev.map(artwork =>
          artwork.id === artworkId
            ? { ...artwork, likeCount: Math.max(0, artwork.likeCount - 1) }
            : artwork
        ));

        if (selectedArtwork?.id === artworkId) {
          setSelectedArtwork(prev => prev ? { ...prev, likeCount: Math.max(0, prev.likeCount - 1) } : null);
        }
      } else {
        // いいねを追加
        await setDoc(likeRef, {
          id: likeId,
          artworkId,
          userEmail: user.email,
          createdAt: new Date(),
        });

        // アートワークのいいね数を増やす
        const artworkRef = doc(db, 'artworks', artworkId);
        await updateDoc(artworkRef, {
          likeCount: increment(1)
        });

        // 楽観的更新
        setArtworks(prev => prev.map(artwork =>
          artwork.id === artworkId
            ? { ...artwork, likeCount: artwork.likeCount + 1 }
            : artwork
        ));

        if (selectedArtwork?.id === artworkId) {
          setSelectedArtwork(prev => prev ? { ...prev, likeCount: prev.likeCount + 1 } : null);
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

      // Firestoreに保存
      const artworkRef = doc(db, 'artworks', artworkId);
      await updateDoc(artworkRef, {
        comments: arrayUnion(newComment)
      });

      // 楽観的更新
      setArtworks(prev => prev.map(artwork =>
        artwork.id === artworkId
          ? { ...artwork, comments: [...artwork.comments, newComment] }
          : artwork
      ));

      if (selectedArtwork?.id === artworkId) {
        setSelectedArtwork(prev => prev ? { ...prev, comments: [...prev.comments, newComment] } : null);
      }
    } catch (error) {
      console.error('Comment error:', error);
      alert('コメントの投稿に失敗しました');
      throw error;
    }
  };

  const handleDelete = async (artworkId: string) => {
    if (user?.role !== 'admin' || !user?.email) return;

    try {
      // Cloud Functionを呼び出して削除（Firestore + Storage）
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

      // UIから削除
      setArtworks(prev => prev.filter(artwork => artwork.id !== artworkId));

      alert('作品を削除しました');
    } catch (error) {
      console.error('Delete error:', error);
      alert(`作品の削除に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
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

  // Masonryレイアウト用のグリッド設定（横幅全体を使用、自動で折り返し）
  const MasonryGrid = ({ children }: { children: React.ReactNode }) => (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {children}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">ギャラリーを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">
              作品ギャラリー
            </h1>
            <div className="flex items-center space-x-4">
              {/* 並び替えセレクトボックス */}
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="submittedAt-desc">提出日時: 新しい順</option>
                <option value="submittedAt-asc">提出日時: 古い順</option>
                <option value="email-asc">学籍番号: A→Z</option>
                <option value="email-desc">学籍番号: Z→A</option>
              </select>
              {user?.role === 'guest' ? (
                <button
                  onClick={handleLoginClick}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                >
                  ログイン
                </button>
              ) : (
                <>
                  <a
                    href="/dashboard"
                    className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
                  >
                    ダッシュボード
                  </a>
                  {user?.role === 'admin' && (
                    <a
                      href="/admin/import"
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                    >
                      新しいインポート
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="w-full py-6 px-4 sm:px-6 lg:px-8">
        {/* インポート進捗表示 */}
        {importProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-blue-900">
                  {importProgress.status === 'completed' ? '✅ インポート完了' : '⏳ インポート進行中'}
                </h3>
                <span className="text-sm text-blue-700">
                  {importProgress.progress}%
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress.progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-blue-700">
                {importProgress.processedFiles} / {importProgress.totalFiles} ファイル処理済み
                {importProgress.status === 'completed' && ' - 作品が追加されました！'}
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {getSortedArtworks().length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                まだ作品がありません
              </h3>
              <p className="text-gray-600 mb-6">
                {user?.role === 'admin'
                  ? 'Google Classroom からデータをインポートして作品を表示しましょう。'
                  : '管理者がデータをインポートするまでお待ちください。'
                }
              </p>
              {user?.role === 'admin' && (
                <a
                  href="/admin/import"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  データインポートを開始
                </a>
              )}
            </div>
          ) : (
            <MasonryGrid>
              {getSortedArtworks().map((artwork) => {
                // 画像データが存在しない場合はスキップ
                if (!artwork.images || artwork.images.length === 0) {
                  return null;
                }

                return (
                <div key={artwork.id} className="break-inside-avoid">
                  <div
                    className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedArtwork(artwork)}
                  >
                    <div className="relative w-full" style={{ aspectRatio: '420 / 297' }}>
                      <Image
                        src={artwork.images[0].thumbnailUrl || artwork.images[0].url}
                        alt={artwork.title}
                        width={420}
                        height={297}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-900 font-medium truncate">{artwork.studentName}</p>
                        <div className="flex items-center space-x-2 text-xs text-gray-500 ml-2 flex-shrink-0">
                          <span className="flex items-center">
                            <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            {artwork.likeCount}
                          </span>
                          <span className="flex items-center">
                            <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            {artwork.comments.length}
                          </span>
                          {artwork.images.length > 1 && (
                            <span className="flex items-center">
                              <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              {artwork.images.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </MasonryGrid>
          )}
      </main>

      {/* Artwork Modal */}
      {selectedArtwork && (
        <ArtworkModal
          artwork={selectedArtwork}
          isOpen={true}
          onClose={() => setSelectedArtwork(null)}
          onLike={handleLike}
          onComment={handleComment}
          onDelete={handleDelete}
          userRole={user?.role || 'viewer'}
        />
      )}
    </div>
  );
}

export default withAuth(GalleryPage, 'guest');