import type { MouseEvent as ReactMouseEvent } from 'react';

export type AnnotationSavePayload = {
  data: string;
  width: number;
  height: number;
};

export type AnnotationSaveReason = 'manual' | 'idle' | 'page-change' | 'mode-exit';

export type AnnotationCanvasHandle = {
  save: (options?: { reason?: AnnotationSaveReason; force?: boolean }) => Promise<void>;
  hasDirtyChanges: () => boolean;
};

export type LineTool = 'draw' | 'erase';

export type LineShape = {
  id: string;
  tool: LineTool;
  points: number[];
  stroke: string;
  strokeWidth: number;
  x: number;
  y: number;
};

export type ToolMode = 'draw' | 'select' | 'pan' | 'erase';

export type Size = { width: number; height: number };
export type Position = { x: number; y: number };
export type AnnotationCanvasProps = {
  imageUrl: string;
  imageCacheKey?: string;
  initialAnnotation?: AnnotationSavePayload | null;
  editable: boolean;
  onSave?: (annotation: AnnotationSavePayload | null) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
  saving?: boolean;
  className?: string;
  zoom: number;
  panPosition: Position;
  isPanDragging: boolean;
  onPanMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPanMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPanMouseUp: () => void;
};
