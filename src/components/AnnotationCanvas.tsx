'use client';

import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import type { Line as KonvaLineNode } from 'konva/lib/shapes/Line';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';

import { ANNOTATION_CONFIG } from '@/config/annotation';
import { imageCacheManager } from '@/utils/imageCache';
import { BRUSH_WIDTH_OPTIONS, COLOR_PRESETS, DEFAULT_HEIGHT, DEFAULT_WIDTH, DRAWING_LAYER_NAME } from './annotation-canvas/constants';
import { createCircleCursor, MIN_CURSOR_DIAMETER } from './annotation-canvas/cursor';
import { useLineHistory } from './annotation-canvas/history';
import { AnnotationStage } from './annotation-canvas/AnnotationStage';
import { AnnotationToolbar } from './annotation-canvas/AnnotationToolbar';
import { generateLineId } from './annotation-canvas/utils';
import type {
  AnnotationCanvasHandle,
  AnnotationCanvasProps,
  AnnotationSavePayload,
  AnnotationSaveReason,
  LineShape,
  Position,
  Size,
  ToolMode,
} from './annotation-canvas/types';

type SaveOptions = { reason?: AnnotationSaveReason; force?: boolean };

const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(function AnnotationCanvas(
  {
    imageUrl,
    imageCacheKey,
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
    onPanTouchStart,
    onPanTouchMove,
    onPanTouchEnd,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<KonvaStage | null>(null);
  const isPointerDrawingRef = useRef(false);
  const indicatorTimeoutRef = useRef<number | null>(null);
  const clearAllTimeoutRef = useRef<number | null>(null);
  const saveAnnotationRef = useRef<(options?: SaveOptions) => Promise<void>>();

  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | ImageBitmap | null>(null);
  const [baseSize, setBaseSize] = useState<Size | null>(null);
  const [displaySize, setDisplaySize] = useState<Size | null>(null);
  const [stageSize, setStageSize] = useState<Size | null>(null);
  const [displayScale, setDisplayScale] = useState({ x: 1, y: 1 });
  const [lines, setLines] = useState<LineShape[]>([]);
  const [mode, setMode] = useState<ToolMode>('draw');
  const [brushColor, setBrushColor] = useState<string>(COLOR_PRESETS[0].value);
  const [brushWidth, setBrushWidth] = useState<number>(BRUSH_WIDTH_OPTIONS[1].value);
  const [eraserWidth, setEraserWidth] = useState<number>(BRUSH_WIDTH_OPTIONS[1].value);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [colorPaletteExpanded, setColorPaletteExpanded] = useState(false);
  const [brushSizeExpanded, setBrushSizeExpanded] = useState(false);
  const [clearAllPending, setClearAllPending] = useState(false);
  const [isPerfectDrawActive, setIsPerfectDrawActive] = useState(false);

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

  const { recordSnapshot, resetHistory, undo, redo, historyState } = useLineHistory(lines, setLines, markDirty);
  const { canUndo, canRedo } = historyState;

  const interactionsEnabled = editable && !saving && !isLoading;
  const isDrawMode = mode === 'draw';
  const isEraseMode = mode === 'erase';
  const isSelectMode = mode === 'select';
  const isPanMode = mode === 'pan';
  const isDrawingToolActive = isDrawMode || isEraseMode;

  const {
    enabled: perfectDrawEnabledFlag,
    strategy: perfectDrawStrategy,
    pointThreshold: perfectDrawPointThreshold,
    lineThreshold: perfectDrawLineThreshold,
    debug: perfectDrawDebug,
  } = ANNOTATION_CONFIG.perfectDraw;

  const lineCount = lines.length;
  const totalPoints = useMemo(
    () => lines.reduce((sum, line) => sum + line.points.length, 0),
    [lines],
  );

  const resolvedPerfectDrawEnabled = useMemo(() => {
    if (!perfectDrawEnabledFlag) {
      return false;
    }

    switch (perfectDrawStrategy) {
      case 'always':
        return true;
      case 'never':
        return false;
      case 'drawing':
        return isPerfectDrawActive;
      case 'dynamic': {
        if (isPerfectDrawActive) {
          return true;
        }
        const withinPointLimit = totalPoints <= perfectDrawPointThreshold;
        const withinLineLimit = lineCount <= perfectDrawLineThreshold;
        return withinPointLimit && withinLineLimit;
      }
      default:
        return false;
    }
  }, [
    isPerfectDrawActive,
    lineCount,
    perfectDrawEnabledFlag,
    perfectDrawPointThreshold,
    perfectDrawStrategy,
    perfectDrawLineThreshold,
    totalPoints,
  ]);

  useEffect(() => {
    if (!perfectDrawDebug) return;
    console.log('[PerfectDraw]', {
      enabled: resolvedPerfectDrawEnabled,
      strategy: perfectDrawStrategy,
      lineCount,
      totalPoints,
      isDrawing: isPerfectDrawActive,
    });
  }, [lineCount, perfectDrawDebug, perfectDrawStrategy, resolvedPerfectDrawEnabled, totalPoints, isPerfectDrawActive]);

  useEffect(() => {
    if (!isDrawingToolActive && isPerfectDrawActive) {
      setIsPerfectDrawActive(false);
    }
  }, [isDrawingToolActive, isPerfectDrawActive]);

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
  }, [drawCursor, eraseCursor, interactionsEnabled, isDrawMode, isEraseMode, isPanDragging, isPanMode, isSelectMode]);

  const stageCenter = useMemo<Position>(
    () => (stageSize ? { x: stageSize.width / 2, y: stageSize.height / 2 } : { x: 0, y: 0 }),
    [stageSize],
  );

  const imageOffset = useMemo<Position>(() => {
    if (!stageSize || !displaySize) {
      return { x: 0, y: 0 };
    }
    return {
      x: Math.max((stageSize.width - displaySize.width) / 2, 0),
      y: Math.max((stageSize.height - displaySize.height) / 2, 0),
    };
  }, [stageSize, displaySize]);

  const activeStrokeWidth = isEraseMode ? eraserWidth : brushWidth;

  const handleBrushWidthChange = useCallback(
    (value: number) => {
      if (isEraseMode) {
        setEraserWidth(value);
      } else {
        setBrushWidth(value);
      }
      setBrushSizeExpanded(false);
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

      const cacheKey = imageCacheKey ?? imageUrl;

      try {
        const { image, bitmap } = await imageCacheManager.get(cacheKey, imageUrl);
        if (cancelled) return;
        const width =
          image.naturalWidth || image.width || bitmap?.width || DEFAULT_WIDTH;
        const height =
          image.naturalHeight || image.height || bitmap?.height || DEFAULT_HEIGHT;
        setBackgroundImage(bitmap ?? image);
        setBaseSize({ width, height });
      } catch (error) {
        console.error('[AnnotationCanvas] Failed to load background image:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void prepareImage();

    return () => {
      cancelled = true;
    };
  }, [imageCacheKey, imageUrl]);

  const updateDisplayLayout = useCallback(() => {
    const stage = stageRef.current;
    const container = containerRef.current;

    if (!container || !baseSize) {
      if (!baseSize && stage) {
        const safeWidth = DEFAULT_WIDTH;
        const safeHeight = DEFAULT_HEIGHT;
        setDisplayScale({ x: 1, y: 1 });
        setDisplaySize({ width: safeWidth, height: safeHeight });
        setStageSize({ width: safeWidth, height: safeHeight });
        stage.width(safeWidth);
        stage.height(safeHeight);
        stage.scale({ x: 1, y: 1 });
        stage.batchDraw();
      }
      return;
    }

    const containerWidth = Math.max(container.clientWidth, 100);
    const containerHeight = Math.max(container.clientHeight, 100);
    const stageWidth = containerWidth;
    const stageHeight = containerHeight;

    const widthScale = baseSize.width > 0 ? stageWidth / baseSize.width : 1;
    const heightScale = baseSize.height > 0 ? stageHeight / baseSize.height : 1;
    const scale = Math.min(widthScale, heightScale, 1);

    const imageWidth = baseSize.width * scale;
    const imageHeight = baseSize.height * scale;

    setDisplayScale({ x: scale, y: scale });
    setDisplaySize({ width: imageWidth, height: imageHeight });
    setStageSize({ width: stageWidth, height: stageHeight });

    if (stage) {
      stage.width(stageWidth);
      stage.height(stageHeight);
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
        const tempContainer = typeof document !== 'undefined' ? document.createElement('div') : undefined;
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
          points: line.points.map((value, idx) => (idx % 2 === 0 ? value * widthRatio : value * heightRatio)),
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

      setColorPaletteExpanded(false);
      setBrushSizeExpanded(false);

      recordSnapshot();
      setIsPerfectDrawActive(true);
      isPointerDrawingRef.current = true;
      const scaleX = displayScale.x || 1;
      const scaleY = displayScale.y || 1;
      const averageScale = (scaleX + scaleY) / 2 || 1;
      const strokeWidthValue = (isEraseMode ? eraserWidth : brushWidth) / averageScale;
      const strokeColor = isEraseMode ? 'rgba(0,0,0,1)' : brushColor;
      const newLine: LineShape = {
        id: generateLineId(),
        tool: isEraseMode ? 'erase' : 'draw',
        points: [pointer.x, pointer.y],
        stroke: strokeColor,
        strokeWidth: strokeWidthValue,
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
      recordSnapshot,
    ],
  );

  const handlePointerMove = useCallback(
    (event?: KonvaEventObject<MouseEvent | TouchEvent>) => {
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
    },
    [getRelativePointerPosition, interactionsEnabled, isDrawingToolActive],
  );

  const finishDrawing = useCallback((event?: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event?.evt.preventDefault?.();
    isPointerDrawingRef.current = false;
    setIsPerfectDrawActive(false);
  }, []);

  const handlePanMouseDownWrapper = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!interactionsEnabled || !isPanMode) return;
      event.preventDefault();
      onPanMouseDown(event);
    },
    [interactionsEnabled, isPanMode, onPanMouseDown],
  );

  const handlePanMouseMoveWrapper = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!interactionsEnabled || !isPanMode) return;
      event.preventDefault();
      onPanMouseMove(event);
    },
    [interactionsEnabled, isPanMode, onPanMouseMove],
  );

  const handlePanMouseUpWrapper = useCallback(() => {
    if (!isPanMode) return;
    onPanMouseUp();
  }, [isPanMode, onPanMouseUp]);

  const handlePanTouchStartWrapper = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!interactionsEnabled || !isPanMode) return;
      event.preventDefault();
      onPanTouchStart(event);
    },
    [interactionsEnabled, isPanMode, onPanTouchStart],
  );

  const handlePanTouchMoveWrapper = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!interactionsEnabled || !isPanMode) return;
      event.preventDefault();
      onPanTouchMove(event);
    },
    [interactionsEnabled, isPanMode, onPanTouchMove],
  );

  const handlePanTouchEndWrapper = useCallback(() => {
    if (!isPanMode) return;
    onPanTouchEnd();
  }, [isPanMode, onPanTouchEnd]);

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
      recordSnapshot();
      if (selectedId !== id) {
        setSelectedId(id);
      }
    },
    [interactionsEnabled, isSelectMode, recordSnapshot, selectedId],
  );

  const handleLineDragMove = useCallback(
    (id: string, event: KonvaEventObject<DragEvent>) => {
      const { x, y } = event.target.position();
      event.evt.preventDefault?.();
      const scaleX = displayScale.x || 1;
      const scaleY = displayScale.y || 1;
      const baseX = x / scaleX;
      const baseY = y / scaleY;
      setLines((prev) => prev.map((line) => (line.id === id ? { ...line, x: baseX, y: baseY } : line)));
      markDirty(true);
    },
    [displayScale, markDirty],
  );

  const handleLineDragEnd = useCallback(() => {
    markDirty(true);
  }, [markDirty]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    recordSnapshot();
    setLines((prev) => prev.filter((line) => line.id !== selectedId));
    setSelectedId(null);
    markDirty(true);
  }, [markDirty, recordSnapshot, selectedId]);

  const handleClearAllClick = useCallback(() => {
    if (lines.length === 0) return;

    if (clearAllPending) {
      recordSnapshot();
      setLines([]);
      setSelectedId(null);
      markDirty(true);
      setClearAllPending(false);
      if (clearAllTimeoutRef.current !== null) {
        window.clearTimeout(clearAllTimeoutRef.current);
        clearAllTimeoutRef.current = null;
      }
    } else {
      setClearAllPending(true);
      clearAllTimeoutRef.current = window.setTimeout(() => {
        setClearAllPending(false);
        clearAllTimeoutRef.current = null;
      }, 3000);
    }
  }, [clearAllPending, lines.length, markDirty, recordSnapshot]);

  const handleUndo = useCallback(() => {
    if (!interactionsEnabled) return;
    if (undo()) {
      setSelectedId(null);
    }
  }, [interactionsEnabled, undo]);

  const handleRedo = useCallback(() => {
    if (!interactionsEnabled) return;
    if (redo()) {
      setSelectedId(null);
    }
  }, [interactionsEnabled, redo]);

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
        setColorPaletteExpanded(false);
        setBrushSizeExpanded(false);
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
        const drawingLayer = stage.findOne<Konva.Layer>(`#${DRAWING_LAYER_NAME}`);
        const backgroundLayer = stage.findOne<Konva.Layer>('.background-layer');
        const backgroundImageNode = backgroundLayer?.findOne<Konva.Image>('Image');
        const lineNodes = drawingLayer?.find<KonvaLineNode>('Line') ?? [];
        const lineStateMap = new Map(lines.map((line) => [line.id, line]));

        const originalStageSize = { width: stage.width(), height: stage.height() };
        const originalDrawingOffset = drawingLayer ? { x: drawingLayer.x(), y: drawingLayer.y() } : null;
        const originalBackgroundOffset = backgroundLayer ? { x: backgroundLayer.x(), y: backgroundLayer.y() } : null;
        const originalImageSize = backgroundImageNode
          ? { width: backgroundImageNode.width(), height: backgroundImageNode.height() }
          : null;
        const originalStageScale = { x: stage.scaleX(), y: stage.scaleY() };
        const originalStagePosition = { x: stage.x(), y: stage.y() };
        const originalStageOffset = { x: stage.offsetX(), y: stage.offsetY() };
        const originalLineStates = lineNodes.map((node) => ({
          node,
          points: [...node.points()],
          x: node.x(),
          y: node.y(),
          strokeWidth: node.strokeWidth(),
        }));

        stage.width(baseSize.width);
        stage.height(baseSize.height);
        stage.scale({ x: 1, y: 1 });
        stage.position({ x: 0, y: 0 });
        stage.offset({ x: 0, y: 0 });

        if (backgroundImageNode) {
          backgroundImageNode.width(baseSize.width);
          backgroundImageNode.height(baseSize.height);
        }

        if (drawingLayer) {
          drawingLayer.x(0);
          drawingLayer.y(0);
        }
        if (backgroundLayer) {
          backgroundLayer.x(0);
          backgroundLayer.y(0);
        }

        lineNodes.forEach((node) => {
          const lineState = lineStateMap.get(node.id());
          if (!lineState) return;

          node.points([...lineState.points]);
          node.x(lineState.x);
          node.y(lineState.y);
          node.strokeWidth(lineState.strokeWidth);
        });

        payload = {
          data: stage.toJSON(),
          width: baseSize.width,
          height: baseSize.height,
        };

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
        stage.scale(originalStageScale);
        stage.position(originalStagePosition);
        stage.offset(originalStageOffset);

        originalLineStates.forEach(({ node, points, x, y, strokeWidth }) => {
          node.points(points);
          node.x(x);
          node.y(y);
          node.strokeWidth(strokeWidth);
        });
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
    [baseSize, clearIndicatorTimer, editable, isDirty, lines, markDirty, onSave, saving],
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
      if (clearAllTimeoutRef.current !== null) {
        window.clearTimeout(clearAllTimeoutRef.current);
      }
    };
  }, [clearIndicatorTimer]);

  const controlsDisabled = useMemo(() => !editable || isLoading || saving, [editable, isLoading, saving]);
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

  const toggleColorPalette = useCallback(() => {
    setColorPaletteExpanded((prev) => {
      const next = !prev;
      if (next) {
        setBrushSizeExpanded(false);
      }
      return next;
    });
  }, []);

  const toggleBrushSize = useCallback(() => {
    setBrushSizeExpanded((prev) => {
      const next = !prev;
      if (next) {
        setColorPaletteExpanded(false);
      }
      return next;
    });
  }, []);

  const handleColorSelect = useCallback((color: string) => {
    setBrushColor(color);
    setColorPaletteExpanded(false);
  }, []);

  return (
    <div className={`relative h-full w-full ${className || ''}`}>
      {!editable && (
        <div className="mb-2 text-sm text-gray-500">
          Annotations are read-only. Please sign in as an administrator to edit.
        </div>
      )}
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden bg-gray-100"
        style={{ cursor: containerCursor }}
        onMouseDown={isPanMode ? handlePanMouseDownWrapper : undefined}
        onMouseMove={isPanMode ? handlePanMouseMoveWrapper : undefined}
        onMouseUp={isPanMode ? handlePanMouseUpWrapper : undefined}
        onMouseLeave={isPanMode ? handlePanMouseUpWrapper : undefined}
        onTouchStart={isPanMode ? handlePanTouchStartWrapper : undefined}
        onTouchMove={isPanMode ? handlePanTouchMoveWrapper : undefined}
        onTouchEnd={isPanMode ? handlePanTouchEndWrapper : undefined}
      >
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        )}
        <AnnotationStage
          stageRef={stageRef}
          backgroundImage={backgroundImage}
          displaySize={displaySize}
          stageSize={stageSize}
          stageCenter={stageCenter}
          imageOffset={imageOffset}
          zoom={zoom}
          panPosition={panPosition}
          interactionsEnabled={interactionsEnabled}
          isSelectMode={isSelectMode}
          saving={saving}
          lines={lines}
          scale={displayScale}
          averageScale={averageScale}
          selectedId={selectedId}
          perfectDrawEnabled={resolvedPerfectDrawEnabled}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerFinish={finishDrawing}
          onLineSelect={handleLineSelect}
          onLineDragStart={handleLineDragStart}
          onLineDragMove={handleLineDragMove}
          onLineDragEnd={handleLineDragEnd}
          listening={interactionsEnabled}
        />
      </div>
      {editable && (
        <AnnotationToolbar
          mode={mode}
          controlsDisabled={controlsDisabled}
          isDirty={isDirty}
          saving={saving}
          autoSaveStatus={autoSaveStatus}
          onModeChange={handleSetMode}
          colorPaletteExpanded={colorPaletteExpanded}
          onColorPaletteToggle={toggleColorPalette}
          onColorSelect={handleColorSelect}
          brushSizeExpanded={brushSizeExpanded}
          onBrushSizeToggle={toggleBrushSize}
          brushColor={brushColor}
          activeStrokeWidth={activeStrokeWidth}
          onBrushWidthChange={handleBrushWidthChange}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onDeleteSelected={handleDeleteSelected}
          hasSelection={Boolean(selectedId)}
          onClearAll={handleClearAllClick}
          clearAllPending={clearAllPending}
          hasLines={lines.length > 0}
          onManualSave={handleManualSave}
        />
      )}
    </div>
  );
});

AnnotationCanvas.displayName = 'AnnotationCanvas';

export default AnnotationCanvas;

export { DRAWING_LAYER_NAME } from './annotation-canvas/constants';

export type {
  AnnotationCanvasHandle,
  AnnotationCanvasProps,
  AnnotationSavePayload,
  AnnotationSaveReason,
} from './annotation-canvas/types';
