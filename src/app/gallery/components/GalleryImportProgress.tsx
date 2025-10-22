'use client';

import type { ImportProgress } from '../hooks/useImportProgress';

type GalleryImportProgressProps = {
  importProgress: ImportProgress | null;
};

const GalleryImportProgress = ({ importProgress }: GalleryImportProgressProps) => {
  if (!importProgress) {
    return null;
  }

  const isCompleted = importProgress.status === 'completed';

  return (
    <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-blue-900">
          {isCompleted ? '✅ インポート完了' : '⏳ インポート進行中'}
        </h3>
        <span className="text-sm text-blue-700">{importProgress.progress}%</span>
      </div>
      <div className="mb-2 h-2 w-full rounded-full bg-blue-200">
        <div
          className="h-2 rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${importProgress.progress}%` }}
        />
      </div>
      <p className="text-xs text-blue-700">
        {importProgress.processedFiles} / {importProgress.totalFiles} ファイル処理済み
        {isCompleted && ' - 作品が追加されました。'}
      </p>
    </div>
  );
};

export default GalleryImportProgress;
