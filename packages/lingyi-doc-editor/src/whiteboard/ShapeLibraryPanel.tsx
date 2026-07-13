import React, { useMemo, useState } from 'react';
import type { ShapeKind, WhiteboardTool } from '@lingyi-doc/core';
import { getShapeRegistry, SHAPE_CATEGORY_IDS } from '@lingyi-doc/core';
import { ShapeIcon } from './ShapeIcon';
import { WB_COLORS, WB_PANEL } from './styles';

export interface ShapeLibraryPanelProps {
  open: boolean;
  selectedKind: ShapeKind | null;
  selectedTool?: WhiteboardTool;
  onClose: () => void;
  onSelectKind: (kind: ShapeKind, categoryId: string) => void;
  onSelectTable?: () => void;
}

type LibraryTab = 'shapes' | 'assets';

export const ShapeLibraryPanel: React.FC<ShapeLibraryPanelProps> = ({
  open,
  selectedKind,
  selectedTool,
  onClose,
  onSelectKind,
  onSelectTable,
}) => {
  const [tab, setTab] = useState<LibraryTab>('shapes');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const registry = getShapeRegistry();
  const categories = useMemo(
    () => registry.listCategories({ enabledOnly: true, includeEmpty: false }),
    [open, query],
  );
  const shapesByCategory = useMemo(() => {
    const q = query.trim();
    return categories.map(cat => ({
      category: cat,
      shapes: registry.listShapes({
        categoryId: cat.id,
        enabledOnly: true,
        query: q || undefined,
      }),
    })).filter(group => group.shapes.length > 0);
  }, [categories, query]);

  if (!open) return null;

  const toggleCategory = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        height: '100%',
        background: WB_PANEL.bg,
        borderRight: WB_PANEL.border,
        boxShadow: WB_PANEL.shadow,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `1px solid ${WB_COLORS.border}`,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: WB_COLORS.text }}>图形库</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭图形库"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            color: WB_COLORS.muted,
          }}
        >
          ×
        </button>
      </header>

      <div style={{ display: 'flex', borderBottom: `1px solid ${WB_COLORS.border}` }}>
        {([
          { id: 'shapes' as const, label: '图形' },
          { id: 'assets' as const, label: '素材' },
        ]).map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderBottom: tab === item.id ? `2px solid ${WB_COLORS.accent}` : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: tab === item.id ? 600 : 400,
              color: tab === item.id ? WB_COLORS.accent : WB_COLORS.text,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'shapes' ? (
        <>
          <div style={{ padding: '10px 12px' }}>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索图形"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                border: `1px solid ${WB_COLORS.border}`,
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 16px' }}>
            {shapesByCategory.map(({ category, shapes }) => {
              const isCollapsed = collapsed[category.id] ?? false;
              return (
                <section key={category.id} style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '6px 2px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 500,
                      color: WB_COLORS.text,
                    }}
                  >
                    <span>{category.label}</span>
                    <span style={{ fontSize: 11, color: WB_COLORS.muted }}>{isCollapsed ? '▸' : '▾'}</span>
                  </button>
                  {!isCollapsed && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 1fr)',
                      gap: 6,
                      marginTop: 4,
                    }}>
                      {shapes.map((shape, idx) => (
                        <ShapeGridButton
                          key={`${category.id}-${shape.kind}-${idx}`}
                          label={shape.label}
                          active={selectedTool !== 'table' && selectedKind === shape.kind}
                          onClick={() => onSelectKind(shape.kind, category.id)}
                        >
                          <ShapeIcon kind={shape.kind} />
                        </ShapeGridButton>
                      ))}
                      {category.id === SHAPE_CATEGORY_IDS.swimlane && onSelectTable && (
                        <ShapeGridButton
                          label="表格"
                          active={selectedTool === 'table'}
                          onClick={onSelectTable}
                        >
                          <TableGridIcon />
                        </ShapeGridButton>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
            {shapesByCategory.length === 0 && (
              <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 13, color: WB_COLORS.muted }}>
                未找到匹配的图形
              </div>
            )}
          </div>

          {(selectedKind || selectedTool === 'table') && (
            <div style={{
              padding: '10px 12px',
              borderTop: `1px solid ${WB_COLORS.border}`,
              fontSize: 12,
              color: WB_COLORS.muted,
              background: '#fafafa',
            }}>
              {selectedTool === 'table'
                ? '已选表格，移动鼠标到右侧画布预览，点击即可放置'
                : '已选图形，移动鼠标到右侧画布预览，点击即可放置'}
            </div>
          )}
        </>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontSize: 13,
          color: WB_COLORS.muted,
          textAlign: 'center',
        }}>
          素材库即将上线
        </div>
      )}
    </div>
  );
};

function TableGridIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="4" width="16" height="16" fill="none" stroke="#333" strokeWidth="1.5" />
      <path d="M4 10h16M4 16h16M10 4v16M16 4v16" stroke="#333" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function ShapeGridButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            padding: '5px 10px',
            background: '#1f2329',
            color: '#ffffff',
            fontSize: 12,
            lineHeight: 1.2,
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          {label}
        </div>
      )}
      <button
        type="button"
        title={label}
        onClick={onClick}
        style={{
          width: 40,
          height: 40,
          border: active ? `2px solid ${WB_COLORS.accent}` : '1px solid transparent',
          borderRadius: 8,
          background: active ? '#eef3ff' : hover ? '#f0f1f2' : '#fff',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {children}
      </button>
    </div>
  );
}
