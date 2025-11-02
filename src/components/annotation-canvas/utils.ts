import { randomUUID } from './uuid';
import type { LineShape } from './types';

export const cloneLines = (source: LineShape[]): LineShape[] =>
  source.map((line) => ({
    ...line,
    points: [...line.points],
  }));

export const generateLineId = () => `line-${randomUUID()}`;
