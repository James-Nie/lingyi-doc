import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BASE_THEME } from '@lingyi-doc/core-sheet';

export interface FormDropdownOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  searchText?: string;
}

interface FormDropdownProps<T extends string> {
  value: T;
  options: FormDropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  minMenuWidth?: number;
  renderValue?: (option: FormDropdownOption<T> | undefined) => React.ReactNode;
}

const triggerBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  minHeight: 32,
  padding: '5px 10px',
  borderRadius: 6,
  border: `1px solid ${BASE_THEME.gridColor}`,
  background: '#fff',
  fontSize: 13,
  color: BASE_THEME.cellTextColor,
  cursor: 'pointer',
  boxSizing: 'border-box',
  textAlign: 'left',
};

export function FormDropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder = '请选择',
  searchable = false,
  searchPlaceholder = '搜索',
  disabled = false,
  minMenuWidth = 200,
  renderValue,
}: FormDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find(o => o.value === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => (o.searchText ?? String(o.value)).toLowerCase().includes(q));
  }, [options, search]);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, minMenuWidth),
      zIndex: 1200,
    });
  }, [minMenuWidth]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onScroll = () => updateMenuPosition();
    const onResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const menu = open && !disabled ? createPortal(
    <div
      ref={menuRef}
      style={{
        ...menuStyle,
        background: '#fff',
        borderRadius: 8,
        border: `1px solid ${BASE_THEME.gridColor}`,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
        overflow: 'hidden',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {searchable && (
        <div style={{ padding: '8px 12px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#86909c', fontSize: 14 }}>🔍</span>
            <input
              autoFocus
              value={search}
              placeholder={searchPlaceholder}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 13,
                color: BASE_THEME.cellTextColor,
                background: 'transparent',
              }}
            />
          </div>
          <div style={{ marginTop: 8, borderBottom: `1px solid ${BASE_THEME.gridColor}` }} />
        </div>
      )}
      <div id={listId} role="listbox" style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: 13, color: BASE_THEME.secondaryTextColor }}>
            无匹配项
          </div>
        ) : filtered.map(option => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                setSearch('');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: isSelected ? BASE_THEME.primaryColor : BASE_THEME.cellTextColor,
                textAlign: 'left',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F2F3F5'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {option.label}
              </span>
              {isSelected && (
                <span style={{ color: BASE_THEME.primaryColor, fontSize: 14, flexShrink: 0 }}>✓</span>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={e => {
          e.stopPropagation();
          if (disabled) return;
          setOpen(v => !v);
        }}
        onMouseDown={e => e.stopPropagation()}
        style={{
          ...triggerBaseStyle,
          borderColor: open ? BASE_THEME.primaryColor : BASE_THEME.gridColor,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {renderValue
            ? renderValue(selected)
            : selected
              ? selected.label
              : <span style={{ color: BASE_THEME.secondaryTextColor }}>{placeholder}</span>}
        </span>
        <span style={{ color: '#86909c', fontSize: 10, flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>
      {menu}
    </>
  );
}
