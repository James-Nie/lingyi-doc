export type AccountSection = 'profile' | 'settings' | 'logs' | 'membership' | 'ai-usage' | 'mcp-tokens';

export interface AccountMenuItem {
  key: AccountSection;
  label: string;
  description: string;
}

export const ACCOUNT_MENU_ITEMS: AccountMenuItem[] = [
  { key: 'profile', label: '个人资料', description: '昵称、头像与账号概览' },
  { key: 'settings', label: '账号设置', description: '密码与安全相关设置' },
  { key: 'logs', label: '登录日志', description: '最近登录设备与 IP 记录' },
  { key: 'membership', label: '会员信息', description: '当前版本、配额与权益' },
  { key: 'ai-usage', label: 'AI 用量', description: 'Token 消耗与调用监控' },
  { key: 'mcp-tokens', label: 'MCP Token', description: '外部 AI 客户端接入授权' },
];

export const DEFAULT_ACCOUNT_SECTION: AccountSection = 'profile';

export function parseAccountSection(raw: string | null): AccountSection {
  if (raw && ACCOUNT_MENU_ITEMS.some(item => item.key === raw)) {
    return raw as AccountSection;
  }
  return DEFAULT_ACCOUNT_SECTION;
}

export function accountSectionPath(section: AccountSection): string {
  return `/account?section=${section}`;
}
