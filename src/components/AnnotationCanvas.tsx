'use client';

import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import type { Line as KonvaLineNode } from 'konva/lib/shapes/Line';
import { Layer, Line, Stage } from 'react-konva';
import { Image as KonvaImage } from 'react-konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AnnotationSavePayload = {
  data: string;
  width: number;
  height: number;
};

type AnnotationCanvasProps = {
  imageUrl: string;
  initialAnnotation?: AnnotationSavePayload | null;
  editable: boolean;
  onSave?: (annotation: AnnotationSavePayload | null) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
  saving?: boolean;
  className?: string;
};

type LineShape = {
  id: string;
  points: number[];
  stroke: string;
  strokeWidth: number;
  x: number;
  y: number;
};

const DEFAULT_WIDTH = 840;
const DEFAULT_HEIGHT = 630;
const DRAWING_LAYER_NAME = 'drawing-layer';

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

const AnnotationCanvas = ({
  imageUrl,
  initialAnnotation,
  editable,
  onSave,
  onDirtyChange,
  saving = false,
  className,
}: AnnotationCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<KonvaStage | null>(null);
  const isPointerDrawingRef = useRef(false);

  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [displayScale, setDisplayScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const [lines, setLines] = useState<LineShape[]>([]);
  const [mode, setMode] = useState<'draw' | 'select'>('draw');
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [brushWidth, setBrushWidth] = useState(4);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const markDirty = useCallback(
    (dirty: boolean) => {
      setIsDirty(dirty);
      onDirtyChange?.(dirty);
    },
    [onDirtyChange],
  );

  const interactionsEnabled = editable && !saving && !isLoading;
  const isDrawMode = mode === 'draw';

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
      } catch (error) {
        console.error('[AnnotationCanvas] Failed to parse annotation JSON:', error);
        setLines([]);
        setSelectedId(null);
        markDirty(false);
      }
    },
    [baseSize, markDirty],
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

    stageContainer.style.cursor = isDrawMode ? 'crosshair' : 'move';
  }, [interactionsEnabled, isDrawMode]);

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
      event.evt.preventDefault?.();
      if (!interactionsEnabled) return;

      if (!isDrawMode) {
        deselectIfEmpty(event);
        return;
      }

      const pointer = getRelativePointerPosition();
      if (!pointer) return;

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
    [brushColor, brushWidth, deselectIfEmpty, displayScale, getRelativePointerPosition, interactionsEnabled, isDrawMode, markDirty],
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

  const handleLineSelect = useCallback(
    (id: string) => {
      if (!interactionsEnabled || isDrawMode) return;
      setSelectedId(id);
    },
    [interactionsEnabled, isDrawMode],
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
    setLines((prev) => prev.filter((line) => line.id !== selectedId));
    setSelectedId(null);
    markDirty(true);
  };

  const handleClearAll = () => {
    if (lines.length === 0) return;
    setLines([]);
    setSelectedId(null);
    markDirty(true);
  };

  const handleModeToggle = () => {
    setMode((prev) => {
      const next = prev === 'draw' ? 'select' : 'draw';
      if (next === 'draw') {
        setSelectedId(null);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!onSave) return;
    const stage = stageRef.current;
    if (!stage) return;

    const hasLines = lines.length > 0;
    const payload: AnnotationSavePayload | null = hasLines
      ? {
          data: stage.toJSON(),
          width: stage.width(),
          height: stage.height(),
        }
      : null;

    await onSave(payload);
    markDirty(false);
  };

  const controlsDisabled = useMemo(
    () => !editable || isLoading || saving,
    [editable, isLoading, saving],
  );

  const scaleX = displayScale.x || 1;
  const scaleY = displayScale.y || 1;
  const averageScale = (scaleX + scaleY) / 2 || 1;

  return (
    <div className={className}>
      {editable && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-700">
          <button
            type="button"
            onClick={handleModeToggle}
            disabled={controlsDisabled}
            className={`rounded border px-3 py-1 transition ${
              mode === 'draw'
                ? 'border-blue-700 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-700'
            } ${controlsDisabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-blue-50'}`}
          >
            {mode === 'draw' ? '選択モードに切り替え' : '描画モードに切り替え'}
          </button>
          <label className="flex items-center gap-2">
            線の色:
            <input
              type="color"
              value={brushColor}
              disabled={controlsDisabled}
              onChange={(event) => setBrushColor(event.target.value)}
              className="h-8 w-12 border border-gray-300"
            />
          </label>
          <label className="flex items-center gap-2">
            太さ
            <input
              type="range"
              min={1}
              max={30}
              value={brushWidth}
              disabled={controlsDisabled}
              onChange={(event) => setBrushWidth(Number(event.target.value))}
            />
            <span>{brushWidth}px</span>
          </label>
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={controlsDisabled || !selectedId}
            className={`rounded border border-gray-300 px-3 py-1 text-gray-700 transition ${
              controlsDisabled || !selectedId ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-100'
            }`}
          >
            選択削除
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={controlsDisabled || lines.length === 0}
            className={`rounded border border-gray-300 px-3 py-1 text-gray-700 transition ${
              controlsDisabled || lines.length === 0 ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-100'
            }`}
          >
            全てクリア
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={controlsDisabled || !isDirty}
            className={`rounded border px-3 py-1 transition ${
              controlsDisabled || !isDirty
                ? 'cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500'
                : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            注釈を保存
          </button>
        </div>
      )}
      {!editable && (
        <div className="mb-2 text-sm text-gray-500">注釈は閲覧専用です。編集するには管理者としてログインしてください。</div>
      )}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded border border-gray-300 bg-white"
        style={{ height: displayHeight }}
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
                  draggable={interactionsEnabled && !isDrawMode}
                  hitStrokeWidth={Math.max(line.strokeWidth * averageScale * 2, 20)}
                  opacity={saving ? 0.7 : 1}
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                    handleLineSelect(line.id);
                  }}
                  onTouchStart={(event) => {
                    event.cancelBubble = true;
                    handleLineSelect(line.id);
                  }}
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
        <p className="mt-2 text-xs text-gray-500">注釈を編集したら「注釈を保存」をクリックしてください。</p>
      )}
      {editable && isDirty && (
        <p className="mt-2 text-xs text-orange-500">
          {saving ? '保存中です。しばらくお待ちください。' : '未保存の変更があります。'}
        </p>
      )}
    </div>
  );
};

export default AnnotationCanvas;
