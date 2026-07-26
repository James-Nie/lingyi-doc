import React, { useMemo, useState } from 'react';
import { Button, ColorPicker } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { Color } from 'antd/es/color-picker';

/**
 * 产品图示预置色板（浅色 → 饱和 → 深色，约 5×10）
 * 选中态由 antd presets 打勾展示
 */
export const METRIC_PRESET_COLORS = [
  '#FFFFFF', '#F5F5F5', '#FAFAFA', '#FFF7E6', '#FFFBE6', '#F6FFED', '#E6FFFB', '#E6F4FF', '#F0F5FF', '#F9F0FF',
  '#A1BDFF', '#91CAFF', '#69B1FF', '#4096FF', '#1677FF', '#95DE64', '#73D13D', '#FFC53D', '#FF9C6E', '#FF7875',
  '#D3ADF7', '#B37FEB', '#9254DE', '#36CFC9', '#13C2C2', '#5CDBD3', '#FF85C0', '#F759AB', '#FFA940', '#FFEC3D',
  '#D9D9D9', '#BFBFBF', '#8C8C8C', '#595959', '#434343', '#262626', '#141414', '#000000', '#003A8C', '#061178',
  '#FFF1F0', '#FFCCC7', '#FFA39E', '#FF4D4F', '#CF1322', '#D9F7BE', '#B7EB8F', '#389E0D', '#ADC6FF', '#2F54EB',
];

interface MetricColorFieldProps {
  value?: string;
  /** 清空 / 默认时触发器展示用的色值 */
  fallback?: string;
  /** 兼容旧调用，不再以文案展示，始终用色块 */
  defaultLabel?: string;
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
}

function toCss(color: Color | string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (typeof color === 'string') return color || fallback;
  return color.toRgbString();
}

/** 属性面板颜色框：小色块 + 下拉箭头；展开浅蓝描边；面板含预置色打勾 / 自定义 / 透明度 */
export const MetricColorField: React.FC<MetricColorFieldProps> = ({
  value,
  fallback = '#1677FF',
  disabled,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const display = value && value !== 'default' ? value : undefined;
  const swatch = display || fallback;

  const presets = useMemo(
    () => [{ label: '预置颜色', colors: METRIC_PRESET_COLORS, defaultOpen: true }],
    [],
  );

  return (
    <ColorPicker
      value={display || fallback}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
      allowClear
      presets={presets}
      disabledAlpha={false}
      format="hex"
      placement="bottomLeft"
      arrow={false}
      onChange={c => onChange(toCss(c, fallback))}
      onClear={() => onChange(undefined)}
      className="dashboard-color-field"
      rootClassName="dashboard-color-picker-root"
      classNames={{ popup: { root: 'dashboard-color-picker-dropdown' } }}
      styles={{
        popupOverlayInner: { padding: 12, borderRadius: 8 },
      }}
      panelRender={(_panel, { components: { Picker, Presets } }) => (
        <div className="dashboard-color-picker-panel">
          <Button
            block
            className="dashboard-color-picker-reset"
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(undefined);
              setOpen(false);
            }}
          >
            恢复默认设置
          </Button>
          <div className="dashboard-color-picker-presets-wrap">
            <Presets />
          </div>
          <div className="dashboard-color-picker-custom-title">自定义颜色</div>
          <Picker />
        </div>
      )}
    >
      <div
        className={[
          'dashboard-color-field-trigger',
          open ? 'is-open' : '',
          disabled ? 'is-disabled' : '',
        ].filter(Boolean).join(' ')}
        aria-expanded={open}
      >
        <span
          className="dashboard-color-field-swatch"
          style={{ background: swatch }}
        />
        <DownOutlined className="dashboard-color-field-arrow" />
      </div>
    </ColorPicker>
  );
};
