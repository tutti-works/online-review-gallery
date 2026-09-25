'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { galleryPath, lastViewedKey, type GalleryMode } from '@/lib/courseArchive';
import type { Gallery } from '@/types';

type Props = {
  galleries: Gallery[];
  currentGalleryId: string | null;
  mode: GalleryMode;
};

export default function GallerySwitcher({ galleries, currentGalleryId, mode }: Props) {
  const router = useRouter();
  const currentGallery = galleries.find((gallery) => gallery.id === currentGalleryId);
  const [chosenCourseId, setChosenCourseId] = useState<string | null>(null);
  useEffect(() => { setChosenCourseId(null); }, [currentGalleryId]);
  const selectedCourseId = chosenCourseId ?? currentGallery?.courseId ?? '';
  const courses = Array.from(new Map(galleries.filter((gallery) => gallery.courseId).map((gallery) =>
    [gallery.courseId, gallery.courseName])).entries());
  const assignments = galleries.filter((gallery) => gallery.courseId === selectedCourseId);

  const handleAssignmentChange = (galleryId: string) => {
    if (!galleryId || !galleries.some((gallery) => gallery.id === galleryId && gallery.courseId === selectedCourseId)) return;
    localStorage.setItem(lastViewedKey(mode), galleryId);
    router.push(`${galleryPath(mode)}?galleryId=${encodeURIComponent(galleryId)}`);
  };

  if (galleries.length === 0) {
    return <div className="text-sm text-gray-500">{mode === 'archive' ? 'アーカイブされた授業はありません' : 'ギャラリーがありません'}</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedCourseId}
        onChange={(event) => setChosenCourseId(event.target.value)}
        className="max-w-[180px] truncate rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        title={courses.find(([id]) => id === selectedCourseId)?.[1] || '授業を選択'}
        aria-label="授業を選択"
      >
        <option value="">授業を選択</option>
        {courses.map(([courseId, courseName]) => <option key={courseId} value={courseId}>{courseName}</option>)}
      </select>
      <select
        value={currentGallery?.courseId === selectedCourseId ? currentGalleryId || '' : ''}
        onChange={(event) => handleAssignmentChange(event.target.value)}
        disabled={!selectedCourseId}
        className="max-w-[180px] truncate rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
        aria-label="課題を選択"
      >
        <option value="">課題を選択</option>
        {assignments.map((gallery) => (
          <option key={gallery.id} value={gallery.id}>
            {gallery.assignmentName} ({gallery.artworkCount}作品)
          </option>
        ))}
      </select>
    </div>
  );
}
