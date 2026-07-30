import React, { useState, useEffect } from 'react';
import { Select } from 'antd';
import type { BaseViewConfig, ColumnDef } from '@lingyi-doc/core-types';
import { CALENDAR_COLORS, CalendarColorKey } from './calendarUtils';

interface CalendarConfigPanelProps {
  config: BaseViewConfig;
  columns: ColumnDef[];
  onClose?: () => void;
  onConfigChange: (config: Partial<BaseViewConfig>) => void;
}

const styles = {
  root: {
    padding: '12px 16px',
    minWidth: 280,
  } as React.CSSProperties,
  section: {
    marginBottom: 20,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    color: '#646a73',
    marginBottom: 8,
  } as React.CSSProperties,
  sectionContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  } as React.CSSProperties,
  configRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
  } as React.CSSProperties,
  configLabel: {
    fontSize: 14,
    color: '#1f2329',
  } as React.CSSProperties,
  colorPicker: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'transform 0.15s',
  } as React.CSSProperties,
};

export const CalendarConfigPanel: React.FC<CalendarConfigPanelProps> = ({
  config,
  columns,
  onConfigChange,
}) => {
  const [localConfig, setLocalConfig] = useState<BaseViewConfig>(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const dateFields = columns.filter(col => col.type === 'date' || col.type === 'datetime');
  const selectableFields = columns.filter(col => col.type !== 'attachment');

  const handleChange = <K extends keyof BaseViewConfig>(key: K, value: BaseViewConfig[K]) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onConfigChange({ [key]: value } as Partial<BaseViewConfig>);
  };

  return (
    <div style={styles.root}>
      <div style={styles.section}>
        <div style={styles.sectionTitle}>日期字段</div>
        <div style={styles.sectionContent}>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>开始日期</span>
            <Select
              style={{ width: 160 }}
              placeholder="选择开始日期字段"
              value={localConfig.calendarDateFieldId}
              onChange={(value) => handleChange('calendarDateFieldId', value)}
              options={[
                { value: '', label: '未选择' },
                ...dateFields.map(f => ({ value: f.id, label: f.name })),
              ]}
            />
          </div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>结束日期</span>
            <Select
              style={{ width: 160 }}
              placeholder="选择结束日期字段"
              value={localConfig.calendarEndDateFieldId}
              onChange={(value) => handleChange('calendarEndDateFieldId', value)}
              options={[
                { value: '', label: '未选择' },
                ...dateFields.map(f => ({ value: f.id, label: f.name })),
              ]}
            />
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>显示设置</div>
        <div style={styles.sectionContent}>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>标题显示</span>
            <Select
              style={{ width: 160 }}
              placeholder="选择标题字段"
              value={localConfig.calendarCardTitleFieldId}
              onChange={(value) => handleChange('calendarCardTitleFieldId', value)}
              options={[
                { value: '', label: '自动选择' },
                ...selectableFields.map(f => ({ value: f.id, label: f.name })),
              ]}
            />
          </div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>颜色显示</span>
            <Select
              style={{ width: 160 }}
              placeholder="选择颜色字段"
              value={localConfig.calendarCardColorFieldId}
              onChange={(value) => handleChange('calendarCardColorFieldId', value)}
              options={[
                { value: '', label: '默认颜色' },
                ...columns.map(f => ({ value: f.id, label: f.name })),
              ]}
            />
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>卡片颜色</div>
        <div style={styles.colorPicker}>
          {(Object.keys(CALENDAR_COLORS) as CalendarColorKey[]).map((key) => (
            <div
              key={key}
              onClick={() => handleChange('calendarDefaultColor', key)}
              style={{
                ...styles.colorDot,
                background: CALENDAR_COLORS[key].border,
                borderColor: localConfig.calendarDefaultColor === key ? CALENDAR_COLORS[key].border : 'transparent',
                transform: localConfig.calendarDefaultColor === key ? 'scale(1.2)' : 'scale(1)',
              }}
              title={key}
            />
          ))}
        </div>
      </div>

    </div>
  );
};
