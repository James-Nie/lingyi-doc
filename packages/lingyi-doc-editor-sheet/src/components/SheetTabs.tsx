import React, { useCallback, useState } from 'react';
import type { SheetType } from '@lingyi-doc/core-types';

interface SheetInfo {
  id: string;
  name: string;
  type: SheetType;
}

interface SheetTabsProps {
  sheets: SheetInfo[];
  activeId: string;
  onSwitch: (sheetId: string) => void;
  onAdd: (type: SheetType) => void;
  onRename: (sheetId: string, name: string) => void;
  onDelete: (sheetId: string) => void;
}

const typeLabels: Record<SheetType, { label: string; icon: string; color: string }> = {
  freeform: { label: '普通表格', icon: '⊞', color: '#1a73e8' },
  standard: { label: '普通表格', icon: '⊞', color: '#1a73e8' },
  base: { label: '多维表格', icon: '▦', color: '#34a853' },
};

export const SheetTabs: React.FC<SheetTabsProps> = ({ sheets, activeId, onSwitch, onAdd, onRename, onDelete }) => {
  const [showTypeDialog, setShowTypeDialog] = useState(false);

  const handleDoubleClick = useCallback((sheet: SheetInfo) => {
    const newName = prompt('重命名工作表', sheet.name);
    if (newName && newName.trim()) {
      onRename(sheet.id, newName.trim());
    }
  }, [onRename]);

  const handleAddClick = () => {
    setShowTypeDialog(true);
  };

  const handleSelectType = (type: SheetType) => {
    setShowTypeDialog(false);
    onAdd(type);
  };

  return (
    <div
      data-sheet-keep-selection
      style={{
      display: 'flex', alignItems: 'center',
      borderTop: '1px solid #e0e0e0', background: '#f5f5f5',
      minHeight: 30, padding: '0 4px', gap: 1, userSelect: 'none',
      position: 'relative',
    }}>
      {sheets.map(sheet => {
        const typeInfo = typeLabels[sheet.type] || typeLabels.freeform;
        return (
          <div
            key={sheet.id}
            onClick={() => onSwitch(sheet.id)}
            onDoubleClick={() => handleDoubleClick(sheet)}
            style={{
              padding: '2px 12px', cursor: 'pointer', fontSize: 12,
              borderTopLeftRadius: 4, borderTopRightRadius: 4,
              background: sheet.id === activeId ? '#fff' : 'transparent',
              color: sheet.id === activeId ? '#333' : '#888',
              borderBottom: sheet.id === activeId ? '2px solid #1a73e8' : '2px solid transparent',
              position: 'relative' as const, top: sheet.id === activeId ? -1 : 0,
              height: sheet.id === activeId ? 30 : 28,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: sheet.id === activeId ? typeInfo.color : '#aaa',
                fontWeight: 500,
              }}
              title={typeInfo.label}
            >
              {typeInfo.icon}
            </span>
            {sheet.name}
            {sheets.length > 1 && (
              <span onClick={e => { e.stopPropagation(); onDelete(sheet.id); }}
                style={{ marginLeft: 2, fontSize: 10, color: '#999', cursor: 'pointer' }}
                title="删除工作表"
              >✕</span>
            )}
          </div>
        );
      })}
      <div onClick={handleAddClick} style={{
        padding: '2px 8px', cursor: 'pointer', fontSize: 16, color: '#666',
        borderRadius: 4, lineHeight: '24px',
      }} title="添加工作表">+</div>

      {/* 类型选择弹窗 */}
      {showTypeDialog && (
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            left: 8,
            zIndex: 100,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: 12,
            minWidth: 240,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8 }}>
            选择工作表类型
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {([
              { type: 'freeform' as SheetType, label: '普通表格', desc: '类似 Excel 的二维单元格矩阵', icon: '⊞', color: '#1a73e8' },
              { type: 'base' as SheetType, label: '多维表格', desc: '结构化数据表，支持字段类型、多视图与记录管理', icon: '▦', color: '#34a853' },
            ]).map(item => (
              <button
                key={item.type}
                onClick={() => handleSelectType(item.type)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  border: '1px solid #e8e8e8',
                  borderRadius: 6,
                  background: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = item.color;
                  (e.currentTarget as HTMLButtonElement).style.background = '#f8f9fa';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#e8e8e8';
                  (e.currentTarget as HTMLButtonElement).style.background = '#fff';
                }}
              >
                <span style={{ fontSize: 20, color: item.color }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{item.desc}</div>
                </div>
              </button>
            ))}
          </div>
          <div
            style={{
              marginTop: 8,
              textAlign: 'center',
              fontSize: 11,
              color: '#999',
              cursor: 'pointer',
            }}
            onClick={() => setShowTypeDialog(false)}
          >
            取消
          </div>
        </div>
      )}
    </div>
  );
};