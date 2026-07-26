import React, { useMemo, useState } from 'react';
import { Input, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { DashboardWidgetType } from '@lingyi-doc/core-types';

export interface AddComponentItem {
  type: DashboardWidgetType;
  label: string;
  /** 简洁图标字符 / emoji，紫底卡片内展示 */
  icon: string;
  group: '图表' | '视图' | '组件';
  isNew?: boolean;
  /** false 时仍展示但点击提示后续支持 */
  enabled?: boolean;
}

/**
 * 添加面板清单（对齐产品图示分组与条目）。
 * enabled=false 的项可展示；点击时给出「后续版本」提示。
 */
export const ADD_COMPONENT_ITEMS: AddComponentItem[] = [
  // —— 图表 ——
  { type: 'metric.card', label: '指标卡', icon: '123↑', group: '图表' },
  { type: 'metric.number', label: '统计数字', icon: '123.4', group: '图表' },
  { type: 'chart.column', label: '柱状图', icon: '▮▮', group: '图表' },
  { type: 'chart.line', label: '折线图', icon: '╱╲', group: '图表' },
  { type: 'chart.bar', label: '条形图', icon: '▭▭', group: '图表' },
  { type: 'chart.area', label: '面积图', icon: '▁▃▅', group: '图表' },
  { type: 'chart.pie', label: '饼图', icon: '◔', group: '图表' },
  { type: 'chart.donut', label: '环形图', icon: '◎', group: '图表', isNew: true },
  { type: 'chart.combo', label: '组合图', icon: '▮〰', group: '图表' },
  { type: 'chart.radar', label: '雷达图', icon: '⬠', group: '图表' },
  { type: 'chart.scatter', label: '散点图', icon: '∵', group: '图表' },
  { type: 'chart.bubble', label: '气泡图', icon: '〇〇', group: '图表' },
  { type: 'chart.funnel', label: '漏斗图', icon: '▽', group: '图表' },
  { type: 'chart.wordCloud', label: '词云', icon: '☁', group: '图表' },
  { type: 'chart.bidirectionalBar', label: '对比条形图', icon: '↔', group: '图表', isNew: true },
  { type: 'chart.sankey', label: '桑基图', icon: '≋', group: '图表', isNew: true },
  { type: 'chart.treemap', label: '矩形树图', icon: '▦', group: '图表', isNew: true },

  // —— 视图 ——
  { type: 'view.grid', label: '表格', icon: '⊞', group: '视图' },
  { type: 'view.kanban', label: '看板', icon: '▥', group: '视图', enabled: false },
  { type: 'view.calendar', label: '日历', icon: '▦', group: '视图', enabled: false },
  { type: 'view.gantt', label: '甘特', icon: '☰', group: '视图', enabled: false },
  { type: 'view.gallery', label: '画册', icon: '▣', group: '视图', enabled: false },

  // —— 组件 ——
  { type: 'pivot', label: '透视表', icon: '⧉', group: '组件', enabled: false },
  { type: 'text', label: '文本', icon: 'T', group: '组件' },
  { type: 'button', label: '按钮', icon: '⏎', group: '组件', enabled: false },
  { type: 'image', label: '图片', icon: '🖼', group: '组件', enabled: false },
  { type: 'rank.list', label: '排行榜', icon: '1·2·3', group: '组件' },
  { type: 'progress', label: '进度图', icon: '61%', group: '组件' },
  { type: 'countdown', label: '倒计时', icon: '05', group: '组件', enabled: false },
  { type: 'nps', label: 'NPS 图', icon: '◔', group: '组件', enabled: false },
  { type: 'filter', label: '过滤器', icon: '▽', group: '组件', enabled: false },
  { type: 'layout.combo', label: '组合布局', icon: '▦', group: '组件', enabled: false },
  { type: 'tabs', label: '标签页', icon: '⧉', group: '组件', enabled: false },
  { type: 'lottery', label: '抽奖', icon: '999', group: '组件', enabled: false },
  { type: 'ai.chart', label: 'AI 分析图表', icon: '✦', group: '组件', isNew: true, enabled: false },
];

interface AddComponentPanelProps {
  open: boolean;
  onClose: () => void;
  onAdd: (type: DashboardWidgetType) => void;
}

export const AddComponentPanel: React.FC<AddComponentPanelProps> = ({ open, onClose, onAdd }) => {
  const [keyword, setKeyword] = useState('');
  const groups = useMemo(() => {
    const filtered = ADD_COMPONENT_ITEMS.filter(item =>
      !keyword || item.label.includes(keyword.trim()),
    );
    const order: Array<AddComponentItem['group']> = ['图表', '视图', '组件'];
    return order
      .map(group => [group, filtered.filter(i => i.group === group)] as const)
      .filter(([, items]) => items.length > 0);
  }, [keyword]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'transparent', zIndex: 1000 }}
      />
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 16,
          width: 420,
          maxHeight: '75vh',
          overflow: 'auto',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
          border: '1px solid #f0f0f0',
          zIndex: 1001,
          padding: 12,
        }}
      >
        <Input
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="搜索"
          allowClear
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          style={{ marginBottom: 12, borderRadius: 20 }}
        />
        {groups.map(([group, items]) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', margin: '4px 4px 8px' }}>{group}</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 8,
              }}
            >
              {items.map(item => {
                const disabled = item.enabled === false;
                return (
                  <button
                    key={`${item.group}-${item.type}-${item.label}`}
                    type="button"
                    onClick={() => {
                      if (disabled) {
                        message.info(`「${item.label}」将在后续版本提供`);
                        return;
                      }
                      onAdd(item.type);
                      onClose();
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      opacity: disabled ? 0.55 : 1,
                      padding: 6,
                      borderRadius: 8,
                      position: 'relative',
                    }}
                  >
                    {item.isNew && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          background: '#fa8c16',
                          color: '#fff',
                          fontSize: 9,
                          borderRadius: 8,
                          padding: '0 4px',
                          lineHeight: '14px',
                          zIndex: 1,
                        }}
                      >
                        新增
                      </span>
                    )}
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        margin: '0 auto 4px',
                        borderRadius: 10,
                        background: '#f3e8ff',
                        color: '#7c3aed',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 15,
                        fontWeight: 600,
                        letterSpacing: -0.5,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#595959',
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
