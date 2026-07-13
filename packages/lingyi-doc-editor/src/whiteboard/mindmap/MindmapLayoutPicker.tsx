import React from 'react';
import type { MindmapLayout, MindNoteBranchStyle } from '@lingyi-doc/core';
import { MINDMAP_LAYOUT_CATEGORIES, MINDMAP_TEMPLATES, WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT } from '@lingyi-doc/core';
import { MindmapLayoutIcon } from './MindmapLayoutIcon';
import { WB_COLORS } from '../styles';

export interface MindmapLayoutPickerProps {
  layout: MindmapLayout | null;
  branchStyle?: MindNoteBranchStyle;
  onLayoutChange: (layout: MindmapLayout) => void;
  onBranchStyleChange?: (style: MindNoteBranchStyle) => void;
  showBranchStyle?: boolean;
}

export const MindmapLayoutPicker: React.FC<MindmapLayoutPickerProps> = ({
  layout,
  branchStyle = WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
  onLayoutChange,
  onBranchStyleChange,
  showBranchStyle = false,
}) => {
  return (
    <div style={{ width: 200 }}>
      {MINDMAP_LAYOUT_CATEGORIES.map((category, index) => {
        const items = MINDMAP_TEMPLATES.filter(t => t.category === category);
        return (
          <section
            key={category}
            style={{ marginBottom: index < MINDMAP_LAYOUT_CATEGORIES.length - 1 ? 14 : 0 }}
          >
            <div style={{
              fontSize: 13,
              fontWeight: 500,
              color: WB_COLORS.text,
              marginBottom: 8,
            }}>
              {category}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 96px)',
              gap: 8,
            }}>
              {items.map(item => (
                <LayoutCard
                  key={item.layout}
                  layout={item.layout}
                  title={item.label}
                  active={layout === item.layout}
                  onClick={() => onLayoutChange(item.layout)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {showBranchStyle && onBranchStyleChange && (
        <section style={{ marginTop: 14 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: WB_COLORS.text,
            marginBottom: 8,
          }}>
            分支线
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['straight', 'curve'] as MindNoteBranchStyle[]).map(style => (
              <button
                key={style}
                type="button"
                onClick={() => onBranchStyleChange(style)}
                style={{
                  flex: 1,
                  height: 32,
                  border: branchStyle === style
                    ? `2px solid ${WB_COLORS.accent}`
                    : `1px solid ${WB_COLORS.border}`,
                  borderRadius: 8,
                  background: branchStyle === style ? '#eef3ff' : '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: branchStyle === style ? WB_COLORS.accent : WB_COLORS.text,
                }}
              >
                {style === 'straight' ? '折线' : '曲线'}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

function LayoutCard({
  layout,
  title,
  active,
  onClick,
}: {
  layout: MindmapLayout;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      style={{
        width: '100%',
        height: 56,
        padding: 6,
        border: active ? `2px solid ${WB_COLORS.accent}` : '1px solid #e0e0e0',
        borderRadius: 8,
        background: active ? '#eef3ff' : '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      <MindmapLayoutIcon layout={layout} size={52} />
    </button>
  );
}
