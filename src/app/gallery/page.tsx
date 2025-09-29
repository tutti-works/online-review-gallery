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
  userRole: string;
}

function ArtworkModal({ artwork, isOpen, onClose, onLike, onComment, userRole }: ArtworkModalProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-75 transition-opacity" onClick={onClose}></div>

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
          <div className="bg-white">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-medium text-gray-900">{artwork.title}</h3>
                <p className="text-sm text-gray-500">
                  {artwork.studentName} ({artwork.studentEmail})
                </p>
                <p className="text-xs text-gray-400">
                  提出日: {toDate(artwork.submittedAt).toLocaleString('ja-JP')}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Image Display */}
                <div className="space-y-4">
                  <div className="relative bg-gray-100 rounded-lg overflow-hidden">
                    <Image
                      src={artwork.images[currentPage].url}
                      alt={`${artwork.title} - Page ${currentPage + 1}`}
                      width={artwork.images[currentPage].width}
                      height={artwork.images[currentPage].height}
                      className="w-full h-auto object-contain max-h-96"
                      unoptimized
                    />
                  </div>

                  {/* Page Navigation */}
                  {artwork.images.length > 1 && (
                    <div className="flex items-center justify-center space-x-4">
                      <button
                        onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                        disabled={currentPage === 0}
                        className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        前へ
                      </button>
                      <span className="text-sm text-gray-500">
                        {currentPage + 1} / {artwork.images.length}
                      </span>
                      <button
                        onClick={() => setCurrentPage(Math.min(artwork.images.length - 1, currentPage + 1))}
                        disabled={currentPage === artwork.images.length - 1}
                        className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        次へ
                      </button>
                    </div>
                  )}

                  {/* Page Thumbnails */}
                  {artwork.images.length > 1 && (
                    <div className="flex space-x-2 overflow-x-auto py-2">
                      {artwork.images.map((image, index) => (
                        <button
                          key={image.id}
                          onClick={() => setCurrentPage(index)}
                          className={`flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden ${
                            currentPage === index ? 'border-blue-500' : 'border-gray-200'
                          }`}
                        >
                          <Image
                            src={image.thumbnailUrl || image.url}
                            alt={`Page ${index + 1} thumbnail`}
                            width={64}
                            height={64}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions and Comments */}
                <div className="space-y-6">
                  {/* Like Button (Admin Only) */}
                  {userRole === 'admin' && (
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={handleLike}
                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        <span>いいね ({artwork.likeCount})</span>
                      </button>
                    </div>
                  )}

                  {/* Like Count (Viewer) */}
                  {userRole === 'viewer' && (
                    <div className="flex items-center space-x-2 text-gray-600">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      <span>いいね {artwork.likeCount}</span>
                    </div>
                  )}

                  {/* Comments */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-gray-900">コメント</h4>

                    {/* Comment Form (Admin Only) */}
                    {userRole === 'admin' && (
                      <form onSubmit={handleCommentSubmit} className="space-y-3">
                        <textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="コメントを入力してください..."
                          rows={3}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                        <button
                          type="submit"
                          disabled={!commentText.trim() || isSubmittingComment}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmittingComment ? '送信中...' : 'コメントを投稿'}
                        </button>
                      </form>
                    )}

                    {/* Comments List */}
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {artwork.comments.length > 0 ? (
                        artwork.comments.map((comment) => (
                          <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
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
                            </div>
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
      </div>
    </div>
  );
}

function GalleryPage() {
  const { user } = useAuth();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);

  useEffect(() => {
    fetchArtworks();
  }, []);

  const fetchArtworks = async () => {
    try {
      // TODO: Firestoreから作品データを取得
      // 今は仮のデータを表示
      const mockArtworks: Artwork[] = [];
      setArtworks(mockArtworks);
    } catch (err) {
      setError('作品の読み込みに失敗しました');
      console.error('Fetch artworks error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (artworkId: string) => {
    if (user?.role !== 'admin') return;

    try {
      // TODO: いいね機能の実装
      console.log('Like artwork:', artworkId);

      // 楽観的更新
      setArtworks(prev => prev.map(artwork =>
        artwork.id === artworkId
          ? { ...artwork, likeCount: artwork.likeCount + 1 }
          : artwork
      ));
    } catch (error) {
      console.error('Like error:', error);
    }
  };

  const handleComment = async (artworkId: string, comment: string) => {
    if (user?.role !== 'admin') return;

    try {
      // TODO: コメント機能の実装
      console.log('Comment on artwork:', artworkId, comment);

      // 楽観的更新
      const newComment = {
        id: crypto.randomUUID(),
        content: comment,
        authorName: user.displayName,
        authorEmail: user.email,
        createdAt: new Date(),
      };

      setArtworks(prev => prev.map(artwork =>
        artwork.id === artworkId
          ? { ...artwork, comments: [...artwork.comments, newComment] }
          : artwork
      ));
    } catch (error) {
      console.error('Comment error:', error);
      throw error;
    }
  };

  // Masonryレイアウト用のグリッド設定
  const MasonryGrid = ({ children }: { children: React.ReactNode }) => (
    <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">
              作品ギャラリー
            </h1>
            <div className="flex items-center space-x-4">
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
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {artworks.length === 0 ? (
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
              {artworks.map((artwork) => (
                <div key={artwork.id} className="break-inside-avoid">
                  <div
                    className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedArtwork(artwork)}
                  >
                    <div className="aspect-auto">
                      <Image
                        src={artwork.images[0].thumbnailUrl || artwork.images[0].url}
                        alt={artwork.title}
                        width={artwork.images[0].width}
                        height={artwork.images[0].height}
                        className="w-full h-auto object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium text-gray-900 mb-1">{artwork.title}</h3>
                      <p className="text-sm text-gray-600 mb-2">{artwork.studentName}</p>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{toDate(artwork.submittedAt).toLocaleDateString('ja-JP')}</span>
                        <div className="flex items-center space-x-3">
                          <span className="flex items-center">
                            <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            {artwork.likeCount}
                          </span>
                          <span className="flex items-center">
                            <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            {artwork.comments.length}
                          </span>
                          {artwork.images.length > 1 && (
                            <span className="flex items-center">
                              <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              ))}
            </MasonryGrid>
          )}
        </div>
      </main>

      {/* Artwork Modal */}
      {selectedArtwork && (
        <ArtworkModal
          artwork={selectedArtwork}
          isOpen={true}
          onClose={() => setSelectedArtwork(null)}
          onLike={handleLike}
          onComment={handleComment}
          userRole={user?.role || 'viewer'}
        />
      )}
    </div>
  );
}

export default withAuth(GalleryPage);