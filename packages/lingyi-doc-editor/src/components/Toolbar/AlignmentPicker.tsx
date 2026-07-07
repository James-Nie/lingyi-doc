import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AlignmentPickerProps {
  value: string;
  onChange: (align: string) => void;
  trigger: React.ReactNode;
  options: { value: string; label: string; icon: string }[];
}

export const AlignmentPicker: React.FC<AlignmentPickerProps> = ({ value, onChange, trigger, options }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const triggerRect = triggerRef.current?.getBoundingClientRect();

  return (
    <>
      <div ref={triggerRef} onClick={() => setOpen(!open)} style={{ cursor: 'pointer', display: 'inline-flex' }}>
        {trigger}
      </div>
      {open && triggerRect && createPortal(
        <div
          ref={dropdownRef}
          data-sheet-keep-selection
          style={{
            position: 'fixed',
            left: triggerRect.left,
            top: triggerRect.bottom + 4,
            zIndex: 10001,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '4px 0',
            minWidth: 120,
          }}
        >
          {options.map(opt => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                padding: '6px 16px', cursor: 'pointer', fontSize: 13, color: '#333',
                display: 'flex', gap: 8, alignItems: 'center',
                background: value === opt.value ? '#e8f0fe' : 'transparent',
              }}
              onMouseEnter={e => { if (value !== opt.value) e.currentTarget.style.background = '#f5f5f5'; }}
              onMouseLeave={e => { if (value !== opt.value) e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
