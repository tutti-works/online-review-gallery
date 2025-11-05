'use client';

type GalleryEmptyStateProps = {
  hasGalleries: boolean;
  currentGalleryId: string | null;
  userRole?: string;
};

const GalleryEmptyState = ({ hasGalleries, currentGalleryId, userRole }: GalleryEmptyStateProps) => {
  const isAdmin = userRole === 'admin';

  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100">
        <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>

      {!hasGalleries ? (
        <>
          <h3 className="mb-2 text-lg font-medium text-gray-900">まだギャラリーがありません</h3>
          <p className="mb-6 text-gray-600">
            {isAdmin
              ? 'Google Classroom からデータをインポートして課題を作成しましょう。'
              : '管理者がデータをインポートするまでお待ちください。'}
          </p>
          {isAdmin && (
            <a
              href="/admin/import"
              className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              データインポートを開く
            </a>
          )}
        </>
      ) : !currentGalleryId ? (
        <>
          <h3 className="mb-2 text-lg font-medium text-gray-900">課題を選択してください</h3>
          <p className="mb-6 text-gray-600">上部のドロップダウンから授業と課題を選択して作品を表示できます。</p>
        </>
      ) : (
        <>
          <h3 className="mb-2 text-lg font-medium text-gray-900">まだ作品がありません</h3>
          <p className="mb-6 text-gray-600">この課題にはまだ作品が登録されていません。</p>
        </>
      )}
    </div>
  );
};

export default GalleryEmptyState;
