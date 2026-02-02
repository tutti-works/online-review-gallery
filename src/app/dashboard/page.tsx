'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import withAuth from '@/components/withAuth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Gallery } from '@/types';
import { getFunctionsBaseUrl } from '@/lib/functionsBaseUrl';

interface SyncResult {
  galleryId: string;
  galleryTitle: string;
  oldCount: number;
  newCount: number;
  oldArtworksArrayLength: number | null;
}

function DashboardPage() {
  const { user, logout } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingGallery, setIsDeletingGallery] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedGalleryId, setSelectedGalleryId] = useState<string>('');

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      alert('ログアウトに失敗しました。');
    }
  };

  const handleResetData = async () => {
    if (window.confirm('本当にすべての作品、ギャラリー情報、画像ファイルを削除しますか？この操作は元に戻せません。')) {
      if (window.confirm('最終確認：この操作を実行すると、関連データがすべて完全に削除されます。よろしいですか？')) {
        setIsDeleting(true);
        try {
          if (!user?.email) {
            throw new Error('ユーザー情報が見つかりません。');
          }

          const functionsBaseUrl = getFunctionsBaseUrl();
          const deleteAllDataUrl = `${functionsBaseUrl}/deleteAllData`;
          
          const response = await fetch(deleteAllDataUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userEmail: user.email }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            try {
              const errorData = JSON.parse(errorText);
              throw new Error(errorData.error || `データのリセットに失敗しました: ${response.statusText}`);
            } catch (e) {
              throw new Error(`データのリセットに失敗しました: ${errorText}`);
            }
          }

          const result = await response.json();
          alert('すべてのデータが正常にリセットされました。');
          console.log(result);

          // localStorageをクリア
          localStorage.removeItem('lastViewedGalleryId');
        } catch (error) {
          console.error('Data reset error:', error);
          const message = error instanceof Error ? error.message : '不明なエラーが発生しました。';
          alert(`データのリセットに失敗しました。: ${message}`);
        } finally {
          setIsDeleting(false);
        }
      }
    }
  };

  const handleSyncArtworkCount = async () => {
    if (!confirm('全ギャラリーのartworkCountを実際の作品数で同期します。\n\n実行しますか？')) {
      return;
    }

    setIsSyncing(true);
    setSyncResults(null);

    try {
      if (!user?.email) {
        throw new Error('ユーザー情報が見つかりません。');
      }

      const functionsBaseUrl = getFunctionsBaseUrl();
      const response = await fetch(`${functionsBaseUrl}/syncGalleryArtworkCount`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userEmail: user.email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '同期に失敗しました');
      }

      const data = await response.json();
      setSyncResults(data.results);
      alert(`${data.results.length}件のギャラリーを同期しました`);

      // ギャラリー一覧を再取得
      window.location.reload();
    } catch (error) {
      console.error('Sync error:', error);
      const message = error instanceof Error ? error.message : '不明なエラーが発生しました。';
      alert(`同期に失敗しました: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // ギャラリー一覧を取得（マウント時のみ）
  useEffect(() => {
    const fetchGalleries = async () => {
      try {
        const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');

        const galleriesQuery = query(
          collection(db, 'galleries'),
          orderBy('createdAt', 'desc')
        );

        const querySnapshot = await getDocs(galleriesQuery);
        const fetchedGalleries: Gallery[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            courseName: data.courseName || 'コース名未設定',
            assignmentName: data.assignmentName || '課題名未設定',
            courseId: data.courseId || '',
            assignmentId: data.assignmentId || '',
            classroomId: data.classroomId || data.courseId || '',
            artworkCount: data.artworkCount || 0,
            createdBy: data.createdBy || '',
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          };
        });

        setGalleries(fetchedGalleries);
      } catch (err) {
        console.error('Failed to fetch galleries:', err);
      }
    };

    fetchGalleries();
  }, []);

  const handleDeleteGallery = async () => {
    if (!selectedGalleryId) {
      alert('課題を選択してください。');
      return;
    }

    const selectedGallery = galleries.find(g => g.id === selectedGalleryId);
    const galleryName = selectedGallery ? `${selectedGallery.courseName} > ${selectedGallery.assignmentName}` : '選択されたギャラリー';

    if (window.confirm(`本当に「${galleryName}」のすべてのデータ（作品、いいね、ファイル）を削除しますか？この操作は元に戻せません。`)) {
      if (window.confirm('最終確認：この操作を実行すると、選択された課題のデータがすべて完全に削除されます。よろしいですか？')) {
        setIsDeletingGallery(true);
        try {
          if (!user?.email) {
            throw new Error('ユーザー情報が見つかりません。');
          }

          const functionsBaseUrl = getFunctionsBaseUrl();
          const deleteGalleryDataUrl = `${functionsBaseUrl}/deleteGalleryData`;

          const response = await fetch(deleteGalleryDataUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userEmail: user.email, galleryId: selectedGalleryId }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            try {
              const errorData = JSON.parse(errorText);
              throw new Error(errorData.error || `ギャラリーの削除に失敗しました: ${response.statusText}`);
            } catch (e) {
              throw new Error(`ギャラリーの削除に失敗しました: ${errorText}`);
            }
          }

          const result = await response.json();
          alert(`ギャラリーが正常に削除されました。削除された作品数: ${result.deletedArtworks}`);
          console.log(result);

          // localStorageから削除したgalleryIdをクリア
          const savedGalleryId = localStorage.getItem('lastViewedGalleryId');
          if (savedGalleryId === selectedGalleryId) {
            localStorage.removeItem('lastViewedGalleryId');
          }

          // ギャラリー一覧を再取得
          setSelectedCourse('');
          setSelectedGalleryId('');
          window.location.reload();
        } catch (error) {
          console.error('Gallery deletion error:', error);
          const message = error instanceof Error ? error.message : '不明なエラーが発生しました。';
          alert(`ギャラリーの削除に失敗しました。: ${message}`);
        } finally {
          setIsDeletingGallery(false);
        }
      }
    }
  };

  // 授業名の一覧（重複を除く）
  const courses = Array.from(new Set(galleries.map(g => g.courseName)));

  // 選択された授業に属する課題一覧
  const assignments = galleries.filter(g => g.courseName === selectedCourse);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">
              ダッシュボード
            </h1>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                {user?.photoURL && (
                  <Image
                    src={user.photoURL}
                    alt={user.displayName || 'User avatar'}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                )}
                <div className="text-sm">
                  <p className="font-medium text-gray-900">{user?.displayName}</p>
                  <p className="text-gray-500">
                    {user?.role === 'admin' ? '管理者' : '閲覧者'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <div className="text-center">
              <div className="bg-white rounded-lg shadow p-6 max-w-md mx-auto">
                <h3 className="text-lg font-semibold mb-4">アカウント情報</h3>
                <dl className="space-y-2 text-left">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">名前:</dt>
                    <dd className="text-sm text-gray-900">{user?.displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      メールアドレス:
                    </dt>
                    <dd className="text-sm text-gray-900">{user?.email}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">ロール:</dt>
                    <dd className="text-sm text-gray-900">
                      {user?.role === 'admin' ? '管理者' : '閲覧者'}
                    </dd>
                  </div>
                </dl>
              </div>

              {user?.role === 'admin' && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">管理者機能</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-2">
                        データインポート
                      </h4>
                      <p className="text-sm text-blue-700 mb-4">
                        Google Classroom から課題の提出物をインポートします。
                      </p>
                      <a
                        href="/admin/import"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        インポート開始
                      </a>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-800 mb-2">
                        ギャラリー管理
                      </h4>
                      <p className="text-sm text-gray-600 mb-4">
                        作品ギャラリーの表示・管理を行います。
                      </p>
                      <a
                        href="/gallery"
                        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                      >
                        ギャラリー表示
                      </a>
                    </div>
                  </div>

                  {/* データ削除機能 */}
                  <div className="mt-8 border-t border-gray-200 pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 課題削除 */}
                      <div className="text-left">
                        <h5 className="text-sm font-semibold text-gray-800 mb-2">
                          課題データ削除
                        </h5>
                        <p className="text-sm text-gray-500 mb-4">
                          選択した課題のすべてのデータ（作品、いいね、ファイル）を削除します。
                        </p>

                        {/* 授業選択ドロップダウン */}
                        <select
                          value={selectedCourse}
                          onChange={(e) => {
                            setSelectedCourse(e.target.value);
                            setSelectedGalleryId(''); // 課題選択をリセット
                          }}
                          className="mb-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="">授業を選択</option>
                          {courses.map(courseName => (
                            <option key={courseName} value={courseName}>
                              {courseName}
                            </option>
                          ))}
                        </select>

                        {/* 課題選択ドロップダウン */}
                        <select
                          value={selectedGalleryId}
                          onChange={(e) => setSelectedGalleryId(e.target.value)}
                          disabled={!selectedCourse}
                          className="mb-4 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          <option value="">課題を選択</option>
                          {assignments.map(gallery => (
                            <option key={gallery.id} value={gallery.id}>
                              {gallery.assignmentName} ({gallery.artworkCount}作品)
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={handleDeleteGallery}
                          disabled={!selectedGalleryId || isDeletingGallery}
                          className="w-full inline-flex justify-center items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed"
                        >
                          {isDeletingGallery ? '削除を実行中...' : '選択した課題を削除'}
                        </button>
                      </div>

                      {/* 全データリセット */}
                      <div className="text-left">
                        <h5 className="text-sm font-semibold text-gray-800 mb-2">
                          全データリセット
                        </h5>
                        <p className="text-sm text-gray-500 mb-4">
                          すべての作品、ギャラリー情報、ファイルを削除し、システムを初期状態に戻します。
                        </p>
                        <button
                          onClick={handleResetData}
                          disabled={isDeleting}
                          className="mt-14 w-full inline-flex justify-center items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed"
                        >
                          {isDeleting ? '削除を実行中...' : '全データをリセット'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ギャラリー作品数同期機能 */}
                  <div className="mt-8 border-t border-gray-200 pt-6">
                    <div className="text-left">
                      <h5 className="text-sm font-semibold text-gray-800 mb-2">
                        ギャラリー作品数同期
                      </h5>
                      <p className="text-sm text-gray-500 mb-4">
                        ギャラリードキュメントのartworkCountを実際の作品数で修正します。作品の個別削除後に作品数が不整合になった場合に使用してください。
                      </p>
                      <button
                        onClick={handleSyncArtworkCount}
                        disabled={isSyncing}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed"
                      >
                        {isSyncing ? '同期を実行中...' : '全ギャラリーの作品数を同期'}
                      </button>

                      {syncResults && syncResults.length > 0 && (
                        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-4">
                          <p className="text-sm font-semibold text-green-900 mb-2">
                            ✓ {syncResults.length}件のギャラリーを同期しました
                          </p>
                          <div className="max-h-48 overflow-y-auto">
                            <table className="min-w-full text-xs">
                              <thead className="bg-green-100">
                                <tr>
                                  <th className="px-2 py-1 text-left text-green-900">ギャラリー</th>
                                  <th className="px-2 py-1 text-left text-green-900">旧</th>
                                  <th className="px-2 py-1 text-left text-green-900">新</th>
                                  <th className="px-2 py-1 text-left text-green-900">差分</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-green-200">
                                {syncResults.map((result) => {
                                  const diff = result.newCount - result.oldCount;
                                  const diffColor = diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-700' : 'text-gray-600';
                                  return (
                                    <tr key={result.galleryId}>
                                      <td className="px-2 py-1 text-green-900">{result.galleryTitle}</td>
                                      <td className="px-2 py-1 text-green-700">{result.oldCount}</td>
                                      <td className="px-2 py-1 font-semibold text-green-900">{result.newCount}</td>
                                      <td className={`px-2 py-1 font-semibold ${diffColor}`}>
                                        {diff > 0 && '+'}{diff}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {user?.role === 'viewer' && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">閲覧者機能</h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">
                      ギャラリー閲覧
                    </h4>
                    <p className="text-sm text-gray-700 mb-4">
                      あなたが所属する授業の作品ギャラリーを閲覧できます。
                    </p>
                    <a
                      href="/gallery"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                      ギャラリー表示
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default withAuth(DashboardPage);
