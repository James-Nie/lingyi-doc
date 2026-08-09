import React from 'react';
import { formatRelativeModified } from '../../utils/formatDate';

interface WikiSpaceHomeContentProps {
  spaceName: string;
  lastModified?: number;
}

export const WikiSpaceHomeContent: React.FC<WikiSpaceHomeContentProps> = ({
  spaceName,
  lastModified,
}) => (
  <div style={{ background: '#fff' }}>
    <div style={{
      width: '100%',
      height: 220,
      background: 'linear-gradient(180deg, #f7f8fa 0%, #eceff3 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          linear-gradient(120deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.2) 45%, transparent 70%),
          radial-gradient(circle at 70% 30%, rgba(200,220,255,0.45), transparent 45%)
        `,
      }} />
      <div style={{
        position: 'absolute',
        left: '12%',
        bottom: 0,
        width: '76%',
        height: 140,
        borderRadius: '12px 12px 0 0',
        background: 'linear-gradient(180deg, #ffffff 0%, #f3f5f8 100%)',
        boxShadow: '0 -8px 24px rgba(31,35,41,0.08)',
      }} />
      <div style={{
        position: 'absolute',
        left: '18%',
        bottom: 24,
        width: 48,
        height: 88,
        borderRadius: 4,
        background: 'rgba(255,255,255,0.75)',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
      }} />
      <div style={{
        position: 'absolute',
        right: '18%',
        bottom: 24,
        width: 48,
        height: 88,
        borderRadius: 4,
        background: 'rgba(255,255,255,0.75)',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
      }} />
    </div>

    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 48px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button
          type="button"
          aria-label="页面菜单"
          style={{
            width: 28,
            height: 28,
            border: 'none',
            borderRadius: 6,
            background: 'transparent',
            color: '#8f959e',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="7" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="5" cy="17" r="1.5" />
            <circle cx="12" cy="7" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="17" r="1.5" />
          </svg>
        </button>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, color: '#1f2329', lineHeight: 1.2 }}>
          首页
        </h1>
      </div>

      <p style={{ margin: '0 0 28px', fontSize: 15, lineHeight: 1.8, color: '#646a73' }}>
        欢迎来到 {spaceName} 知识空间！本页面将帮助你了解知识空间的主要用途，以及如何更好地使用与协作。
        {lastModified ? ` 最近更新于 ${formatRelativeModified(lastModified)}。` : ''}
      </p>

      <Section
        emoji="🎯"
        title="愿景和目标"
        description="明确团队知识沉淀方向，让每位成员都能快速找到所需信息，提升协作效率。"
      />
      <Section
        emoji="⛳"
        title="知识空间简介"
        description={`${spaceName} 用于集中管理团队文档、项目资料与经验沉淀，支持目录化组织与权限管控。`}
      />
      <Section
        emoji="⭐"
        title="常用文档和链接"
        description="可将高频访问的文档、表格与外部链接固定在本页，方便成员快速进入。"
      />
      <Section
        emoji="💡"
        title="知识空间帮助"
        description="使用左侧目录添加文档，通过顶部搜索快速定位内容；如需协作可邀请成员加入空间。"
      />
    </div>
  </div>
);

function Section({
  emoji,
  title,
  description,
}: {
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1f2329' }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 2, background: '#e5e6eb', borderRadius: 1, flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: '#646a73' }}>{description}</p>
      </div>
    </div>
  );
}
