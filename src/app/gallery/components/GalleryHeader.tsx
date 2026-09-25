'use client';

import { Suspense, useState } from 'react';
import GallerySwitcher from '@/components/GallerySwitcher';
import LabelBadge from '@/components/labels/LabelBadge';
import { LABEL_DEFINITIONS } from '@/constants/labels';
import { getVisibleLabelFilterOptions } from '@/lib/reviewLabels';
import type { LabelType } from '@/types';
import type { Gallery } from '@/types';
import type { GalleryMode } from '@/lib/courseArchive';
import type { SortOption } from '../types';
import ReadOnlyBadge from '@/components/ui/ReadOnlyBadge';

type GalleryHeaderProps = {
  galleries: Gallery[];
  currentGalleryId: string | null;
  mode: GalleryMode;
  userRole?: string;
  selectedLabels: LabelType[];
  availableLabels: ReadonlySet<LabelType>;
  availableTotals: number[];
  isTotalLabelFilterActive: boolean;
  onToggleLabelFilter: (label: LabelType) => void;
  totalLabelFilter: number | null;
  onTotalLabelFilterChange: (value: string) => void;
  sortOption: SortOption;
  onSortOptionChange: (option: SortOption) => void;
  hideIncomplete: boolean;
  onHideIncompleteChange: (hide: boolean) => void;
  incompleteCount: number;
  onLoginClick: () => void;
};

const GalleryHeader = ({
  galleries,
  currentGalleryId,
  mode,
  userRole,
  selectedLabels,
  availableLabels,
  availableTotals,
  isTotalLabelFilterActive,
  onToggleLabelFilter,
  totalLabelFilter,
  onTotalLabelFilterChange,
  sortOption,
  onSortOptionChange,
  hideIncomplete,
  onHideIncompleteChange,
  incompleteCount,
  onLoginClick,
}: GalleryHeaderProps) => {
  const isAdmin = userRole === 'admin';
  const isGuest = userRole === 'guest';
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  const activeFilterCount = selectedLabels.length + (isTotalLabelFilterActive ? 1 : 0) + (hideIncomplete ? 1 : 0);
  const visibleOptions = getVisibleLabelFilterOptions(availableLabels, availableTotals, selectedLabels, totalLabelFilter);
  const visibleLabels = LABEL_DEFINITIONS.filter((label) => visibleOptions.labels.has(label.type));
  const startsColor = (index: number) =>
    index > 0 && visibleLabels[index].type.split('-')[0] !== visibleLabels[index - 1].type.split('-')[0];

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0b0f17]/90 border-b border-white/[0.08] shadow-2xl transition-all">
      <div className="w-full px-4 sm:px-6 lg:px-8 max-w-[1920px] mx-auto">
        {/* 1行レイアウト (1651px以上) */}
        <div className="hidden layout-2xl:flex h-20 items-center justify-between gap-6">
          {/* Logo / Brand / Title */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-orange-400">
                    {mode === 'archive' ? 'ARCHIVE' : 'EXHIBITION'}
                  </span>
                  <ReadOnlyBadge />
                </div>
                <h1 className="text-base font-bold text-white tracking-tight">
                  {mode === 'archive' ? '過去授業のギャラリー' : '作品ギャラリー'}
                </h1>
              </div>
            </div>
          </div>

          {/* Controls: Switcher & Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Suspense fallback={<div className="text-xs text-slate-500">読み込み中...</div>}>
              <GallerySwitcher galleries={galleries} currentGalleryId={currentGalleryId} mode={mode} />
            </Suspense>

            {isAdmin && (
              <>
                <div className="h-5 w-[1px] bg-white/10 mx-1"></div>

                {/* Label Badges */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#121826] border border-white/10">
                  {visibleLabels.map((label, index) => {
                    const isSelected = selectedLabels.includes(label.type);
                    return (
                      <button
                        key={label.type}
                        onClick={() => onToggleLabelFilter(label.type)}
                        disabled={isTotalLabelFilterActive}
                        className={`flex items-center justify-center w-8 h-8 text-xs font-bold rounded-lg border transition-all ${
                          isSelected
                            ? `${label.bgColor} border-white shadow-md scale-105`
                            : `bg-slate-900/60 border-transparent hover:border-white/20 text-slate-400 hover:text-white`
                        } ${isTotalLabelFilterActive ? 'opacity-30 cursor-not-allowed' : ''} ${
                          startsColor(index) ? 'ml-1.5 pl-1.5 border-l border-white/10' : ''
                        }`}
                        title={label.type}
                        aria-label={`${label.type.split('-')[0]} ${label.symbol}点で絞り込み`}
                        aria-pressed={isSelected}
                      >
                        <LabelBadge label={label.type} isActive={isSelected} className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>

                {/* Total filter */}
                <select
                  value={totalLabelFilter === null ? '' : String(totalLabelFilter)}
                  onChange={(event) => onTotalLabelFilterChange(event.target.value)}
                  className="rounded-xl border border-white/10 bg-[#121826] px-3 py-2 text-xs font-medium text-slate-200 shadow-sm transition-all hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40 cursor-pointer"
                >
                  <option value="" className="bg-[#121826] text-slate-400">合計点で絞り込み</option>
                  {visibleOptions.totals.map((totalValue) => (
                    <option key={totalValue} value={totalValue} className="bg-[#121826] text-slate-200">
                      {totalValue}点
                    </option>
                  ))}
                </select>

                {/* Incomplete toggle */}
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-slate-300 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={hideIncomplete}
                    onChange={(e) => onHideIncompleteChange(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-slate-800 text-orange-500 focus:ring-orange-500/40 focus:ring-offset-0 cursor-pointer accent-orange-500"
                  />
                  <span>
                    未提出等を隠す {hideIncomplete && incompleteCount > 0 && `(${incompleteCount})`}
                  </span>
                </label>
              </>
            )}

            <div className="h-5 w-[1px] bg-white/10 mx-1"></div>

            {/* Sort */}
            <select
              value={sortOption}
              onChange={(event) => onSortOptionChange(event.target.value as SortOption)}
              className="rounded-xl border border-white/10 bg-[#121826] px-3.5 py-2 text-xs font-medium text-slate-200 shadow-sm transition-all hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40 cursor-pointer"
            >
              <option value="submittedAt-asc" className="bg-[#121826]">提出日: 早い順</option>
              <option value="submittedAt-desc" className="bg-[#121826]">提出日: 遅い順</option>
              <option value="email-asc" className="bg-[#121826]">学籍番号: A→Z</option>
              <option value="email-desc" className="bg-[#121826]">学籍番号: Z→A</option>
            </select>
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {isGuest ? (
              <button
                onClick={onLoginClick}
                className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all active:scale-95"
              >
                ログイン
              </button>
            ) : (
              <>
                <a
                  href="/dashboard"
                  className="flex items-center gap-2 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2 text-xs sm:text-sm font-medium text-slate-200 transition-all"
                >
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  <span>ダッシュボード</span>
                </a>

                {isAdmin && (
                  <a
                    href="/admin/import"
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all active:scale-95"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>インポート</span>
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        {/* 2行レイアウト (1131px〜1650px) */}
        <div className="hidden layout-lg:block layout-2xl:hidden py-2">
          {/* Row 1: Brand + Action Buttons */}
          <div className="flex h-14 items-center justify-between border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">{mode === 'archive' ? '過去授業のギャラリー' : '作品ギャラリー'}</h1>
                <ReadOnlyBadge />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isGuest ? (
                <button
                  onClick={onLoginClick}
                  className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-md active:scale-95"
                >
                  ログイン
                </button>
              ) : (
                <>
                  <a
                    href="/dashboard"
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    ダッシュボード
                  </a>
                  {isAdmin && (
                    <a
                      href="/admin/import"
                      className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      インポート
                    </a>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Row 2: GallerySwitcher + Controls */}
          <div className="flex h-14 items-center justify-between gap-4">
            <Suspense fallback={<div className="text-xs text-slate-500">読み込み中...</div>}>
              <GallerySwitcher galleries={galleries} currentGalleryId={currentGalleryId} mode={mode} />
            </Suspense>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#121826] border border-white/10">
                    {visibleLabels.map((label, index) => {
                      const isSelected = selectedLabels.includes(label.type);
                      return (
                        <button
                          key={label.type}
                          onClick={() => onToggleLabelFilter(label.type)}
                          disabled={isTotalLabelFilterActive}
                          className={`flex items-center justify-center w-7 h-7 text-xs font-bold rounded border transition-all ${
                            isSelected
                              ? `${label.bgColor} border-white shadow-md scale-105`
                              : `bg-slate-900/60 border-transparent hover:border-white/20 text-slate-400 hover:text-white`
                          } ${isTotalLabelFilterActive ? 'opacity-30 cursor-not-allowed' : ''} ${
                            startsColor(index) ? 'ml-1 pl-1 border-l border-white/10' : ''
                          }`}
                          title={label.type}
                        >
                          <LabelBadge label={label.type} isActive={isSelected} className="h-3.5 w-3.5" />
                        </button>
                      );
                    })}
                  </div>

                  <select
                    value={totalLabelFilter === null ? '' : String(totalLabelFilter)}
                    onChange={(event) => onTotalLabelFilterChange(event.target.value)}
                    className="rounded-xl border border-white/10 bg-[#121826] px-3 py-1.5 text-xs font-medium text-slate-200"
                  >
                    <option value="" className="bg-[#121826] text-slate-400">合計点</option>
                    {visibleOptions.totals.map((totalValue) => (
                      <option key={totalValue} value={totalValue} className="bg-[#121826] text-slate-200">
                        {totalValue}点
                      </option>
                    ))}
                  </select>

                  <label className="flex items-center gap-1.5 text-xs cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={hideIncomplete}
                      onChange={(e) => onHideIncompleteChange(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-white/20 bg-slate-800 text-orange-500 accent-orange-500"
                    />
                    <span>非表示 {hideIncomplete && incompleteCount > 0 && `(${incompleteCount})`}</span>
                  </label>
                </>
              )}

              <select
                value={sortOption}
                onChange={(event) => onSortOptionChange(event.target.value as SortOption)}
                className="rounded-xl border border-white/10 bg-[#121826] px-3 py-1.5 text-xs font-medium text-slate-200"
              >
                <option value="submittedAt-asc">提出日: 早↑</option>
                <option value="submittedAt-desc">提出日: 遅↓</option>
                <option value="email-asc">学籍: A→Z</option>
                <option value="email-desc">学籍: Z→A</option>
              </select>
            </div>
          </div>
        </div>

        {/* 簡略レイアウト (1130px以下) */}
        <div className="layout-lg:hidden py-2">
          {/* Row 1 */}
          <div className="flex h-12 items-center justify-between border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white">{mode === 'archive' ? '過去授業' : '作品ギャラリー'}</h1>
              <ReadOnlyBadge />
            </div>

            <div className="flex items-center gap-2">
              {!isGuest && (
                <a
                  href="/dashboard"
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300"
                >
                  ダッシュボード
                </a>
              )}
              {isGuest ? (
                <button
                  onClick={onLoginClick}
                  className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-semibold text-white"
                >
                  ログイン
                </button>
              ) : (
                isAdmin && (
                  <a
                    href="/admin/import"
                    className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-semibold text-white"
                  >
                    インポート
                  </a>
                )
              )}
            </div>
          </div>

          {/* Row 2 */}
          <div className="flex h-12 items-center justify-between gap-2 mt-1">
            <Suspense fallback={<div className="text-[10px] text-slate-500">読み込み中...</div>}>
              <GallerySwitcher galleries={galleries} currentGalleryId={currentGalleryId} mode={mode} />
            </Suspense>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <div className="relative">
                  <button
                    onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#121826] px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <span>絞り込み</span>
                    {activeFilterCount > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {isFilterDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10 bg-black/40 backdrop-blur-sm"
                        onClick={() => setIsFilterDropdownOpen(false)}
                      />
                      <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-white/10 bg-[#101624] p-4 shadow-2xl backdrop-blur-2xl">
                        <div className="space-y-4">
                          <div>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                              ラベルフィルター
                            </h3>
                            <div className="grid grid-cols-5 gap-1.5">
                              {visibleLabels.map((label, index) => {
                                const isSelected = selectedLabels.includes(label.type);
                                return (
                                  <button
                                    key={label.type}
                                    onClick={() => onToggleLabelFilter(label.type)}
                                    disabled={isTotalLabelFilterActive}
                                    className={`flex items-center justify-center h-10 text-xs font-bold rounded-lg border transition-all ${
                                      isSelected
                                        ? `${label.bgColor} border-white shadow-md scale-105`
                                        : `bg-slate-900/60 border-transparent text-slate-400 hover:text-white`
                                    } ${isTotalLabelFilterActive ? 'opacity-30 cursor-not-allowed' : ''}`}
                                  >
                                    <LabelBadge label={label.type} isActive={isSelected} className="h-5 w-5" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                              合計点で絞り込み
                            </h3>
                            <select
                              value={totalLabelFilter === null ? '' : String(totalLabelFilter)}
                              onChange={(event) => onTotalLabelFilterChange(event.target.value)}
                              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                            >
                              <option value="">選択してください</option>
                              {visibleOptions.totals.map((totalValue) => (
                                <option key={totalValue} value={totalValue}>
                                  {totalValue}点
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="flex items-center gap-2 text-xs cursor-pointer text-slate-300">
                              <input
                                type="checkbox"
                                checked={hideIncomplete}
                                onChange={(e) => onHideIncompleteChange(e.target.checked)}
                                className="h-4 w-4 rounded border-white/20 bg-slate-800 text-orange-500 accent-orange-500"
                              />
                              <span>未提出等を非表示 {hideIncomplete && incompleteCount > 0 && `(${incompleteCount}件)`}</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <select
                value={sortOption}
                onChange={(event) => onSortOptionChange(event.target.value as SortOption)}
                className="rounded-lg border border-white/10 bg-[#121826] px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="submittedAt-asc">早↑</option>
                <option value="submittedAt-desc">遅↓</option>
                <option value="email-asc">A→Z</option>
                <option value="email-desc">Z→A</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default GalleryHeader;
