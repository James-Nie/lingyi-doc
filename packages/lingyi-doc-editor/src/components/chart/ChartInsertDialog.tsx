import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChartType, ChartVariant } from '@lingyi-doc/core';

interface ChartInsertDialogProps {
  visible: boolean;
  onClose: () => void;
  onInsert: (type: ChartType, variant: ChartVariant) => void;
}

interface ChartOption {
  type: ChartType;
  variant: ChartVariant;
  label: string;
  description: string;
  icon: string;
}

const CHART_OPTIONS: ChartOption[] = [
  { type: 'bar', variant: 'default', label: '柱状图', description: '标准垂直柱状图表', icon: '📊' },
  { type: 'bar', variant: 'stacked', label: '堆叠柱状图', description: '多系列堆叠展示', icon: '📊' },
  { type: 'horizontalBar', variant: 'default', label: '条形图', description: '标准水平条形图表', icon: '📈' },
  { type: 'horizontalBar', variant: 'stacked', label: '堆叠条形图', description: '水平多系列堆叠', icon: '📈' },
  { type: 'line', variant: 'default', label: '折线图', description: '趋势折线图表', icon: '📉' },
  { type: 'pie', variant: 'default', label: '饼图', description: '比例扇形图表', icon: '🥧' },
  { type: 'pie', variant: 'donut', label: '环形图', description: '中空环形占比图', icon: '🍩' },
];

export const ChartInsertDialog: React.FC<ChartInsertDialogProps> = ({ visible, onClose, onInsert }) => {
  const [selectedType, setSelectedType] = useState<ChartType>('bar');
  const [selectedVariant, setSelectedVariant] = useState<ChartVariant>('default');

  if (!visible) return null;

  const handleInsert = () => {
    onInsert(selectedType, selectedVariant);
    onClose();
  };

  const dialog = (
    <div
      data-sheet-keep-selection
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.3)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          width: 520,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>插入图表</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#f5f5f5',
              borderRadius: 6,
              width: 32,
              height: 32,
              cursor: 'pointer',
              fontSize: 16,
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Chart type grid */}
        <div style={{ padding: '20px 24px' }}>
          {/* Type filter */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            padding: 4,
            background: '#f5f5f5',
            borderRadius: 8,
          }}>
            {(['bar', 'horizontalBar', 'line', 'pie'] as ChartType[]).map(type => {
              const label = type === 'bar' ? '柱状图' : type === 'horizontalBar' ? '条形图' : type === 'line' ? '折线图' : '饼图';
              const icon = type === 'bar' ? '📊' : type === 'horizontalBar' ? '📈' : type === 'line' ? '📉' : '🥧';
              return (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedType(type);
                    // Reset variant for type change
                    if (type === 'pie') setSelectedVariant('default');
                    else if (selectedVariant === 'donut') setSelectedVariant('default');
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: 6,
                    background: selectedType === type ? '#fff' : 'transparent',
                    color: selectedType === type ? '#4285F4' : '#666',
                    fontWeight: selectedType === type ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: 13,
                    boxShadow: selectedType === type ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>
                  <div>{label}</div>
                </button>
              );
            })}
          </div>

          {/* Variant options */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}>
            {CHART_OPTIONS
              .filter(opt => opt.type === selectedType && (opt.variant !== 'donut' || selectedType === 'pie'))
              .map(opt => {
                const isSelected = opt.type === selectedType && opt.variant === selectedVariant;
                return (
                  <div
                    key={opt.label}
                    onClick={() => setSelectedVariant(opt.variant)}
                    style={{
                      padding: '16px 12px',
                      border: isSelected ? '2px solid #4285F4' : '2px solid #e8e8e8',
                      borderRadius: 10,
                      cursor: 'pointer',
                      textAlign: 'center',
                      background: isSelected ? '#e8f0fe' : '#fff',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{opt.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: '#333' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {opt.description}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px 20px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              border: '1px solid #ddd',
              borderRadius: 6,
              background: '#fff',
              color: '#666',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            取消
          </button>
          <button
            onClick={handleInsert}
            style={{
              padding: '8px 24px',
              border: 'none',
              borderRadius: 6,
              background: '#4285F4',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            插入图表
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
};
