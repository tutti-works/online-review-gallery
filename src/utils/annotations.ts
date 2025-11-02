import { DRAWING_LAYER_NAME } from '@/components/annotation-canvas/constants';
import type { ArtworkAnnotationLine } from '@/types';

type StageNode = {
  attrs?: Record<string, unknown>;
  className?: string;
  children?: StageNode[];
};

const ensureNumberArray = (values: unknown): number[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.reduce<number[]>((acc, value) => {
    const asNumber = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(asNumber)) {
      acc.push(asNumber);
    }
    return acc;
  }, []);
};

const resolveLineId = (rawId: unknown): string => {
  if (typeof rawId === 'string' && rawId.trim().length > 0) {
    return rawId;
  }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const resolveLineTool = (attrs: Record<string, unknown>): 'draw' | 'erase' => {
  const compositeOp = attrs.globalCompositeOperation;
  if (compositeOp === 'destination-out') {
    return 'erase';
  }
  const rawTool = attrs.tool;
  return rawTool === 'erase' ? 'erase' : 'draw';
};

const resolveNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

export const extractLinesFromStageJSON = (stageJSON: string): ArtworkAnnotationLine[] => {
  try {
    const stageData = JSON.parse(stageJSON) as StageNode;
    const layers = Array.isArray(stageData?.children) ? stageData.children : [];
    const drawingLayer = layers.find((layer) => {
      const attrs = layer?.attrs ?? {};
      const name = typeof attrs?.name === 'string' ? attrs.name : undefined;
      const id = typeof attrs?.id === 'string' ? attrs.id : undefined;
      return name === DRAWING_LAYER_NAME || id === DRAWING_LAYER_NAME;
    });

    if (!drawingLayer || !Array.isArray(drawingLayer.children)) {
      return [];
    }

    return drawingLayer.children
      .filter((child): child is StageNode => Boolean(child) && child.className === 'Line' && typeof child.attrs === 'object')
      .map((child) => {
        const attrs = (child.attrs ?? {}) as Record<string, unknown>;
        return {
          id: resolveLineId(attrs.id),
          tool: resolveLineTool(attrs),
          points: ensureNumberArray(attrs.points),
          stroke: typeof attrs.stroke === 'string' ? attrs.stroke : '#000000',
          strokeWidth: resolveNumber(attrs.strokeWidth, 1),
          x: resolveNumber(attrs.x, 0),
          y: resolveNumber(attrs.y, 0),
        };
      });
  } catch (error) {
    console.error('[annotations] Failed to parse Stage JSON:', error);
    return [];
  }
};

export const convertLinesToStageJSON = (
  lines: ArtworkAnnotationLine[],
  width: number,
  height: number,
): string => {
  const stageData = {
    attrs: {
      width,
      height,
    },
    className: 'Stage',
    children: [
      {
        attrs: { name: 'background-layer' },
        className: 'Layer',
        children: [],
      },
      {
        attrs: { name: DRAWING_LAYER_NAME, id: DRAWING_LAYER_NAME },
        className: 'Layer',
        children: lines.map((line) => ({
          className: 'Line',
          attrs: {
            id: line.id,
            tool: line.tool,
            points: Array.isArray(line.points) ? line.points : [],
            stroke: line.stroke,
            strokeWidth: line.strokeWidth,
            x: line.x ?? 0,
            y: line.y ?? 0,
            lineCap: 'round',
            lineJoin: 'round',
            tension: 0.5,
            globalCompositeOperation: line.tool === 'erase' ? 'destination-out' : 'source-over',
            listening: line.tool === 'draw',
            draggable: false,
          },
        })),
      },
    ],
  };

  return JSON.stringify(stageData);
};
