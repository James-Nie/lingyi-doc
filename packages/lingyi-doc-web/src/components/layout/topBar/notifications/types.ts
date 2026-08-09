import type React from 'react';

/** 通知动作按钮 */
export interface NotificationAction {
  key: string;
  label: string;
  type?: 'primary' | 'default';
  danger?: boolean;
  icon?: React.ReactNode;
  loading?: boolean;
  onClick: () => void;
}

/** 通用通知项 */
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  actions: NotificationAction[];
  createdAt: number;
}

/** 通知分组 */
export interface NotificationGroup {
  type: string;
  label: string;
  items: NotificationItem[];
}