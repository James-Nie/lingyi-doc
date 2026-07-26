import React, { useMemo } from 'react';
import {
  Column,
  Bar,
  Line,
  Area,
  Pie,
  DualAxes,
  Radar,
  Scatter,
  Funnel,
  WordCloud,
  BidirectionalBar,
  Sankey,
  Treemap,
} from '@ant-design/charts';
import type { AggregatedDataset, DashboardChartDisplayConfig, DashboardChartKind } from '@lingyi-doc/core-types';
import { toAntChartsSpec } from '../charts/toAntChartsSpec';
import { resolveChartVisualProps } from '../charts/resolveChartVisualProps';
import { ChartHost } from './ChartHost';

interface DashboardChartWidgetProps {
  dataset: AggregatedDataset | null;
  display: DashboardChartDisplayConfig;
  chartKind: DashboardChartKind;
  onDataClick?: (category: string) => void;
}

export const DashboardChartWidget: React.FC<DashboardChartWidgetProps> = ({
  dataset,
  display,
  chartKind,
  onDataClick,
}) => {
  const spec = useMemo(
    () => (dataset ? toAntChartsSpec(dataset, { ...display, chartKind }) : null),
    [dataset, display, chartKind],
  );

  const visuals = useMemo(() => resolveChartVisualProps(display), [display]);

  if (!spec || spec.data.length === 0) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#bfbfbf', fontSize: 13 }}>
        暂无数据
      </div>
    );
  }

  const colors = visuals.colors;
  const colorScale = { color: { range: colors } };

  const handleReady = (plot: unknown) => {
    const chart = plot as { on?: (event: string, handler: (evt: unknown) => void) => void };
    chart.on?.('element:click', (evt: unknown) => {
      const e = evt as { data?: { data?: { category?: string; source?: string } } };
      const category = e?.data?.data?.category ?? e?.data?.data?.source;
      if (category != null) onDataClick?.(String(category));
    });
  };

  return (
    <ChartHost>
      {({ width, height }) => {
        const common = {
          width,
          height,
          autoFit: false as const,
          onReady: handleReady,
          legend: visuals.legend,
          tooltip: visuals.tooltip,
        };

        if (chartKind === 'pie' || chartKind === 'donut') {
          const total = spec.data.reduce((s, r) => s + Number(r.value || 0), 0) || 1;
          const labelCfg = visuals.label === false ? false : {
            ...(visuals.label as object),
            text: (d: { category: string; value: number; series?: string }) => {
              const pct = ((Number(d.value) / total) * 100).toFixed(1);
              const content = (display.seriesStyle?.labelContent || { value: true });
              const parts: string[] = [];
              if (content.category !== false) parts.push(String(d.category));
              if (content.value !== false) parts.push(visuals.formatValue(d.value));
              if (content.series && d.series) parts.push(String(d.series));
              return `${parts.join(' ') || visuals.formatValue(d.value)} (${pct}%)`;
            },
            position: (visuals.label as { position?: string })?.position || 'outside',
            connector: true,
            transform: [{ type: 'overlapDodgeY' }],
          };
          return (
            <Pie
              {...common}
              data={spec.data}
              angleField={spec.angleField || 'value'}
              colorField={spec.colorField || 'category'}
              radius={0.72}
              innerRadius={chartKind === 'donut' ? 0.45 : 0}
              margin={8}
              padding={8}
              scale={colorScale}
              label={labelCfg}
            />
          );
        }

        if (chartKind === 'bar') {
          return (
            <Bar
              {...common}
              data={spec.data}
              xField={spec.xField}
              yField={spec.yField}
              style={{ fill: visuals.fill }}
              scale={colorScale}
              label={visuals.label === false
                ? false
                : {
                    ...(visuals.label as object),
                    position: (visuals.label as { position?: string })?.position || 'right',
                    dx: 4,
                  }}
              axis={visuals.axis as object}
            />
          );
        }

        if (chartKind === 'bidirectionalBar') {
          const biData = spec.data.map(d => ({
            category: d.category,
            正向: Number(d.value) || 0,
            反向: -Math.round((Number(d.value) || 0) * 0.6),
          }));
          return (
            <BidirectionalBar
              {...common}
              data={biData}
              xField="category"
              yField={['正向', '反向']}
              scale={colorScale}
              axis={visuals.axis as object}
            />
          );
        }

        if (chartKind === 'line') {
          return (
            <Line
              {...common}
              data={spec.data}
              xField={spec.xField}
              yField={spec.yField}
              seriesField={spec.seriesField}
              style={visuals.style}
              point={visuals.point as object}
              label={visuals.label as object | false}
              axis={visuals.axis as object}
              scale={{ y: { nice: true }, ...colorScale }}
              {...(spec.connectNulls ? { connectNulls: true as const } : {})}
            />
          );
        }

        if (chartKind === 'area') {
          return (
            <Area
              {...common}
              data={spec.data}
              xField={spec.xField}
              yField={spec.yField}
              seriesField={spec.seriesField}
              style={{
                fill: visuals.fill,
                fillOpacity: display.fillStyle === 'gradient' ? 0.85 : 0.25,
                stroke: (visuals.style.stroke as string) || colors[0],
                lineWidth: (visuals.style.lineWidth as number) || 2,
                ...(visuals.shape ? { shape: visuals.shape } : {}),
              }}
              point={visuals.point as object}
              label={visuals.label as object | false}
              axis={visuals.axis as object}
              scale={colorScale}
              {...(spec.connectNulls ? { connectNulls: true as const } : {})}
            />
          );
        }

        if (chartKind === 'combo') {
          const lineOnRight = display.seriesStyle?.pointAxis !== 'left';
          return (
            <DualAxes
              {...common}
              data={spec.data}
              xField="category"
              children={[
                {
                  type: 'interval',
                  yField: 'value',
                  style: { fill: visuals.fill, maxWidth: 32 },
                },
                {
                  type: 'line',
                  yField: 'value',
                  style: {
                    stroke: (visuals.style.stroke as string) || colors[3] || colors[0],
                    lineWidth: (visuals.style.lineWidth as number) || 2,
                  },
                  axis: lineOnRight ? { y: { position: 'right' } } : undefined,
                },
              ]}
            />
          );
        }

        if (chartKind === 'radar') {
          return (
            <Radar
              {...common}
              data={spec.data}
              xField="category"
              yField="value"
              style={{
                fill: colors[0],
                fillOpacity: 0.25,
                stroke: colors[0],
              }}
              scale={colorScale}
              label={visuals.label}
            />
          );
        }

        if (chartKind === 'scatter' || chartKind === 'bubble') {
          return (
            <Scatter
              {...common}
              data={spec.data}
              xField={spec.xField}
              yField={spec.yField}
              colorField={spec.colorField}
              sizeField={chartKind === 'bubble' ? spec.sizeField : undefined}
              size={chartKind === 'bubble' ? [8, 28] : 6}
              scale={colorScale}
              axis={visuals.axis as object}
              label={visuals.label}
            />
          );
        }

        if (chartKind === 'funnel') {
          return (
            <Funnel
              {...common}
              data={spec.data}
              xField="category"
              yField="value"
              scale={colorScale}
              label={visuals.label === false ? false : {
                ...(visuals.label as object),
                text: (d: { category: string; value: number }) =>
                  `${d.category} ${visuals.formatValue(d.value)}`,
              }}
            />
          );
        }

        if (chartKind === 'wordCloud') {
          return (
            <WordCloud
              {...common}
              data={spec.data}
              textField="category"
              valueField="value"
              colorField="category"
              scale={colorScale}
              legend={false}
            />
          );
        }

        if (chartKind === 'sankey') {
          return (
            <Sankey
              {...common}
              data={spec.data}
              sourceField={spec.sourceField || 'source'}
              targetField={spec.targetField || 'target'}
              valueField={spec.valueField || 'value'}
              scale={colorScale}
              legend={false}
            />
          );
        }

        if (chartKind === 'treemap') {
          return (
            <Treemap
              {...common}
              data={{
                name: 'root',
                children: spec.data.map(d => ({
                  name: String(d.category),
                  value: Number(d.value) || 0,
                })),
              }}
              valueField="value"
              scale={colorScale}
              legend={false}
              label={visuals.label}
            />
          );
        }

        return (
          <Column
            {...common}
            data={spec.data}
            xField={spec.xField}
            yField={spec.yField}
            seriesField={spec.seriesField}
            style={{ fill: visuals.fill }}
            scale={colorScale}
            label={visuals.label}
            axis={visuals.axis as object}
          />
        );
      }}
    </ChartHost>
  );
};
