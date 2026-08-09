import React from 'react';
import { topBarShellStyle } from './styles';

interface AppTopBarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** 统一顶栏容器：左侧信息区 + 右侧操作区 */
export const AppTopBar: React.FC<AppTopBarProps> = ({ left, right, style }) => (
  <header
    data-sheet-keep-selection
    style={{ ...topBarShellStyle, ...style }}
  >
    {left ? (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
        {left}
      </div>
    ) : <div style={{ flex: 1 }} />}
    {right}
  </header>
);
