export const MAX_HISTORY_ENTRIES = 15;

export const DEFAULT_WIDTH = 840;
export const DEFAULT_HEIGHT = 630;

export const DRAWING_LAYER_NAME = 'drawing-layer';

export const COLOR_PRESETS = [
  { label: 'Black', value: '#000000' },
  { label: 'Red', value: '#EF4444' },
  { label: 'Blue', value: '#3B82F6' },
  { label: 'Green', value: '#22C55E' },
  { label: 'Yellow', value: '#FACC15' },
  { label: 'White', value: '#FFFFFF' },
] as const;

export const BRUSH_WIDTH_OPTIONS = [
  { label: 'Thin', value: 2 },
  { label: 'Medium', value: 6 },
  { label: 'Thick', value: 12 },
] as const;
