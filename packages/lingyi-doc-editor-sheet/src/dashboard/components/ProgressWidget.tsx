import React, { useMemo } from 'react';
import type { AggregatedDataset, DashboardProgressConfig } from '@lingyi-doc/core-types';
import { formatMetricValue } from '../utils/formatMetricValue';

interface ProgressWidgetProps {
  dataset: AggregatedDataset | null;
  config: DashboardProgressConfig;
}

const TRACK = '#F0F0F0';
const DEFAULT_BLUE = '#5B8FF9';
const LABEL_MUTED = '#8c8c8c';
const TEXT_DARK = '#262626';

/** 按完成度区间配色 */
function resolveProgressRangeColor(ratio: number, fallback: string): string {
  if (ratio >= 1) return '#52C41A';
  if (ratio >= 0.66) return fallback || DEFAULT_BLUE;
  if (ratio >= 0.33) return '#FAAD14';
  return '#F4664A';
}

function resolveUnitPrefix(config: DashboardProgressConfig): { prefix: string; suffix: string } {
  const unit = config.unit || 'none';
  const pos = config.unitPosition || 'left';
  let mark = '';
  if (unit === 'cny') mark = '¥';
  else if (unit === 'usd') mark = '$';
  else if (unit === 'custom') mark = config.customUnit || '';
  if (!mark) return { prefix: '', suffix: '' };
  return pos === 'right' ? { prefix: '', suffix: mark } : { prefix: mark, suffix: '' };
}

function formatProgressNumber(raw: number, config: DashboardProgressConfig): string {
  const { prefix, suffix } = resolveUnitPrefix(config);
  const body = formatMetricValue(raw, {
    numberFormat: 'number',
    decimalPlaces: config.decimalPlaces ?? 0,
    largeNumberAbbrev: config.largeNumberAbbrev || 'none',
    useThousandSeparator: config.useThousandSeparator !== false,
  });
  return `${prefix}${body}${suffix}`;
}

function ProgressBar({
  ratio,
  color,
  achieved,
}: {
  ratio: number;
  color: string;
  achieved?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div style={{
      width: '72%',
      maxWidth: 280,
      height: 10,
      borderRadius: 999,
      background: TRACK,
      overflow: 'hidden',
      boxShadow: achieved ? `0 0 0 2px ${color}33` : undefined,
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        borderRadius: 999,
        background: color,
        transition: 'width 0.25s ease',
      }} />
    </div>
  );
}

function ProgressArc({
  ratio,
  color,
  semicircle,
  percentText,
  percentColor,
  achieved,
}: {
  ratio: number;
  color: string;
  semicircle: boolean;
  percentText: string;
  percentColor: string;
  achieved?: boolean;
}) {
  const size = semicircle ? 168 : 148;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = semicircle ? size / 2 + stroke / 2 : size / 2;
  const clamped = Math.max(0, Math.min(1, ratio));
  const glow = achieved ? `drop-shadow(0 0 4px ${color}88)` : undefined;

  if (semicircle) {
    const circumference = Math.PI * r;
    const dash = clamped * circumference;
    const viewH = size / 2 + stroke;
    return (
      <div style={{ position: 'relative', width: size, height: viewH, filter: glow }}>
        <svg width={size} height={viewH} viewBox={`0 0 ${size} ${viewH}`}>
          <path
            d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
            fill="none"
            stroke={TRACK}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <path
            d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 4,
          textAlign: 'center',
          fontSize: 28,
          fontWeight: 700,
          color: percentColor,
          letterSpacing: -0.5,
        }}>
          {percentText}
        </div>
      </div>
    );
  }

  const circumference = 2 * Math.PI * r;
  const dash = clamped * circumference;
  return (
    <div style={{ position: 'relative', width: size, height: size, filter: glow }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={TRACK}
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        fontSize: 28,
        fontWeight: 700,
        color: percentColor,
        letterSpacing: -0.5,
      }}>
        {percentText}
      </div>
    </div>
  );
}

export const ProgressWidget: React.FC<ProgressWidgetProps> = ({ dataset, config }) => {
  const shape = config.shape || 'ring';
  const baseProgressColor = config.progressColor || DEFAULT_BLUE;

  const { current, target } = useMemo(() => {
    const row = dataset?.rows?.[0];
    let cur = config.currentMode === 'custom'
      ? Number(config.currentValue ?? 0)
      : Number(row?.current ?? row?.count ?? 0);
    let tgt = config.targetMode === 'custom'
      ? Number(config.targetValue ?? 0)
      : Number(row?.target ?? 0);
    if (!Number.isFinite(cur)) cur = 0;
    if (!Number.isFinite(tgt)) tgt = 0;
    return { current: cur, target: tgt };
  }, [dataset, config]);

  const ratio = target > 0 ? current / target : 0;
  const achieved = config.achieveEffectEnabled && ratio >= 1;
  const progressColor = config.rangeColorEnabled
    ? resolveProgressRangeColor(ratio, baseProgressColor)
    : baseProgressColor;
  const percentColor = config.percentColor || TEXT_DARK;
  const currentColor = config.currentValueColor || progressColor;
  const targetColor = config.targetValueColor || LABEL_MUTED;

  const pctPlaces = config.progressDecimalPlaces ?? 0;
  const percentText = `${(Math.max(0, ratio) * 100).toFixed(pctPlaces)}%`;

  const currentLabel = config.currentLabel || '当前';
  const targetLabel = config.targetLabel || '目标';
  const currentText = formatProgressNumber(current, config);
  const targetText = formatProgressNumber(target, config);

  return (
    <div style={{
      height: '100%',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '8px 16px 16px',
      boxSizing: 'border-box',
      gap: shape === 'bar' ? 16 : 12,
    }}>
      {shape === 'bar' ? (
        <>
          <div style={{
            fontSize: 32,
            fontWeight: 700,
            color: percentColor,
            letterSpacing: -0.8,
            lineHeight: 1.1,
          }}>
            {percentText}
          </div>
          <ProgressBar ratio={ratio} color={progressColor} achieved={achieved} />
        </>
      ) : (
        <ProgressArc
          ratio={ratio}
          color={progressColor}
          semicircle={shape === 'semicircle'}
          percentText={percentText}
          percentColor={percentColor}
          achieved={achieved}
        />
      )}

      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: 10,
        fontSize: 13,
        lineHeight: 1.2,
      }}>
        <span>
          <span style={{ color: currentColor, opacity: 0.85 }}>{currentLabel}</span>
          {' '}
          <span style={{ color: currentColor, fontWeight: 700, fontSize: 15 }}>{currentText}</span>
        </span>
        <span style={{ color: '#d9d9d9', fontWeight: 300 }}>|</span>
        <span>
          <span style={{ color: targetColor, opacity: 0.9 }}>{targetLabel}</span>
          {' '}
          <span style={{ color: targetColor, fontWeight: 700, fontSize: 15 }}>{targetText}</span>
        </span>
      </div>
    </div>
  );
};
