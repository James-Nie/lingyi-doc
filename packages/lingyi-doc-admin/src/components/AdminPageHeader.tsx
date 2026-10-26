import React from 'react';

export interface AdminPageHeaderCrumb {
  title: string;
  to?: string;
}

interface AdminPageHeaderProps {
  /** 页面标题：全站唯一最强层级，20px/600 */
  title: React.ReactNode;
  /** 一句话说明这个页面做什么，14px 次文本 */
  description?: React.ReactNode;
  /**
   * 面包屑。顶栏已经有一条了，这里只在该页需要强调层级时使用；
   * 大多数页面不传，避免出现两条面包屑。
   */
  breadcrumb?: AdminPageHeaderCrumb[];
  /** 右侧操作区：主按钮 + 次按钮，窄屏自动换行 */
  extra?: React.ReactNode;
}

/**
 * 全站唯一的页面页头。
 *
 * 取代各页手写的 `<h2 style={{marginTop:0}}>` / `<Typography.Title level={3}>` /
 * `<Card title="...">` 三种混用写法 —— 这三种并存时，用户无法从字号判断页面层级。
 */
export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  title,
  description,
  breadcrumb,
  extra,
}) => (
  <header className="admin-page-header">
    <div className="admin-page-header__main">
      {breadcrumb && breadcrumb.length > 1 && (
        <nav className="admin-page-header__crumbs" aria-label="页面路径">
          {breadcrumb.map((c, i) => (
            <React.Fragment key={`${c.title}-${i}`}>
              {i > 0 && <span className="admin-page-header__sep" aria-hidden="true">/</span>}
              {c.to ? <a href={c.to}>{c.title}</a> : <span>{c.title}</span>}
            </React.Fragment>
          ))}
        </nav>
      )}
      <h1 className="admin-page-header__title">{title}</h1>
      {description && <p className="admin-page-header__desc">{description}</p>}
    </div>
    {extra && <div className="admin-page-header__actions">{extra}</div>}
  </header>
);
