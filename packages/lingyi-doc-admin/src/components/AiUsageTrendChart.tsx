import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface AiUsageTrendPoint {
  period: string;
  label: string;
  tokens: number;
  requests: number;
  errors: number;
  avgLatency: number;
}

interface AiUsageTrendChartProps {
  data: AiUsageTrendPoint[];
  loading?: boolean;
  emptyText?: string;
}

const PAD = { top: 20, right: 16, bottom: 36, left: 52 };
const CHART_HEIGHT = 260;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTooltipTitle(point: AiUsageTrendPoint): string {
  if (/^\d{2}:\d{2}$/.test(point.period)) {
    return `今日 ${point.period}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(point.period)) {
    const [, month, day] = point.period.split('-');
    return month && day ? `${point.period}（${parseInt(month, 10)}/${parseInt(day, 10)}）` : point.period;
  }
  return point.label;
}

function formatTick(value: number): string {
  return formatTokens(value);
}

export const AiUsageTrendChart: React.FC<AiUsageTrendChartProps> = ({
  data,
  loading,
  emptyText = '暂无趋势数据',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartHeight = CHART_HEIGHT - PAD.top - PAD.bottom;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    ro.observe(el);
    setWidth(Math.max(280, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const { path, areaPath, coords, yTicks } = useMemo(() => {
    if (!data.length) {
      return {
        path: '',
        areaPath: '',
        coords: [] as Array<AiUsageTrendPoint & { x: number; y: number }>,
        yTicks: [0],
      };
    }

    const values = data.map((d) => d.tokens);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const max = rawMax === rawMin ? rawMax + 1 : rawMax;
    const min = rawMin === rawMax ? Math.max(0, rawMin - 1) : rawMin;
    const range = max - min || 1;
    const innerWidth = width - PAD.left - PAD.right;

    const coords = data.map((point, index) => {
      const x = PAD.left + (data.length <= 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
      const y = PAD.top + chartHeight - ((point.tokens - min) / range) * chartHeight;
      return { ...point, x, y };
    });

    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const baseline = PAD.top + chartHeight;
    const areaPath = coords.length
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseline} L ${coords[0].x.toFixed(1)} ${baseline} Z`
      : '';

    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount }, (_, i) => min + (range * i) / (tickCount - 1));

    return { path: linePath, areaPath, coords, yTicks };
  }, [chartHeight, data, width]);

  const hover = hoverIndex != null ? coords[hoverIndex] : null;

  const handleMouseMove = (event: React.MouseEvent<SVGRectElement>) => {
    if (!coords.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < coords.length; i += 1) {
      const dist = Math.abs(coords[i].x - x);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  };

  if (loading) {
    return (
      <div ref={containerRef} style={{ width: '100%', height: CHART_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8c8c8c' }}>
        加载中…
      </div>
    );
  }

  if (!data.length) {
    return (
      <div ref={containerRef} style={{ width: '100%', height: CHART_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8c8c8c' }}>
        {emptyText}
      </div>
    );
  }

  const tooltipLeft = hover
    ? Math.min(Math.max(hover.x - 80, PAD.left), width - PAD.right - 160)
    : 0;
  const tooltipTop = hover ? Math.max(hover.y - 88, PAD.top) : 0;

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg width={width} height={CHART_HEIGHT} role="img" aria-label="AI 用量趋势">
        {yTicks.map((tick, i) => {
          const y = PAD.top + chartHeight - (i / Math.max(1, yTicks.length - 1)) * chartHeight;
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={width - PAD.right} y2={y} stroke="#f0f0f0" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#bfbfbf">
                {formatTick(tick)}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="#1677ff" fillOpacity={0.08} />}
        {path && (
          <path
            d={path}
            fill="none"
            stroke="#1677ff"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {coords.map((c, index) => (
          <circle
            key={c.period}
            cx={c.x}
            cy={c.y}
            r={hoverIndex === index ? 5 : 3.5}
            fill="#1677ff"
            stroke="#fff"
            strokeWidth={2}
            pointerEvents="none"
          />
        ))}

        {coords.map((c, index) => {
          const labelStep = data.length <= 12
            ? 1
            : data.length <= 24
              ? 2
              : Math.ceil(data.length / 8);
          if (index % labelStep !== 0 && index !== data.length - 1) {
            return null;
          }
          return (
            <text
              key={`label-${c.period}`}
              x={c.x}
              y={CHART_HEIGHT - 10}
              textAnchor="middle"
              fontSize={11}
              fill="#8c8c8c"
            >
              {c.label}
            </text>
          );
        })}

        {hover && (
          <>
            <line
              x1={hover.x}
              y1={PAD.top}
              x2={hover.x}
              y2={PAD.top + chartHeight}
              stroke="#1677ff"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
              pointerEvents="none"
            />
            <circle cx={hover.x} cy={hover.y} r={6} fill="#1677ff" stroke="#fff" strokeWidth={2} pointerEvents="none" />
          </>
        )}

        <rect
          x={PAD.left}
          y={PAD.top}
          width={width - PAD.left - PAD.right}
          height={chartHeight}
          fill="transparent"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hover && (
        <div
          style={{
            position: 'absolute',
            left: tooltipLeft,
            top: tooltipTop,
            background: 'rgba(0, 0, 0, 0.82)',
            color: '#fff',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 12,
            lineHeight: 1.6,
            pointerEvents: 'none',
            minWidth: 160,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{formatTooltipTitle(hover)}</div>
          <div>Token：{formatTokens(hover.tokens)}</div>
          <div>请求数：{hover.requests}</div>
          <div>平均延迟：{Math.round(hover.avgLatency)} ms</div>
          <div>错误数：{hover.errors}</div>
        </div>
      )}
    </div>
  );
};
