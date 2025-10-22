'use client';

import { Suspense } from 'react';
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

  return (
    <header className="bg-white shadow-sm">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">作品ギャラリー</h1>
          <div className="flex items-center space-x-4">
            <Suspense fallback={<div className="text-sm text-gray-500">読み込み中...</div>}>
              <GallerySwitcher />
            </Suspense>

            {isAdmin && (
              <>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-700">フィルター:</span>
                  <div className="flex items-center space-x-1">
                    {LABEL_DEFINITIONS.map((label) => {
                      const isSelected = selectedLabels.includes(label.type);
                      const buttonClasses = [
                        'flex items-center justify-center w-7 h-7 text-xs font-bold rounded border transition-colors',
                        isSelected
                          ? `${label.bgColor} border-gray-300`
                          : `bg-white border-gray-300 ${isTotalLabelFilterActive ? '' : 'hover:bg-gray-50'}`,
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
                          <LabelBadge label={label.type} isActive={isSelected} className="h-5 w-5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <select
                  value={totalLabelFilter === null ? '' : String(totalLabelFilter)}
                  onChange={(event) => onTotalLabelFilterChange(event.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="submittedAt-asc">提出日: 早い順</option>
              <option value="submittedAt-desc">提出日: 遅い順</option>
              <option value="email-asc">学籍番号: A→Z</option>
              <option value="email-desc">学籍番号: Z→A</option>
            </select>

            {isGuest ? (
              <button
                onClick={onLoginClick}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                ログイン
              </button>
            ) : (
              <>
                <a href="/dashboard" className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
                  ダッシュボード
                </a>
                {isAdmin && (
                  <a
                    href="/admin/import"
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    新しいインポート
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default GalleryHeader;
