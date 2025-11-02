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

type LineShape = {
  id: string;
  points: number[];
  stroke: string;
  strokeWidth: number;
  x: number;
  y: number;
};

type ToolMode = 'draw' | 'select' | 'pan';

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
  const [displayScale, setDisplayScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const [lines, setLines] = useState<LineShape[]>([]);
  const [mode, setMode] = useState<ToolMode>('draw');
  const [brushColor, setBrushColor] = useState<string>(COLOR_PRESETS[0].value);
  const [brushWidth, setBrushWidth] = useState<number>(BRUSH_WIDTH_OPTIONS[1].value);
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
  const isSelectMode = mode === 'select';
  const isPanMode = mode === 'pan';
  const containerCursor = useMemo(() => {
    if (!interactionsEnabled) {
      return 'default';
    }
    if (isPanMode) {
      return isPanDragging ? 'grabbing' : 'grab';
    }
    if (isDrawMode) {
      return 'crosshair';
    }
    return 'move';
  }, [interactionsEnabled, isDrawMode, isPanDragging, isPanMode]);
  const stageCenter = useMemo(
    () =>
      displaySize
        ? { x: displaySize.width / 2, y: displaySize.height / 2 }
        : { x: 0, y: 0 },
    [displaySize],
  );

  useEffect(() => {
    if (!interactionsEnabled && isPanMode) {
      onPanMouseUp();
    }
  }, [interactionsEnabled, isPanMode, onPanMouseUp]);

  const displayHeight = useMemo(
    () => displaySize?.height ?? baseSize?.height ?? DEFAULT_HEIGHT,
    [displaySize, baseSize],
  );

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
    const rawContainerWidth = containerRef.current?.clientWidth ?? 0;
    const fallbackWidth = baseSize?.width ?? DEFAULT_WIDTH;
    const containerWidth = rawContainerWidth > 0 ? rawContainerWidth : fallbackWidth;

    if (!baseSize) {
      const safeWidth = containerWidth || DEFAULT_WIDTH;
      setDisplayScale({ x: 1, y: 1 });
      setDisplaySize({ width: safeWidth, height: DEFAULT_HEIGHT });
      if (stage) {
        stage.width(safeWidth);
        stage.height(DEFAULT_HEIGHT);
        stage.scale({ x: 1, y: 1 });
        stage.batchDraw();
      }
      return;
    }

    const widthScale =
      baseSize.width > 0 ? Math.max(containerWidth / baseSize.width, 0.01) : 1;
    const width = containerWidth;
    const height = baseSize.height * widthScale;
    const heightScale =
      baseSize.height > 0 ? Math.max(height / baseSize.height, 0.01) : widthScale;

    setDisplayScale({ x: widthScale, y: heightScale });
    setDisplaySize({ width, height });

    if (stage) {
      stage.width(width);
      stage.height(height);
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
              return {
                id,
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

    if (!interactionsEnabled) {
      stageContainer.style.cursor = 'default';
      return;
    }

    if (isPanMode) {
      stageContainer.style.cursor = isPanDragging ? 'grabbing' : 'grab';
      return;
    }

    stageContainer.style.cursor = isDrawMode ? 'crosshair' : 'move';
  }, [interactionsEnabled, isDrawMode, isPanDragging, isPanMode]);

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
      x: pointer.x / scaleX,
      y: pointer.y / scaleY,
    };
  }, [displayScale]);

  const handlePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!interactionsEnabled) return;
      if (isPanMode) return;
      event.evt.preventDefault?.();

      if (!isDrawMode) {
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
      const newLine: LineShape = {
        id: generateLineId(),
        points: [pointer.x, pointer.y],
        stroke: brushColor,
        strokeWidth: brushWidth / averageScale,
        x: 0,
        y: 0,
      };

      setLines((prev) => [...prev, newLine]);
      setSelectedId(null);
      markDirty(true);
    },
    [brushColor, brushWidth, deselectIfEmpty, displayScale, getRelativePointerPosition, interactionsEnabled, isDrawMode, isPanMode, markDirty, recordHistory],
  );

  const handlePointerMove = useCallback((event?: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event?.evt.preventDefault?.();
    if (!isPointerDrawingRef.current) return;
    if (!interactionsEnabled || !isDrawMode) return;

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
  }, [getRelativePointerPosition, interactionsEnabled, isDrawMode]);

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
      const payload: AnnotationSavePayload | null = hasLines
        ? {
            data: stage.toJSON(),
            width: stage.width(),
            height: stage.height(),
          }
        : null;

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
    <div className={className}>
      {editable && (
        <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-[180px] flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">TOOLS</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSetMode('draw')}
                  disabled={controlsDisabled}
                  className={`flex items-center gap-1 rounded-md border px-3 py-1 transition ${
                    isDrawMode
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-blue-50'
                  } ${controlsDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => handleSetMode('select')}
                  disabled={controlsDisabled}
                  className={`flex items-center gap-1 rounded-md border px-3 py-1 transition ${
                    isSelectMode
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-blue-50'
                  } ${controlsDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  Select Line
                </button>
                <button
                  type="button"
                  disabled
                  className="flex items-center gap-1 rounded-md border border-dashed border-gray-300 bg-white px-3 py-1 text-gray-400"
                  title="Available in phase 2"
                >
                  Erase (soon)
                </button>
                <button
                  type="button"
                  onClick={() => handleSetMode('pan')}
                  disabled={controlsDisabled}
                  className={`flex items-center gap-1 rounded-md border px-3 py-1 transition ${
                    isPanMode
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-blue-50'
                  } ${controlsDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  Pan
                </button>
              </div>
            </div>
            <div className="flex min-w-[220px] flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">BRUSH</span>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  {COLOR_PRESETS.map((preset) => {
                    const isSelected = brushColor.toLowerCase() === preset.value.toLowerCase();
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setBrushColor(preset.value)}
                        disabled={controlsDisabled}
                        className={`h-7 w-7 rounded-full border transition ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-gray-300 hover:border-gray-400'
                        } ${controlsDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                        style={{ backgroundColor: preset.value }}
                        title={`Color: ${preset.label}`}
                        aria-pressed={isSelected}
                      >
                        <span className="sr-only">Color {preset.label}</span>
                      </button>
                    );
                  })}
                  {!COLOR_PRESETS.some((preset) => preset.value.toLowerCase() === brushColor.toLowerCase()) && (
                    <button
                      type="button"
                      onClick={() => setBrushColor(brushColor)}
                      disabled={controlsDisabled}
                      className={`h-7 w-7 rounded-full border border-dashed transition ${
                        controlsDisabled ? 'cursor-not-allowed opacity-60' : 'hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: brushColor || '#000000' }}
                      title={`Custom color (${brushColor})`}
                    >
                      <span className="sr-only">Custom color</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {BRUSH_WIDTH_OPTIONS.map((option) => {
                    const isSelected = brushWidth === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setBrushWidth(option.value)}
                        disabled={controlsDisabled}
                        className={`rounded-md border px-2 py-1 text-xs transition ${
                          isSelected
                            ? 'border-blue-600 bg-white text-blue-600'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                        } ${controlsDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                  {!BRUSH_WIDTH_OPTIONS.some((option) => option.value === brushWidth) && (
                    <span className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500">
                      {brushWidth}px
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 md:items-end">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">ACTIONS</span>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={controlsDisabled || !canUndo}
                  className={`flex items-center gap-1 rounded-md border px-3 py-1 transition ${
                    controlsDisabled || !canUndo
                      ? 'cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                  title="Undo (Ctrl+Z)"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={controlsDisabled || !canRedo}
                  className={`flex items-center gap-1 rounded-md border px-3 py-1 transition ${
                    controlsDisabled || !canRedo
                      ? 'cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                  title="Redo (Ctrl+Shift+Z)"
                >
                  Redo
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={controlsDisabled || !selectedId}
                  className={`rounded-md border px-3 py-1 transition ${
                    controlsDisabled || !selectedId
                      ? 'cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Delete Selection
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={controlsDisabled || lines.length === 0}
                  className={`rounded-md border px-3 py-1 transition ${
                    controlsDisabled || lines.length === 0
                      ? 'cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={handleManualSave}
                  disabled={controlsDisabled || !isDirty}
                  className={`rounded-md border px-3 py-1 transition ${
                    controlsDisabled || !isDirty
                      ? 'cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500'
                      : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Save Annotation
                </button>
                {autoSaveStatus !== 'idle' && (
                  <span
                    className={`text-xs ${
                      autoSaveStatus === 'saving' ? 'text-blue-600' : 'text-green-600'
                    }`}
                  >
                    {autoSaveStatus === 'saving' ? 'Auto-saving...' : 'Autosaved'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {!editable && (
        <div className="mb-2 text-sm text-gray-500">Annotations are read-only. Please sign in as an administrator to edit.</div>
      )}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded border border-gray-300 bg-white"
        style={{ height: displayHeight, cursor: containerCursor }}
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
        {backgroundImage && baseSize && displaySize && (
          <Stage
            ref={stageRef}
            width={displaySize.width}
            height={displaySize.height}
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
            <Layer name="background-layer">
              <KonvaImage
                image={backgroundImage}
                width={displaySize.width}
                height={displaySize.height}
                listening={false}
              />
            </Layer>
            <Layer name={DRAWING_LAYER_NAME} id={DRAWING_LAYER_NAME}>
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
                  draggable={interactionsEnabled && isSelectMode}
                  hitStrokeWidth={Math.max(line.strokeWidth * averageScale * 2, 20)}
                  opacity={saving ? 0.7 : 1}
                  onMouseDown={(event) => {
                    if (!isSelectMode) return;
                    event.cancelBubble = true;
                    handleLineSelect(line.id);
                  }}
                  onTouchStart={(event) => {
                    if (!isSelectMode) return;
                    event.cancelBubble = true;
                    handleLineSelect(line.id);
                  }}
                  onDragStart={() => handleLineDragStart(line.id)}
                  onDragMove={(event) => handleLineDragMove(line.id, event as KonvaEventObject<DragEvent>)}
                  onDragEnd={() => markDirty(true)}
                  shadowColor={selectedId === line.id ? '#2b6cb0' : undefined}
                  shadowBlur={selectedId === line.id ? 10 : 0}
                />
              ))}
            </Layer>
          </Stage>
        )}
      </div>
      {editable && !isDirty && (
        <p className="mt-2 text-xs text-gray-500">After editing the annotations, click &quot;Save Annotation&quot;.</p>
      )}
      {editable && isDirty && (
        <p className="mt-2 text-xs text-orange-500">
          {saving ? 'Saving... Please wait.' : 'There are unsaved changes.'}
        </p>
      )}
    </div>
  );
});

export default AnnotationCanvas;
