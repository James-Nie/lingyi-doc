import React from 'react';
import { AppLogo, APP_NAME } from '../AppLogo';

/** 公开表单页底部品牌支持条 */
export const PublicFormSupportFooter: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 28,
    padding: '0 8px 8px',
    color: '#8f959e',
    fontSize: 13,
    lineHeight: '20px',
    userSelect: 'none',
  }}>
    <span style={{ flex: 1, height: 1, background: '#d0d3d6', maxWidth: 120 }} />
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
      whiteSpace: 'nowrap',
    }}>
      <AppLogo size={16} alt={APP_NAME} />
      <span>{APP_NAME}提供支持</span>
    </span>
    <span style={{ flex: 1, height: 1, background: '#d0d3d6', maxWidth: 120 }} />
  </div>
);
