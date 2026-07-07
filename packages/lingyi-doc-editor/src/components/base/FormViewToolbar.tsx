import React from 'react';
import { BASE_THEME } from '@lingyi-doc/core';

interface FormViewToolbarProps {
  tab: 'edit' | 'fill';
  onTabChange: (tab: 'edit' | 'fill') => void;
}

export const FormViewToolbar: React.FC<FormViewToolbarProps> = ({ tab, onTabChange }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    padding: '8px 16px', borderBottom: `1px solid ${BASE_THEME.toolbarBorder}`,
    background: BASE_THEME.toolbarBg, minHeight: 44, flexShrink: 0,
  }}>
    <div style={{
      display: 'inline-flex', background: '#EDEEF0', borderRadius: 8, padding: 3, gap: 2,
    }}>
      {([
        { key: 'edit' as const, label: '编辑表单', icon: '✎' },
        { key: 'fill' as const, label: '填写表单', icon: '📋' },
      ]).map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onTabChange(t.key)}
          style={{
            border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer',
            fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: tab === t.key ? BASE_THEME.primaryColor : 'transparent',
            color: tab === t.key ? '#fff' : BASE_THEME.headerTextColor,
            fontWeight: tab === t.key ? 500 : 400,
            boxShadow: tab === t.key ? '0 1px 3px rgba(51, 112, 255, 0.3)' : 'none',
          }}
        >
          <span>{t.icon}</span>{t.label}
        </button>
      ))}
    </div>
    <div style={{ position: 'absolute', right: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        fontSize: 13, color: BASE_THEME.headerTextColor, display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <span>🔒</span> 分享表单
      </button>
    </div>
  </div>
);
