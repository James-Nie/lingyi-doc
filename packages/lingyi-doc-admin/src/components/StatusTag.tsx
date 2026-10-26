import React from 'react';

export type AdminTagTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusTagProps {
  tone: AdminTagTone;
  children: React.ReactNode;
  /**
   * 活性状态建议开启：在颜色之外多给一层「圆点」形状线索，
   * 色盲用户不靠颜色也能分辨状态（WCAG 1.4.1）。
   */
  dot?: boolean;
  title?: string;
}

/** 色调 → CSS 修饰符，全部定义在 admin-overrides.css，组件内零色值 */
const TONE_CLASS: Record<AdminTagTone, string> = {
  success: 'admin-status-tag--success',
  warning: 'admin-status-tag--warning',
  danger: 'admin-status-tag--danger',
  info: 'admin-status-tag--info',
  neutral: 'admin-status-tag--neutral',
};

/**
 * 状态胶囊：浅底深字 + 圆角 999 + 12px。
 *
 * 取代散落各页的 `<Tag color="success">` / `<Tag color="green">` / 自绘 span ——
 * 那些写法的圆角从 4 到 999 都有，边框有无也不一致，扫读时区分度低。
 *
 * 用法：`<StatusTag tone="success" dot>正常</StatusTag>`
 */
export const StatusTag: React.FC<StatusTagProps> = ({ tone, children, dot, title }) => (
  <span className={`admin-status-tag ${TONE_CLASS[tone]}`} title={title}>
    {dot && <i className="admin-status-tag__dot" aria-hidden="true" />}
    {children}
  </span>
);
