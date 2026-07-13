import React from 'react';
import { isBaseSheet } from '@lingyi-doc/core';
import type { SheetContainerProps } from '../SheetContainer.types';
import { SheetGridHost } from '../shared/SheetGridContext';
import { BaseGridView } from './BaseGridView';
import { BaseGridOrchestrator } from './BaseGridOrchestrator';

/** 多维表（Base）网格视图入口 */
export const BaseGridContainer: React.FC<SheetContainerProps> = (props) => {
  if (!isBaseSheet(props.table.sheet)) {
    return null;
  }
  return (
    <SheetGridHost mode="base">
      <BaseGridOrchestrator
        table={props.table}
        onOpenFieldConfig={props.onOpenFieldConfig}
        onToggleFieldVisibility={props.onToggleFieldVisibility}
        onDeleteField={props.onDeleteField}
        onAddSheetComment={props.onAddSheetComment}
        commentsEnabled={props.commentsEnabled}
      >
        <BaseGridView {...props} />
      </BaseGridOrchestrator>
    </SheetGridHost>
  );
};
