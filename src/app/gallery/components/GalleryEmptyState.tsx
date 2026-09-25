'use client';

type GalleryEmptyStateProps = {
  hasGalleries: boolean;
  currentGalleryId: string | null;
  userRole?: string;
};

const GalleryEmptyState = ({ hasGalleries, currentGalleryId, userRole }: GalleryEmptyStateProps) => {
  const isAdmin = userRole === 'admin';

  return (
    <div className="py-20 text-center max-w-lg mx-auto">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#141b2a] border border-white/10 shadow-inner">
        <svg className="h-9 w-9 text-orange-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>

      {!hasGalleries ? (
        <>
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400 mb-1">
            No Galleries Found
          </div>
          <h3 className="mb-2 text-xl font-bold text-white">ギャラリーがありません</h3>
          <p className="mb-8 text-sm text-slate-400 leading-relaxed">
            {isAdmin
              ? 'Google Classroom から課題データをインポートしてギャラリーを作成してください。'
              : '管理者がデータをインポートするまでお待ちください。'}
          </p>
          {isAdmin && (
            <a
              href="/admin/import"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition-all active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>データインポートを開始</span>
            </a>
          )}
        </>
      ) : !currentGalleryId ? (
        <>
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400 mb-1">
            Selection Required
          </div>
          <h3 className="mb-2 text-xl font-bold text-white">課題を選択してください</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            上部のドロップダウンから授業と課題を選択すると作品が表示されます。
          </p>
        </>
      ) : (
        <>
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400 mb-1">
            Empty Exhibition
          </div>
          <h3 className="mb-2 text-xl font-bold text-white">作品が登録されていません</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            この課題にはまだ提出作品がインポートされていません。
          </p>
        </>
      )}
    </div>
  );
};

export default GalleryEmptyState;
