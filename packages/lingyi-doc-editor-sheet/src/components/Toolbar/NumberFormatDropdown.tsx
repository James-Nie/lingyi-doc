import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface NumberFormatDropdownProps {
  value: string;
  onChange: (format: string) => void;
  /** 工具栏紧凑样式：全宽下拉，与字体区 select 对齐 */
  compact?: boolean;
}

interface FormatOption {
  value: string;
  label: string;
  preview: string;
  category?: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { value: 'general', label: '常规', preview: '' },
  { value: 'text', label: '纯文本', preview: '' },
  { value: 'number', label: '数字', preview: '1024' },
  { value: 'number_comma', label: '数字（千分位）', preview: '1,024' },
  { value: 'number_decimal', label: '数字（千分位，小数点）', preview: '1,024.56' },
  { value: 'percent', label: '百分比', preview: '10%' },
  { value: 'percent_decimal', label: '百分比（小数点）', preview: '10.24%' },
  { value: 'scientific', label: '科学记数', preview: '1.02E+03' },
  { value: 'cny', label: '人民币', preview: '\u00A51,024' },
  { value: 'cny_decimal', label: '人民币（小数点）', preview: '\u00A51,024.56' },
  { value: 'usd', label: '美元', preview: '$1,024' },
  { value: 'usd_decimal', label: '美元（小数点）', preview: '$1,024.56' },
  { value: 'date_slash', label: '日期', preview: '2017/08/01' },
  { value: 'date_dash', label: '日期', preview: '2017-08-01' },
  { value: 'time', label: '时间', preview: '23:24:25' },
  { value: 'datetime', label: '日期时间', preview: '2017/08/01 23:24:25' },
];

export const NumberFormatDropdown: React.FC<NumberFormatDropdownProps> = ({ value, onChange, compact }) => {
  const [open, setOpen] = useState(false);
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

  const triggerRect = triggerRef.current?.getBoundingClientRect();
  const currentFormat = FORMAT_OPTIONS.find(f => f.value === value);
  const displayLabel = currentFormat?.label || '常规';

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        style={{
          padding: compact ? '2px 4px' : '4px 8px',
          border: '1px solid #d0d0d0',
          borderRadius: compact ? 3 : 4,
          background: '#fff',
          cursor: 'pointer',
          fontSize: compact ? 12 : 13,
          height: compact ? 24 : 32,
          width: compact ? '100%' : undefined,
          minWidth: compact ? undefined : 70,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          whiteSpace: 'nowrap',
          color: '#333',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayLabel}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.45, flexShrink: 0 }}>
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {open && triggerRect && createPortal(
        <div
          ref={dropdownRef}
          data-sheet-keep-selection
          style={{
            position: 'fixed',
            left: triggerRect.left,
            top: triggerRect.bottom + 4,
            width: 280,
            maxHeight: 440,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            zIndex: 10001,
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #e8e8e8',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '10px 12px',
            borderBottom: '1px solid #eee',
            fontSize: 12,
            color: '#999',
            fontWeight: 500,
          }}>
            常规
          </div>

          {/* Format list */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {FORMAT_OPTIONS.map(f => {
              const isActive = value === f.value;
              return (
                <div
                  key={f.value}
                  onClick={() => {
                    onChange(f.value);
                    setOpen(false);
                  }}
                  style={{
                    padding: '9px 12px',
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
                  <span style={{ fontSize: 13, color: '#333', fontWeight: isActive ? 500 : 400 }}>
                    {f.label}
                  </span>
                  <span style={{ fontSize: 12, color: isActive ? '#4285F4' : '#999' }}>
                    {f.preview}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: '1px solid #eee',
              fontSize: 12,
              color: '#4285F4',
              cursor: 'pointer',
              textAlign: 'center',
            }}
            onClick={() => setOpen(false)}
          >
            更多格式 &gt;
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
