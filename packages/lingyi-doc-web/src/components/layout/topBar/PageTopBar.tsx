import React from 'react';
import { AppTopBar } from './AppTopBar';
import { TopBarToolbar, type TopBarToolbarProps } from './TopBarToolbar';
import { TOP_BAR_MUTED, TOP_BAR_TEXT } from './styles';

interface PageTopBarProps extends TopBarToolbarProps {
  title: string;
  subtitle?: string;
  titleExtra?: React.ReactNode;
}

/** 非编辑页顶栏：标题 + 通用工具栏（不含分享、文档操作等编辑页专属项） */
export const PageTopBar: React.FC<PageTopBarProps> = ({
  title,
  subtitle,
  titleExtra,
  showShare = false,
  showMore = false,
  ...toolbarProps
}) => (
  <AppTopBar
    left={(
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
        {titleExtra}
      </div>
    )}
    right={<TopBarToolbar showShare={showShare} showMore={showMore} {...toolbarProps} />}
  />
);
