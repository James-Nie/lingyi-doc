/** 格式化创建时间 */
export function formatCreatedAt(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();

  if (sameYear) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 格式化最近访问时间 */
export function formatLastVisited(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) {
    return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (diffDays === 1) {
    return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 格式化相对修改时间，如「1 小时前」 */
export function formatRelativeModified(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return formatLastVisited(ts);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 根据名称生成头像背景色 */
export function getAvatarColor(name: string): string {
  const colors = ['#7c3aed', '#ea580c', '#2563eb', '#059669', '#dc2626', '#0891b2', '#db2777'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** 获取头像文字 */
export function getAvatarText(name: string): string {
  if (!name || name === '—') return '?';
  return name.length <= 2 ? name : name.slice(-2);
}
