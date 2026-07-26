import React from 'react';
import type { SheetContainerProps } from '../SheetContainer.types';
import { useSheetGridContext } from '../shared/SheetGridContext';
import { BaseGridContext } from './BaseGridContext';
import { useBaseGridState } from './useBaseGridState';

export type BaseGridOrchestratorProps = Pick<
  SheetContainerProps,
  'table' | 'onOpenFieldConfig' | 'onToggleFieldVisibility' | 'onDeleteField' | 'onAddSheetComment' | 'commentsEnabled' | 'viewIdOverride'
> & {
  children: React.ReactNode;
};

/** 多维表状态层：挂载 base hooks 并通过 Context 向 BaseGridView 提供数据 */
export const BaseGridOrchestrator: React.FC<BaseGridOrchestratorProps> = ({
  table,
  onOpenFieldConfig,
  onToggleFieldVisibility,
  onDeleteField,
  onAddSheetComment,
  commentsEnabled,
  viewIdOverride,
  children,
}) => {
  const host = useSheetGridContext();
  const baseState = useBaseGridState({
    table,
    host,
    onOpenFieldConfig,
    onToggleFieldVisibility,
    onDeleteField,
    onAddSheetComment,
    commentsEnabled,
    viewIdOverride,
  });

  return (
    <BaseGridContext.Provider value={baseState}>
      {children}
    </BaseGridContext.Provider>
  );
};
