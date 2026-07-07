import React from 'react';
import { TopBarToolbar, type TopBarToolbarProps } from './topBar';

/** @deprecated 请使用 TopBarToolbar 或 PageTopBar */
export const PageHeaderActions: React.FC<{ onStub: (name: string) => void } & Partial<TopBarToolbarProps>> = ({
  onStub,
  ...rest
}) => (
  <TopBarToolbar onStub={onStub} {...rest} />
);
