/**
 * 工作流编辑器 - 左侧节点库
 */
import React, { useMemo, useState } from 'react';
import { Input, Tooltip } from 'antd';
import { SearchOutlined, DragOutlined } from '@ant-design/icons';
import {
  NODE_TYPE_CATALOG,
  TRIGGER_GROUPS,
  getNodeMeta,
  type NodeTypeMeta,
  type WorkflowNodeType,
} from '@lingyi-doc/core-sheet';

type CategoryKey = 'common' | 'feishu' | 'dingtalk' | 'ai' | 'shortcut';

const CATEGORY_TABS: Array<{ key: CategoryKey; label: string }> = [
  { key: 'common', label: '常用' },
  { key: 'feishu', label: '飞书' },
  { key: 'dingtalk', label: '钉钉' },
  { key: 'ai', label: 'AI' },
  { key: 'shortcut', label: '节点捷径' },
];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  common: '常用',
  feishu: '飞书',
  dingtalk: '钉钉',
  ai: 'AI',
  shortcut: '节点捷径',
};

interface NodeLibraryProps {
  onDragStart?: (type: WorkflowNodeType, e: React.DragEvent<HTMLDivElement>) => void;
  onClickAdd?: (type: WorkflowNodeType) => void;
  /** 过滤模式：只显示指定类型的节点（如 'trigger' 只显示触发器） */
  filterMode?: 'trigger' | 'all';
}

export const NodeLibrary: React.FC<NodeLibraryProps> = ({ onDragStart, onClickAdd, filterMode = 'all' }) => {
  const [activeTab, setActiveTab] = useState<CategoryKey>('common');
  const [keyword, setKeyword] = useState('');

  const grouped = useMemo(() => {
    // 触发器过滤模式：按 TRIGGER_GROUPS 分组展示（AI 表格 / 待办 / 内置工具）
    if (filterMode === 'trigger') {
      const triggers = NODE_TYPE_CATALOG.filter(
        (n) => n.type.startsWith('trigger.') || n.type === 'start',
      );
      const byGroup = new Map<string, NodeTypeMeta[]>();
      for (const t of triggers) {
        const key = t.triggerGroup ?? 'tool';
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key)!.push(t);
      }
      const groups: Array<{ title: string; items: NodeTypeMeta[] }> = [];
      for (const g of TRIGGER_GROUPS) {
        const items = byGroup.get(g.key) ?? [];
        if (items.length) groups.push({ title: g.title, items });
      }
      return groups;
    }

    let catalogItems = NODE_TYPE_CATALOG;

    const filtered = catalogItems.filter((n) => {
      if (keyword.trim()) {
        const k = keyword.trim().toLowerCase();
        return n.label.toLowerCase().includes(k) || n.type.toLowerCase().includes(k);
      }
      return n.category === activeTab;
    });
    if (activeTab === 'common' && !keyword.trim()) {
      const triggers = filtered.filter((n) => n.type.startsWith('trigger.'));
      const logic = filtered.filter((n) => n.type.startsWith('condition.') || n.type.startsWith('loop.'));
      const records = filtered.filter((n) => n.type.startsWith('record.'));
      const others = filtered.filter(
        (n) => !n.type.startsWith('trigger.') && !n.type.startsWith('condition.') && !n.type.startsWith('loop.') && !n.type.startsWith('record.'),
      );
      const groups: Array<{ title: string; items: NodeTypeMeta[] }> = [];
      if (triggers.length) groups.push({ title: '触发器', items: triggers });
      if (logic.length) groups.push({ title: '逻辑', items: logic });
      if (records.length) groups.push({ title: '数据', items: records });
      if (others.length) groups.push({ title: CATEGORY_LABELS[activeTab], items: others });
      return groups;
    }
    if (filtered.length === 0) return [];
    return [{ title: keyword.trim() ? '搜索结果' : CATEGORY_LABELS[activeTab], items: filtered }];
  }, [activeTab, keyword]);

  return (
    <aside className="bwf-library">
      <div className="bwf-library__search">
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#c9cdd4' }} />}
          placeholder="搜索节点"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <div className="bwf-library__tabs">
        {CATEGORY_TABS.map((tab) => (
          <div
            key={tab.key}
            className={`bwf-library__tab ${activeTab === tab.key ? 'bwf-library__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </div>
        ))}
      </div>
      <div className="bwf-library__list">
        {grouped.length === 0 && (
          <div style={{ padding: '24px 12px', color: '#86909c', fontSize: 13, textAlign: 'center' }}>
            没有匹配的节点
          </div>
        )}
        {grouped.map((group, gi) => (
          <div key={group.title} className="bwf-library__group">
            {gi > 0 && <div className="bwf-library__group-divider" />}
            <div className="bwf-library__group-title">{group.title}</div>
            {group.items.map((item) => (
              <Tooltip key={item.type} title={item.description ?? ''} placement="right">
                <div
                  className="bwf-library__item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-bwf-node-type', item.type);
                    e.dataTransfer.effectAllowed = 'copy';
                    onDragStart?.(item.type, e);
                  }}
                  onClick={() => onClickAdd?.(item.type)}
                >
                  <span className="bwf-library__item-icon" style={{ background: item.color }} aria-hidden>
                    {item.icon}
                  </span>
                  <div className="bwf-library__item-body">
                    <div className="bwf-library__item-label">{item.label}</div>
                    {item.description && (
                      <div className="bwf-library__item-desc">{item.description}</div>
                    )}
                  </div>
                  <DragOutlined style={{ color: '#c9cdd4', fontSize: 12 }} />
                </div>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
};

export { getNodeMeta };
