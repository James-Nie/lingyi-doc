import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CellRange, DataValidation, SelectOption } from '@lingyi-doc/core';
import {
  createDefaultDropdownOptions,
  DEFAULT_DROPDOWN_OPTION_COLORS,
} from '@lingyi-doc/core';
import { ColorPicker } from './Toolbar/ColorPicker';

export interface DropdownListConfig {
  mode: 'single' | 'multi';
  showOptionColor: boolean;
  options: SelectOption[];
}

interface DropdownListConfigModalProps {
  open: boolean;
  targetRange: CellRange | null;
  initialConfig?: DropdownListConfig | null;
  onClose: () => void;
  onConfirm: (range: CellRange, config: DropdownListConfig) => void;
  onRemove: (range: CellRange) => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.35)',
  zIndex: 10050,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px 12px',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 20px 16px',
  borderTop: '1px solid #ebebeb',
};

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#C9CDD4">
      <circle cx="8" cy="7" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <circle cx="8" cy="17" r="1.5" />
      <circle cx="14" cy="7" r="1.5" />
      <circle cx="14" cy="12" r="1.5" />
      <circle cx="14" cy="17" r="1.5" />
    </svg>
  );
}

export const DropdownListConfigModal: React.FC<DropdownListConfigModalProps> = ({
  open,
  targetRange,
  initialConfig,
  onClose,
  onConfirm,
  onRemove,
}) => {
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [showOptionColor, setShowOptionColor] = useState(true);
  const [options, setOptions] = useState<SelectOption[]>(createDefaultDropdownOptions());
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialConfig?.mode ?? 'single');
    setShowOptionColor(initialConfig?.showOptionColor ?? true);
    setOptions(
      initialConfig?.options?.length
        ? initialConfig.options.map(option => ({ ...option }))
        : createDefaultDropdownOptions(),
    );
    setDragIndex(null);
    // 仅在弹窗打开时初始化，避免父组件重渲染导致输入被重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleAddOption = useCallback(() => {
    setOptions(prev => [
      ...prev,
      {
        id: `opt_${Date.now()}_${prev.length}`,
        name: `选项${prev.length + 1}`,
        color: DEFAULT_DROPDOWN_OPTION_COLORS[prev.length % DEFAULT_DROPDOWN_OPTION_COLORS.length],
      },
    ]);
  }, []);

  const handleRemoveOption = useCallback((index: number) => {
    setOptions(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const handleDrop = useCallback((index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    setOptions(prev => {
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      next.splice(index, 0, item);
      return next;
    });
    setDragIndex(null);
  }, [dragIndex]);

  const handleConfirm = useCallback(() => {
    if (!targetRange) return;
    onConfirm(targetRange, {
      mode,
      showOptionColor,
      options,
    });
  }, [targetRange, mode, showOptionColor, options, onConfirm]);

  const handleRemoveList = useCallback(() => {
    if (!targetRange) return;
    onRemove(targetRange);
  }, [targetRange, onRemove]);

  if (!open || !targetRange) return null;

  return createPortal(
    <div style={overlayStyle} onMouseDown={onClose}>
      <div
        style={modalStyle}
        data-sheet-keep-selection
        data-sheet-dropdown-config
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="下拉列表"
      >
        <div style={headerStyle}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2329' }}>下拉列表</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#86909c',
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '0 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#1f2329', cursor: 'pointer' }}>
              <input
                type="radio"
                checked={mode === 'single'}
                onChange={() => setMode('single')}
              />
              单选
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#1f2329', cursor: 'pointer' }}>
              <input
                type="radio"
                checked={mode === 'multi'}
                onChange={() => setMode('multi')}
              />
              多选
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#1f2329', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showOptionColor}
                onChange={e => setShowOptionColor(e.target.checked)}
              />
              选项颜色
            </label>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#86909c' }}>更多选项设置 &gt;</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {options.map((option, index) => (
              <div
                key={option.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{ cursor: 'grab', display: 'flex', flexShrink: 0 }}>
                  <DragHandleIcon />
                </span>
                {showOptionColor ? (
                  <ColorPicker
                    value={option.color}
                    onChange={color => {
                      setOptions(prev => {
                        const next = [...prev];
                        next[index] = { ...next[index], color };
                        return next;
                      });
                    }}
                    trigger={(
                      <button
                        type="button"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          border: '1px solid #dee0e3',
                          background: option.color,
                          cursor: 'pointer',
                          padding: 0,
                          flexShrink: 0,
                        }}
                        aria-label="选择颜色"
                      />
                    )}
                  />
                ) : (
                  <span style={{ width: 24, flexShrink: 0 }} />
                )}
                <input
                  type="text"
                  value={option.name}
                  placeholder="请输入选项"
                  onChange={e => {
                    const name = e.target.value;
                    setOptions(prev => {
                      const next = [...prev];
                      next[index] = { ...next[index], name };
                      return next;
                    });
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 32,
                    border: '1px solid #dee0e3',
                    borderRadius: 6,
                    padding: '0 10px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveOption(index)}
                  aria-label="删除选项"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#86909c',
                    padding: 4,
                    flexShrink: 0,
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddOption}
            style={{
              marginTop: 10,
              border: 'none',
              background: 'transparent',
              color: '#1f2329',
              fontSize: 13,
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            + 新增选项
          </button>
        </div>

        <div style={footerStyle}>
          <button
            type="button"
            onClick={handleRemoveList}
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 6,
              border: '1px solid #dee0e3',
              background: '#fff',
              color: '#1f2329',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            移除列表
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 32,
                padding: '0 14px',
                borderRadius: 6,
                border: '1px solid #dee0e3',
                background: '#fff',
                color: '#1f2329',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                height: 32,
                padding: '0 14px',
                borderRadius: 6,
                border: 'none',
                background: '#3370ff',
                color: '#fff',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export function validationToDropdownConfig(validation: DataValidation | null): DropdownListConfig | null {
  if (!validation || validation.type !== 'dropdownList') return null;
  return {
    mode: validation.mode ?? 'single',
    showOptionColor: validation.showOptionColor !== false,
    options: validation.options?.map(option => ({ ...option })) ?? createDefaultDropdownOptions(),
  };
}
