import type { LabelType } from '@/types';

const LABEL_PATTERN = /^(red|blue|green)-([1-5])$/;

export const isReviewLabel = (value: unknown): value is LabelType =>
  typeof value === 'string' && LABEL_PATTERN.test(value);

export const toggleColorLabel = (labels: unknown, selected: LabelType): LabelType[] => {
  const current = Array.isArray(labels) ? labels.filter((value): value is LabelType => typeof value === 'string') : [];
  const color = selected.split('-')[0];
  const sameColor = current.filter((value) => value.startsWith(`${color}-`));
  const otherColors = current.filter((value) => !value.startsWith(`${color}-`));
  return sameColor.length === 1 && sameColor[0] === selected ? otherColors : [...otherColors, selected];
};

export const getLabelTotal = (labels: unknown): number => {
  if (!Array.isArray(labels)) return 0;
  const scores = new Map<string, number>();
  for (const label of labels) {
    if (!isReviewLabel(label)) continue;
    const [color, score] = label.split('-');
    scores.set(color, Number(score));
  }
  return Array.from(scores.values()).reduce((sum, score) => sum + score, 0);
};

export const matchesAnyLabel = (labels: unknown, selected: LabelType[]): boolean =>
  Array.isArray(labels) && selected.some((label) => labels.includes(label));

export const getGalleryLabelOptions = (artworks: { labels?: unknown }[]) => {
  const labels = new Set<LabelType>();
  const totals = new Set<number>();
  for (const artwork of artworks) {
    if (Array.isArray(artwork.labels)) {
      artwork.labels.forEach((label) => {
        if (isReviewLabel(label)) labels.add(label);
      });
    }
    const total = getLabelTotal(artwork.labels);
    if (total > 0) totals.add(total);
  }
  return { labels, totals: Array.from(totals).sort((a, b) => a - b) };
};
