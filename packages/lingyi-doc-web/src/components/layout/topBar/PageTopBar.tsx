import React from 'react';
import { AppTopBar } from './AppTopBar';
import { TopBarToolbar, type TopBarToolbarProps } from './TopBarToolbar';
import { TOP_BAR_MUTED, TOP_BAR_TEXT } from './styles';

interface PageTopBarProps extends TopBarToolbarProps {
  title: string;
  subtitle?: string;
}

/** 非编辑页顶栏：标题 + 统一右侧工具栏 */
export const PageTopBar: React.FC<PageTopBarProps> = ({
  title,
  subtitle,
  ...toolbarProps
}) => (
  <AppTopBar
    left={(
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 600,
          color: TOP_BAR_TEXT,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '2px 0 0', fontSize: 12, color: TOP_BAR_MUTED, lineHeight: '18px' }}>
            {subtitle}
          </p>
        )}
      </div>
    )}
    right={<TopBarToolbar {...toolbarProps} />}
  />
);
