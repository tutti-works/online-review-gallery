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
  const isError = importProgress.status === 'error';
  const isPreparing = importProgress.initializationComplete === false;

  if (isError) {
    return (
      <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        インポート中にエラーが発生しました。取り込み済みの作品を確認してから、もう一度インポートしてください。
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-blue-900">
          {isCompleted ? '✅ インポート完了' : isPreparing ? '⏳ 提出物を準備しています' : '⏳ インポート進行中'}
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
        {isPreparing ? '提出一覧と添付ファイルを取得しています。準備が終わると処理件数を表示します。' : importProgress.totalSubmissions !== undefined
          ? `${importProgress.completedSubmissions ?? 0} / ${importProgress.totalSubmissions} 学生提出を処理済み`
          : `${importProgress.processedFiles} / ${importProgress.totalFiles} ファイル処理済み`}
        {importProgress.failedSubmissions ? `（失敗 ${importProgress.failedSubmissions} 件）` : ''}
        {importProgress.failedFileCount ? `（ファイル失敗 ${importProgress.failedFileCount} 件）` : ''}
        {isCompleted && ' - インポート処理が完了しました。'}
      </p>
    </div>
  );
};

export default GalleryImportProgress;
