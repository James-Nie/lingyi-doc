import { useCallback, useRef } from 'react';
import type { SheetInteractionDeps } from './sheetInteraction.types';
import { handleSheetMouseDown } from './mouse/sheetMouseDown';
import { handleSheetMouseMove } from './mouse/sheetMouseMove';
import { handleSheetMouseUp } from './mouse/sheetMouseUp';
import { handleSheetDoubleClick } from './mouse/sheetDoubleClick';
import { handleSheetContextMenu } from './mouse/sheetContextMenu';

export function useSheetMouseHandlers(deps: SheetInteractionDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handleSheetMouseDown(e, depsRef.current);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    handleSheetMouseMove(e, depsRef.current);
  }, []);

  const handleMouseUp = useCallback((_e?: React.MouseEvent) => {
    handleSheetMouseUp(depsRef.current);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    handleSheetDoubleClick(e, depsRef.current);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    handleSheetContextMenu(e, depsRef.current);
  }, []);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleContextMenu,
  };
}
