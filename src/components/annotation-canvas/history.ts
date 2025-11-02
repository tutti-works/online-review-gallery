import { useCallback, useRef, useState } from 'react';

import { MAX_HISTORY_ENTRIES } from './constants';
import { cloneLines } from './utils';
import type { LineShape } from './types';

type HistorySnapshot = LineShape[];

type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};

export const useLineHistory = (
  lines: LineShape[],
  setLines: React.Dispatch<React.SetStateAction<LineShape[]>>,
  onDirty: (dirty: boolean) => void,
) => {
  const historyRef = useRef<{ past: HistorySnapshot[]; future: HistorySnapshot[] }>({
    past: [],
    future: [],
  });
  const [historyState, setHistoryState] = useState<HistoryState>({ canUndo: false, canRedo: false });

  const updateState = useCallback(() => {
    const { past, future } = historyRef.current;
    setHistoryState({
      canUndo: past.length > 0,
      canRedo: future.length > 0,
    });
  }, []);

  const resetHistory = useCallback(() => {
    historyRef.current.past = [];
    historyRef.current.future = [];
    setHistoryState({ canUndo: false, canRedo: false });
  }, []);

  const recordSnapshot = useCallback(() => {
    const { past } = historyRef.current;
    past.push(cloneLines(lines));
    if (past.length > MAX_HISTORY_ENTRIES) {
      past.shift();
    }
    historyRef.current.future = [];
    setHistoryState({ canUndo: past.length > 0, canRedo: false });
  }, [lines]);

  const undo = useCallback(() => {
    const { past, future } = historyRef.current;
    const previousSnapshot = past.pop();
    if (!previousSnapshot) {
      return false;
    }

    future.push(cloneLines(lines));
    if (future.length > MAX_HISTORY_ENTRIES) {
      future.shift();
    }

    setLines(cloneLines(previousSnapshot));
    onDirty(true);
    updateState();
    return true;
  }, [lines, onDirty, setLines, updateState]);

  const redo = useCallback(() => {
    const { past, future } = historyRef.current;
    const nextSnapshot = future.pop();
    if (!nextSnapshot) {
      return false;
    }

    past.push(cloneLines(lines));
    if (past.length > MAX_HISTORY_ENTRIES) {
      past.shift();
    }

    setLines(cloneLines(nextSnapshot));
    onDirty(true);
    updateState();
    return true;
  }, [lines, onDirty, setLines, updateState]);

  return {
    recordSnapshot,
    resetHistory,
    undo,
    redo,
    historyState,
  };
};
