import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface TrendPoint {
  date: string;
  value: number;
}

interface TrendLineChartProps {
  title: string;
  points: TrendPoint[];
  color?: string;
  formatValue?: (value: number) => string;
}

const PAD = { top: 16, right: 12, bottom: 28, left: 44 };

function formatShortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${month}/${day}`;
}

function defaultFormat(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export const TrendLineChart: React.FC<TrendLineChartProps> = ({
  title,
  points,
  color = '#1677ff',
  formatValue = defaultFormat,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const height = 200;
  const chartHeight = height - PAD.top - PAD.bottom;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(200, Math.floor(entry.contentRect.width)));
    });
    ro.observe(el);
    setWidth(Math.max(200, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const { path, areaPath, coords, yTicks } = useMemo(() => {
    if (!points.length) {
      return { path: '', areaPath: '', coords: [] as Array<{ x: number; y: number; date: string; value: number }>, yTicks: [0] };
    }

    const values = points.map((p) => p.value);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const max = rawMax === rawMin ? rawMax + 1 : rawMax;
    const min = rawMin === rawMax ? Math.max(0, rawMin - 1) : rawMin;
    const range = max - min || 1;
    const innerWidth = width - PAD.left - PAD.right;

    const coords = points.map((point, index) => {
      const x = PAD.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
      const y = PAD.top + chartHeight - ((point.value - min) / range) * chartHeight;
      return { x, y, date: point.date, value: point.value };
    });

    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const baseline = PAD.top + chartHeight;
    const areaPath = coords.length
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseline} L ${coords[0].x.toFixed(1)} ${baseline} Z`
      : '';

    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount }, (_, i) => min + (range * i) / (tickCount - 1));

    return { path: linePath, areaPath, coords, yTicks };
  }, [chartHeight, points, width]);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const hover = hoverIndex != null ? coords[hoverIndex] : null;

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontWeight: 500 }}>{title}</span>
        {hover && (
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            {formatShortDate(hover.date)} · {formatValue(hover.value)}
          </span>
        )}
      </div>
      <svg width={width} height={height} role="img" aria-label={title}>
        {yTicks.map((tick, i) => {
          const y = PAD.top + chartHeight - (i / Math.max(1, yTicks.length - 1)) * chartHeight;
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={width - PAD.right} y2={y} stroke="#f0f0f0" />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#bfbfbf">
                {formatValue(tick)}
              </text>
            </g>
          );
        })}
        {areaPath && <path d={areaPath} fill={color} fillOpacity={0.08} />}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {coords.map((c, index) => (
          <circle
            key={c.date}
            cx={c.x}
            cy={c.y}
            r={hoverIndex === index ? 4 : 3}
            fill={color}
            stroke="#fff"
            strokeWidth={1.5}
            onMouseEnter={() => setHoverIndex(index)}
            onMouseLeave={() => setHoverIndex(null)}
          />
        ))}
        {coords.map((c) => (
          <text
            key={`label-${c.date}`}
            x={c.x}
            y={height - 8}
            textAnchor="middle"
            fontSize={11}
            fill="#8c8c8c"
          >
            {formatShortDate(c.date)}
          </text>
        ))}
      </svg>
    </div>
  );
};

export function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
