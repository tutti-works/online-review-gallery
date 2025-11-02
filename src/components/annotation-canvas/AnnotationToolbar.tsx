import {
  Circle,
  Eraser,
  Hand,
  MousePointer2,
  Palette,
  Pencil,
  Redo2,
  Save,
  Trash,
  Trash2,
  Undo2,
} from 'lucide-react';

import { BRUSH_WIDTH_OPTIONS, COLOR_PRESETS } from './constants';
import type { ToolMode } from './types';

type AnnotationToolbarProps = {
  mode: ToolMode;
  controlsDisabled: boolean;
  isDirty: boolean;
  saving: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'saved';
  onModeChange: (mode: ToolMode) => void;
  colorPaletteExpanded: boolean;
  onColorPaletteToggle: () => void;
  onColorSelect: (color: string) => void;
  brushSizeExpanded: boolean;
  onBrushSizeToggle: () => void;
  brushColor: string;
  activeStrokeWidth: number;
  onBrushWidthChange: (value: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  onClearAll: () => void;
  clearAllPending: boolean;
  hasLines: boolean;
  onManualSave: () => void;
};

const TOOL_BUTTON_BASE =
  'flex items-center justify-center w-12 h-12 transition group relative text-gray-300 hover:bg-gray-700 hover:text-white';

export const AnnotationToolbar = ({
  mode,
  controlsDisabled,
  isDirty,
  saving,
  autoSaveStatus,
  onModeChange,
  colorPaletteExpanded,
  onColorPaletteToggle,
  onColorSelect,
  brushSizeExpanded,
  onBrushSizeToggle,
  brushColor,
  activeStrokeWidth,
  onBrushWidthChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDeleteSelected,
  hasSelection,
  onClearAll,
  clearAllPending,
  hasLines,
  onManualSave,
}: AnnotationToolbarProps) => {
  const isDrawMode = mode === 'draw';
  const isSelectMode = mode === 'select';
  const isEraseMode = mode === 'erase';
  const isPanMode = mode === 'pan';

  const buttonDisabledClass = controlsDisabled ? 'cursor-not-allowed opacity-50' : '';

  const renderTooltip = (label: string) => (
    <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
      {label}
    </span>
  );

  const toolbarTranslate =
    autoSaveStatus !== 'idle' || (isDirty && !saving) ? 'translateY(calc(-50% + 24px))' : 'translateY(-50%)';

  return (
    <div className="absolute left-4 top-1/2 z-20" style={{ transform: toolbarTranslate }}>
      <div className="flex flex-col rounded-lg bg-gray-700 bg-opacity-90 backdrop-blur-sm shadow-2xl">
        <div className="flex flex-col border-b border-gray-700">
          <button
            type="button"
            onClick={() => onModeChange('draw')}
            disabled={controlsDisabled}
            className={`${TOOL_BUTTON_BASE} ${isDrawMode ? 'bg-blue-500 text-white' : ''} ${buttonDisabledClass} first:rounded-t-lg`}
            title="Draw"
          >
            <Pencil size={20} />
            {renderTooltip('Draw')}
          </button>
          <button
            type="button"
            onClick={() => onModeChange('select')}
            disabled={controlsDisabled}
            className={`${TOOL_BUTTON_BASE} ${isSelectMode ? 'bg-blue-500 text-white' : ''} ${buttonDisabledClass}`}
            title="Select"
          >
            <MousePointer2 size={20} />
            {renderTooltip('Select')}
          </button>
          <button
            type="button"
            onClick={() => onModeChange('erase')}
            disabled={controlsDisabled}
            className={`${TOOL_BUTTON_BASE} ${isEraseMode ? 'bg-blue-500 text-white' : ''} ${buttonDisabledClass}`}
            title="Erase"
          >
            <Eraser size={20} />
            {renderTooltip('Erase')}
          </button>
          <button
            type="button"
            onClick={() => onModeChange('pan')}
            disabled={controlsDisabled}
            className={`${TOOL_BUTTON_BASE} ${isPanMode ? 'bg-blue-500 text-white' : ''} ${buttonDisabledClass}`}
            title="Pan"
          >
            <Hand size={20} />
            {renderTooltip('Pan')}
          </button>
        </div>

        <div className="border-b border-gray-700 relative">
          <button
            type="button"
            onClick={onColorPaletteToggle}
            disabled={controlsDisabled}
            className={`${TOOL_BUTTON_BASE} ${colorPaletteExpanded ? 'bg-gray-700' : ''} ${buttonDisabledClass}`}
            title="Color"
          >
            <div className="relative">
              <Palette size={20} />
              <div
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-800"
                style={{ backgroundColor: brushColor }}
              />
            </div>
            {renderTooltip('Color')}
          </button>
          {colorPaletteExpanded && (
            <div className="absolute left-full top-0 ml-2 p-2.5 rounded-lg bg-gray-700 bg-opacity-90 backdrop-blur-sm shadow-2xl z-20 min-w-max">
              <div className="grid grid-cols-2 gap-2.5">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = brushColor.toLowerCase() === preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => onColorSelect(preset.value)}
                      disabled={controlsDisabled}
                      className={`w-9 h-9 rounded-full border-2 transition flex-shrink-0 ${
                        isSelected ? 'border-blue-400 ring-2 ring-blue-300' : 'border-gray-600 hover:border-gray-400'
                      } ${buttonDisabledClass}`}
                      style={{ backgroundColor: preset.value }}
                      title={preset.label}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="border-b border-gray-700 relative">
          <button
            type="button"
            onClick={onBrushSizeToggle}
            disabled={controlsDisabled}
            className={`${TOOL_BUTTON_BASE} ${brushSizeExpanded ? 'bg-gray-700' : ''} ${buttonDisabledClass}`}
            title="Brush Size"
          >
            <Circle size={Math.min(activeStrokeWidth * 2, 24)} />
            {renderTooltip('Size')}
          </button>
          {brushSizeExpanded && (
            <div className="absolute left-full top-0 ml-2 p-2 rounded-lg bg-gray-700 bg-opacity-90 backdrop-blur-sm shadow-2xl z-20">
              <div className="flex flex-col gap-1">
                {BRUSH_WIDTH_OPTIONS.map((option) => {
                  const isSelected = activeStrokeWidth === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onBrushWidthChange(option.value)}
                      disabled={controlsDisabled}
                      className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition whitespace-nowrap ${
                        isSelected ? 'bg-blue-500 text-white' : 'text-gray-200 hover:bg-gray-600'
                      } ${buttonDisabledClass}`}
                    >
                      <Circle size={option.value * 2} />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <button
            type="button"
            onClick={onUndo}
            disabled={controlsDisabled || !canUndo}
            className={`${TOOL_BUTTON_BASE} ${
              controlsDisabled || !canUndo ? 'cursor-not-allowed text-gray-500' : ''
            } ${controlsDisabled ? 'opacity-50' : ''}`}
            title="Undo"
          >
            <Undo2 size={20} />
            {renderTooltip('Undo')}
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={controlsDisabled || !canRedo}
            className={`${TOOL_BUTTON_BASE} ${
              controlsDisabled || !canRedo ? 'cursor-not-allowed text-gray-500' : ''
            } ${controlsDisabled ? 'opacity-50' : ''}`}
            title="Redo"
          >
            <Redo2 size={20} />
            {renderTooltip('Redo')}
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={controlsDisabled || !hasSelection}
            className={`${TOOL_BUTTON_BASE} ${
              controlsDisabled || !hasSelection ? 'cursor-not-allowed text-gray-500' : ''
            } ${controlsDisabled ? 'opacity-50' : ''}`}
            title="Delete Selected"
          >
            <Trash2 size={20} />
            {renderTooltip('Delete')}
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={controlsDisabled || !hasLines}
            className={`${TOOL_BUTTON_BASE} ${
              clearAllPending
                ? 'bg-red-600 text-white animate-pulse'
                : controlsDisabled || !hasLines
                ? 'cursor-not-allowed text-gray-500'
                : 'hover:bg-red-600/20 hover:text-red-400'
            } ${controlsDisabled ? 'opacity-50' : ''}`}
            title={clearAllPending ? 'Click again to confirm' : 'Clear All Annotations'}
          >
            <Trash size={20} fill={clearAllPending ? 'currentColor' : 'none'} />
            {renderTooltip(clearAllPending ? 'Click to confirm' : 'Clear All')}
          </button>
          <button
            type="button"
            onClick={onManualSave}
            disabled={controlsDisabled || !isDirty}
            className={`${TOOL_BUTTON_BASE} ${
              controlsDisabled || !isDirty
                ? 'cursor-not-allowed text-gray-500'
                : 'text-blue-400 hover:bg-blue-600 hover:text-white'
            } ${controlsDisabled ? 'opacity-50' : ''}`}
            title="Save"
          >
            <Save size={20} />
            {renderTooltip('Save')}
          </button>

          {(autoSaveStatus !== 'idle' || (isDirty && !saving)) && (
            <div className="flex items-center justify-center w-12 h-12 border-t border-gray-700 group relative rounded-b-lg">
              {autoSaveStatus === 'saving' && (
                <>
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-blue-300 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Saving...
                  </span>
                </>
              )}
              {autoSaveStatus === 'saved' && (
                <>
                  <div className="text-green-400 text-lg">✓</div>
                  <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-green-300 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Saved
                  </span>
                </>
              )}
              {isDirty && !saving && autoSaveStatus === 'idle' && (
                <>
                  <div className="text-orange-400 text-lg">⚠</div>
                  <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-orange-300 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Unsaved changes
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
