export type PerfectDrawStrategy = 'always' | 'never' | 'drawing' | 'dynamic';

const parseFiniteNumber = (value: string | undefined, fallback: number): number => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolvePerfectDrawEnabled = (): boolean => {
  const featureFlag = process.env.NEXT_PUBLIC_FEATURE_PERFECT_DRAW_HYBRID;
  if (featureFlag === 'true') {
    return true;
  }
  if (featureFlag === 'false') {
    return false;
  }
  const explicit = process.env.NEXT_PUBLIC_PERFECT_DRAW;
  if (explicit === 'true') {
    return true;
  }
  if (explicit === 'false') {
    return false;
  }
  return true;
};

const resolvePerfectDrawStrategy = (): PerfectDrawStrategy => {
  const raw = process.env.NEXT_PUBLIC_PERFECT_DRAW_STRATEGY;
  switch (raw) {
    case 'always':
    case 'never':
    case 'drawing':
    case 'dynamic':
      return raw;
    default:
      return 'dynamic';
  }
};

export const ANNOTATION_CONFIG = {
  perfectDraw: {
    enabled: resolvePerfectDrawEnabled(),
    strategy: resolvePerfectDrawStrategy(),
    pointThreshold: parseFiniteNumber(process.env.NEXT_PUBLIC_PERFECT_DRAW_POINT_THRESHOLD, 5000),
    lineThreshold: parseFiniteNumber(process.env.NEXT_PUBLIC_PERFECT_DRAW_LINE_THRESHOLD, 100),
    debug: process.env.NEXT_PUBLIC_PERFECT_DRAW_DEBUG === 'true',
  },
} as const;

export type AnnotationPerfectDrawConfig = typeof ANNOTATION_CONFIG.perfectDraw;
