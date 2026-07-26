import React, { useEffect, useRef, useState } from 'react';
import type { AggregatedDataset, DashboardMetricCardConfig } from '@lingyi-doc/core-types';
import { formatMetricValue } from '../utils/formatMetricValue';

interface MetricCardWidgetProps {
  dataset: AggregatedDataset | null;
  config: DashboardMetricCardConfig;
  /** @deprecated 标题已在 WidgetShell 顶栏展示 */
  dragHandleClassName?: string;
  readOnly?: boolean;
}

function useAdaptiveFontSize(
  enabled: boolean,
  text: string,
  customSize?: number,
): { ref: React.RefObject<HTMLDivElement>; fontSize: number } {
  const ref = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(customSize || 42);

  useEffect(() => {
    if (!enabled) {
      setFontSize(customSize && customSize > 0 ? customSize : 42);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observeTarget = el.parentElement ?? el;

    const fit = () => {
      const box = el.parentElement ?? el;
      const maxW = Math.max(40, box.clientWidth - 8);
      const maxH = Math.max(28, box.clientHeight - 8);
      let size = Math.min(56, Math.max(20, Math.floor(maxH * 0.72)));
      el.style.fontSize = `${size}px`;
      while (size > 18 && el.scrollWidth > maxW) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
      setFontSize(size);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(observeTarget);
    return () => ro.disconnect();
  }, [enabled, text, customSize]);

  return { ref, fontSize };
}

/** 无阈值配置时的简易区间配色 */
function resolveRangeColor(raw: number, fallback?: string): string {
  if (raw < 0) return '#cf1322';
  if (raw === 0) return '#8c8c8c';
  return fallback || '#262626';
}

/** 单点趋势占位：有多行聚合结果时画真实折线，否则画平坦基线 */
function MiniTrend({ values }: { values: number[] }) {
  const pts = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 120;
  const h = 28;
  const path = pts.map((v, i) => {
    const x = (i / Math.max(1, pts.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ marginTop: 8 }}>
      <path d={path} fill="none" stroke="#91caff" strokeWidth="2" />
    </svg>
  );
}

/** 指标卡内容区：仅展示大号数值（标题/操作在外壳顶栏，对齐产品图） */
export const MetricCardWidget: React.FC<MetricCardWidgetProps> = ({
  dataset,
  config,
}) => {
  const metricCol = dataset?.columns.find(c => c.role === 'metric');
  const raw = metricCol
    ? Number(dataset?.rows?.[0]?.[metricCol.id] ?? dataset?.meta.totalSourceRows ?? 0)
    : (dataset?.meta.totalSourceRows ?? 0);

  const text = formatMetricValue(raw, {
    numberFormat: config.numberFormat,
    decimalPlaces: config.decimalPlaces,
    largeNumberAbbrev: config.largeNumberAbbrev,
    useThousandSeparator: config.useThousandSeparator,
  });

  const adaptive = (config.valueFontSizeMode || 'adaptive') !== 'custom';
  const { ref, fontSize } = useAdaptiveFontSize(adaptive, text, config.valueFontSize);

  const valueColor = config.rangeColorEnabled
    ? resolveRangeColor(raw, config.valueColor)
    : (config.valueColor || '#262626');

  const trendValues = metricCol && dataset?.rows?.length
    ? dataset.rows.map(r => Number(r[metricCol.id] ?? 0)).filter(n => Number.isFinite(n))
    : [raw];

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '4px 16px 20px',
        boxSizing: 'border-box',
        minHeight: 0,
      }}
    >
      {config.valueDescription ? (
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>
          {config.valueDescription}
        </div>
      ) : null}
      <div
        ref={ref}
        style={{
          fontSize,
          fontWeight: 700,
          lineHeight: 1.1,
          color: valueColor,
          letterSpacing: -0.8,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {text}
      </div>
      {config.showYoy ? (
        <div style={{ marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>
          同比 <span style={{ color: '#bfbfbf' }}>—</span>
          <span style={{ marginLeft: 6, fontSize: 11, color: '#bfbfbf' }}>暂无对比期数据</span>
        </div>
      ) : null}
      {config.showTrend ? <MiniTrend values={trendValues} /> : null}
    </div>
  );
};
