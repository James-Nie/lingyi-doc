import React, { useMemo } from 'react';
import { Select } from 'antd';
import { CHART_COLOR_THEMES, resolveChartThemeColors } from '../charts/toAntChartsSpec';

function PaletteRow({ colors }: { colors: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {colors.slice(0, 6).map((c, i) => (
        <span
          key={`${c}-${i}`}
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            background: c,
            flexShrink: 0,
            border: '1px solid rgba(0,0,0,0.04)',
          }}
        />
      ))}
    </div>
  );
}

interface ChartColorThemeSelectProps {
  value?: string;
  colors?: string[];
  disabled?: boolean;
  onChange: (themeId: string, colors: string[]) => void;
}

/** 颜色主题下拉：每行 6 色块，选中行浅蓝底 + 勾选 */
export const ChartColorThemeSelect: React.FC<ChartColorThemeSelectProps> = ({
  value,
  colors,
  disabled,
  onChange,
}) => {
  const themeId = useMemo(() => {
    if (value && CHART_COLOR_THEMES.some(t => t.id === value)) return value;
    if (colors?.length) {
      const matched = CHART_COLOR_THEMES.find(t =>
        t.colors.slice(0, 6).every((c, i) => c === colors[i]),
      );
      if (matched) return matched.id;
    }
    return CHART_COLOR_THEMES[0].id;
  }, [value, colors]);

  const currentColors = resolveChartThemeColors(themeId, colors);

  return (
    <Select
      style={{ width: '100%' }}
      disabled={disabled}
      value={themeId}
      optionLabelProp="label"
      popupMatchSelectWidth
      options={CHART_COLOR_THEMES.map(t => ({
        value: t.id,
        label: <PaletteRow colors={t.colors} />,
      }))}
      optionRender={opt => <PaletteRow colors={CHART_COLOR_THEMES.find(t => t.id === opt.value)?.colors || []} />}
      labelRender={() => <PaletteRow colors={currentColors} />}
      onChange={(id: string) => {
        const theme = CHART_COLOR_THEMES.find(t => t.id === id) || CHART_COLOR_THEMES[0];
        onChange(theme.id, theme.colors);
      }}
    />
  );
};
