import React from 'react';
import { TOP_BAR_MUTED, TOP_BAR_TEXT } from './styles';

export interface TopBarBreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface TopBarBreadcrumbsProps {
  items: TopBarBreadcrumbItem[];
  pinned?: boolean;
  onTogglePin?: () => void;
  titleEditable?: boolean;
  title?: string;
  onTitleChange?: (title: string) => void;
  subtitle?: string;
  trailing?: React.ReactNode;
}

export const TopBarBreadcrumbs: React.FC<TopBarBreadcrumbsProps> = ({
  items,
  pinned,
  onTogglePin,
  titleEditable,
  title,
  onTitleChange,
  subtitle,
  trailing,
}) => (
  <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        flex: 1,
        fontSize: 14,
        color: TOP_BAR_MUTED,
      }}>
        {items.map((item, index) => (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <span style={{ color: '#c9cdd4', flexShrink: 0 }}>&gt;</span>
            )}
            {item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  color: TOP_BAR_MUTED,
                  fontSize: 14,
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </button>
            ) : (
              <span style={{
                maxWidth: index === items.length - 1 && !titleEditable ? 320 : 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: index === items.length - 1 && !titleEditable ? TOP_BAR_TEXT : TOP_BAR_MUTED,
                fontWeight: index === items.length - 1 && !titleEditable ? 500 : 400,
              }}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        ))}

        {titleEditable && (
          <>
            {items.length > 0 && <span style={{ color: '#c9cdd4', flexShrink: 0 }}>&gt;</span>}
            <input
              type="text"
              value={title ?? ''}
              onChange={e => onTitleChange?.(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              placeholder="未命名文档"
              style={{
                flex: 1,
                minWidth: 80,
                maxWidth: 360,
                border: 'none',
                outline: 'none',
                fontSize: 14,
                fontWeight: 500,
                color: TOP_BAR_TEXT,
                background: 'transparent',
                padding: 0,
              }}
            />
          </>
        )}
      </div>

      {trailing}
    </div>

    {subtitle && (
      <div style={{ fontSize: 12, color: TOP_BAR_MUTED, marginTop: 2, lineHeight: '18px' }}>
        {subtitle}
      </div>
    )}
  </div>
);
