import React from 'react';
import { isFreeformSheet } from '@lingyi-doc/core';
import type { SheetContainerProps } from '../SheetContainer.types';
import { SheetGridHost } from '../shared/SheetGridContext';
import { FreeformGridView } from './FreeformGridView';

/** 普通表格（Freeform）网格视图入口 */
export const FreeformGridContainer: React.FC<SheetContainerProps> = (props) => {
  if (!isFreeformSheet(props.table.sheet)) {
    return null;
  }
  return (
    <SheetGridHost mode="freeform">
      <FreeformGridView {...props} />
    </SheetGridHost>
  );
};
