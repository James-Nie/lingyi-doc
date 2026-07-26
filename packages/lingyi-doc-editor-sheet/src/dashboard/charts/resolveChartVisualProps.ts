import type { DashboardChartDisplayConfig, ChartTextFormat } from '@lingyi-doc/core-types';
import { resolveChartThemeColors } from './toAntChartsSpec';
import { formatChartValue, resolveFillStyle } from '../utils/formatChartValue';

function labelAngle(angle?: string): number | undefined {
  if (!angle || angle === 'default') return undefined;
  const n = Number(angle);
  return Number.isFinite(n) ? n : undefined;
}

function axisLabelStyle(
  format: ChartTextFormat | undefined,
  fallback?: { fontSize?: number; color?: string },
) {
  return {
    fontSize: format?.fontSize ?? fallback?.fontSize,
    fill: format?.color || fallback?.color,
    fontWeight: format?.bold ? 700 : undefined,
    fontStyle: format?.italic ? 'italic' as const : undefined,
  };
}

function parseLabelMaxHeight(raw?: string): number | undefined {
  if (!raw) return undefined;
  const pct = raw.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (pct) return Math.round(Number(pct[1]));
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function buildAxisConfig(
  axis: DashboardChartDisplayConfig['xAxis'] | DashboardChartDisplayConfig['yAxis'],
  opts?: {
    isY?: boolean;
    componentFontSize?: number;
    componentTextColor?: string;
    valueNumberFormat?: DashboardChartDisplayConfig['valueNumberFormat'];
  },
) {
  if (axis?.enabled === false) return false;

  const rotate = labelAngle(axis?.labelAngle);
  const title = axis?.title
    ? {
        title: axis.title,
        titleFill: axis.titleFormat?.color || opts?.componentTextColor,
        titleFontSize: axis.titleFormat?.fontSize ?? opts?.componentFontSize,
        titleFontWeight: axis.titleFormat?.bold ? 700 : undefined,
        titleFontStyle: axis.titleFormat?.italic ? 'italic' : undefined,
      }
    : {};

  const domain =
    opts?.isY && axis?.rangeMode !== 'dynamic' && (axis?.min != null || axis?.max != null)
      ? {
          domainMin: axis.min ?? undefined,
          domainMax: axis.max ?? undefined,
        }
      : {};

  const maxHeight = !opts?.isY ? parseLabelMaxHeight(axis?.labelMaxHeight) : undefined;

  return {
    ...title,
    ...domain,
    label: axis?.showLabel === false
      ? false
      : {
          style: axisLabelStyle(axis?.labelFormat, {
            fontSize: opts?.componentFontSize,
            color: opts?.componentTextColor,
          }),
          ...(rotate != null ? { transform: `rotate(${rotate})` } : {}),
          autoRotate: rotate == null && maxHeight != null,
          autoHide: maxHeight != null,
          formatter: opts?.isY
            ? (v: unknown) => formatChartValue(v, opts?.valueNumberFormat)
            : undefined,
        },
    line: axis?.showLine ? true : false,
    tick: true,
    grid: undefined as unknown,
  };
}

export interface ResolvedChartVisuals {
  colors: string[];
  legend: false | Record<string, unknown>;
  label: false | Record<string, unknown>;
  tooltip: false | Record<string, unknown>;
  axis: Record<string, unknown> | false | undefined;
  style: Record<string, unknown>;
  /** 柱/条/面积填充 */
  fill: string;
  point: false | Record<string, unknown>;
  shapeField?: string;
  /** line: straight/smooth/step */
  shape?: string;
  componentFontSize?: number;
  componentTextColor?: string;
  seriesName?: string;
  formatValue: (raw: unknown) => string;
}

/** 将仪表盘自定义配置映射为 Ant Design Charts 常用属性 */
export function resolveChartVisualProps(
  display: DashboardChartDisplayConfig,
): ResolvedChartVisuals {
  const series = display.seriesStyle || {};
  const legendStyle = display.legendStyle || {};
  const tip = display.tooltipStyle || {};
  const colors = resolveChartThemeColors(display.colorThemeId, display.colors);
  const formatValue = (raw: unknown) => formatChartValue(raw, display.valueNumberFormat);

  const stroke = series.lineColor || colors[0];
  const pointFill = series.customPointColor && series.pointColor
    ? series.pointColor
    : stroke;
  const fill = resolveFillStyle(colors[0], display.fillStyle);
  const seriesName =
    series.customDisplayName && series.displayName
      ? series.displayName
      : undefined;

  const labelHidden =
    series.labelVisibility === 'hidden'
    || display.showLabel === false;

  const labelContent = series.labelContent || { value: true };
  const labelText = (d: { category?: string; value?: number | null; series?: string }) => {
    const parts: string[] = [];
    if (labelContent.series) parts.push(String(d.series || seriesName || ''));
    if (labelContent.category && d.category != null) parts.push(String(d.category));
    if (labelContent.value !== false && d.value != null) parts.push(formatValue(d.value));
    return parts.filter(Boolean).join(' ') || formatValue(d.value);
  };

  const labelPos = series.labelPosition && series.labelPosition !== 'default'
    ? series.labelPosition
    : undefined;

  const legend = display.showLegend === false
    ? false
    : {
        position: legendStyle.position || 'top',
        itemLabelFontSize: legendStyle.textFormat?.fontSize ?? display.componentFontSize ?? 11,
        itemLabelFill: legendStyle.textFormat?.color || display.componentTextColor,
        itemLabelFontWeight: legendStyle.textFormat?.bold ? 700 : undefined,
        itemLabelFontStyle: legendStyle.textFormat?.italic ? 'italic' : undefined,
      };

  const tooltip = tip.enabled === false
    ? false
    : {
        shared: tip.trigger !== 'item',
        title: tip.showTitle === false
          ? false
          : (d: { category?: string }) => (d?.category != null ? String(d.category) : undefined),
        items: [
          ...(tip.showSeries === false
            ? []
            : [{
                channel: 'y' as const,
                name: seriesName || '数值',
                valueFormatter: (v: unknown) => formatValue(v),
              }]),
          ...(tip.showTotal
            ? [{
                channel: 'y' as const,
                name: '总计',
                valueFormatter: (v: unknown) => formatValue(v),
              }]
            : []),
        ],
        css: {
          ...(tip.backgroundColor ? { '--g2-tooltip-background-color': tip.backgroundColor } : {}),
          ...(tip.borderColor ? { '--g2-tooltip-border-color': tip.borderColor } : {}),
          ...(tip.borderWidth != null
            ? { '--g2-tooltip-border-width': `${tip.borderWidth}px` }
            : {}),
          ...(tip.width === 'small' ? { maxWidth: '120px' } : {}),
          ...(tip.width === 'medium' ? { maxWidth: '200px' } : {}),
          ...(tip.width === 'large' ? { maxWidth: '320px' } : {}),
        },
      };

  const axisOpts = {
    componentFontSize: display.componentFontSize,
    componentTextColor: display.componentTextColor,
    valueNumberFormat: display.valueNumberFormat,
  };
  const xCfg = buildAxisConfig(display.xAxis, axisOpts);
  const yCfg = buildAxisConfig(display.yAxis, { ...axisOpts, isY: true });

  if (xCfg && typeof xCfg === 'object') {
    const g = display.grid || {};
    xCfg.grid = g.vertical
      ? {
          lineDash: [0],
          stroke: g.verticalColor || '#f0f0f0',
          lineWidth: g.verticalWidth ?? 0.5,
        }
      : null;
  }
  if (yCfg && typeof yCfg === 'object') {
    const g = display.grid || {};
    yCfg.grid = g.horizontal === false
      ? null
      : {
          lineDash: [0],
          stroke: g.horizontalColor || '#f0f0f0',
          lineWidth: g.horizontalWidth ?? 0.5,
        };
    yCfg.tick = g.horizontalTick ? true : yCfg.tick;
  }

  const lineDash =
    series.lineDash === 'dashed' ? [4, 4]
      : series.lineDash === 'dotted' ? [1, 3]
        : undefined;

  const shape =
    series.lineStyle === 'smooth' ? 'smooth'
      : series.lineStyle === 'step' ? 'hvh'
        : undefined;

  const point =
    series.pointVisibility === 'hidden'
      ? false
      : {
          shapeField: series.pointShape || 'circle',
          size: series.pointSize ?? 3,
          style: {
            fill: pointFill,
            stroke: '#fff',
            lineWidth: 1,
            ...(series.pointVisibility === 'hover' ? { opacity: 0 } : {}),
          },
          tooltip: false,
        };

  const label = labelHidden
    ? false
    : {
        text: labelText,
        position: labelPos,
        style: {
          fontSize: series.labelFormat?.fontSize ?? display.componentFontSize ?? 12,
          fill: series.labelFormat?.color || display.componentTextColor,
          fontWeight: series.labelFormat?.bold ? 700 : undefined,
          fontStyle: series.labelFormat?.italic ? 'italic' : undefined,
          background: series.labelFormat?.backgroundColor,
        },
        transform: series.hideOverlappingLabels === false
          ? undefined
          : [{ type: 'overlapHide' }],
      };

  return {
    colors,
    legend,
    label,
    tooltip,
    axis: {
      x: xCfg,
      y: yCfg,
    },
    style: {
      stroke,
      lineWidth: series.lineWidth ?? 2,
      ...(lineDash ? { lineDash } : {}),
      ...(shape ? { shape } : {}),
    },
    fill,
    point,
    shape,
    componentFontSize: display.componentFontSize,
    componentTextColor: display.componentTextColor,
    seriesName,
    formatValue,
  };
}
