'use client';

import { useState, useEffect } from 'react';
import withAuth from '@/components/withAuth';
import { useAuth } from '@/context/AuthContext';
import { ClassroomCourse, CourseAssignment } from '@/types';

function AdminImportPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [isLoadingCourses, setIsLoadingCourses] = useState<boolean>(false);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // ブラウザを閉じる際の警告
  useEffect(() => {
    if (isImporting) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [isImporting]);

  useEffect(() => {
    const fetchCourses = async () => {
      if (!user) return;

      if (!user.googleAccessToken) {
        setStatusMessage('APIへのアクセス許可がありません。一度ログアウトし、再度ログインしてアクセスを許可してください。');
        return;
      }

      setIsLoadingCourses(true);
      setStatusMessage('担当クラスを読み込んでいます...');

      try {
        const response = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
          headers: {
            'Authorization': `Bearer ${user.googleAccessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`API呼び出しに失敗しました: ${response.statusText}`);
        }

        const data = await response.json();
        setCourses(data.courses || []);
        setStatusMessage('');
      } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : '不明なエラー';
        setStatusMessage(`クラスの読み込みに失敗しました。${errorMessage}`)
      }

      setIsLoadingCourses(false);
    };

    fetchCourses();
  }, [user]);

  useEffect(() => {
    const fetchAssignments = async () => {
      if (!selectedCourse || !user?.googleAccessToken) {
        setAssignments([]);
        setSelectedAssignment('');
        return;
      }

      setIsLoadingAssignments(true);
      setStatusMessage('課題を読み込んでいます...');

      try {
        const response = await fetch(`https://classroom.googleapis.com/v1/courses/${selectedCourse}/courseWork` , {
          headers: {
            'Authorization': `Bearer ${user.googleAccessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`API呼び出しに失敗しました: ${response.statusText}`);
        }

        const data = await response.json();
        setAssignments(data.courseWork || []);
        setStatusMessage('');
      } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : '不明なエラー';
        setStatusMessage(`課題の読み込みに失敗しました。${errorMessage}`)
      }

      setIsLoadingAssignments(false);
    };

    fetchAssignments();
  }, [selectedCourse, user]);

  const handleImport = async () => {
    console.log('読み込まれたFunctionsのURL:', process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL); // ← この行を追加
    if (!selectedCourse || !selectedAssignment || !user?.email) {
      alert('授業と課題を選択してください。');
      return;
    }

    setIsImporting(true);
    setStatusMessage('Google Classroomからデータを取得しています...');

    // 段階的にメッセージを変更（案1）
    const messageTimers = [
      setTimeout(() => setStatusMessage('提出ファイルを確認しています...'), 20000),
      setTimeout(() => setStatusMessage('処理キューを準備しています...'), 60000),
      setTimeout(() => setStatusMessage('もう少しお待ちください...'), 120000),
    ];

    try {
      const { collection, addDoc, doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // ギャラリーを作成
      const selectedCourseName = courses.find(c => c.id === selectedCourse)?.name || 'Unknown Course';
      const selectedAssignmentName = assignments.find(a => a.id === selectedAssignment)?.title || 'Unknown Assignment';

      const galleryRef = doc(collection(db, 'galleries'));
      const galleryId = galleryRef.id;

      await setDoc(galleryRef, {
        id: galleryId,
        title: `${selectedCourseName} - ${selectedAssignmentName}`,
        classroomId: selectedCourse,
        assignmentId: selectedAssignment,
        createdBy: user.email,
        createdAt: new Date(),
        artworks: [],
      });

      // Firebase Functionsを呼び出してインポートを開始
      const functionsBaseUrl = process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL || 'http://localhost:5001';

      console.log('Access Token being sent:', user?.googleAccessToken);

      const response = await fetch(`${functionsBaseUrl}/importClassroomSubmissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.googleAccessToken}`,
        },
        body: JSON.stringify({
          galleryId,
          classroomId: selectedCourse,
          assignmentId: selectedAssignment,
          userEmail: user.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'インポート処理の開始に失敗しました。');
      }

      const data = await response.json();
      const importJobId = data.importJobId;

      setStatusMessage('インポート処理を開始しました。ギャラリーページで進捗を確認できます...');

      // インポートジョブ情報をlocalStorageに保存
      localStorage.setItem('activeImportJob', JSON.stringify({
        importJobId,
        galleryId,
        startedAt: new Date().toISOString(),
      }));

      // インポートしたギャラリーのIDをlocalStorageに保存
      localStorage.setItem('lastViewedGalleryId', galleryId);

      // 2秒後にギャラリーページへリダイレクト（galleryIdパラメータ付き）
      setTimeout(() => {
        window.location.href = `/gallery?galleryId=${galleryId}`;
      }, 2000);

      // 進捗を監視（リダイレクト前の短い間のみ）
      const checkProgress = setInterval(async () => {
        try {
          const progressResponse = await fetch(`${functionsBaseUrl}/getImportStatus?importJobId=${importJobId}`);
          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            const { status, progress, processedFiles, totalFiles } = progressData;

            setStatusMessage(
              `インポート進行中... (${processedFiles}/${totalFiles} ファイル処理済み - ${progress}%)`
            );

            if (status === 'completed') {
              clearInterval(checkProgress);
              setStatusMessage('インポートが正常に完了しました！ギャラリーページで確認してください。');
              setIsImporting(false);
            } else if (status === 'error') {
              clearInterval(checkProgress);
              setStatusMessage(`インポート中にエラーが発生しました: ${progressData.errorMessage || '不明なエラー'}`);
              setIsImporting(false);
            }
          }
        } catch (err) {
          console.error('Progress check error:', err);
        }
      }, 3000); // 3秒ごとに進捗を確認

      // タイムアウト設定（10分）
      setTimeout(() => {
        clearInterval(checkProgress);
        if (isImporting) {
          setStatusMessage('インポート処理がタイムアウトしました。ギャラリーページで結果を確認してください。');
          setIsImporting(false);
        }
      }, 600000);

    } catch (error) {
      console.error('Import error:', error);
      setStatusMessage(`エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
      setIsImporting(false);
      // エラー時はタイマーをクリア
      messageTimers.forEach(timer => clearTimeout(timer));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">
              データインポート
            </h1>
            <a href="/dashboard" className="text-sm text-blue-600 hover:underline">ダッシュボードに戻る</a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white p-8 rounded-lg shadow">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">インポート設定</h2>
            <p className="text-sm text-gray-600 mb-6">
              Google Classroomから作品をインポートする授業と課題を選択してください。
            </p>

            <div className="space-y-6">
              {/* Step 1: Course Selection */}
              <div>
                <label htmlFor="course-select" className="block text-sm font-medium text-gray-700 mb-2">
                  ステップ1: 授業を選択
                </label>
                <select
                  id="course-select"
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  disabled={isLoadingCourses || isImporting}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100"
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
              {selectedCourse && (
                <div>
                  <label htmlFor="assignment-select" className="block text-sm font-medium text-gray-700 mb-2">
                    ステップ2: 課題を選択
                  </label>
                  <select
                    id="assignment-select"
                    value={selectedAssignment}
                    onChange={(e) => setSelectedAssignment(e.target.value)}
                    disabled={isLoadingAssignments || !selectedCourse || isImporting}
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100"
                  >
                    <option value="">{isLoadingAssignments ? '読み込み中...' : '-- 課題を選択してください --'}</option>
                    {assignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
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
                  disabled={!selectedAssignment || isImporting || isLoadingCourses || isLoadingAssignments}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isImporting ? 'インポート処理中...' : 'インポートを開始'}
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
                          <strong className="font-bold">重要:</strong> インポート処理が完了するまで、このページを閉じないでください。処理には数分かかる場合があります。
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ステータスメッセージ（スピナー付き） */}
                  {statusMessage && (
                    <div className="p-4 bg-indigo-50 rounded-md">
                      <div className="flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 text-indigo-600 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-sm font-medium text-indigo-700">{statusMessage}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status Message（インポート中でない場合） */}
              {!isImporting && statusMessage && (
                <div className="mt-6 p-4 bg-gray-100 rounded-md text-center">
                  <p className="text-sm text-gray-700">{statusMessage}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default withAuth(AdminImportPage, 'admin');
