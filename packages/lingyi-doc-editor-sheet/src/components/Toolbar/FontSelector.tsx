import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface FontSelectorProps {
  value: string;
  onChange: (font: string) => void;
}

interface FontCategory {
  name: string;
  fonts: Array<{ name: string; weight?: string }>;
}

// 从截图翻译过来的字体列表
const FONT_CATEGORIES: FontCategory[] = [
  {
    name: '默认',
    fonts: [
      { name: '默认字体' },
    ],
  },
  {
    name: '西文字体',
    fonts: [
      { name: 'Arial' },
      { name: 'Arial Black', weight: 'bold' },
      { name: 'Arial Narrow' },
      { name: 'Arial Unicode MS' },
      { name: 'Courier New' },
      { name: 'Comic Sans MS' },
      { name: 'Georgia' },
      { name: 'Helvetica Neue' },
      { name: 'Impact', weight: 'bold' },
      { name: 'Microsoft Sans Serif' },
      { name: 'Tahoma' },
      { name: 'Times New Roman' },
      { name: 'Trebuchet MS' },
      { name: 'Verdana' },
      { name: 'Geneva' },
      { name: 'Menlo' },
      { name: 'Webdings' },
      { name: 'Wingdings' },
      { name: 'Wingdings 2' },
      { name: 'Wingdings 3' },
    ],
  },
  {
    name: '中文字体',
    fonts: [
      { name: '苹方-简' },
      { name: '苹方-繁' },
      { name: '苹方-港' },
      { name: '冬青黑体简体中文' },
      { name: '宋体-简' },
      { name: '宋体-繁' },
      { name: '华文宋体' },
      { name: '仿宋' },
      { name: '楷体' },
      { name: '宋体' },
      { name: '黑体' },
      { name: '微软雅黑' },
    ],
  },
];

export const FontSelector: React.FC<FontSelectorProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filteredCategories = FONT_CATEGORIES.map(cat => ({
    ...cat,
    fonts: cat.fonts.filter(f =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (cat.name + f.name).toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.fonts.length > 0);

  const triggerRect = triggerRef.current?.getBoundingClientRect();
  const displayFont = value || '默认字体';

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        style={{
          padding: '4px 8px',
          border: '1px solid #ddd',
          borderRadius: 4,
          background: '#fff',
          cursor: 'pointer',
          fontSize: 13,
          height: 32,
          minWidth: 130,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayFont}</span>
        <span style={{ fontSize: 8, color: '#999', flexShrink: 0 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && triggerRect && createPortal(
        <div
          ref={dropdownRef}
          data-sheet-keep-selection
          style={{
            position: 'fixed',
            left: triggerRect.left,
            top: triggerRect.bottom + 4,
            width: 260,
            maxHeight: 400,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            zIndex: 10001,
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #e8e8e8',
          }}
        >
          {/* Search */}
          <div style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', border: '1px solid #e0e0e0', borderRadius: 4,
              background: '#f5f5f5',
            }}>
              <span style={{ color: '#999', fontSize: 14 }}>{'\uD83D\uDD0D'}</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索字体"
                autoFocus
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: 12,
                  color: '#333',
                }}
              />
            </div>
          </div>

          {/* Font list */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filteredCategories.map(cat => (
              <div key={cat.name}>
                <div style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  color: '#999',
                  fontWeight: 500,
                  background: '#fafafa',
                  borderBottom: '1px solid #f0f0f0',
                }}>
                  {cat.name}
                </div>
                {cat.fonts.map(f => {
                  const isActive = value === f.name || (f.name === '默认字体' && !value);
                  return (
                    <div
                      key={f.name}
                      onClick={() => {
                        onChange(f.name === '默认字体' ? '' : f.name);
                        setOpen(false);
                        setSearch('');
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: isActive ? '#e8f0fe' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.target as HTMLElement).style.background = '#f5f5f5'; }}
                      onMouseLeave={e => { if (!isActive) (e.target as HTMLElement).style.background = 'transparent'; }}
                    >
                      <span style={{
                        fontSize: 14,
                        fontFamily: f.name === '默认字体' ? 'inherit' : f.name,
                        fontWeight: f.weight === 'bold' ? 700 : 400,
                        color: '#333',
                      }}>
                        {f.name}
                        {f.name === '默认字体' && <span style={{ fontSize: 10, color: '#999', marginLeft: 8 }}>({displayFont})</span>}
                      </span>
                      {isActive && (
                        <span style={{ color: '#4285F4', fontSize: 14 }}>{'\u2713'}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
