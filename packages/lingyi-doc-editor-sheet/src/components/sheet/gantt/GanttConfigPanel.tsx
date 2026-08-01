import React, { useState, useEffect } from 'react';
import { Select, Tooltip } from 'antd';
import type { BaseViewConfig, ColumnDef } from '@lingyi-doc/core-types';
import { CALENDAR_COLORS, CalendarColorKey } from '../calendar/calendarUtils';

const DROPDOWN_Z_INDEX = 10080;

const COLOR_LABELS: Record<CalendarColorKey, string> = {
  red: '红色',
  orange: '橙色',
  yellow: '黄色',
  green: '绿色',
  cyan: '青色',
  blue: '蓝色',
  purple: '紫色',
  gray: '灰色',
};

interface GanttConfigPanelProps {
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
    marginTop: 8,
  } as React.CSSProperties,
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 6,
    cursor: 'pointer',
    border: '2px solid transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
};

type ColorMode = 'custom' | 'field';

export const GanttConfigPanel: React.FC<GanttConfigPanelProps> = ({
  config,
  columns,
  onConfigChange,
}) => {
  const [localConfig, setLocalConfig] = useState<BaseViewConfig>(config);
  const [colorMode, setColorMode] = useState<ColorMode>(
    config.calendarCardColorFieldId ? 'field' : 'custom',
  );

  useEffect(() => {
    setLocalConfig(config);
    setColorMode(config.calendarCardColorFieldId ? 'field' : 'custom');
  }, [config]);

  const dateFields = columns.filter(col => col.type === 'date' || col.type === 'datetime');
  const selectableFields = columns.filter(col => col.type !== 'attachment');

  const handleChange = <K extends keyof BaseViewConfig>(key: K, value: BaseViewConfig[K]) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onConfigChange({ [key]: value } as Partial<BaseViewConfig>);
  };

  const handleColorModeChange = (mode: ColorMode) => {
    setColorMode(mode);
    if (mode === 'custom') {
      handleChange('calendarCardColorFieldId', '' as any);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.section}>
        <div style={styles.sectionContent}>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>开始日期</span>
            <Select
              style={{ width: 160 }}
              dropdownStyle={{ zIndex: DROPDOWN_Z_INDEX }}
              placeholder="选择开始日期字段"
              value={localConfig.ganttStartDateFieldId}
              onChange={(value) => handleChange('ganttStartDateFieldId', value)}
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
              dropdownStyle={{ zIndex: DROPDOWN_Z_INDEX }}
              placeholder="选择结束日期字段"
              value={localConfig.ganttEndDateFieldId}
              onChange={(value) => handleChange('ganttEndDateFieldId', value)}
              options={[
                { value: '', label: '未选择' },
                ...dateFields.map(f => ({ value: f.id, label: f.name })),
              ]}
            />
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionContent}>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>标题显示</span>
            <Select
              style={{ width: 160 }}
              dropdownStyle={{ zIndex: DROPDOWN_Z_INDEX }}
              placeholder="选择任务名字段"
              value={localConfig.ganttTaskNameFieldId}
              onChange={(value) => handleChange('ganttTaskNameFieldId', value)}
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
              dropdownStyle={{ zIndex: DROPDOWN_Z_INDEX }}
              value={colorMode}
              onChange={handleColorModeChange}
              options={[
                { value: 'custom', label: '自定义颜色' },
                { value: 'field', label: '跟随字段颜色' },
              ]}
            />
          </div>

          {colorMode === 'field' && (
            <div style={styles.configRow}>
              <span style={styles.configLabel}>颜色字段</span>
              <Select
                style={{ width: 160 }}
                dropdownStyle={{ zIndex: DROPDOWN_Z_INDEX }}
                placeholder="选择颜色字段"
                value={localConfig.calendarCardColorFieldId}
                onChange={(value) => handleChange('calendarCardColorFieldId', value)}
                options={[
                  { value: '', label: '未选择' },
                  ...columns.map(f => ({ value: f.id, label: f.name })),
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {colorMode === 'custom' && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>卡片颜色</div>
          <div style={styles.colorPicker}>
            {(Object.keys(CALENDAR_COLORS) as CalendarColorKey[]).map((key) => {
              const selected = localConfig.calendarDefaultColor === key;
              return (
                <Tooltip key={key} title={COLOR_LABELS[key]} placement="top">
                  <div
                    onClick={() => handleChange('calendarDefaultColor', key)}
                    style={{
                      ...styles.colorDot,
                      background: CALENDAR_COLORS[key].border,
                      borderColor: selected ? '#3370ff' : 'transparent',
                      boxShadow: selected ? '0 0 0 1px #3370ff' : 'none',
                    }}
                  >
                    {selected && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
