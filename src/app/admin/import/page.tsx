'use client';
import { blockPreviewWrite } from '@/lib/localPreview';

import { previewFetch } from '@/lib/previewFetch';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Download, Layers } from 'lucide-react';
import withAuth from '@/components/withAuth';
import { useAuth } from '@/context/AuthContext';
import { ClassroomCourse, CourseAssignment } from '@/types';
import { CLASSROOM_INCREMENTAL_SCOPES } from '@/lib/firebase';
import { getFunctionsBaseUrl } from '@/lib/functionsBaseUrl';
import { getFunctionAuthorizationHeader } from '@/lib/functionAuth';

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
      const response = await previewFetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
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
    setStatusMessage('課題を読み込んでいます...');

    try {
      const response = await previewFetch(`https://classroom.googleapis.com/v1/courses/${selectedCourse}/courseWork`, {
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
    if (blockPreviewWrite()) return;
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
      const { collection, doc, setDoc, query, where, getDocs } = await import('@/lib/previewFirestore');
      const { db } = await import('@/lib/firebase');

      const selectedCourseName = courses.find((c) => c.id === selectedCourse)?.name || 'Unknown Course';
      const selectedAssignmentName = assignments.find((a) => a.id === selectedAssignment)?.title || 'Unknown Assignment';

      // 既存のギャラリーを検索（同じclassroomId + assignmentIdの組み合わせ）
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
        // 既存のギャラリーが見つかった場合は再利用
        const existingGallery = existingGalleriesSnapshot.docs[0];
        galleryId = existingGallery.id;
        galleryRef = doc(db, 'galleries', galleryId);
        console.log(`Using existing gallery: ${galleryId}`);
      } else {
        // 新規ギャラリーを作成
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

      const response = await previewFetch(`${functionsBaseUrl}/importClassroomSubmissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
          'X-Classroom-OAuth-Token': accessToken,
        },
        body: JSON.stringify({
          galleryId,
          classroomId: selectedCourse,
          assignmentId: selectedAssignment,
        }),
      });

      if (!response.ok) {
        clearMessageTimers();
        const data = await response.json();
        throw new Error(data?.error || 'インポートのリクエストに失敗しました');
      }

      const data = await response.json();
      const importJobId = data.importJobId;

      localStorage.setItem('activeImportJob', JSON.stringify({
        importJobId,
        startedAt: new Date().toISOString(),
        galleryId,
      }));

      // バックエンドに処理が渡ったので、ギャラリーページにリダイレクト
      clearMessageTimers();
      setStatusMessage('インポート処理を開始しました。ギャラリーページへ移動します...');

      // beforeunloadイベントを無効化してからリダイレクト
      window.onbeforeunload = null;

      setTimeout(() => {
        router.push(`/gallery?galleryId=${galleryId}`);
      }, 1500);
    } catch (error) {
      console.error('Import error:', error);
      setStatusMessage(`エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsImporting(false);
      clearMessageTimers();
    }
  };

  return (
    <div className="import-page min-h-screen bg-gray-50">
      <header>
        <div className="import-heading">
          <div>
            <p className="atelier-eyebrow">CLASSROOM / IMPORT</p>
            <h1>作品をインポート</h1>
            <p className="import-description">授業で生まれた作品を、ギャラリーへ。</p>
          </div>
          <a href="/dashboard" className="import-back"><ArrowLeft size={15} aria-hidden="true" />ダッシュボード</a>
        </div>
      </header>

      <main className="mx-auto">
        <div className="import-layout">
          <section className="import-settings" aria-labelledby="import-settings-title">
            <div className="import-section-heading"><span className="import-icon"><Download size={20} aria-hidden="true" /></span><div><p className="atelier-eyebrow">GOOGLE CLASSROOM</p><h2 id="import-settings-title">インポート設定</h2></div></div>
            <p className="import-description">
              Google Classroomから作品をインポートする授業と課題を選択してください。
            </p>

            <div className="import-fields">
              {needsAdditionalConsent && (
                <div className="import-notice">
                  <p className="text-sm text-yellow-800">
                    Google Classroom APIへのアクセス許可が必要です。下のボタンから追加のアクセス許可を付与してください。
                  </p>
                  {scopeRequestError && (
                    <p className="mt-2 text-sm text-red-600">{scopeRequestError}</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleRequestScopes}
                      disabled={isRequestingScopes}
                      className="import-button"
                    >
                      {isRequestingScopes ? '権限を付与しています...' : 'Googleでアクセスを許可'}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="import-button import-button-secondary"
                    >
                      前のページに戻る
                    </button>
                  </div>
                </div>
              )}

              {/* Step 1: Course Selection */}
              <div className="import-field">
                <label htmlFor="course-select">
                  <span className="import-step">01</span>授業を選択
                </label>
                <select
                  id="course-select"
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  disabled={isLoadingCourses || isImporting || isRequestingScopes || needsAdditionalConsent}
                  className="import-select"
                >
                  <option value="">{isLoadingCourses ? '読み込み中...' : '-- 授業を選択してください --'}</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Assignment Selection */}
                <div className="import-field">
                  <label htmlFor="assignment-select">
                    <span className="import-step">02</span>課題を選択
                  </label>
                  <select
                    id="assignment-select"
                    value={selectedAssignment}
                    onChange={(e) => setSelectedAssignment(e.target.value)}
                    disabled={isLoadingAssignments || !selectedCourse || isImporting || isRequestingScopes || needsAdditionalConsent}
                    className="import-select"
                  >
                    <option value="">{!selectedCourse ? '先に授業を選択してください' : isLoadingAssignments ? '読み込み中...' : '-- 課題を選択してください --'}</option>
                    {assignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.title}
                      </option>
                    ))}
                  </select>
                </div>

              {/* Step 3: Import Button */}
              <div className="import-action">
                <button
                  onClick={handleImport}
                  disabled={!selectedAssignment || isImporting || isLoadingCourses || isLoadingAssignments || isRequestingScopes || needsAdditionalConsent}
                  className="import-button"
                >
                  {isImporting ? 'インポート処理中...' : 'インポートを開始'}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </div>

              {/* 警告メッセージ（インポート中のみ表示） */}
              {isImporting && (
                <div className="space-y-4">
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                          <strong className="font-bold">重要:</strong> インポート処理が完全に終わるまで、このページを閉じないでください。処理には数分かかる場合があります。
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ステータスメッセージ（スピナー付き） */}
                  {statusMessage && (
                    <div className="import-status" role="status">
                      <div className="flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 mr-3 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <p className="text-sm font-medium">{statusMessage}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ステータスメッセージ（インポート中でない場合） */}
              {!isImporting && statusMessage && (
                <div className="import-status" role="status">
                  <p className="text-sm text-gray-700">{statusMessage}</p>
                </div>
              )}
            </div>
          </section>
          <aside className="import-summary" aria-labelledby="import-summary-title">
            <span className="import-icon"><Layers size={22} aria-hidden="true" /></span>
            <p className="atelier-eyebrow">YOUR SELECTION</p>
            <h2 id="import-summary-title">取り込む作品の確認</h2>
            <p className="import-description">選択した課題の提出作品をギャラリーにまとめます。</p>
            <dl>
              <div><dt>授業</dt><dd>{courses.find((course) => course.id === selectedCourse)?.name || '未選択'}</dd></div>
              <div><dt>課題</dt><dd>{assignments.find((assignment) => assignment.id === selectedAssignment)?.title || '未選択'}</dd></div>
            </dl>
            <p className="import-summary-note">開始後はギャラリーへ移動し、取り込みの進捗を確認できます。</p>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default withAuth(AdminImportPage, 'admin');
