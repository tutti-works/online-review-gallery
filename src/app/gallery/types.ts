import type { LabelType } from '@/types';

export type SortOption = 'submittedAt-desc' | 'submittedAt-asc' | 'email-asc' | 'email-desc';

export type LabelFilterState = {
  selectedLabels: LabelType[];
  totalLabelFilter: number | null;
};
