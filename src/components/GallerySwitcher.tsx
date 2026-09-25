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
    return <div className="text-xs text-slate-500 font-mono">{mode === 'archive' ? 'アーカイブされた授業はありません' : 'ギャラリーがありません'}</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={selectedCourseId}
          onChange={(event) => setChosenCourseId(event.target.value)}
          className="max-w-[200px] truncate rounded-xl border border-white/10 bg-[#121826] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-200 shadow-sm transition-all hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/80 cursor-pointer"
          title={courses.find(([id]) => id === selectedCourseId)?.[1] || '授業を選択'}
          aria-label="授業を選択"
        >
          <option value="" className="bg-[#121826] text-slate-400">授業を選択</option>
          {courses.map(([courseId, courseName]) => (
            <option key={courseId} value={courseId} className="bg-[#121826] text-slate-200">
              {courseName}
            </option>
          ))}
        </select>
      </div>

      <div className="relative">
        <select
          value={currentGallery?.courseId === selectedCourseId ? currentGalleryId || '' : ''}
          onChange={(event) => handleAssignmentChange(event.target.value)}
          disabled={!selectedCourseId}
          className="max-w-[220px] truncate rounded-xl border border-white/10 bg-[#121826] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-200 shadow-sm transition-all hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/80 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          aria-label="課題を選択"
        >
          <option value="" className="bg-[#121826] text-slate-400">課題を選択</option>
          {assignments.map((gallery) => (
            <option key={gallery.id} value={gallery.id} className="bg-[#121826] text-slate-200">
              {gallery.assignmentName} ({gallery.artworkCount}作品)
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
