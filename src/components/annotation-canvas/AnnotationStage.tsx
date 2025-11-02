import { Layer, Line, Stage } from 'react-konva';
import { Image as KonvaImage } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';

import { DRAWING_LAYER_NAME } from './constants';
import type { LineShape, Position, Size } from './types';

type AnnotationStageProps = {
  stageRef: React.MutableRefObject<KonvaStage | null>;
  backgroundImage: HTMLImageElement | ImageBitmap | null;
  displaySize: Size | null;
  stageSize: Size | null;
  stageCenter: Position;
  imageOffset: Position;
  zoom: number;
  panPosition: Position;
  interactionsEnabled: boolean;
  isSelectMode: boolean;
  saving: boolean;
  lines: LineShape[];
  scale: { x: number; y: number };
  averageScale: number;
  selectedId: string | null;
  perfectDrawEnabled: boolean;
  onPointerDown: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onPointerMove: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onPointerFinish: (event?: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onLineSelect: (lineId: string) => void;
  onLineDragStart: (lineId: string) => void;
  onLineDragMove: (lineId: string, event: KonvaEventObject<DragEvent>) => void;
  onLineDragEnd: () => void;
  listening: boolean;
};

export const AnnotationStage = ({
  stageRef,
  backgroundImage,
  displaySize,
  stageSize,
  stageCenter,
  imageOffset,
  zoom,
  panPosition,
  interactionsEnabled,
  isSelectMode,
  saving,
  lines,
  scale,
  averageScale,
  selectedId,
  perfectDrawEnabled,
  onPointerDown,
  onPointerMove,
  onPointerFinish,
  onLineSelect,
  onLineDragStart,
  onLineDragMove,
  onLineDragEnd,
  listening,
}: AnnotationStageProps) => {
  if (!backgroundImage || !displaySize || !stageSize) {
    return null;
  }

  const scaleX = scale.x || 1;
  const scaleY = scale.y || 1;

  return (
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
      listening={listening}
      onMouseDown={onPointerDown}
      onTouchStart={onPointerDown}
      onMouseMove={onPointerMove}
      onTouchMove={onPointerMove}
      onMouseUp={onPointerFinish}
      onTouchEnd={onPointerFinish}
      onMouseLeave={onPointerFinish}
      onTouchCancel={onPointerFinish}
    >
      <Layer name="background-layer" x={imageOffset.x} y={imageOffset.y}>
        <KonvaImage image={backgroundImage} width={displaySize.width} height={displaySize.height} listening={false} />
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
            points={line.points.map((value, index) => (index % 2 === 0 ? value * scaleX : value * scaleY))}
            stroke={line.stroke}
            strokeWidth={line.strokeWidth * averageScale}
            lineCap="round"
            lineJoin="round"
            tension={0.5}
            perfectDrawEnabled={perfectDrawEnabled}
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
              onLineSelect(line.id);
            }}
            onTouchStart={(event) => {
              if (!isSelectMode || line.tool !== 'draw') return;
              event.cancelBubble = true;
              onLineSelect(line.id);
            }}
            onDragStart={() => line.tool === 'draw' && onLineDragStart(line.id)}
            onDragMove={(event: KonvaEventObject<DragEvent>) =>
              line.tool === 'draw' && onLineDragMove(line.id, event)
            }
            onDragEnd={() => line.tool === 'draw' && onLineDragEnd()}
            shadowColor={selectedId === line.id && line.tool === 'draw' ? '#2b6cb0' : undefined}
            shadowBlur={selectedId === line.id && line.tool === 'draw' ? 10 : 0}
          />
        ))}
      </Layer>
    </Stage>
  );
};
