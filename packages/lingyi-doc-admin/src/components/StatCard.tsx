import React from 'react';
import { Skeleton } from 'antd';

export type StatCardTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

interface StatCardProps {
  /** 语义图标：只用线性图标，16/20/24 三档，这里用 20px */
  icon: React.ReactNode;
  tone: StatCardTone;
  /** 指标名，13px 次文本 */
  label: React.ReactNode;
  /** 指标值：数字会等宽渲染（tabular-nums），避免跳动 */
  value: React.ReactNode;
  /** 补充说明（环比、口径），12px 弱文本 */
  hint?: React.ReactNode;
  /** hint 的语义：决定它是中性灰还是涨/跌色 */
  hintTone?: 'neutral' | 'up' | 'down';
  loading?: boolean;
}

const TONE_CLASS: Record<StatCardTone, string> = {
  primary: 'admin-stat-card--primary',
  success: 'admin-stat-card--success',
  warning: 'admin-stat-card--warning',
  danger: 'admin-stat-card--danger',
  neutral: 'admin-stat-card--neutral',
};

const HINT_CLASS = {
  neutral: 'admin-stat-card__hint',
  up: 'admin-stat-card__hint admin-stat-card__hint--up',
  down: 'admin-stat-card__hint admin-stat-card__hint--down',
} as const;

/**
 * KPI 指标卡。
 *
 * 取代「一排光秃秃的 <Statistic>」—— 那种写法所有数字一个样，
 * 「已禁用 0」和「正常 3」在视觉上完全等价，管理员扫一眼抓不到重点。
 *
 * 图标块的底色用语义浅底（10% tint），图标用语义文字版（保证 AA），
 * 图标本身只作识别用途，不承载信息。
 */
export const StatCard: React.FC<StatCardProps> = ({
  icon,
  tone,
  label,
  value,
  hint,
  hintTone = 'neutral',
  loading,
}) => (
  <div className={`admin-stat-card ${TONE_CLASS[tone]}`}>
    <span className="admin-stat-card__icon" aria-hidden="true">{icon}</span>
    <div className="admin-stat-card__body">
      <div className="admin-stat-card__label">{label}</div>
      <div className="admin-stat-card__value">
        {loading ? <Skeleton.Input active size="small" style={{ width: 56 }} /> : value}
      </div>
      {hint !== undefined && <div className={HINT_CLASS[hintTone]}>{hint}</div>}
    </div>
  </div>
);
