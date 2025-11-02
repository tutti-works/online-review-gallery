type CircleCursorStroke = {
  color: string;
  width: number;
};

export type CircleCursorOptions = {
  diameter: number;
  fillColor?: string;
  innerStroke?: CircleCursorStroke;
  outerStroke?: CircleCursorStroke;
};

export const MIN_CURSOR_DIAMETER = 4;
export const MAX_CURSOR_DIAMETER = 128;

export const createCircleCursor = (options: CircleCursorOptions): string | null => {
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
