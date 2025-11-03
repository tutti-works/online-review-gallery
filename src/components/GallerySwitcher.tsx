'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Gallery } from '@/types';

export default function GallerySwitcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedGalleryId, setSelectedGalleryId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // URLパラメータからgalleryIdを取得
  const currentGalleryId = searchParams.get('galleryId') || '';

  // galleriesコレクションからデータを取得
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

        // 現在のgalleryIdに対応する授業と課題を選択状態にする
        if (currentGalleryId) {
          const currentGallery = fetchedGalleries.find(g => g.id === currentGalleryId);
          if (currentGallery) {
            setSelectedCourse(currentGallery.courseName);
            setSelectedGalleryId(currentGalleryId);
          }
        }
        // currentGalleryIdがない場合は何も選択しない（初期状態のまま）
      } catch (err) {
        console.error('Failed to fetch galleries:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGalleries();
  }, [currentGalleryId]);

  // 授業名の一覧（重複を除く）
  const courses = Array.from(new Set(galleries.map(g => g.courseName)));

  // 選択された授業に属する課題一覧
  const assignments = galleries.filter(g => g.courseName === selectedCourse);

  // 授業選択時
  const handleCourseChange = (courseName: string) => {
    setSelectedCourse(courseName);
    setSelectedGalleryId(''); // 課題選択をリセット
  };

  // 課題選択時
  const handleAssignmentChange = (galleryId: string) => {
    setSelectedGalleryId(galleryId);
    // localStorageに保存
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastViewedGalleryId', galleryId);
    }
    // URLを更新してギャラリーページに遷移
    router.push(`/gallery?galleryId=${galleryId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="animate-pulse bg-gray-200 h-10 w-40 rounded"></div>
        <div className="animate-pulse bg-gray-200 h-10 w-40 rounded"></div>
      </div>
    );
  }

  if (galleries.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        ギャラリーがありません
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* 授業選択ドロップダウン */}
      <select
        value={selectedCourse}
        onChange={(e) => handleCourseChange(e.target.value)}
        className="max-w-[240px] truncate rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        title={selectedCourse || '授業を選択'}
      >
        <option value="">授業を選択</option>
        {courses.map(courseName => (
          <option key={courseName} value={courseName} title={courseName}>
            {courseName}
          </option>
        ))}
      </select>

      {/* 課題選択ドロップダウン（常に表示） */}
      <select
        value={selectedGalleryId}
        onChange={(e) => handleAssignmentChange(e.target.value)}
        disabled={!selectedCourse}
        className="max-w-[240px] truncate rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:border-gray-300"
        title={selectedGalleryId ? assignments.find(g => g.id === selectedGalleryId)?.assignmentName : '課題を選択'}
      >
        <option value="">課題を選択</option>
        {assignments.map(gallery => (
          <option key={gallery.id} value={gallery.id} title={`${gallery.assignmentName} (${gallery.artworkCount}作品)`}>
            {gallery.assignmentName} ({gallery.artworkCount}作品)
          </option>
        ))}
      </select>
    </div>
  );
}
