'use client';

import { Suspense, useState } from 'react';
import GallerySwitcher from '@/components/GallerySwitcher';
import LabelBadge from '@/components/labels/LabelBadge';
import { LABEL_DEFINITIONS } from '@/constants/labels';
import type { LabelType } from '@/types';

import type { SortOption } from '../types';

type GalleryHeaderProps = {
  userRole?: string;
  selectedLabels: LabelType[];
  isTotalLabelFilterActive: boolean;
  onToggleLabelFilter: (label: LabelType) => void;
  totalLabelFilter: number | null;
  onTotalLabelFilterChange: (value: string) => void;
  sortOption: SortOption;
  onSortOptionChange: (option: SortOption) => void;
  onLoginClick: () => void;
};

const GalleryHeader = ({
  userRole,
  selectedLabels,
  isTotalLabelFilterActive,
  onToggleLabelFilter,
  totalLabelFilter,
  onTotalLabelFilterChange,
  sortOption,
  onSortOptionChange,
  onLoginClick,
}: GalleryHeaderProps) => {
  const isAdmin = userRole === 'admin';
  const isGuest = userRole === 'guest';
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  const activeFilterCount = selectedLabels.length + (isTotalLabelFilterActive ? 1 : 0);

  return (
    <header className="bg-white shadow-sm">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        {/* 1行レイアウト (1651px以上) */}
        <div className="hidden layout-2xl:flex h-16 items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">作品ギャラリー</h1>
          <div className="flex items-center gap-4">
            <Suspense fallback={<div className="text-sm text-gray-500">読み込み中...</div>}>
              <GallerySwitcher />
            </Suspense>

            {isAdmin && (
              <>
                <div className="flex items-center gap-2">
                  {/* <span className="text-sm font-medium text-gray-700">フィルター:</span> */}
                  <div className="flex items-center gap-1.5">
                    {LABEL_DEFINITIONS.map((label) => {
                      const isSelected = selectedLabels.includes(label.type);
                      const buttonClasses = [
                        'flex items-center justify-center w-8 h-8 text-xs font-bold rounded-lg border-2 transition-all shadow-sm hover:shadow',
                        isSelected
                          ? `${label.bgColor} border-gray-400 scale-105`
                          : `bg-white border-gray-300 ${isTotalLabelFilterActive ? '' : 'hover:bg-gray-50 hover:border-gray-400'}`,
                        isTotalLabelFilterActive ? 'opacity-50 cursor-not-allowed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <button
                          key={label.type}
                          onClick={() => onToggleLabelFilter(label.type)}
                          disabled={isTotalLabelFilterActive}
                          className={buttonClasses}
                          title={label.type}
                        >
                          <LabelBadge label={label.type} isActive={isSelected} className="h-5 w-5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <select
                  value={totalLabelFilter === null ? '' : String(totalLabelFilter)}
                  onChange={(event) => onTotalLabelFilterChange(event.target.value)}
                  className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">合計で絞り込み</option>
                  {Array.from({ length: 10 }, (_, index) => {
                    const totalValue = index + 1;
                    return (
                      <option key={totalValue} value={totalValue}>
                        {totalValue}
                      </option>
                    );
                  })}
                </select>
              </>
            )}

            <select
              value={sortOption}
              onChange={(event) => onSortOptionChange(event.target.value as SortOption)}
              className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="submittedAt-asc">提出日: 早い順</option>
              <option value="submittedAt-desc">提出日: 遅い順</option>
              <option value="email-asc">学籍番号: A→Z</option>
              <option value="email-desc">学籍番号: Z→A</option>
            </select>

            {isGuest ? (
              <button
                onClick={onLoginClick}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-95"
              >
                ログイン
              </button>
            ) : (
              <>
                <a
                  href="/dashboard"
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  ダッシュボード
                </a>
                {isAdmin && (
                  <a
                    href="/admin/import"
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-95"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    新しいインポート
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        {/* 2行レイアウト (1131px〜1650px) */}
        <div className="hidden layout-lg:block layout-2xl:hidden">
          {/* 1行目: タイトル + アクションボタン */}
          <div className="flex h-14 items-center justify-between border-b border-gray-200">
            <h1 className="text-lg font-semibold text-gray-900">作品ギャラリー</h1>
            <div className="flex items-center gap-2">
              {isGuest ? (
                <button
                  onClick={onLoginClick}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-95"
                >
                  ログイン
                </button>
              ) : (
                <>
                  <a
                    href="/dashboard"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    ダッシュボード
                  </a>
                  {isAdmin && (
                    <a
                      href="/admin/import"
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-95"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      新しいインポート
                    </a>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 2行目: GallerySwitcher + フィルター・ソート */}
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <Suspense fallback={<div className="text-sm text-gray-500">読み込み中...</div>}>
                <GallerySwitcher />
              </Suspense>
            </div>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <div className="flex items-center gap-2">
                    {/* <span className="text-sm font-medium text-gray-700">フィルター:</span> */}
                    <div className="flex items-center gap-1.5">
                      {LABEL_DEFINITIONS.map((label) => {
                        const isSelected = selectedLabels.includes(label.type);
                        const buttonClasses = [
                          'flex items-center justify-center w-8 h-8 text-xs font-bold rounded-lg border-2 transition-all shadow-sm hover:shadow',
                          isSelected
                            ? `${label.bgColor} border-gray-400 scale-105`
                            : `bg-white border-gray-300 ${isTotalLabelFilterActive ? '' : 'hover:bg-gray-50 hover:border-gray-400'}`,
                          isTotalLabelFilterActive ? 'opacity-50 cursor-not-allowed' : '',
                        ]
                          .filter(Boolean)
                          .join(' ');

                        return (
                          <button
                            key={label.type}
                            onClick={() => onToggleLabelFilter(label.type)}
                            disabled={isTotalLabelFilterActive}
                            className={buttonClasses}
                            title={label.type}
                          >
                            <LabelBadge label={label.type} isActive={isSelected} className="h-5 w-5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <select
                    value={totalLabelFilter === null ? '' : String(totalLabelFilter)}
                    onChange={(event) => onTotalLabelFilterChange(event.target.value)}
                    className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">合計で絞り込み</option>
                    {Array.from({ length: 10 }, (_, index) => {
                      const totalValue = index + 1;
                      return (
                        <option key={totalValue} value={totalValue}>
                          {totalValue}
                        </option>
                      );
                    })}
                  </select>
                </>
              )}

              <select
                value={sortOption}
                onChange={(event) => onSortOptionChange(event.target.value as SortOption)}
                className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="submittedAt-asc">提出日: 早い順</option>
                <option value="submittedAt-desc">提出日: 遅い順</option>
                <option value="email-asc">学籍番号: A→Z</option>
                <option value="email-desc">学籍番号: Z→A</option>
              </select>
            </div>
          </div>
        </div>

        {/* 簡略レイアウト (1130px以下) */}
        <div className="layout-lg:hidden">
          {/* 1行目: タイトル + アクションボタン */}
          <div className="flex h-14 items-center justify-between border-b border-gray-200">
            <h1 className="text-lg font-semibold text-gray-900">作品ギャラリー</h1>
            <div className="flex items-center gap-2">
              {!isGuest && (
                <a
                  href="/dashboard"
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100"
                  title="ダッシュボード"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  <span className="hidden md:inline">ダッシュボード</span>
                </a>
              )}
              {isGuest ? (
                <button
                  onClick={onLoginClick}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700 active:scale-95"
                >
                  ログイン
                </button>
              ) : (
                isAdmin && (
                  <a
                    href="/admin/import"
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700 active:scale-95"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden md:inline">インポート</span>
                  </a>
                )
              )}
            </div>
          </div>

          {/* 2行目: GallerySwitcher + フィルター・ソート */}
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-2">
              <Suspense fallback={<div className="text-xs text-gray-500">読み込み中...</div>}>
                <GallerySwitcher />
              </Suspense>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <div className="relative">
                  <button
                    onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                    className="flex items-center gap-1.5 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 hover:bg-gray-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                    <span>フィルター</span>
                    {activeFilterCount > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {isFilterDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsFilterDropdownOpen(false)}
                      />
                      <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
                        <div className="space-y-4">
                          <div>
                            <h3 className="mb-2 text-sm font-semibold text-gray-900">ラベルフィルター</h3>
                            <div className="grid grid-cols-5 gap-2">
                              {LABEL_DEFINITIONS.map((label) => {
                                const isSelected = selectedLabels.includes(label.type);
                                const buttonClasses = [
                                  'flex flex-col items-center justify-center h-11 text-xs font-bold rounded-lg border-2 transition-all',
                                  isSelected
                                    ? `${label.bgColor} border-gray-400 shadow-md scale-105`
                                    : `bg-white border-gray-300 ${isTotalLabelFilterActive ? '' : 'hover:bg-gray-50 hover:border-gray-400 hover:shadow'}`,
                                  isTotalLabelFilterActive ? 'opacity-50 cursor-not-allowed' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ');

                                return (
                                  <button
                                    key={label.type}
                                    onClick={() => onToggleLabelFilter(label.type)}
                                    disabled={isTotalLabelFilterActive}
                                    className={buttonClasses}
                                  >
                                    <LabelBadge label={label.type} isActive={isSelected} className="h-6 w-6" />
                                    {/* <span className="mt-1 text-[10px] text-gray-600">{label.symbol}</span> */}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <h3 className="mb-2 text-sm font-semibold text-gray-900">合計で絞り込み</h3>
                            <select
                              value={totalLabelFilter === null ? '' : String(totalLabelFilter)}
                              onChange={(event) => onTotalLabelFilterChange(event.target.value)}
                              className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">選択してください</option>
                              {Array.from({ length: 10 }, (_, index) => {
                                const totalValue = index + 1;
                                return (
                                  <option key={totalValue} value={totalValue}>
                                    {totalValue}
                                  </option>
                                );
                              })}
                            </select>
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
                className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="submittedAt-asc">提出日: 早↑</option>
                <option value="submittedAt-desc">提出日: 遅↓</option>
                <option value="email-asc">学籍番号: A→Z</option>
                <option value="email-desc">学籍番号: Z→A</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default GalleryHeader;
