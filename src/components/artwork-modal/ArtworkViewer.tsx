'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ForwardRefExoticComponent,
  type MutableRefObject,
  type RefAttributes,
} from 'react';
import {
  DRAWING_LAYER_NAME,
  type AnnotationCanvasHandle,
  type AnnotationCanvasProps,
  type AnnotationSavePayload,
} from '@/components/AnnotationCanvas';
import type { Artwork } from '@/types';
import { usePanZoom } from './usePanZoom';

type ArtworkViewerProps = {
  artwork: Artwork;
  currentPage: number;
  currentImage: Artwork['images'][number];
  currentFileName: string;
  showAnnotation: boolean;
  userRole: string;
  currentAnnotation: {
    data: string;
    width: number;
    height: number;
  } | null;
  isSavingAnnotation: boolean;
  annotationCanvasRef: MutableRefObject<AnnotationCanvasHandle | null>;
  annotationOverlayVisible: boolean;
  onToggleOverlay: () => void;
  onClose: () => void;
  onPageChange: (index: number) => Promise<void> | void;
  onSaveAnnotation: (payload: AnnotationSavePayload | null) => Promise<void>;
  onAnnotationDirtyChange: (dirty: boolean) => void;
};

type OverlayLine = {
  id: string;
  points: number[];
  stroke: string;
  strokeWidth: number;
  x: number;
  y: number;
  opacity: number;
};

type OverlayAnnotationData = {
  width: number;
  height: number;
  lines: OverlayLine[];
};

const ArtworkViewer = ({
  artwork,
  currentPage,
  currentImage,
  currentFileName,
  showAnnotation,
  userRole,
  currentAnnotation,
  isSavingAnnotation,
  annotationCanvasRef,
  annotationOverlayVisible,
  onToggleOverlay,
  onClose,
  onPageChange,
  onSaveAnnotation,
  onAnnotationDirtyChange,
}: ArtworkViewerProps) => {
  const [AnnotationCanvasComponent, setAnnotationCanvasComponent] =
    useState<ForwardRefExoticComponent<AnnotationCanvasProps & RefAttributes<AnnotationCanvasHandle>> | null>(null);
  const [isAnnotationCanvasLoading, setAnnotationCanvasLoading] = useState(true);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const {
    zoom,
    panPosition,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDragStart,
    handleZoomIn,
    handleZoomOut,
    resetZoom,
  } = usePanZoom();

  useEffect(() => {
    let isMounted = true;

    import('@/components/AnnotationCanvas')
      .then((module) => {
        if (!isMounted) {
          return;
        }
        setAnnotationCanvasComponent(() => module.default);
      })
      .catch((error) => {
        if (isMounted) {
          console.error('[ArtworkViewer] Failed to load AnnotationCanvas module:', error);
        }
      })
      .finally(() => {
        if (isMounted) {
          setAnnotationCanvasLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const updateImageDimensions = useCallback(() => {
    const img = imageRef.current;
    if (!img) {
      return;
    }

    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    setImageDimensions((prev) => {
      if (prev && Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5) {
        return prev;
      }
      return { width: rect.width, height: rect.height };
    });
  }, []);

  useEffect(() => {
    setImageDimensions(null);
    resetZoom();
  }, [currentImage?.id, currentImage.url, resetZoom]);

  useEffect(() => {
    resetZoom();
  }, [showAnnotation, resetZoom]);

  useEffect(() => {
    const img = imageRef.current;
    if (!img) {
      return;
    }

    updateImageDimensions();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateImageDimensions();
    });

    observer.observe(img);

    return () => {
      observer.disconnect();
    };
  }, [currentImage?.id, updateImageDimensions]);

  const imageCacheKey = useMemo(() => {
    if (!currentImage) {
      return undefined;
    }
    const parts = [
      artwork.id,
      currentImage.id ?? '',
      String(currentImage.pageNumber ?? currentPage + 1),
      currentImage.url ?? '',
    ];
    return parts.filter(Boolean).join(':');
  }, [artwork.id, currentImage, currentPage]);

  /* eslint-disable react-hooks/exhaustive-deps */
  const overlayAnnotation = useMemo<OverlayAnnotationData | null>(() => {
    if (!currentAnnotation) {
      return null;
    }

    try {
      const stageData = JSON.parse(currentAnnotation.data);
      const layers = Array.isArray(stageData.children) ? stageData.children : [];
      const drawingLayer =
        layers.find((layer: any) => {
          const attrs = layer?.attrs ?? {};
          const name = (attrs.name ?? attrs.id ?? '') as string;
          return name === DRAWING_LAYER_NAME;
        }) ?? null;

      const lines: OverlayLine[] =
        drawingLayer && Array.isArray(drawingLayer.children)
          ? drawingLayer.children
              .filter((node: any) => node.className === 'Line')
              .map((node: any, index: number) => {
                const attrs = node.attrs ?? {};
                const points = Array.isArray(attrs.points) ? (attrs.points as number[]) : [];
                return {
                  id: typeof attrs.id === 'string' ? attrs.id : `overlay-line-${index}`,
                  points,
                  stroke: typeof attrs.stroke === 'string' ? attrs.stroke : '#ff0000',
                  strokeWidth: typeof attrs.strokeWidth === 'number' ? attrs.strokeWidth : 2,
                  x: typeof attrs.x === 'number' ? attrs.x : 0,
                  y: typeof attrs.y === 'number' ? attrs.y : 0,
                  opacity: typeof attrs.opacity === 'number' ? attrs.opacity : 1,
                };
              })
          : [];

      return {
        width: currentAnnotation.width || 1,
        height: currentAnnotation.height || 1,
        lines,
      };
    } catch (error) {
      console.error('[ArtworkViewer] Failed to parse annotation overlay:', error);
      return null;
    }
  }, [currentAnnotation]);


  const hasOverlay = overlayAnnotation !== null && overlayAnnotation.lines.length > 0;
  const shouldShowOverlay = !showAnnotation && annotationOverlayVisible && hasOverlay;
  const overlayToggleTitle = hasOverlay
    ? annotationOverlayVisible
      ? '豕ｨ驥医ｒ髱櫁｡ｨ遉ｺ'
      : '豕ｨ驥医ｒ陦ｨ遉ｺ'
    : '豕ｨ驥医・縺ゅｊ縺ｾ縺帙ｓ';

  return (
    <div className="flex-1 flex flex-col bg-gray-100 relative">
      <button
        onClick={onClose}
        className="absolute left-4 top-4 z-10 rounded-full bg-white p-2 shadow-lg transition-colors hover:bg-gray-100"
      >
        <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div ref={viewportRef} className="flex-1 flex items-center justify-center overflow-hidden relative bg-gray-100">
        {showAnnotation ? (
          <div className="h-full w-full">
            {AnnotationCanvasComponent ? (
              <AnnotationCanvasComponent
                ref={annotationCanvasRef}
                imageUrl={currentImage.url}
                imageCacheKey={imageCacheKey}
                initialAnnotation={
                  currentAnnotation
                    ? {
                        data: currentAnnotation.data,
                        width: currentAnnotation.width,
                        height: currentAnnotation.height,
                      }
                    : null
                }
                editable={userRole === 'admin'}
                onSave={onSaveAnnotation}
                onDirtyChange={onAnnotationDirtyChange}
                saving={isSavingAnnotation}
                zoom={zoom}
                panPosition={panPosition}
                isPanDragging={isDragging}
                onPanMouseDown={handleMouseDown}
                onPanMouseMove={handleMouseMove}
                onPanMouseUp={handleMouseUp}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                {isAnnotationCanvasLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
                  </div>
                ) : (
                  <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                    Failed to load annotation tools. Please reload the page.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            className="h-full w-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <div
              className="w-full h-full flex items-center justify-center p-8"
              style={{
                transform: `scale(${zoom}) translate(${panPosition.x / zoom}px, ${panPosition.y / zoom}px)`,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={currentImage.url}
                alt={`${currentFileName} - Page ${currentPage + 1}`}
                className="max-w-full max-h-full object-contain select-none pointer-events-none"
                draggable={false}
                onDragStart={handleDragStart}
                onLoad={updateImageDimensions}
              />
            </div>
            {shouldShowOverlay && overlayAnnotation && imageDimensions && (
              <div
                ref={containerRef}
                className="pointer-events-none absolute"
                style={{
                  transform: `scale(${zoom}) translate(${panPosition.x / zoom}px, ${panPosition.y / zoom}px)`,
                  left: '50%',
                  top: '50%',
                  marginLeft: -imageDimensions.width / 2,
                  marginTop: -imageDimensions.height / 2,
                  width: imageDimensions.width,
                  height: imageDimensions.height,
                }}
              >
                <svg
                  className="h-full w-full"
                  viewBox={`0 0 ${overlayAnnotation.width} ${overlayAnnotation.height}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {overlayAnnotation.lines.map((line) => {
                    if (!line.points || line.points.length < 4) {
                      return null;
                    }

                    const points: string[] = [];
                    for (let i = 0; i < line.points.length; i += 2) {
                      const x = (line.points[i] ?? 0) + line.x;
                      const y = (line.points[i + 1] ?? 0) + line.y;
                      points.push(`${x},${y}`);
                    }

                    return (
                      <polyline
                        key={line.id}
                        points={points.join(' ')}
                        stroke={line.stroke}
                        strokeWidth={line.strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={line.opacity}
                        fill="none"
                      />
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        )}
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center space-x-4 rounded-full bg-gray-700 bg-opacity-70 px-3 py-1 backdrop-blur-sm transition-all duration-300 ease-in-out">
          {artwork.images.length > 1 && (
            <>
              <button
                onClick={() => void onPageChange(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0 || isSavingAnnotation}
                className="rounded-lg p-2 text-white transition-colors hover:bg-white hover:bg-opacity-20 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                title="前のページ"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="min-w-[60px] text-center text-sm font-medium text-white">
                {currentPage + 1} / {artwork.images.length}
              </span>
              <button
                onClick={() => void onPageChange(Math.min(artwork.images.length - 1, currentPage + 1))}
                disabled={currentPage === artwork.images.length - 1 || isSavingAnnotation}
                className="rounded-lg p-2 text-white transition-colors hover:bg-white hover:bg-opacity-20 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                title="次のページ"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="h-6 w-px bg-white bg-opacity-30" />
            </>
          )}

          {!showAnnotation && (
            <>
              <button
                onClick={() => {
                  if (hasOverlay) {
                    onToggleOverlay();
                  }
                }}
                disabled={!hasOverlay}
                className={`rounded-lg p-2 text-white transition-colors ${
                  annotationOverlayVisible && hasOverlay
                    ? 'bg-white bg-opacity-20'
                    : 'hover:bg-white hover:bg-opacity-20'
                } disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
                title={overlayToggleTitle}
                aria-pressed={annotationOverlayVisible && hasOverlay}
              >
                <span aria-hidden="true">📝</span>
              </button>
              <div className="h-6 w-px bg-white bg-opacity-30" />
            </>
          )}

          <button
            onClick={handleZoomOut}
            className="rounded-lg p-2 text-white transition-colors hover:bg-white hover:bg-opacity-20"
            title="縮小">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
            </svg>
          </button>
          <span className="min-w-[50px] text-center text-sm font-medium text-white">{Math.round(zoom * 100)}%</span>
          <button
            onClick={handleZoomIn}
            className="rounded-lg p-2 text-white transition-colors hover:bg-white hover:bg-opacity-20"
            title="拡大"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={resetZoom}
            className="ml-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white hover:bg-opacity-20"
            title="リセット"
          >
            リセット
          </button>
        </div>
      </div>

      {artwork.images.length > 1 && (
        <div className="border-t border-gray-200 bg-white p-3">
          <div className="flex space-x-2 overflow-x-auto">
            {artwork.images.map((image, index) => {
              const pageNumber = image.pageNumber ?? index + 1;
              const pageKey = String(pageNumber);
              const imageHasAnnotation =
                Boolean(artwork.annotationsMap?.[pageKey]?.lines?.length) ||
                (Array.isArray(artwork.annotations) &&
                  artwork.annotations.some((annotation) => annotation.pageNumber === pageNumber));

              return (
                <button
                  key={image.id}
                  onClick={() => void onPageChange(index)}
                  disabled={isSavingAnnotation}
                  className={`relative h-14 w-20 flex-shrink-0 overflow-hidden rounded border-2 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    currentPage === index ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {imageHasAnnotation && (
                    <span className="pointer-events-none absolute right-1 top-1 rounded-full bg-black/60 px-1 text-[10px] font-semibold text-white">📝</span>
                  )}
                  <Image
                    src={image.thumbnailUrl || image.url}
                    alt={`Page ${index + 1} thumbnail`}
                    width={80}
                    height={56}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtworkViewer;
