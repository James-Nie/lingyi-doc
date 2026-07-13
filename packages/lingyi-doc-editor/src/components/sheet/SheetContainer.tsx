import React from 'react';
import { isBaseSheet, isFreeformSheet } from '@lingyi-doc/core';
import type { SheetContainerProps } from './SheetContainer.types';
import { BaseGridContainer } from './base/BaseGridContainer';
import { FreeformGridContainer } from './freeform/FreeformGridContainer';

export type { SheetContainerProps };

/** 按 sheet 类型路由到多维表 / 普通表格网格容器 */
export const SheetContainer: React.FC<SheetContainerProps> = (props) => {
  const sheet = props.table.sheet;
  if (isBaseSheet(sheet)) {
    return <BaseGridContainer {...props} />;
  }
  if (isFreeformSheet(sheet)) {
    return <FreeformGridContainer {...props} />;
  }
  return <FreeformGridContainer {...props} />;
};
