'use client';

import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import type { Line as KonvaLineNode } from 'konva/lib/shapes/Line';
import { Layer, Line, Stage } from 'react-konva';
import { Image as KonvaImage } from 'react-konva';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';

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

type SaveOptions = { reason?: AnnotationSaveReason; force?: boolean };

export type AnnotationCanvasProps = {
  imageUrl: string;
  initialAnnotation?: AnnotationSavePayload | null;
  editable: boolean;
  onSave?: (annotation: AnnotationSavePayload | null) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
  saving?: boolean;
  className?: string;
  zoom: number;
  panPosition: { x: number; y: number };
  isPanDragging: boolean;
  onPanMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPanMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPanMouseUp: () => void;
};

type LineTool = 'draw' | 'erase';

type LineShape = {
  id: string;
  tool: LineTool;
  points: number[];
  stroke: string;
  strokeWidth: number;
  x: number;
  y: number;
};

type ToolMode = 'draw' | 'select' | 'pan' | 'erase';

const MAX_HISTORY_ENTRIES = 15;

const cloneLines = (source: LineShape[]): LineShape[] =>
  source.map((line) => ({
    ...line,
    points: [...line.points],
  }));

const DEFAULT_WIDTH = 840;
const DEFAULT_HEIGHT = 630;
export const DRAWING_LAYER_NAME = 'drawing-layer';

const COLOR_PRESETS = [
  { label: 'Black', value: '#000000' },
  { label: 'Red', value: '#EF4444' },
  { label: 'Blue', value: '#3B82F6' },
  { label: 'Green', value: '#22C55E' },
  { label: 'Yellow', value: '#FACC15' },
  { label: 'White', value: '#FFFFFF' },
] as const;

const BRUSH_WIDTH_OPTIONS = [
  { label: 'Thin', value: 2 },
  { label: 'Medium', value: 6 },
  { label: 'Thick', value: 12 },
] as const;

const MIN_CURSOR_DIAMETER = 4;
const MAX_CURSOR_DIAMETER = 128;

type CircleCursorStroke = {
  color: string;
  width: number;
};

type CircleCursorOptions = {
  diameter: number;
  fillColor?: string;
  innerStroke?: CircleCursorStroke;
  outerStroke?: CircleCursorStroke;
};

const createCircleCursor = (options: CircleCursorOptions): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const { diameter, fillColor, innerStroke, outerStroke } = options;
  const effectiveDiameter = Math.min(Math.max(diameter, MIN_CURSOR_DIAMETER), MAX_CURSOR_DIAMETER);
  const maxStrokeWidth = Math.max(outerStroke?.width ?? 0, innerStroke?.width ?? 0);
  const padding = Math.ceil((maxStrokeWidth || 0) / 2) + 2;
  const size = Math.ceil(effectiveDiameter + padding * 2);
  const deviceRatio =
    typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
      ? Math.min(Math.max(window.devicePixelRatio ?? 1, 1), 4)
      : 1;

  const canvas = document.createElement('canvas');
  canvas.width = size * deviceRatio;
  canvas.height = size * deviceRatio;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.scale(deviceRatio, deviceRatio);
  context.clearRect(0, 0, size, size);

  const center = size / 2;
  const radius = effectiveDiameter / 2;

  if (fillColor) {
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fillStyle = fillColor;
    context.fill();
  }

  if (outerStroke && outerStroke.width > 0) {
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.strokeStyle = outerStroke.color;
    context.lineWidth = outerStroke.width;
    context.stroke();
  }

  if (innerStroke && innerStroke.width > 0) {
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.strokeStyle = innerStroke.color;
    context.lineWidth = innerStroke.width;
    context.stroke();
  }

  const hotspot = Math.round(center);
  return `url(${canvas.toDataURL('image/png')}) ${hotspot} ${hotspot}, crosshair`;
};

const generateLineId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `line-${crypto.randomUUID()}`;
  }
  return `line-${Math.random().toString(36).slice(2)}-${Date.now()}`;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
    img.src = src;
  });

const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(function AnnotationCanvas(
  {
    imageUrl,
    initialAnnotation,
    editable,
    onSave,
    onDirtyChange,
    saving = false,
    className,
    zoom,
    panPosition,
    isPanDragging,
    onPanMouseDown,
    onPanMouseMove,
    onPanMouseUp,
  }: AnnotationCanvasProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<KonvaStage | null>(null);
  const isPointerDrawingRef = useRef(false);
  const historyRef = useRef<{ past: LineShape[][]; future: LineShape[][] }>({ past: [], future: [] });
  const indicatorTimeoutRef = useRef<number | null>(null);
  const saveAnnotationRef = useRef<(options?: SaveOptions) => Promise<void>>();

  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [displayScale, setDisplayScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const [lines, setLines] = useState<LineShape[]>([]);
  const [mode, setMode] = useState<ToolMode>('draw');
  const [brushColor, setBrushColor] = useState<string>(COLOR_PRESETS[0].value);
  const [brushWidth, setBrushWidth] = useState<number>(BRUSH_WIDTH_OPTIONS[1].value);
  const [eraserWidth, setEraserWidth] = useState<number>(BRUSH_WIDTH_OPTIONS[1].value);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [historyState, setHistoryState] = useState<{ canUndo: boolean; canRedo: boolean }>({
    canUndo: false,
    canRedo: false,
  });

  const clearIndicatorTimer = useCallback(() => {
    if (indicatorTimeoutRef.current !== null) {
      window.clearTimeout(indicatorTimeoutRef.current);
      indicatorTimeoutRef.current = null;
    }
  }, []);

  const markDirty = useCallback(
    (dirty: boolean) => {
      setIsDirty((prev) => (prev === dirty ? prev : dirty));
      onDirtyChange?.(dirty);
    },
    [onDirtyChange],
  );

  const resetHistory = useCallback(() => {
    historyRef.current.past = [];
    historyRef.current.future = [];
    setHistoryState({ canUndo: false, canRedo: false });
  }, []);

  const recordHistory = useCallback(() => {
    const snapshot = cloneLines(lines);
    const { past } = historyRef.current;
    past.push(snapshot);
    if (past.length > MAX_HISTORY_ENTRIES) {
      past.shift();
    }
    historyRef.current.future = [];
    setHistoryState({ canUndo: past.length > 0, canRedo: false });
  }, [lines]);

  const interactionsEnabled = editable && !saving && !isLoading;
  const isDrawMode = mode === 'draw';
  const isEraseMode = mode === 'erase';
  const isSelectMode = mode === 'select';
  const isPanMode = mode === 'pan';
  const isDrawingToolActive = isDrawMode || isEraseMode;
  const drawCursor = useMemo(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const zoomScale = Math.max(zoom, 0.1);
    const diameter = Math.max(brushWidth * zoomScale, MIN_CURSOR_DIAMETER);
    return createCircleCursor({
      diameter,
      fillColor: brushColor,
    });
  }, [brushColor, brushWidth, zoom]);
  const eraseCursor = useMemo(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const zoomScale = Math.max(zoom, 0.1);
    const diameter = Math.max(eraserWidth * zoomScale, MIN_CURSOR_DIAMETER);
    const strokeWidth = Math.min(Math.max(diameter * 0.12, 1), 3);
    return createCircleCursor({
      diameter,
      outerStroke: { color: 'rgba(17, 24, 39, 0.85)', width: strokeWidth },
    });
  }, [eraserWidth, zoom]);
  const containerCursor = useMemo(() => {
    if (!interactionsEnabled) {
      return 'default';
    }
    if (isPanMode) {
      return isPanDragging ? 'grabbing' : 'grab';
    }
    if (isEraseMode) {
      return eraseCursor ?? 'crosshair';
    }
    if (isDrawMode) {
      return drawCursor ?? 'crosshair';
    }
    if (isSelectMode) {
      return 'move';
    }
    return 'default';
  }, [
    drawCursor,
    eraseCursor,
    interactionsEnabled,
    isDrawMode,
    isEraseMode,
    isPanDragging,
    isPanMode,
    isSelectMode,
  ]);
  const stageCenter = useMemo(
    () =>
      stageSize
        ? { x: stageSize.width / 2, y: stageSize.height / 2 }
        : { x: 0, y: 0 },
    [stageSize],
  );
  const imageOffset = useMemo(
    () => {
      if (!stageSize || !displaySize) {
        return { x: 0, y: 0 };
      }
      return {
        x: (stageSize.width - displaySize.width) / 2,
        y: (stageSize.height - displaySize.height) / 2,
      };
    },
    [stageSize, displaySize],
  );
  const activeStrokeWidth = isEraseMode ? eraserWidth : brushWidth;
  const handleBrushWidthChange = useCallback(
    (value: number) => {
      if (isEraseMode) {
        setEraserWidth(value);
      } else {
        setBrushWidth(value);
      }
    },
    [isEraseMode],
  );

  useEffect(() => {
    if (!interactionsEnabled && isPanMode) {
      onPanMouseUp();
    }
  }, [interactionsEnabled, isPanMode, onPanMouseUp]);


  useEffect(() => {
    let cancelled = false;

    const prepareImage = async () => {
      setIsLoading(true);
      setBackgroundImage(null);
      setBaseSize(null);

      if (!imageUrl) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const img = await loadImage(imageUrl);
        if (cancelled) return;
        const width = img.naturalWidth || img.width || DEFAULT_WIDTH;
        const height = img.naturalHeight || img.height || DEFAULT_HEIGHT;
        setBackgroundImage(img);
        setBaseSize({ width, height });
      } catch (error) {
        console.error('[AnnotationCanvas] Failed to load background image:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    prepareImage();

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const updateDisplayLayout = useCallback(() => {
    const stage = stageRef.current;
    const container = containerRef.current;

    if (!container || !baseSize) {
      if (!baseSize && stage) {
        const safeWidth = DEFAULT_WIDTH;
        setDisplayScale({ x: 1, y: 1 });
        setDisplaySize({ width: safeWidth, height: DEFAULT_HEIGHT });
        stage.width(safeWidth);
        stage.height(DEFAULT_HEIGHT);
        stage.scale({ x: 1, y: 1 });
        stage.batchDraw();
      }
      return;
    }

    // コンテナ全体を使用するが、画像サイズ計算時にマージンを考慮
    const containerWidth = Math.max(container.clientWidth, 100);
    const containerHeight = Math.max(container.clientHeight, 100);

    // 画像サイズ計算用のマージン (以前のpaddingと同じ)
    const margin = 64; // 32px on each side
    const availableWidth = Math.max(containerWidth - margin, 100);
    const availableHeight = Math.max(containerHeight - margin, 100);

    // 幅と高さの両方を考慮して、画像が完全に収まる縮小率を計算
    const widthScale = baseSize.width > 0 ? availableWidth / baseSize.width : 1;
    const heightScale = baseSize.height > 0 ? availableHeight / baseSize.height : 1;
    const scale = Math.min(widthScale, heightScale, 1); // 1を超えて拡大しない

    // 画像の表示サイズ(中央配置用)
    const imageWidth = baseSize.width * scale;
    const imageHeight = baseSize.height * scale;

    setDisplayScale({ x: scale, y: scale });
    setDisplaySize({ width: imageWidth, height: imageHeight });
    setStageSize({ width: availableWidth, height: availableHeight });

    if (stage) {
      // Stageはコンテナ全体のサイズに設定
      stage.width(availableWidth);
      stage.height(availableHeight);
      stage.scale({ x: 1, y: 1 });
      stage.batchDraw();
    }
  }, [baseSize]);

  useEffect(() => {
    const id = requestAnimationFrame(updateDisplayLayout);
    return () => cancelAnimationFrame(id);
  }, [baseSize, updateDisplayLayout]);

  useEffect(() => {
    if (!baseSize) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      updateDisplayLayout();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [baseSize, updateDisplayLayout]);

  const applyAnnotation = useCallback(
    (payload: AnnotationSavePayload | null | undefined) => {
      if (!payload || !payload.data) {
        setLines([]);
        setSelectedId(null);
        markDirty(false);
        resetHistory();
        return;
      }

      try {
        const tempContainer =
          typeof document !== 'undefined' ? document.createElement('div') : undefined;
        const stageNode = Konva.Node.create(payload.data, tempContainer) as KonvaStage;
        const stageWidth = stageNode.width();
        const stageHeight = stageNode.height();
        const widthReference = payload.width || stageWidth || 1;
        const heightReference = payload.height || stageHeight || 1;
        const widthRatio = baseSize ? baseSize.width / widthReference : 1;
        const heightRatio = baseSize ? baseSize.height / heightReference : 1;
        const drawingLayer =
          stageNode.findOne<Konva.Layer>(`.${DRAWING_LAYER_NAME}`) ??
          stageNode.findOne<Konva.Layer>(`#${DRAWING_LAYER_NAME}`);

        const parsedLines: LineShape[] = drawingLayer
          ? (drawingLayer.find('Line') as KonvaLineNode[]).map((node) => {
              const id = node.id() || generateLineId();
              const stroke = node.stroke();
              const strokeColor = typeof stroke === 'string' ? stroke : '#ff0000';
              const compositeOperation = node.getAttr('globalCompositeOperation') as GlobalCompositeOperation | undefined;
              return {
                id,
                tool: compositeOperation === 'destination-out' ? 'erase' : 'draw',
                points: node.points(),
                stroke: strokeColor,
                strokeWidth: node.strokeWidth(),
                x: node.x(),
                y: node.y(),
              };
            })
          : [];

        stageNode.destroy();

        const normalizedLines = parsedLines.map((line) => ({
          ...line,
          points: line.points.map((value, idx) =>
            idx % 2 === 0 ? value * widthRatio : value * heightRatio,
          ),
          x: line.x * widthRatio,
          y: line.y * heightRatio,
          strokeWidth: line.strokeWidth * ((widthRatio + heightRatio) / 2),
        }));

        setLines(normalizedLines);
        setSelectedId(null);
        markDirty(false);
        clearIndicatorTimer();
        setAutoSaveStatus('idle');
        resetHistory();
      } catch (error) {
        console.error('[AnnotationCanvas] Failed to parse annotation JSON:', error);
        setLines([]);
        setSelectedId(null);
        markDirty(false);
        clearIndicatorTimer();
        setAutoSaveStatus('idle');
        resetHistory();
      }
    },
    [baseSize, clearIndicatorTimer, markDirty, resetHistory],
  );

  useEffect(() => {
    if (!baseSize) return;
    if (isDirty) return;
    applyAnnotation(initialAnnotation ?? null);
  }, [initialAnnotation, baseSize, applyAnnotation, isDirty]);

  useEffect(() => {
    const stageContainer = stageRef.current?.container();
    if (!stageContainer) return;

    stageContainer.style.touchAction = 'none';
    stageContainer.style.cursor = containerCursor;
  }, [containerCursor]);

  const deselectIfEmpty = useCallback((event: KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>) => {
    if (!stageRef.current) return;
    if (event.target === stageRef.current) {
      setSelectedId(null);
    }
  }, []);

  const getRelativePointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getRelativePointerPosition();
    if (!pointer) return null;
    const scaleX = displayScale.x || 1;
    const scaleY = displayScale.y || 1;
    return {
      x: (pointer.x - imageOffset.x) / scaleX,
      y: (pointer.y - imageOffset.y) / scaleY,
    };
  }, [displayScale, imageOffset]);

  const handlePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!interactionsEnabled) return;
      if (isPanMode) return;
      event.evt.preventDefault?.();

      if (!isDrawingToolActive) {
        deselectIfEmpty(event);
        return;
      }

      const pointer = getRelativePointerPosition();
      if (!pointer) return;

      recordHistory();
      isPointerDrawingRef.current = true;
      const scaleX = displayScale.x || 1;
      const scaleY = displayScale.y || 1;
      const averageScale = (scaleX + scaleY) / 2 || 1;
      const strokeWidth = (isEraseMode ? eraserWidth : brushWidth) / averageScale;
      const strokeColor = isEraseMode ? 'rgba(0,0,0,1)' : brushColor;
      const newLine: LineShape = {
        id: generateLineId(),
        tool: isEraseMode ? 'erase' : 'draw',
        points: [pointer.x, pointer.y],
        stroke: strokeColor,
        strokeWidth,
        x: 0,
        y: 0,
      };

      setLines((prev) => [...prev, newLine]);
      setSelectedId(null);
      markDirty(true);
    },
    [
      brushColor,
      brushWidth,
      deselectIfEmpty,
      displayScale,
      eraserWidth,
      getRelativePointerPosition,
      interactionsEnabled,
      isDrawingToolActive,
      isEraseMode,
      isPanMode,
      markDirty,
      recordHistory,
    ],
  );

  const handlePointerMove = useCallback((event?: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event?.evt.preventDefault?.();
    if (!isPointerDrawingRef.current) return;
    if (!interactionsEnabled || !isDrawingToolActive) return;

    const pointer = getRelativePointerPosition();
    if (!pointer) return;

    setLines((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const lastLine = updated[updated.length - 1];
      updated[updated.length - 1] = {
        ...lastLine,
        points: [...lastLine.points, pointer.x, pointer.y],
      };
      return updated;
    });
  }, [getRelativePointerPosition, interactionsEnabled, isDrawingToolActive]);

  const finishDrawing = useCallback((event?: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event?.evt.preventDefault?.();
    isPointerDrawingRef.current = false;
  }, []);

  const handlePanMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!interactionsEnabled || !isPanMode) return;
      event.preventDefault();
      onPanMouseDown(event);
    },
    [interactionsEnabled, isPanMode, onPanMouseDown],
  );

  const handlePanMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!interactionsEnabled || !isPanMode) return;
      event.preventDefault();
      onPanMouseMove(event);
    },
    [interactionsEnabled, isPanMode, onPanMouseMove],
  );

  const handlePanMouseUp = useCallback(() => {
    if (!isPanMode) return;
    onPanMouseUp();
  }, [isPanMode, onPanMouseUp]);

  const handleLineSelect = useCallback(
    (id: string) => {
      if (!interactionsEnabled || !isSelectMode) return;
      setSelectedId(id);
    },
    [interactionsEnabled, isSelectMode],
  );

  const handleLineDragStart = useCallback(
    (id: string) => {
      if (!interactionsEnabled || !isSelectMode) return;
      recordHistory();
      if (selectedId !== id) {
        setSelectedId(id);
      }
    },
    [interactionsEnabled, isSelectMode, recordHistory, selectedId],
  );

  const handleLineDragMove = useCallback(
    (id: string, event: KonvaEventObject<DragEvent>) => {
      const { x, y } = event.target.position();
      event.evt.preventDefault?.();
      const scaleX = displayScale.x || 1;
      const scaleY = displayScale.y || 1;
      const baseX = x / scaleX;
      const baseY = y / scaleY;
      setLines((prev) =>
        prev.map((line) => (line.id === id ? { ...line, x: baseX, y: baseY } : line)),
      );
      markDirty(true);
    },
    [displayScale, markDirty],
  );

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    recordHistory();
    setLines((prev) => prev.filter((line) => line.id !== selectedId));
    setSelectedId(null);
    markDirty(true);
  };

  const handleClearAll = () => {
    if (lines.length === 0) return;
    recordHistory();
    setLines([]);
    setSelectedId(null);
    markDirty(true);
  };

  const handleUndo = useCallback(() => {
    if (!interactionsEnabled) return;

    const { past, future } = historyRef.current;
    if (past.length === 0) {
      return;
    }

    const previousSnapshot = past.pop();
    if (!previousSnapshot) {
      return;
    }

    future.push(cloneLines(lines));
    if (future.length > MAX_HISTORY_ENTRIES) {
      future.shift();
    }

    setLines(cloneLines(previousSnapshot));
    setSelectedId(null);
    markDirty(true);
    setHistoryState({
      canUndo: past.length > 0,
      canRedo: future.length > 0,
    });
  }, [interactionsEnabled, lines, markDirty]);

  const handleRedo = useCallback(() => {
    if (!interactionsEnabled) return;

    const { past, future } = historyRef.current;
    if (future.length === 0) {
      return;
    }

    const nextSnapshot = future.pop();
    if (!nextSnapshot) {
      return;
    }

    past.push(cloneLines(lines));
    if (past.length > MAX_HISTORY_ENTRIES) {
      past.shift();
    }

    setLines(cloneLines(nextSnapshot));
    setSelectedId(null);
    markDirty(true);
    setHistoryState({
      canUndo: past.length > 0,
      canRedo: future.length > 0,
    });
  }, [interactionsEnabled, lines, markDirty]);

  const handleSetMode = useCallback(
    (nextMode: ToolMode) => {
      setMode((prev) => {
        if (prev === nextMode) {
          return prev;
        }
        if (prev === 'pan' && nextMode !== 'pan') {
          onPanMouseUp();
        }
        if (nextMode !== 'select') {
          setSelectedId(null);
        }
        return nextMode;
      });
    },
    [onPanMouseUp],
  );

  const saveAnnotation = useCallback(
    async (options?: SaveOptions) => {
      if (!editable || !onSave) return;
      if (saving) return;

      const stage = stageRef.current;
      if (!stage) return;

      if (!isDirty && !options?.force) {
        return;
      }

      const reason = options?.reason ?? 'manual';
      const isAutoReason = reason !== 'manual';

      if (isAutoReason) {
        clearIndicatorTimer();
        setAutoSaveStatus('saving');
      }

      const hasLines = lines.length > 0;
      let payload: AnnotationSavePayload | null = null;

      if (hasLines && baseSize) {
        // 保存前にStageとLayerの状態を一時的に変更
        const drawingLayer = stage.findOne(`#${DRAWING_LAYER_NAME}`);
        const backgroundLayer = stage.findOne('.background-layer');
        const backgroundImageNode = backgroundLayer?.findOne('Image');

        // 元の状態を保存
        const originalStageSize = { width: stage.width(), height: stage.height() };
        const originalDrawingOffset = drawingLayer ? { x: drawingLayer.x(), y: drawingLayer.y() } : null;
        const originalBackgroundOffset = backgroundLayer ? { x: backgroundLayer.x(), y: backgroundLayer.y() } : null;
        const originalImageSize = backgroundImageNode
          ? { width: backgroundImageNode.width(), height: backgroundImageNode.height() }
          : null;

        // Stageサイズを元画像サイズに変更
        stage.width(baseSize.width);
        stage.height(baseSize.height);

        // 背景画像サイズを元画像サイズに変更
        if (backgroundImageNode) {
          backgroundImageNode.width(baseSize.width);
          backgroundImageNode.height(baseSize.height);
        }

        // Layerオフセットを削除
        if (drawingLayer) {
          drawingLayer.x(0);
          drawingLayer.y(0);
        }
        if (backgroundLayer) {
          backgroundLayer.x(0);
          backgroundLayer.y(0);
        }

        payload = {
          data: stage.toJSON(),
          width: baseSize.width,
          height: baseSize.height,
        };

        // 状態を復元
        stage.width(originalStageSize.width);
        stage.height(originalStageSize.height);

        if (backgroundImageNode && originalImageSize) {
          backgroundImageNode.width(originalImageSize.width);
          backgroundImageNode.height(originalImageSize.height);
        }

        if (drawingLayer && originalDrawingOffset) {
          drawingLayer.x(originalDrawingOffset.x);
          drawingLayer.y(originalDrawingOffset.y);
        }
        if (backgroundLayer && originalBackgroundOffset) {
          backgroundLayer.x(originalBackgroundOffset.x);
          backgroundLayer.y(originalBackgroundOffset.y);
        }
      }

      try {
        await onSave(payload);
        markDirty(false);

        if (isAutoReason) {
          setAutoSaveStatus('saved');
          indicatorTimeoutRef.current = window.setTimeout(() => {
            setAutoSaveStatus('idle');
            indicatorTimeoutRef.current = null;
          }, 2000);
        }
      } catch (error) {
        if (isAutoReason) {
          setAutoSaveStatus('idle');
        }
        throw error;
      }
    },
    [
      baseSize,
      clearIndicatorTimer,
      editable,
      isDirty,
      lines.length,
      markDirty,
      onSave,
      saving,
    ],
  );

  const handleManualSave = useCallback(() => {
    void saveAnnotation({ reason: 'manual' });
  }, [saveAnnotation]);

  useEffect(() => {
    saveAnnotationRef.current = saveAnnotation;
    return () => {
      saveAnnotationRef.current = undefined;
    };
  }, [saveAnnotation]);

  useEffect(() => {
    return () => {
      clearIndicatorTimer();
    };
  }, [clearIndicatorTimer]);

  const controlsDisabled = useMemo(
    () => !editable || isLoading || saving,
    [editable, isLoading, saving],
  );
  const { canUndo, canRedo } = historyState;

  const scaleX = displayScale.x || 1;
  const scaleY = displayScale.y || 1;
  const averageScale = (scaleX + scaleY) / 2 || 1;

  useImperativeHandle(
    ref,
    () => ({
      save: (options?: SaveOptions) => saveAnnotation(options),
      hasDirtyChanges: () => isDirty,
    }),
    [isDirty, saveAnnotation],
  );

  return (
    <div className={`relative h-full w-full ${className || ''}`}>
      {!editable && (
        <div className="mb-2 text-sm text-gray-500">Annotations are read-only. Please sign in as an administrator to edit.</div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full flex items-center justify-center overflow-hidden bg-gray-100"
        style={{ cursor: containerCursor }}
        onMouseDown={isPanMode ? handlePanMouseDown : undefined}
        onMouseMove={isPanMode ? handlePanMouseMove : undefined}
        onMouseUp={isPanMode ? handlePanMouseUp : undefined}
        onMouseLeave={isPanMode ? handlePanMouseUp : undefined}
      >
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        )}
        {backgroundImage && baseSize && displaySize && stageSize && (
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            scaleX={zoom}
            scaleY={zoom}
            x={stageCenter.x + panPosition.x}
            y={stageCenter.y + panPosition.y}
            offsetX={stageCenter.x}
            offsetY={stageCenter.y}
            listening={interactionsEnabled}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
            onMouseMove={handlePointerMove}
            onTouchMove={handlePointerMove}
            onMouseUp={finishDrawing}
            onTouchEnd={finishDrawing}
            onMouseLeave={finishDrawing}
            onTouchCancel={finishDrawing}
          >
            <Layer name="background-layer" x={imageOffset.x} y={imageOffset.y}>
              <KonvaImage
                image={backgroundImage}
                width={displaySize.width}
                height={displaySize.height}
                listening={false}
              />
            </Layer>
            <Layer
              name={DRAWING_LAYER_NAME}
              id={DRAWING_LAYER_NAME}
              x={imageOffset.x}
              y={imageOffset.y}
              clipFunc={(ctx) => {
                ctx.rect(0, 0, displaySize.width, displaySize.height);
              }}
            >
              {lines.map((line) => (
                <Line
                  key={line.id}
                  id={line.id}
                  points={line.points.map((value, index) =>
                    index % 2 === 0 ? value * scaleX : value * scaleY,
                  )}
                  stroke={line.stroke}
                  strokeWidth={line.strokeWidth * averageScale}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.5}
                  x={line.x * scaleX}
                  y={line.y * scaleY}
                  globalCompositeOperation={line.tool === 'erase' ? 'destination-out' : 'source-over'}
                  listening={line.tool === 'draw'}
                  draggable={interactionsEnabled && isSelectMode && line.tool === 'draw'}
                  hitStrokeWidth={Math.max(line.strokeWidth * averageScale * 2, 20)}
                  opacity={line.tool === 'erase' ? 1 : saving ? 0.7 : 1}
                  onMouseDown={(event) => {
                    if (!isSelectMode || line.tool !== 'draw') return;
                    event.cancelBubble = true;
                    handleLineSelect(line.id);
                  }}
                  onTouchStart={(event) => {
                    if (!isSelectMode || line.tool !== 'draw') return;
                    event.cancelBubble = true;
                    handleLineSelect(line.id);
                  }}
                  onDragStart={() => line.tool === 'draw' && handleLineDragStart(line.id)}
                  onDragMove={(event) =>
                    line.tool === 'draw' &&
                    handleLineDragMove(line.id, event as KonvaEventObject<DragEvent>)
                  }
                  onDragEnd={() => line.tool === 'draw' && markDirty(true)}
                  shadowColor={selectedId === line.id && line.tool === 'draw' ? '#2b6cb0' : undefined}
                  shadowBlur={selectedId === line.id && line.tool === 'draw' ? 10 : 0}
                />
              ))}
            </Layer>
          </Stage>
        )}
      </div>
      {editable && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[95%]">
          <div className="rounded-lg bg-gray-700 bg-opacity-90 backdrop-blur-sm px-3 py-2 shadow-lg">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSetMode('draw')}
                  disabled={controlsDisabled}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    isDrawMode
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  } ${controlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => handleSetMode('select')}
                  disabled={controlsDisabled}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    isSelectMode
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  } ${controlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => handleSetMode('erase')}
                  disabled={controlsDisabled}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    isEraseMode
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  } ${controlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  Erase
                </button>
                <button
                  type="button"
                  onClick={() => handleSetMode('pan')}
                  disabled={controlsDisabled}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    isPanMode
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  } ${controlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  Pan
                </button>
              </div>
              <div className="h-4 w-px bg-gray-500" />
              <div className="flex items-center gap-1">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = brushColor.toLowerCase() === preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setBrushColor(preset.value)}
                      disabled={controlsDisabled}
                      className={`h-5 w-5 rounded-full border-2 transition ${
                        isSelected
                          ? 'border-blue-400 ring-2 ring-blue-300'
                          : 'border-gray-400 hover:border-gray-300'
                      } ${controlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                      style={{ backgroundColor: preset.value }}
                      title={preset.label}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                {BRUSH_WIDTH_OPTIONS.map((option) => {
                  const isSelected = activeStrokeWidth === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleBrushWidthChange(option.value)}
                      disabled={controlsDisabled}
                      className={`rounded px-2 py-1 text-xs transition ${
                        isSelected
                          ? 'bg-gray-800 text-white'
                          : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                      } ${controlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="h-4 w-px bg-gray-500" />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={controlsDisabled || !canUndo}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    controlsDisabled || !canUndo
                      ? 'cursor-not-allowed bg-gray-700 text-gray-500'
                      : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  }`}
                  title="Undo"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={controlsDisabled || !canRedo}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    controlsDisabled || !canRedo
                      ? 'cursor-not-allowed bg-gray-700 text-gray-500'
                      : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  }`}
                  title="Redo"
                >
                  Redo
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={controlsDisabled || !selectedId}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    controlsDisabled || !selectedId
                      ? 'cursor-not-allowed bg-gray-700 text-gray-500'
                      : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  }`}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={controlsDisabled || lines.length === 0}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    controlsDisabled || lines.length === 0
                      ? 'cursor-not-allowed bg-gray-700 text-gray-500'
                      : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  }`}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleManualSave}
                  disabled={controlsDisabled || !isDirty}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    controlsDisabled || !isDirty
                      ? 'cursor-not-allowed bg-gray-700 text-gray-500'
                      : 'bg-blue-600 text-white hover:bg-blue-500'
                  }`}
                >
                  Save
                </button>
                {autoSaveStatus !== 'idle' && (
                  <span
                    className={`text-xs ${
                      autoSaveStatus === 'saving' ? 'text-blue-300' : 'text-green-300'
                    }`}
                  >
                    {autoSaveStatus === 'saving' ? 'Saving...' : 'Saved'}
                  </span>
                )}
              </div>
            </div>
            {isDirty && (
              <div className="mt-1 text-center text-xs text-orange-300">
                {saving ? 'Saving...' : 'Unsaved changes'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default AnnotationCanvas;
