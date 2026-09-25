'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import withAuth from '@/components/withAuth';
import { useAuth } from '@/context/AuthContext';
import { ClassroomCourse, CourseAssignment } from '@/types';
import { CLASSROOM_INCREMENTAL_SCOPES } from '@/lib/firebase';
import { getFunctionsBaseUrl } from '@/lib/functionsBaseUrl';
import { getFunctionAuthorizationHeader } from '@/lib/functionAuth';
import { isReadOnlyMode, dispatchReadOnlyToast } from '@/lib/readOnlyMode';
import ReadOnlyBadge from '@/components/ui/ReadOnlyBadge';

const CONSENT_MESSAGE = 'Google Classroom APIへのアクセス許可が必要です。下のボタンから許可してください。';
const TOKEN_MESSAGE = 'Google Classroom APIのトークンを取得できませんでした。ログアウト後に再度ログインしてください。';

function AdminImportPage() {
  const router = useRouter();
  const { user, requestAdditionalScopes } = useAuth();

  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [isLoadingCourses, setIsLoadingCourses] = useState<boolean>(false);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [hasRequiredScopes, setHasRequiredScopes] = useState<boolean>(false);
  const [needsAdditionalConsent, setNeedsAdditionalConsent] = useState<boolean>(false);
  const [isRequestingScopes, setIsRequestingScopes] = useState<boolean>(false);
  const [scopeRequestError, setScopeRequestError] = useState<string | null>(null);

  const readOnly = isReadOnlyMode();

  const incrementalScopes = useMemo(() => [...CLASSROOM_INCREMENTAL_SCOPES], []);
  const messageTimersRef = useRef<number[]>([]);

  const getCurrentAccessToken = useCallback(
    () => user?.googleAccessToken || sessionStorage.getItem('googleAccessToken'),
    [user?.googleAccessToken]
  );

  const clearMessageTimers = useCallback(() => {
    messageTimersRef.current.forEach((id) => clearTimeout(id));
    messageTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearMessageTimers();
  }, [clearMessageTimers]);

  const markConsentRequired = useCallback((message: string = CONSENT_MESSAGE) => {
    setHasRequiredScopes(false);
    setNeedsAdditionalConsent(true);
    setScopeRequestError(null);
    setCourses([]);
    setAssignments([]);
    setSelectedCourse('');
    setSelectedAssignment('');
    setStatusMessage(message);
  }, []);

  useEffect(() => {
    if (!user) {
      setHasRequiredScopes(false);
      setNeedsAdditionalConsent(false);
      setScopeRequestError(null);
      setCourses([]);
      setAssignments([]);
      setSelectedCourse('');
      setSelectedAssignment('');
      setStatusMessage('');
      return;
    }

    const token = getCurrentAccessToken();
    if (token) {
      setHasRequiredScopes(true);
      setNeedsAdditionalConsent(false);
      setScopeRequestError(null);
      setStatusMessage('');
    } else {
      markConsentRequired();
    }
  }, [user, getCurrentAccessToken, markConsentRequired]);

  const fetchCourses = useCallback(async () => {
    if (!user || !hasRequiredScopes) {
      return;
    }

    const accessToken = getCurrentAccessToken();
    if (!accessToken) {
      markConsentRequired(TOKEN_MESSAGE);
      return;
    }

    setIsLoadingCourses(true);
    setStatusMessage('公開済みクラスを読み込んでいます...');

    try {
      const response = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        let apiError = response.statusText;
        try {
          const body = await response.json();
          apiError = body?.error?.message ?? apiError;
        } catch {
          // ignore JSON parse errors
        }

        if (response.status === 401 || response.status === 403) {
          markConsentRequired(CONSENT_MESSAGE);
          return;
        }

        throw new Error(apiError);
      }

      const data = await response.json();
      setCourses(data.courses || []);
      setStatusMessage('');
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      setStatusMessage(`クラスの読み込みに失敗しました: ${errorMessage}`);
    } finally {
      setIsLoadingCourses(false);
    }
  }, [user, hasRequiredScopes, getCurrentAccessToken, markConsentRequired]);

  useEffect(() => {
    void fetchCourses();
  }, [fetchCourses]);

  const fetchAssignments = useCallback(async () => {
    if (!selectedCourse || !hasRequiredScopes) {
      setAssignments([]);
      setSelectedAssignment('');
      return;
    }

    const accessToken = getCurrentAccessToken();
    if (!accessToken) {
      setAssignments([]);
      setSelectedAssignment('');
      markConsentRequired(TOKEN_MESSAGE);
      return;
    }

    setIsLoadingAssignments(true);
    setStatusMessage('課題一覧を読み込んでいます...');

    try {
      const response = await fetch(
        `https://classroom.googleapis.com/v1/courses/${selectedCourse}/courseWork?courseWorkStates=PUBLISHED`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        let apiError = response.statusText;
        try {
          const body = await response.json();
          apiError = body?.error?.message ?? apiError;
        } catch {
          // ignore
        }

        if (response.status === 401 || response.status === 403) {
          setAssignments([]);
          setSelectedAssignment('');
          markConsentRequired(CONSENT_MESSAGE);
          return;
        }

        throw new Error(apiError);
      }

      const data = await response.json();
      setAssignments(data.courseWork || []);
      setStatusMessage('');
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      setStatusMessage(`課題の読み込みに失敗しました: ${errorMessage}`);
    } finally {
      setIsLoadingAssignments(false);
    }
  }, [selectedCourse, hasRequiredScopes, getCurrentAccessToken, markConsentRequired]);

  useEffect(() => {
    void fetchAssignments();
  }, [fetchAssignments]);

  const ensureClassroomScopes = useCallback(async (): Promise<boolean> => {
    try {
      const token = await requestAdditionalScopes(incrementalScopes);
      return Boolean(token ?? getCurrentAccessToken());
    } catch (error) {
      throw error;
    }
  }, [incrementalScopes, requestAdditionalScopes, getCurrentAccessToken]);

  const handleRequestScopes = useCallback(async () => {
    setIsRequestingScopes(true);
    setScopeRequestError(null);
    setStatusMessage('Google Classroom APIのアクセス許可処理を開始します...');

    try {
      const success = await ensureClassroomScopes();

      if (!success) {
        const message = 'Google Classroom APIへのアクセス許可が付与されませんでした。もう一度お試しください。';
        setScopeRequestError(message);
        setStatusMessage(message);
        return;
      }

      const token = getCurrentAccessToken();
      if (token) {
        setHasRequiredScopes(true);
        setNeedsAdditionalConsent(false);
        setScopeRequestError(null);
        setStatusMessage('権限が付与されました。授業情報を更新しています...');
        setCourses([]);
        setAssignments([]);
        setSelectedCourse('');
        setSelectedAssignment('');
      } else {
        const message = 'Google Classroom APIへのアクセス許可が付与されませんでした。もう一度お試しください。';
        setScopeRequestError(message);
        setStatusMessage(message);
      }
    } catch (error) {
      const firebaseError = error as { code?: string; message?: string };
      let message = 'Google Classroom APIへのアクセス許可処理中にエラーが発生しました。';

      if (firebaseError?.code === 'auth/popup-blocked') {
        message = 'ポップアップがブロックされました。ブラウザでポップアップを許可して再試行してください。';
      } else if (firebaseError?.code === 'auth/popup-closed-by-user' || firebaseError?.code === 'auth/cancelled-popup-request') {
        message = '認証ウィンドウが閉じられました。もう一度ボタンを押して権限を付与してください。';
      }

      setScopeRequestError(message);
      setStatusMessage(message);
    } finally {
      setIsRequestingScopes(false);
    }
  }, [ensureClassroomScopes, getCurrentAccessToken]);

  const handleImport = async () => {
    if (readOnly) {
      dispatchReadOnlyToast('【本番データ保護】プレビューモードのためインポート実行は無効化されています');
      return;
    }

    if (!hasRequiredScopes) {
      alert('Google Classroom APIの権限が付与されていません。画面上のボタンから権限を付与してください。');
      return;
    }

    if (isRequestingScopes) {
      alert('Google Classroom APIの権限付与処理が進行中です。完了までお待ちください。');
      return;
    }

    const accessToken = getCurrentAccessToken();
    if (!accessToken) {
      alert('Google Classroom APIのトークンを確認できませんでした。再度権限の付与を行ってください。');
      return;
    }

    if (!selectedCourse || !selectedAssignment || !user?.email) {
      alert('授業と課題を選択してください。');
      return;
    }

    setIsImporting(true);
    setStatusMessage('Google Classroomからデータを取得しています...');

    clearMessageTimers();
    messageTimersRef.current = [
      window.setTimeout(() => setStatusMessage('提出ファイルを確認しています...'), 20_000),
      window.setTimeout(() => setStatusMessage('処理キューを準備しています...'), 60_000),
      window.setTimeout(() => setStatusMessage('もう少しお待ちください...'), 120_000),
    ];

    try {
      const { collection, doc, setDoc, query, where, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const selectedCourseName = courses.find((c) => c.id === selectedCourse)?.name || 'Unknown Course';
      const selectedAssignmentName = assignments.find((a) => a.id === selectedAssignment)?.title || 'Unknown Assignment';

      // 既存のギャラリーを検索
      const galleriesRef = collection(db, 'galleries');
      const q = query(
        galleriesRef,
        where('classroomId', '==', selectedCourse),
        where('assignmentId', '==', selectedAssignment)
      );
      const existingGalleriesSnapshot = await getDocs(q);

      let galleryId: string;
      let galleryRef;

      if (!existingGalleriesSnapshot.empty) {
        const existingGallery = existingGalleriesSnapshot.docs[0];
        galleryId = existingGallery.id;
        galleryRef = doc(db, 'galleries', galleryId);
        console.log(`Using existing gallery: ${galleryId}`);
      } else {
        galleryRef = doc(collection(db, 'galleries'));
        galleryId = galleryRef.id;

        await setDoc(galleryRef, {
          id: galleryId,
          title: `${selectedCourseName} - ${selectedAssignmentName}`,
          classroomId: selectedCourse,
          assignmentId: selectedAssignment,
          artworkCount: 0,
          createdBy: user.email,
          createdAt: new Date(),
        });
        console.log(`Created new gallery: ${galleryId}`);
      }

      const functionsBaseUrl = getFunctionsBaseUrl();
      const authorization = await getFunctionAuthorizationHeader();

      const response = await fetch(`${functionsBaseUrl}/importClassroomSubmissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
          'X-Classroom-OAuth-Token': accessToken,
        },
        body: JSON.stringify({
          galleryId,
          courseId: selectedCourse,
          courseWorkId: selectedAssignment,
        }),
      });

      if (!response.ok) {
        let apiError = response.statusText;
        try {
          const body = await response.json();
          apiError = body?.error || apiError;
        } catch {
          // ignore
        }
        throw new Error(apiError);
      }

      const result = await response.json();
      const jobQuery = result.importJobId ? `&importJobId=${encodeURIComponent(result.importJobId)}` : '';

      clearMessageTimers();
      setStatusMessage('インポート処理がキューに追加されました。ギャラリーへ移動します...');

      setTimeout(() => {
        router.push(`/gallery?galleryId=${galleryId}${jobQuery}`);
      }, 1000);
    } catch (error) {
      console.error(error);
      clearMessageTimers();
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      setStatusMessage(`インポート処理に失敗しました: ${errorMessage}`);
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] architectural-bg text-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0b0f17]/90 border-b border-white/[0.08] shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400">
                    IMPORT PIPELINE
                  </span>
                  <ReadOnlyBadge />
                </div>
                <h1 className="text-base font-bold text-white tracking-tight">データインポート</h1>
              </div>
            </div>

            <a
              href="/dashboard"
              className="text-xs font-medium text-slate-400 hover:text-white px-3.5 py-2 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.04] transition-all"
            >
              ← ダッシュボードに戻る
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl w-full mx-auto py-10 px-4 sm:px-6 lg:px-8 flex-1">
        {readOnly && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-950/20 backdrop-blur-xl p-4 shadow-xl flex items-center gap-3">
            <span className="text-amber-400">🔒</span>
            <p className="text-xs text-amber-200">
              本番データ保護モードが有効なため、Google Classroomからの実際のインポート実行は無効化されています。
            </p>
          </div>
        )}

        <div className="glass-panel rounded-2xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400 mb-2">
            Classroom Sync
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-2">インポート設定</h2>
          <p className="text-xs sm:text-sm text-slate-400 mb-8 leading-relaxed">
            Google Classroomから課題の提出物（PDF図面・画像）を取得し、新しいギャラリーを作成します。
          </p>

          <div className="space-y-6">
            {needsAdditionalConsent && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-5 backdrop-blur-md">
                <p className="text-xs text-amber-200 leading-relaxed">
                  Google Classroom APIへのアクセス許可が必要です。下のボタンから追加のアクセス許可を付与してください。
                </p>
                {scopeRequestError && (
                  <p className="mt-2 text-xs text-rose-400 font-mono">{scopeRequestError}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleRequestScopes}
                    disabled={isRequestingScopes}
                    className="inline-flex items-center rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-orange-500/20 transition active:scale-95 disabled:opacity-40"
                  >
                    {isRequestingScopes ? '権限を付与しています...' : 'Googleでアクセスを許可'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    前のページに戻る
                  </button>
                </div>
              </div>
            )}

            {/* Step 1: Course Selection */}
            <div className="space-y-2">
              <label htmlFor="course-select" className="block text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                ステップ 1: 授業を選択
              </label>
              <select
                id="course-select"
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                disabled={isLoadingCourses || isImporting || isRequestingScopes || needsAdditionalConsent}
                className="block w-full rounded-xl border border-white/10 bg-[#121826] px-4 py-3 text-sm font-medium text-slate-200 shadow-inner transition hover:border-white/20 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-40 cursor-pointer"
              >
                <option value="">{isLoadingCourses ? '授業を読み込み中...' : '-- 授業を選択してください --'}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id} className="bg-[#121826]">
                    {course.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Assignment Selection */}
            {selectedCourse && (
              <div className="space-y-2 animate-slide-up">
                <label htmlFor="assignment-select" className="block text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                  ステップ 2: 課題を選択
                </label>
                <select
                  id="assignment-select"
                  value={selectedAssignment}
                  onChange={(e) => setSelectedAssignment(e.target.value)}
                  disabled={isLoadingAssignments || !selectedCourse || isImporting || isRequestingScopes || needsAdditionalConsent}
                  className="block w-full rounded-xl border border-white/10 bg-[#121826] px-4 py-3 text-sm font-medium text-slate-200 shadow-inner transition hover:border-white/20 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-40 cursor-pointer"
                >
                  <option value="">{isLoadingAssignments ? '課題を読み込み中...' : '-- 課題を選択してください --'}</option>
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id} className="bg-[#121826]">
                      {assignment.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Step 3: Import Button */}
            <div className="pt-4">
              <button
                onClick={handleImport}
                disabled={!selectedAssignment || isImporting || isLoadingCourses || isLoadingAssignments || isRequestingScopes || needsAdditionalConsent}
                className="w-full flex justify-center py-3.5 px-5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 font-semibold text-sm text-white shadow-xl shadow-orange-500/20 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isImporting ? 'インポート処理中...' : 'インポートを開始'}
              </button>
            </div>

            {/* Warning Message during import */}
            {isImporting && (
              <div className="space-y-4 animate-slide-up">
                <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                  <span className="text-amber-400 text-base">⚠️</span>
                  <p className="text-xs text-amber-200 leading-relaxed">
                    <strong className="font-bold text-amber-300">重要:</strong> インポート処理が完了するまでページを閉じないでください。ファイル数によっては数分かかる場合があります。
                  </p>
                </div>

                {statusMessage && (
                  <div className="p-4 rounded-xl bg-[#121826] border border-white/10 flex items-center justify-center gap-3">
                    <div className="w-4 h-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div>
                    <p className="text-xs font-mono font-medium text-orange-400">{statusMessage}</p>
                  </div>
                )}
              </div>
            )}

            {!isImporting && statusMessage && (
              <div className="p-4 rounded-xl bg-[#121826] border border-white/10 text-center">
                <p className="text-xs font-mono text-slate-300">{statusMessage}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default withAuth(AdminImportPage, 'admin');
