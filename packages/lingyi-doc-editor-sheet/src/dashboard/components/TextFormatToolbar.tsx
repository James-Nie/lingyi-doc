import React from 'react';
import { Button, ColorPicker, Select, Space } from 'antd';
import { BoldOutlined, ItalicOutlined } from '@ant-design/icons';
import type { ChartTextFormat } from '@lingyi-doc/core-types';

const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18, 20, 24].map(n => ({
  value: n,
  label: String(n),
}));

interface TextFormatToolbarProps {
  value?: ChartTextFormat;
  disabled?: boolean;
  onChange: (next: ChartTextFormat) => void;
}

/** 图表配置面板用：字号 / 字色 / 底色 / 粗斜体 */
export const TextFormatToolbar: React.FC<TextFormatToolbarProps> = ({
  value,
  disabled,
  onChange,
}) => {
  const v = value || {};
  const patch = (next: Partial<ChartTextFormat>) => onChange({ ...v, ...next });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        border: '1px solid #d9d9d9',
        borderRadius: 6,
        background: '#fff',
        flexWrap: 'wrap',
      }}
    >
      <Select
        size="small"
        variant="borderless"
        disabled={disabled}
        value={v.fontSize ?? 11}
        options={FONT_SIZE_OPTIONS}
        style={{ width: 56 }}
        onChange={(fontSize: number) => patch({ fontSize })}
      />
      <ColorPicker
        size="small"
        disabled={disabled}
        value={v.color || '#262626'}
        onChange={c => patch({ color: c.toRgbString() })}
      >
        <Button
          size="small"
          type="text"
          disabled={disabled}
          style={{
            fontWeight: 700,
            color: v.color || '#1677ff',
            borderBottom: `2px solid ${v.color || '#1677ff'}`,
            borderRadius: 0,
            padding: '0 6px',
            height: 24,
          }}
        >
          A
        </Button>
      </ColorPicker>
      <ColorPicker
        size="small"
        disabled={disabled}
        value={v.backgroundColor || 'transparent'}
        allowClear
        onChange={(c, css) => patch({ backgroundColor: css || undefined })}
        onClear={() => patch({ backgroundColor: undefined })}
      >
        <Button
          size="small"
          type="text"
          disabled={disabled}
          style={{
            fontWeight: 700,
            height: 24,
            padding: '0 4px',
            border: '1px solid #d9d9d9',
            background: v.backgroundColor || 'transparent',
          }}
        >
          A
        </Button>
      </ColorPicker>
      <Space.Compact>
        <Button
          size="small"
          type={v.bold ? 'primary' : 'text'}
          icon={<BoldOutlined />}
          disabled={disabled}
          onClick={() => patch({ bold: !v.bold })}
        />
        <Button
          size="small"
          type={v.italic ? 'primary' : 'text'}
          icon={<ItalicOutlined />}
          disabled={disabled}
          onClick={() => patch({ italic: !v.italic })}
        />
      </Space.Compact>
    </div>
  );
};

export function textFormatToCss(format?: ChartTextFormat): React.CSSProperties {
  if (!format) return {};
  return {
    fontSize: format.fontSize,
    color: format.color,
    backgroundColor: format.backgroundColor,
    fontWeight: format.bold ? 700 : undefined,
    fontStyle: format.italic ? 'italic' : undefined,
  };
}
