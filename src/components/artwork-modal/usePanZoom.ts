'use client';

import { useCallback, useState, type DragEvent, type MouseEvent, type TouchEvent } from 'react';

type PanPosition = {
  x: number;
  y: number;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export const usePanZoom = () => {
  const [zoom, setZoom] = useState(1);
  const [panPosition, setPanPosition] = useState<PanPosition>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<PanPosition>({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      setIsDragging(true);
      setDragStart({
        x: event.clientX - panPosition.x,
        y: event.clientY - panPosition.y,
      });
    },
    [panPosition],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isDragging) {
        return;
      }

      setPanPosition({
        x: event.clientX - dragStart.x,
        y: event.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      setIsDragging(true);
      setDragStart({
        x: touch.clientX - panPosition.x,
        y: touch.clientY - panPosition.y,
      });
    },
    [panPosition],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!isDragging || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      setPanPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragStart = useCallback((event: DragEvent) => {
    event.preventDefault();
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  return {
    zoom,
    panPosition,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleDragStart,
    handleZoomIn,
    handleZoomOut,
    resetZoom,
  };
};
