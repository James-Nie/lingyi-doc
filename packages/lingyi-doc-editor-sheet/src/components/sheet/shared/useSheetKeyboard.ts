import { useEffect, useRef } from 'react';
import type { SheetInteractionDeps } from './sheetInteraction.types';
import { handleSheetKeyDown } from './sheetKeyboardHandler';

export interface UseSheetKeyboardOptions {
  previewMode: boolean;
  deps: SheetInteractionDeps;
}

export function useSheetKeyboard({ previewMode, deps }: UseSheetKeyboardOptions) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    if (previewMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      handleSheetKeyDown(e, depsRef.current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewMode]);
}
