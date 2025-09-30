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
        setStatusMessage(`クラスの読み込みに失敗しました。${error.message}`)
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
        setStatusMessage(`課題の読み込みに失敗しました。${error.message}`)
      }

      setIsLoadingAssignments(false);
    };

    fetchAssignments();
  }, [selectedCourse, user]);

  const handleImport = async () => {
    if (!selectedCourse || !selectedAssignment || !user?.email) {
      alert('授業と課題を選択してください。');
      return;
    }

    setIsImporting(true);
    setStatusMessage('インポート処理を開始しています...');

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

      setStatusMessage('インポート処理を開始しました。完了まで数分かかることがあります...');

      // 進捗を監視
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

              {/* Status Message */}
              {statusMessage && (
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
