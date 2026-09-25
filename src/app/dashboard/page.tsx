'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import withAuth from '@/components/withAuth';
import type { Gallery } from '@/types';
import { getFunctionsBaseUrl } from '@/lib/functionsBaseUrl';
import { getFunctionAuthorizationHeader } from '@/lib/functionAuth';
import { fetchArchivedCourseIds, fetchGalleries } from '@/lib/galleryData';
import { isReadOnlyMode, dispatchReadOnlyToast } from '@/lib/readOnlyMode';
import ReadOnlyBadge from '@/components/ui/ReadOnlyBadge';

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
  const [selectedArchiveCourseId, setSelectedArchiveCourseId] = useState('');
  const [archivedCourseIds, setArchivedCourseIds] = useState<Set<string>>(new Set());
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiveLoaded, setIsArchiveLoaded] = useState(false);
  const [isUpdatingArchive, setIsUpdatingArchive] = useState(false);

  const readOnly = isReadOnlyMode();

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
    if (readOnly) {
      dispatchReadOnlyToast('【本番データ保護】プレビューモードのため全データリセットは無効化されています');
      return;
    }

    if (window.confirm('本当にすべての作品、ギャラリー情報、画像ファイルを削除しますか？この操作は元に戻せません。')) {
      if (window.confirm('最終確認：この操作を実行すると、関連データがすべて完全に削除されます。よろしいですか？')) {
        setIsDeleting(true);
        try {
          if (!user?.email) {
            throw new Error('ユーザー情報が見つかりません。');
          }

          const functionsBaseUrl = getFunctionsBaseUrl();
          const deleteAllDataUrl = `${functionsBaseUrl}/deleteAllData`;
          const authorization = await getFunctionAuthorizationHeader();
          
          const response = await fetch(deleteAllDataUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authorization,
            },
            body: JSON.stringify({}),
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
          localStorage.removeItem('lastViewedArchivedGalleryId');
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
    if (readOnly) {
      dispatchReadOnlyToast('【本番データ保護】プレビューモードのため作品数同期は無効化されています');
      return;
    }

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
      const authorization = await getFunctionAuthorizationHeader();
      const response = await fetch(`${functionsBaseUrl}/syncGalleryArtworkCount`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
        },
        body: JSON.stringify({}),
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
    const loadGalleries = async () => {
      try {
        setGalleries(await fetchGalleries());
      } catch (err) {
        console.error('Failed to fetch galleries:', err);
        setArchiveError('授業一覧を読み込めませんでした。再読み込みしてください。');
      }
      try {
        setArchivedCourseIds(await fetchArchivedCourseIds());
        setIsArchiveLoaded(true);
      } catch (err) {
        console.error('Failed to fetch archived courses:', err);
        setArchiveError('アーカイブ状態を読み込めませんでした。再読み込みしてください。');
      }
    };

    void loadGalleries();
  }, []);

  const archiveCourses = Array.from(new Map(galleries.filter((gallery) => gallery.courseId).map((gallery) =>
    [gallery.courseId, gallery.courseName])).entries());
  const selectedArchiveName = archiveCourses.find(([id]) => id === selectedArchiveCourseId)?.[1];
  const isSelectedArchived = archivedCourseIds.has(selectedArchiveCourseId);

  const handleArchiveChange = async () => {
    if (readOnly) {
      dispatchReadOnlyToast('【本番データ保護】プレビューモードのためアーカイブ操作は無効化されています');
      return;
    }

    if (user?.role !== 'admin' || !selectedArchiveCourseId || !selectedArchiveName || !isArchiveLoaded || isUpdatingArchive || archiveError) return;
    const action = isSelectedArchived ? 'アーカイブを解除' : 'アーカイブ';
    if (!window.confirm(`「${selectedArchiveName}」の${action}をしますか？`)) return;

    setIsUpdatingArchive(true);
    try {
      const { doc, setDoc, deleteDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const archiveRef = doc(db, 'archivedCourses', selectedArchiveCourseId);
      if (isSelectedArchived) {
        await deleteDoc(archiveRef);
      } else {
        await setDoc(archiveRef, { archivedAt: serverTimestamp() });
      }
      setArchivedCourseIds((previous) => {
        const next = new Set(previous);
        if (isSelectedArchived) next.delete(selectedArchiveCourseId);
        else next.add(selectedArchiveCourseId);
        return next;
      });
      const sourceKey = isSelectedArchived ? 'lastViewedArchivedGalleryId' : 'lastViewedGalleryId';
      const savedId = localStorage.getItem(sourceKey);
      if (galleries.some((gallery) => gallery.id === savedId && gallery.courseId === selectedArchiveCourseId)) {
        localStorage.removeItem(sourceKey);
      }
    } catch (error) {
      console.error('Archive update error:', error);
      alert(`授業の${action}に失敗しました。`);
    } finally {
      setIsUpdatingArchive(false);
    }
  };

  const handleDeleteGallery = async () => {
    if (readOnly) {
      dispatchReadOnlyToast('【本番データ保護】プレビューモードのため課題削除は無効化されています');
      return;
    }

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
          const authorization = await getFunctionAuthorizationHeader();

          const response = await fetch(deleteGalleryDataUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authorization,
            },
            body: JSON.stringify({ galleryId: selectedGalleryId }),
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
          if (localStorage.getItem('lastViewedArchivedGalleryId') === selectedGalleryId) {
            localStorage.removeItem('lastViewedArchivedGalleryId');
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
    <div className="min-h-screen bg-[#0b0f17] architectural-bg text-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0b0f17]/90 border-b border-white/[0.08] shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400">
                    CONSOLE
                  </span>
                  <ReadOnlyBadge />
                </div>
                <h1 className="text-base font-bold text-white tracking-tight">ダッシュボード</h1>
              </div>
            </div>

            <div className="flex items-center space-x-5">
              <div className="flex items-center space-x-3 bg-white/[0.04] border border-white/[0.08] px-3.5 py-1.5 rounded-xl">
                {user?.photoURL ? (
                  <Image
                    src={user.photoURL}
                    alt={user.displayName || 'User avatar'}
                    width={32}
                    height={32}
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-white/20"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-mono text-slate-300">
                    {user?.displayName?.slice(0, 1) || 'U'}
                  </div>
                )}
                <div className="text-xs">
                  <p className="font-semibold text-slate-200">{user?.displayName}</p>
                  <p className="text-slate-400 font-mono text-[10px]">
                    {user?.role === 'admin' ? 'ADMINISTRATOR' : 'VIEWER'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="text-xs font-medium text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto py-10 px-4 sm:px-6 lg:px-8 flex-1">
        {/* Read-Only Notice Banner if active */}
        {readOnly && (
          <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-950/20 backdrop-blur-xl p-5 shadow-xl flex items-start gap-4">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-amber-400 text-sm">
              🔒
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-300 mb-1">
                本番データ保護（読み取り専用プレビューモード）が有効です
              </h4>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                本番Firebaseに接続しながらUIを安全に確認できます。データの削除・リセット・インポート・同期・アーカイブなどの変更操作はすべてフロントエンド側でブロックされます。
              </p>
            </div>
          </div>
        )}

        {/* Top Quick Links & Account Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Account Profile Card */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400 mb-4">
              Account Profile
            </div>
            <dl className="space-y-3.5 text-xs">
              <div>
                <dt className="text-slate-500 font-mono text-[10px] uppercase">名前</dt>
                <dd className="text-sm font-semibold text-white mt-0.5">{user?.displayName}</dd>
              </div>
              <div>
                <dt className="text-slate-500 font-mono text-[10px] uppercase">メールアドレス</dt>
                <dd className="text-sm font-medium text-slate-300 mt-0.5 truncate">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500 font-mono text-[10px] uppercase">権限ロール</dt>
                <dd className="mt-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase font-mono ${
                    user?.role === 'admin'
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-slate-800 text-slate-300 border border-white/10'
                  }`}>
                    {user?.role === 'admin' ? '管理者 (ADMIN)' : '閲覧者 (VIEWER)'}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Quick Access Cards */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Gallery View */}
            <div className="glass-card rounded-2xl p-6 flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
                    <path d="M3 9h18M9 21V9" strokeWidth="2" />
                  </svg>
                </div>
                <h4 className="text-base font-bold text-white mb-1">作品ギャラリー</h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                  現在開講中の授業における設計課題作品を閲覧・講評します。
                </p>
              </div>
              <a
                href="/gallery"
                className="inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-white transition-all group-hover:border-orange-500/40"
              >
                <span>ギャラリーを開く</span>
                <span className="text-orange-400">→</span>
              </a>
            </div>

            {/* Archive View */}
            <div className="glass-card rounded-2xl p-6 flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <h4 className="text-base font-bold text-white mb-1">過去授業アーカイブ</h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                  過去年度や終了した学期の作品アーカイブを閲覧します。
                </p>
              </div>
              <a
                href="/archive"
                className="inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-white transition-all group-hover:border-blue-500/40"
              >
                <span>アーカイブを見る</span>
                <span className="text-blue-400">→</span>
              </a>
            </div>
          </div>
        </div>

        {/* Administrator Section */}
        {user?.role === 'admin' && (
          <div className="space-y-8">
            {/* Import & Data Management */}
            <div className="glass-panel rounded-2xl p-6 sm:p-8">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400 mb-2">
                Administration Hub
              </div>
              <h3 className="text-lg font-bold text-white mb-6">授業・課題管理ツール</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Classroom Import Box */}
                <div className="rounded-2xl border border-white/10 bg-[#121826]/70 p-6 flex flex-col justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold font-mono uppercase mb-3">
                      Google Classroom
                    </div>
                    <h4 className="text-base font-bold text-white mb-2">課題データインポート</h4>
                    <p className="text-xs text-slate-400 leading-relaxed mb-6">
                      Google Classroom から課題の提出物・図面PDF・画像データをインポートし、新しいギャラリーを作成します。
                    </p>
                  </div>
                  <a
                    href="/admin/import"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold text-xs transition-all shadow-lg shadow-orange-500/20 active:scale-95"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>インポート画面へ進む</span>
                  </a>
                </div>

                {/* Archive Management Box */}
                <div className="rounded-2xl border border-white/10 bg-[#121826]/70 p-6 flex flex-col justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold font-mono uppercase mb-3">
                      Course Visibility
                    </div>
                    <h4 className="text-base font-bold text-white mb-2">授業アーカイブ管理</h4>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      授業の表示先を通常ギャラリーと過去アーカイブの間で切り替えます。（作品データは保持されます）
                    </p>
                    {archiveError && <p role="alert" className="mb-3 text-xs text-rose-400">{archiveError}</p>}
                    <select
                      value={selectedArchiveCourseId}
                      onChange={(event) => setSelectedArchiveCourseId(event.target.value)}
                      aria-label="アーカイブする授業を選択"
                      className="mb-3 w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="">授業を選択</option>
                      {archiveCourses.map(([courseId, courseName]) => (
                        <option key={courseId} value={courseId}>{courseName}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleArchiveChange}
                    disabled={!selectedArchiveCourseId || !isArchiveLoaded || isUpdatingArchive || Boolean(archiveError)}
                    className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-white/10 text-xs font-semibold rounded-xl text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    {isUpdatingArchive ? '更新中...' : isSelectedArchived ? 'アーカイブを解除' : '選択した授業をアーカイブ'}
                  </button>
                </div>
              </div>

              {/* Artwork Count Sync */}
              <div className="mt-6 p-6 rounded-2xl border border-white/10 bg-[#121826]/70">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h5 className="text-sm font-bold text-white mb-1">ギャラリー作品数の再同期</h5>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      各ギャラリーの作品数（artworkCount）を実データと照合して同期します。
                    </p>
                  </div>
                  <button
                    onClick={handleSyncArtworkCount}
                    disabled={isSyncing}
                    className="flex-shrink-0 inline-flex items-center justify-center px-4 py-2 border border-white/10 text-xs font-semibold rounded-xl text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 transition"
                  >
                    {isSyncing ? '同期を実行中...' : '全作品数を同期'}
                  </button>
                </div>

                {syncResults && syncResults.length > 0 && (
                  <div className="mt-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 p-4">
                    <p className="text-xs font-semibold text-emerald-300 mb-2">
                      ✓ {syncResults.length}件のギャラリーを同期しました
                    </p>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="min-w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-emerald-500/20 text-slate-400">
                            <th className="px-2 py-1 text-left">ギャラリー</th>
                            <th className="px-2 py-1 text-left">旧</th>
                            <th className="px-2 py-1 text-left">新</th>
                            <th className="px-2 py-1 text-left">差分</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-500/10">
                          {syncResults.map((result) => {
                            const diff = result.newCount - result.oldCount;
                            const diffColor = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-slate-400';
                            return (
                              <tr key={result.galleryId}>
                                <td className="px-2 py-1 text-slate-200">{result.galleryTitle}</td>
                                <td className="px-2 py-1 text-slate-400">{result.oldCount}</td>
                                <td className="px-2 py-1 font-semibold text-slate-200">{result.newCount}</td>
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

            {/* Danger Zone: Data Deletion */}
            <div className="rounded-2xl border border-rose-500/20 bg-rose-950/10 backdrop-blur-md p-6 sm:p-8">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-rose-400 mb-2">
                <span>⚠️ Danger Zone</span>
                {readOnly && <span className="text-amber-400 font-mono">(PROTECTED)</span>}
              </div>
              <h3 className="text-lg font-bold text-white mb-6">危険な操作（データ削除）</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Single Gallery Deletion */}
                <div className="rounded-2xl border border-rose-500/20 bg-[#120e14]/70 p-6 flex flex-col justify-between">
                  <div>
                    <h5 className="text-sm font-bold text-rose-200 mb-1">特定課題のデータ削除</h5>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      選択した課題に属するすべての作品、注釈、画像ファイルを完全に削除します。
                    </p>

                    <select
                      value={selectedCourse}
                      onChange={(e) => {
                        setSelectedCourse(e.target.value);
                        setSelectedGalleryId('');
                      }}
                      className="mb-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="">授業を選択</option>
                      {courses.map(courseName => (
                        <option key={courseName} value={courseName}>{courseName}</option>
                      ))}
                    </select>

                    <select
                      value={selectedGalleryId}
                      onChange={(e) => setSelectedGalleryId(e.target.value)}
                      disabled={!selectedCourse}
                      className="mb-4 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:outline-none disabled:opacity-30"
                    >
                      <option value="">課題を選択</option>
                      {assignments.map(gallery => (
                        <option key={gallery.id} value={gallery.id}>
                          {gallery.assignmentName} ({gallery.artworkCount}作品)
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleDeleteGallery}
                    disabled={!selectedGalleryId || isDeletingGallery}
                    className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-rose-500/40 text-xs font-semibold rounded-xl text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    {isDeletingGallery ? '削除を実行中...' : '選択した課題を削除'}
                  </button>
                </div>

                {/* Reset All Data */}
                <div className="rounded-2xl border border-rose-500/20 bg-[#120e14]/70 p-6 flex flex-col justify-between">
                  <div>
                    <h5 className="text-sm font-bold text-rose-200 mb-1">全システムデータリセット</h5>
                    <p className="text-xs text-slate-400 leading-relaxed mb-6">
                      すべての作品、ギャラリー情報、Storageファイルを一括全削除し、システムを初期化します。
                    </p>
                  </div>

                  <button
                    onClick={handleResetData}
                    disabled={isDeleting}
                    className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-rose-500/50 text-xs font-semibold rounded-xl text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-lg shadow-rose-600/20"
                  >
                    {isDeleting ? '全データ削除を実行中...' : '全データをリセット'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default withAuth(DashboardPage);
