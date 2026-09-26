'use client';
import { Suspense, useState } from 'react';
import { SlidersHorizontal, ArrowUpRight } from 'lucide-react';
import GallerySwitcher from '@/components/GallerySwitcher';
import LabelBadge from '@/components/labels/LabelBadge';
import { LABEL_DEFINITIONS } from '@/constants/labels';
import { getVisibleLabelFilterOptions } from '@/lib/reviewLabels';
import type { LabelType, Gallery } from '@/types';
import type { GalleryMode } from '@/lib/courseArchive';
import type { SortOption } from '../types';
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

export default function GalleryHeader(props: GalleryHeaderProps) {
  const [open, setOpen] = useState(false);
  const options = getVisibleLabelFilterOptions(
    props.availableLabels,
    props.availableTotals,
    props.selectedLabels,
    props.totalLabelFilter
  );
  const count =
    props.selectedLabels.length +
    (props.isTotalLabelFilterActive ? 1 : 0) +
    (props.hideIncomplete ? 1 : 0);
  return (
    <header className="exhibition-header">
      <div className="exhibition-intro">
        <div>
          <h1>
            {props.mode === 'archive'
              ? 'THE ARCHIVE'
              : 'THE COLLECTION'}
          </h1>
          <p className="exhibition-description">
            Take time to explore each unique perspective. Open a work and start a conversation.
          </p>
        </div>
      </div>
      <div className="exhibition-toolbar">
        <Suspense fallback={<span>授業を読み込み中…</span>}>
          <GallerySwitcher
            galleries={props.galleries}
            currentGalleryId={props.currentGalleryId}
            mode={props.mode}
          />
        </Suspense>
        <div className="exhibition-tools">
          {props.userRole === 'admin' && (
            <button
              className="atelier-filter"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls="review-filters"
            >
              <SlidersHorizontal size={16} />
              フィルター{count > 0 && <span>{count}</span>}
            </button>
          )}
          <select
            aria-label="作品の並び順"
            value={props.sortOption}
            onChange={(e) =>
              props.onSortOptionChange(e.target.value as SortOption)
            }
          >
            <option value="submittedAt-asc">提出日：早い順</option>
            <option value="submittedAt-desc">提出日：遅い順</option>
            <option value="email-asc">学籍番号：A → Z</option>
            <option value="email-desc">学籍番号：Z → A</option>
          </select>
          {props.userRole === 'guest' && (
            <button className="atelier-filter" onClick={props.onLoginClick}>
              ログイン
              <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </div>
      {open && props.userRole === 'admin' && (
        <div className="exhibition-filters" id="review-filters">
          <div className="flex flex-wrap gap-2">
            {LABEL_DEFINITIONS.filter((l) => options.labels.has(l.type)).map(
              (l) => (
                <button
                  key={l.type}
                  disabled={props.isTotalLabelFilterActive}
                  aria-label={l.type + 'で絞り込み'}
                  aria-pressed={props.selectedLabels.includes(l.type)}
                  onClick={() => props.onToggleLabelFilter(l.type)}
                >
                  <LabelBadge
                    label={l.type}
                    isActive={props.selectedLabels.includes(l.type)}
                  />
                </button>
              )
            )}
          </div>
          <select
            aria-label="合計点で絞り込み"
            value={props.totalLabelFilter ?? ''}
            onChange={(e) => props.onTotalLabelFilterChange(e.target.value)}
          >
            <option value="">合計点：すべて</option>
            {options.totals.map((n) => (
              <option key={n} value={n}>
                {n}点
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={props.hideIncomplete}
              onChange={(e) => props.onHideIncompleteChange(e.target.checked)}
            />{' '}
            未提出・エラーを非表示（{props.incompleteCount}件）
          </label>
        </div>
      )}
    </header>
  );
}
