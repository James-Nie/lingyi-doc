import React, { useState, useEffect, useMemo } from 'react';
import type { ChartInstance, ChartConfig } from '@lingyi-doc/core';
import { CHART_COLOR_PALETTES, getPaletteSuggestions } from '@lingyi-doc/core';
import type { FreeTable } from '@lingyi-doc/core';

interface ChartEditorProps {
  chart: ChartInstance | null;
  table: FreeTable;
  onClose: () => void;
  onUpdate: (chartId: string, updates: Partial<ChartInstance>) => void;
}

interface LayoutOption {
  id: string;
  name: string;
  preview: React.ReactNode;
  apply: (config: ChartConfig) => Partial<ChartConfig>;
}

const LAYOUT_PREVIEW_SVG = (color: string): React.ReactNode => (
  <svg width="48" height="30" viewBox="0 0 48 30" style={{ display: 'block', margin: '0 auto' }}>
    <rect x="2" y="2" width="44" height="26" fill="#fafafa" rx="2" />
    {[0, 1, 2].map(i => {
      const heights: Record<string, number[]> = {
        '#4285F4': [18, 12, 16],
        '#34A853': [10, 18, 14],
        '#EA4335': [14, 16, 10],
        '#FBBC05': [16, 10, 18],
      };
      const h = (heights[color] || [16, 12, 14])[i];
      return (
        <rect
          key={i}
          x={i === 0 ? 8 : i === 1 ? 22 : 36}
          y={2 + 26 - h}
          width={8}
          height={h}
          fill={color === '#4285F4' ? '#4285F4' : color === '#34A853' ? '#34A853' : color === '#EA4335' ? '#EA4335' : '#FBBC05'}
          rx="1"
          opacity={i === 0 ? 1 : i === 1 ? 0.7 : 0.5}
        />
      );
    })}
  </svg>
);

type LayoutMap = Record<string, LayoutOption[]>;

const getLayoutsForType = (type: string): LayoutOption[] => {
  const layouts: LayoutMap = {
    bar: [
      {
        id: 'default',
        name: '默认布局',
        preview: LAYOUT_PREVIEW_SVG('#4285F4'),
        apply: () => ({ showLegend: true, showDataLabels: false }),
      },
      {
        id: 'legend-top',
        name: '图例顶部',
        preview: LAYOUT_PREVIEW_SVG('#34A853'),
        apply: () => ({ showLegend: true, showDataLabels: false }),
      },
      {
        id: 'legend-bottom',
        name: '图例底部',
        preview: LAYOUT_PREVIEW_SVG('#EA4335'),
        apply: () => ({ showLegend: true, showDataLabels: false }),
      },
      {
        id: 'with-labels',
        name: '显示标签',
        preview: LAYOUT_PREVIEW_SVG('#FBBC05'),
        apply: () => ({ showLegend: true, showDataLabels: true }),
      },
      {
        id: 'compact',
        name: '紧凑布局',
        preview: LAYOUT_PREVIEW_SVG('#4285F4'),
        apply: () => ({ showLegend: false, showDataLabels: false }),
      },
      {
        id: 'minimal',
        name: '极简布局',
        preview: LAYOUT_PREVIEW_SVG('#34A853'),
        apply: () => ({ showLegend: false, showDataLabels: false, title: '' }),
      },
    ],
    horizontalBar: [
      {
        id: 'default',
        name: '默认布局',
        preview: LAYOUT_PREVIEW_SVG('#4285F4'),
        apply: () => ({ showLegend: true, showDataLabels: false }),
      },
      {
        id: 'legend-top',
        name: '图例左侧',
        preview: LAYOUT_PREVIEW_SVG('#34A853'),
        apply: () => ({ showLegend: true, showDataLabels: false }),
      },
      {
        id: 'legend-bottom',
        name: '图例右侧',
        preview: LAYOUT_PREVIEW_SVG('#EA4335'),
        apply: () => ({ showLegend: true, showDataLabels: false }),
      },
      {
        id: 'with-labels',
        name: '显示标签',
        preview: LAYOUT_PREVIEW_SVG('#FBBC05'),
        apply: () => ({ showLegend: true, showDataLabels: true }),
      },
      {
        id: 'compact',
        name: '紧凑布局',
        preview: LAYOUT_PREVIEW_SVG('#4285F4'),
        apply: () => ({ showLegend: false, showDataLabels: false }),
      },
      {
        id: 'minimal',
        name: '极简布局',
        preview: LAYOUT_PREVIEW_SVG('#34A853'),
        apply: () => ({ showLegend: false, showDataLabels: false, title: '' }),
      },
    ],
    line: [
      {
        id: 'default',
        name: '默认布局',
        preview: LAYOUT_PREVIEW_SVG('#4285F4'),
        apply: () => ({ showLegend: true, showDataLabels: false }),
      },
      {
        id: 'legend-top',
        name: '图例顶部',
        preview: LAYOUT_PREVIEW_SVG('#34A853'),
        apply: () => ({ showLegend: true, showDataLabels: false }),
      },
      {
        id: 'legend-bottom',
        name: '图例底部',
        preview: LAYOUT_PREVIEW_SVG('#EA4335'),
        apply: () => ({ showLegend: true, showDataLabels: false }),
      },
      {
        id: 'with-labels',
        name: '显示标签',
        preview: LAYOUT_PREVIEW_SVG('#FBBC05'),
        apply: () => ({ showLegend: true, showDataLabels: true }),
      },
      {
        id: 'compact',
        name: '紧凑布局',
        preview: LAYOUT_PREVIEW_SVG('#4285F4'),
        apply: () => ({ showLegend: false, showDataLabels: false }),
      },
      {
        id: 'minimal',
        name: '极简布局',
        preview: LAYOUT_PREVIEW_SVG('#34A853'),
        apply: () => ({ showLegend: false, showDataLabels: false, title: '' }),
      },
    ],
    pie: [
      {
        id: 'default',
        name: '标准饼图',
        preview: LAYOUT_PREVIEW_SVG('#4285F4'),
        apply: () => ({ showLegend: true, showDataLabels: true }),
      },
      {
        id: 'donut',
        name: '环形图',
        preview: LAYOUT_PREVIEW_SVG('#34A853'),
        apply: () => ({ variant: 'donut' as const, showLegend: true, showDataLabels: true }),
      },
      {
        id: 'show-percent',
        name: '显示占比',
        preview: LAYOUT_PREVIEW_SVG('#EA4335'),
        apply: () => ({ showLegend: false, showDataLabels: true }),
      },
      {
        id: 'with-labels',
        name: '显示标签',
        preview: LAYOUT_PREVIEW_SVG('#FBBC05'),
        apply: () => ({ showLegend: false, showDataLabels: true }),
      },
      {
        id: 'compact',
        name: '紧凑饼图',
        preview: LAYOUT_PREVIEW_SVG('#4285F4'),
        apply: () => ({ showLegend: false, showDataLabels: false }),
      },
      {
        id: 'minimal',
        name: '极简饼图',
        preview: LAYOUT_PREVIEW_SVG('#34A853'),
        apply: () => ({ showLegend: false, showDataLabels: false, title: '' }),
      },
    ],
  };
  return layouts[type] || layouts.bar;
};

export const ChartEditor: React.FC<ChartEditorProps> = ({ chart, table, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'custom'>('basic');
  const [title, setTitle] = useState(chart?.config.title || '');
  const [dataRange, setDataRange] = useState(chart?.dataSource.range || '');

  useEffect(() => {
    if (chart) {
      setTitle(chart.config.title);
      setDataRange(chart.dataSource.range);
    }
  }, [chart?.id, chart?.config.title, chart?.dataSource.range]);

  if (!chart) return null;

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    onUpdate(chart.id, {
      config: { ...chart.config, title: newTitle },
    });
  };

  const handleDataRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRange = e.target.value;
    setDataRange(newRange);
    onUpdate(chart.id, {
      dataSource: { ...chart.dataSource, range: newRange },
    });
  };

  const handleColorChange = (colors: string[]) => {
    onUpdate(chart.id, {
      config: { ...chart.config, colors },
    });
  };

  const handleToggleLegend = () => {
    onUpdate(chart.id, {
      config: { ...chart.config, showLegend: !chart.config.showLegend },
    });
  };

  const handleToggleDataLabels = () => {
    onUpdate(chart.id, {
      config: { ...chart.config, showDataLabels: !chart.config.showDataLabels },
    });
  };

  const handleToggleBorder = () => {
    onUpdate(chart.id, {
      config: { ...chart.config, showBorder: !chart.config.showBorder },
    });
  };

  const handleToggleGridLines = () => {
    onUpdate(chart.id, {
      config: { ...chart.config, showGridLines: !chart.config.showGridLines },
    });
  };

  const handleToggleTitle = () => {
    onUpdate(chart.id, {
      config: {
        ...chart.config,
        title: chart.config.title ? '' : (title || '图表标题'),
      },
    });
    if (chart.config.title) setTitle('');
  };

  const handleToggleCategories = () => {
    onUpdate(chart.id, {
      dataSource: { ...chart.dataSource, hasCategories: !chart.dataSource.hasCategories },
    });
  };

  const handleToggleHeader = () => {
    onUpdate(chart.id, {
      dataSource: { ...chart.dataSource, hasHeader: !chart.dataSource.hasHeader },
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 300,
        height: '100%',
        background: '#fff',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #eee',
      }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>图表设置</span>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 18,
            color: '#999',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #eee',
      }}>
        <button
          onClick={() => setActiveTab('basic')}
          style={{
            flex: 1,
            padding: '10px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'basic' ? '2px solid #4285F4' : '2px solid transparent',
            color: activeTab === 'basic' ? '#4285F4' : '#666',
            fontWeight: activeTab === 'basic' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          基础
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          style={{
            flex: 1,
            padding: '10px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'custom' ? '2px solid #4285F4' : '2px solid transparent',
            color: activeTab === 'custom' ? '#4285F4' : '#666',
            fontWeight: activeTab === 'custom' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          自定义
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {activeTab === 'basic' ? (
          <div>
            {/* Title */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#555', fontSize: 12 }}>图表标题</label>
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                placeholder="请输入标题"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Color Schemes — type-aware */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 10, color: '#555', fontSize: 12 }}>配色方案</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {Object.entries(getPaletteSuggestions(chart.config.type)).map(([name, palette]) => (
                  <div
                    key={name}
                    onClick={() => handleColorChange(palette)}
                    style={{
                      padding: 8,
                      border: JSON.stringify(chart.config.colors) === JSON.stringify(palette)
                        ? '2px solid #4285F4'
                        : '1px solid #ddd',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: '#fafafa',
                    }}
                  >
                    {/* Color preview pie */}
                    <svg width="50" height="50" viewBox="0 0 50 50" style={{ display: 'block', margin: '0 auto' }}>
                      {palette.slice(0, 4).map((color, i) => {
                        const angle = (i * 90 * Math.PI) / 180;
                        const nextAngle = ((i + 1) * 90 * Math.PI) / 180;
                        const cx = 25;
                        const cy = 25;
                        const r = 22;
                        const x1 = cx + r * Math.cos(angle);
                        const y1 = cy + r * Math.sin(angle);
                        const x2 = cx + r * Math.cos(nextAngle);
                        const y2 = cy + r * Math.sin(nextAngle);
                        return (
                          <path
                            key={i}
                            d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z`}
                            fill={color}
                          />
                        );
                      })}
                    </svg>
                    <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginTop: 4 }}>
                      {name}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Layout — type-aware */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 10, color: '#555', fontSize: 12 }}>快速布局</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {getLayoutsForType(chart.config.type).map((layout) => {
                  const isActiveLayout = (() => {
                    const curr = chart.config;
                    if (layout.id === 'default') return curr.showLegend && !curr.showDataLabels && curr.variant !== 'donut';
                    if (layout.id === 'donut') return curr.variant === 'donut' && curr.showLegend;
                    if (layout.id === 'show-percent') return !curr.showLegend && curr.showDataLabels;
                    if (layout.id === 'with-labels') return curr.showDataLabels && (curr.type !== 'pie' || !curr.showLegend);
                    if (layout.id === 'compact') return !curr.showLegend && !curr.showDataLabels && curr.title !== '';
                    if (layout.id === 'minimal') return !curr.showLegend && !curr.showDataLabels && curr.title === '';
                    return false;
                  })();
                  return (
                    <div
                      key={layout.id}
                      style={{
                        padding: '6px 4px',
                        border: isActiveLayout ? '2px solid #4285F4' : '1px solid #e0e0e0',
                        borderRadius: 6,
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isActiveLayout ? '#e8f0fe' : '#fafafa',
                        fontSize: 11,
                        transition: 'all 0.15s',
                      }}
                      onClick={() => {
                        const updates = layout.apply(chart.config);
                        onUpdate(chart.id, { config: { ...chart.config, ...updates } });
                      }}
                    >
                      {layout.preview}
                      <div style={{ color: isActiveLayout ? '#4285F4' : '#666', fontWeight: isActiveLayout ? 600 : 400, marginTop: 2 }}>
                        {layout.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Data Range */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#555', fontSize: 12 }}>数据区域</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={dataRange}
                  onChange={handleDataRangeChange}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                />
                <button
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    background: '#f5f5f5',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                  title="选择数据区域"
                >
                  ⬚
                </button>
              </div>
            </div>

            {/* Options */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={chart.dataSource.hasHeader}
                  onChange={handleToggleHeader}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: '#555', fontSize: 12 }}>第一行为标题</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={chart.dataSource.hasCategories}
                  onChange={handleToggleCategories}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: '#555', fontSize: 12 }}>第一列为分类</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={chart.config.showLegend}
                  onChange={handleToggleLegend}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: '#555', fontSize: 12 }}>显示图例</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={chart.config.showDataLabels}
                  onChange={handleToggleDataLabels}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: '#555', fontSize: 12 }}>显示数据标签</span>
              </label>
            </div>
          </div>
        ) : (
          <div>
            {/* Option checkboxes — two columns */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 10, color: '#555', fontSize: 12, fontWeight: 600 }}>
                显示选项
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                {/* Left column */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!chart.config.title} onChange={handleToggleTitle} style={{ cursor: 'pointer' }} />
                  <span style={{ color: '#555', fontSize: 12 }}>标题</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked readOnly style={{ cursor: 'pointer' }} />
                  <span style={{ color: '#555', fontSize: 12 }}>显示隐藏数据</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={chart.config.showBorder !== false} onChange={handleToggleBorder} style={{ cursor: 'pointer' }} />
                  <span style={{ color: '#555', fontSize: 12 }}>边框</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={chart.config.showDataLabels}
                    onChange={handleToggleDataLabels}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: '#555', fontSize: 12 }}>数据标签</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked readOnly style={{ cursor: 'pointer' }} />
                  <span style={{ color: '#555', fontSize: 12 }}>显示空数据</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked readOnly style={{ cursor: 'pointer' }} />
                  <span style={{ color: '#555', fontSize: 12 }}>轴标题</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={chart.config.showGridLines !== false} onChange={handleToggleGridLines} style={{ cursor: 'pointer' }} />
                  <span style={{ color: '#555', fontSize: 12 }}>网格线</span>
                </label>
              </div>
            </div>

            {/* Separator */}
            <div style={{ borderTop: '1px solid #eee', margin: '12px 0' }} />

            {/* Axis limits */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 8, color: '#555', fontSize: 12, fontWeight: 600 }}>
                坐标轴极值
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    placeholder="自定义最小值"
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    placeholder="自定义最大值"
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* X Axis label tilt */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#555', fontSize: 12 }}>
                X轴倾斜标签
              </label>
              <select style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: 12,
                background: '#fff',
              }}>
                <option>自动</option>
                <option>0°</option>
                <option>-30°</option>
                <option>-45°</option>
                <option>-60°</option>
                <option>-90°</option>
              </select>
            </div>

            {/* Y Axis data format */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#555', fontSize: 12 }}>
                Y轴数据格式
              </label>
              <select style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: 12,
                background: '#fff',
              }}>
                <option>来自数据</option>
                <option>常规</option>
                <option>数字</option>
                <option>货币</option>
                <option>百分比</option>
                <option>科学记数</option>
              </select>
            </div>

            {/* Legend position */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#555', fontSize: 12 }}>
                图例位置
              </label>
              <select
                value={chart.config.showLegend ? 'bottom' : 'none'}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdate(chart.id, { config: { ...chart.config, showLegend: val !== 'none' } });
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: 12,
                  background: '#fff',
                }}
              >
                <option value="bottom">下方</option>
                <option value="top">上方</option>
                <option value="right">右侧</option>
                <option value="left">左侧</option>
                <option value="none">无</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
