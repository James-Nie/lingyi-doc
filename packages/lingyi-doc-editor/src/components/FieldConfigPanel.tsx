import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Checkbox,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Slider,
  Space,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import {
  CloseOutlined,
  DeleteOutlined,
  HolderOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { ColumnDef, ColumnType } from '@lingyi-doc/core';
import { RATING_ICON_DEFS, getRatingItemColors } from '@lingyi-doc/core';
import {
  FIELD_TYPE_CATEGORIES,
  FIELD_PALETTE_TYPES,
  getFieldTypeMeta,
} from './base/fieldTypeMeta';
import { FieldTypeIcon } from './base/FieldTypeIcon';

interface FieldConfigPanelProps {
  visible: boolean;
  field?: ColumnDef | null;
  onClose: () => void;
  onConfirm: (field: Partial<ColumnDef>) => void;
  /** 内嵌模式：无遮罩，用于工具栏弹窗内 */
  embedded?: boolean;
  /** 已有字段列表，用于重名校验 */
  allFields?: ColumnDef[];
}

const OPTION_COLORS = [
  '#2196F3', '#FF9800', '#4CAF50', '#E91E63',
  '#9C27B0', '#00BCD4', '#FF5722', '#607D8B',
];

const DATE_FORMATS = [
  { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY年MM月DD日', label: 'YYYY年MM月DD日' },
];

const RATING_ICONS = RATING_ICON_DEFS;
const RATING_RANGE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

import { baseSheetSelectProps } from './base/baseAntdConfig';

function getDefaultPlaceholder(type: ColumnType): string {
  switch (type) {
    case 'text': return '请输入内容';
    case 'number': return '请输入数字';
    case 'email': return '请输入邮箱';
    case 'phone': return '请输入电话';
    case 'link': return '请输入链接';
    case 'formula': return '请输入公式';
    default: return '';
  }
}

function serializeDefaultValue(value: unknown): unknown | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

const FieldConfigPanelInner: React.FC<FieldConfigPanelProps> = ({
  visible,
  field,
  onClose,
  onConfirm,
  embedded = false,
  allFields = [],
}) => {
  const [title, setTitle] = useState(field?.name || '');
  const [duplicateName, setDuplicateName] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ColumnType>(field?.type || 'text');
  const [options, setOptions] = useState<{ id: string; name: string; color: string }[]>(
    field?.options || [],
  );
  const [referOptions, setReferOptions] = useState(false);
  const [dateFormat, setDateFormat] = useState(field?.format || 'YYYY/MM/DD');
  const [ratingIcon, setRatingIcon] = useState(field?.ratingIcon || 'star');
  const [ratingMin, setRatingMin] = useState(field?.ratingMin || 1);
  const [ratingMax, setRatingMax] = useState(field?.ratingMax || 5);
  const [allowMultiple, setAllowMultiple] = useState(field?.allowMultiple || false);
  const [defaultValue, setDefaultValue] = useState<unknown>(field?.defaultValue || '');

  const fieldId = field?.id ?? null;

  useEffect(() => {
    if (!visible) return;
    setTitle(field?.name || '');
    setSelectedType(field?.type || 'text');
    setOptions(field?.options ? field.options.map(o => ({ ...o })) : []);
    setReferOptions(false);
    setDateFormat(field?.format || 'YYYY/MM/DD');
    setRatingIcon(field?.ratingIcon || 'star');
    setRatingMin(field?.ratingMin || 1);
    setRatingMax(field?.ratingMax || 5);
    setAllowMultiple(field?.allowMultiple || false);
    setDefaultValue(field?.defaultValue ?? '');
  }, [visible, fieldId]);

  const selectedTypeInfo = getFieldTypeMeta(selectedType);

  const fieldTypeOptions = useMemo(
    () => FIELD_TYPE_CATEGORIES.map(cat => ({
      label: cat.label,
      options: FIELD_PALETTE_TYPES[cat.key].map(type => {
        const meta = getFieldTypeMeta(type);
        return { value: type, label: meta.name };
      }),
    })),
    [],
  );

  const handleAddOption = useCallback(() => {
    const newOption = {
      id: `opt_${Date.now()}_${options.length}`,
      name: `选项${options.length + 1}`,
      color: OPTION_COLORS[options.length % OPTION_COLORS.length],
    };
    setOptions(prev => [...prev, newOption]);
  }, [options.length]);

  const handleUpdateOptionName = useCallback((index: number, name: string) => {
    setOptions(prev => {
      const next = [...prev];
      next[index] = { ...next[index], name };
      return next;
    });
  }, []);

  const handleCycleOptionColor = useCallback((index: number) => {
    setOptions(prev => {
      const next = [...prev];
      const currentIdx = OPTION_COLORS.indexOf(next[index].color);
      const nextIdx = (currentIdx + 1) % OPTION_COLORS.length;
      next[index] = { ...next[index], color: OPTION_COLORS[nextIdx] };
      return next;
    });
  }, []);

  const handleRemoveOption = useCallback((index: number) => {
    setOptions(prev => {
      const removed = prev[index];
      if (removed && defaultValue === removed.id) {
        setDefaultValue('');
      }
      return prev.filter((_, i) => i !== index);
    });
  }, [defaultValue]);

  const handleTypeChange = useCallback((type: ColumnType) => {
    setSelectedType(type);
    setDefaultValue('');
    if (type === 'select' || type === 'multiSelect') {
      setOptions(prev => (prev.length > 0 ? prev : [
        { id: 'opt1', name: '选项1', color: '#2196F3' },
        { id: 'opt2', name: '选项2', color: '#FF9800' },
      ]));
    }
  }, []);

  const handleConfirm = useCallback(() => {
    const resolvedName = title.trim() || selectedTypeInfo?.name || '未命名字段';
    const isDuplicate = allFields.some(
      f => f.name === resolvedName && f.id !== field?.id,
    );
    if (isDuplicate) {
      setDuplicateName(resolvedName);
      return;
    }

    const result: Partial<ColumnDef> = {
      name: resolvedName,
      type: selectedType,
      defaultValue: serializeDefaultValue(defaultValue),
      options: undefined,
      format: undefined,
      ratingIcon: undefined,
      ratingMin: undefined,
      ratingMax: undefined,
      allowMultiple: undefined,
    };

    if (selectedType === 'select' || selectedType === 'multiSelect') {
      result.options = options.length > 0 ? options : [
        { id: 'opt1', name: '选项1', color: '#2196F3' },
        { id: 'opt2', name: '选项2', color: '#FF9800' },
      ];
    }

    if (selectedType === 'date' || selectedType === 'datetime') {
      result.format = dateFormat;
    }

    if (selectedType === 'rating') {
      result.ratingIcon = ratingIcon;
      result.ratingMin = ratingMin;
      result.ratingMax = Math.max(ratingMax, ratingMin);
    }

    if (selectedType === 'user') {
      result.allowMultiple = allowMultiple;
    }

    onConfirm(result);
    if (!embedded) onClose();
  }, [title, selectedType, selectedTypeInfo, options, dateFormat, ratingIcon, ratingMin, ratingMax, allowMultiple, defaultValue, onConfirm, onClose, embedded, allFields, field?.id]);

  const renderDefaultValueField = () => {
    if (selectedType === 'select' || selectedType === 'multiSelect') {
      return (
        <Select
          allowClear
          placeholder="请选择选项"
          value={String(defaultValue || '') || undefined}
          onChange={value => setDefaultValue(value || '')}
          options={options.map(o => ({ value: o.id, label: o.name }))}
          style={{ width: '100%' }}
          {...baseSheetSelectProps}
        />
      );
    }

    if (selectedType === 'date' || selectedType === 'datetime') {
      return (
        <Select
          allowClear
          placeholder="请选择日期"
          value={String(defaultValue || '') || undefined}
          onChange={value => setDefaultValue(value || '')}
          options={[{ value: 'today', label: '今天' }]}
          style={{ width: '100%' }}
          {...baseSheetSelectProps}
        />
      );
    }

    if (selectedType === 'boolean') {
      return (
        <Space>
          <Switch
            checked={defaultValue === true || defaultValue === 'true'}
            onChange={value => setDefaultValue(value)}
          />
          <Typography.Text type="secondary">默认选中</Typography.Text>
        </Space>
      );
    }

    if (selectedType === 'user') {
      return (
        <Select
          allowClear
          placeholder="请选择成员"
          value={String(defaultValue || '') || undefined}
          onChange={value => setDefaultValue(value || '')}
          options={[]}
          style={{ width: '100%' }}
          {...baseSheetSelectProps}
        />
      );
    }

    if (selectedType === 'rating') {
      return (
        <Flex gap={4} wrap align="center">
          {Array.from({ length: ratingMax - ratingMin + 1 }, (_, i) => {
            const value = ratingMin + i;
            const iconDef = RATING_ICONS.find(r => r.key === ratingIcon) || RATING_ICONS[0];
            const active = Number(defaultValue) >= value;
            const colors = getRatingItemColors(iconDef, active);
            return (
              <Button
                key={value}
                type="text"
                size="small"
                title={`${value}`}
                onClick={() => setDefaultValue(value)}
                style={{ padding: 0, height: 'auto' }}
              >
                {iconDef.isNumber ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 18,
                      borderRadius: 3,
                      background: colors.color,
                      color: active ? '#fff' : '#999',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {value}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 18,
                      lineHeight: 1,
                      color: iconDef.useEmoji ? undefined : colors.color,
                      filter: iconDef.useEmoji && !active ? 'grayscale(1)' : undefined,
                      opacity: iconDef.useEmoji && !active ? 0.35 : 1,
                    }}
                  >
                    {iconDef.char}
                  </span>
                )}
              </Button>
            );
          })}
        </Flex>
      );
    }

    if (selectedType === 'progress') {
      const progressValue = Number(defaultValue) || 0;
      return (
        <Flex align="center" gap={12}>
          <Slider
            min={0}
            max={100}
            value={progressValue}
            onChange={value => setDefaultValue(value)}
            style={{ flex: 1, margin: 0 }}
          />
          <Typography.Text type="secondary" style={{ minWidth: 36, textAlign: 'right' }}>
            {progressValue}%
          </Typography.Text>
        </Flex>
      );
    }

    if (selectedType === 'number' || selectedType === 'currency' || selectedType === 'percent') {
      return (
        <InputNumber
          value={defaultValue === '' || defaultValue === undefined ? null : Number(defaultValue)}
          onChange={value => setDefaultValue(value ?? '')}
          placeholder={getDefaultPlaceholder(selectedType)}
          style={{ width: '100%' }}
        />
      );
    }

    return (
      <Input
        value={String(defaultValue || '')}
        onChange={e => setDefaultValue(e.target.value)}
        placeholder={getDefaultPlaceholder(selectedType)}
      />
    );
  };

  const panelContent = (
    <>
      <div style={{ flex: 1, overflow: 'auto', padding: embedded ? '16px' : '16px 20px' }}>
        <Form layout="vertical" requiredMark={false}>
          <Form.Item label="标题">
            <Input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={selectedTypeInfo?.name || ''}
            />
          </Form.Item>

          <Form.Item label="字段类型">
            <Select
              showSearch
              value={selectedType}
              onChange={handleTypeChange}
              optionFilterProp="label"
              options={fieldTypeOptions}
              {...baseSheetSelectProps}
              labelRender={({ value }) => {
                const type = value as ColumnType;
                const info = getFieldTypeMeta(type);
                return (
                  <Space>
                    <FieldTypeIcon type={type} size={16} />
                    <span>{info.name}</span>
                  </Space>
                );
              }}
              optionRender={option => {
                const type = option.value as ColumnType;
                const info = getFieldTypeMeta(type);
                return (
                  <Space>
                    <FieldTypeIcon type={type} size={16} />
                    <span>{info.name}</span>
                  </Space>
                );
              }}
            />
            <Button
              type="text"
              block
              style={{
                marginTop: 8,
                background: '#f5f7fa',
                justifyContent: 'space-between',
                height: 36,
              }}
              onClick={() => {/* 探索字段捷径 */}}
            >
              <span>探索字段捷径</span>
              <Space size={4}>
                <InfoCircleOutlined style={{ color: '#bbb' }} />
                <RightOutlined style={{ color: '#bbb', fontSize: 12 }} />
              </Space>
            </Button>
          </Form.Item>

          {(selectedType === 'select' || selectedType === 'multiSelect') && (
            <Form.Item
              label={
                <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                  <span>选项内容</span>
                  <Checkbox
                    checked={referOptions}
                    onChange={e => setReferOptions(e.target.checked)}
                  >
                    <Space size={4}>
                      引用选项
                      <Tooltip title="引用其他字段的选项">
                        <InfoCircleOutlined style={{ color: '#bbb' }} />
                      </Tooltip>
                    </Space>
                  </Checkbox>
                </Flex>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {options.map((opt, i) => (
                  <Flex key={opt.id} align="center" gap={8}>
                    <HolderOutlined style={{ color: '#ccc', cursor: 'grab' }} />
                    <button
                      type="button"
                      onClick={() => handleCycleOptionColor(i)}
                      title="点击切换颜色"
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: opt.color,
                        cursor: 'pointer',
                        flexShrink: 0,
                        border: '1px solid rgba(0,0,0,0.08)',
                        padding: 0,
                      }}
                    />
                    <Input
                      value={opt.name}
                      onChange={e => handleUpdateOptionName(i, e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveOption(i)}
                    />
                  </Flex>
                ))}
                <Button type="link" icon={<PlusOutlined />} onClick={handleAddOption} style={{ paddingLeft: 0 }}>
                  添加选项
                </Button>
              </Space>
            </Form.Item>
          )}

          {(selectedType === 'date' || selectedType === 'datetime') && (
            <Form.Item label="日期格式">
              <Select
                value={dateFormat}
                onChange={setDateFormat}
                options={DATE_FORMATS}
                style={{ width: '100%' }}
                {...baseSheetSelectProps}
              />
            </Form.Item>
          )}

          {selectedType === 'rating' && (
            <>
              <Form.Item label="图形">
                <Flex gap={6} wrap>
                  {RATING_ICONS.map(ri => (
                    <Button
                      key={ri.key}
                      title={ri.label}
                      type={ratingIcon === ri.key ? 'primary' : 'default'}
                      onClick={() => setRatingIcon(ri.key)}
                      style={{ width: 34, height: 34, padding: 0 }}
                    >
                      {ri.isNumber ? (
                        <span
                          style={{
                            background: ri.activeColor,
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 5px',
                            borderRadius: 3,
                            lineHeight: 1,
                          }}
                        >
                          123
                        </span>
                      ) : (
                        <span style={{ color: ri.activeColor, lineHeight: 1, fontSize: 18 }}>{ri.char}</span>
                      )}
                    </Button>
                  ))}
                </Flex>
              </Form.Item>

              <Form.Item label="分值">
                <Flex align="center" gap={8}>
                  <Select
                    value={ratingMin}
                    onChange={value => {
                      setRatingMin(value);
                      setRatingMax(prev => Math.max(prev, value));
                    }}
                    options={RATING_RANGE.map(n => ({ value: n, label: String(n) }))}
                    style={{ flex: 1 }}
                    {...baseSheetSelectProps}
                  />
                  <Typography.Text type="secondary">~</Typography.Text>
                  <Select
                    value={ratingMax}
                    onChange={value => setRatingMax(value)}
                    options={RATING_RANGE.filter(n => n >= ratingMin).map(n => ({
                      value: n,
                      label: String(n),
                    }))}
                    style={{ flex: 1 }}
                    {...baseSheetSelectProps}
                  />
                </Flex>
              </Form.Item>
            </>
          )}

          {selectedType === 'user' && (
            <Form.Item label="成员设置">
              <Flex justify="space-between" align="center">
                <Typography.Text type="secondary">允许添加多个成员</Typography.Text>
                <Switch checked={allowMultiple} onChange={setAllowMultiple} />
              </Flex>
            </Form.Item>
          )}

          <Form.Item
            label={
              <Space size={4}>
                默认值
                <Tooltip title="新建记录时自动填入的默认值">
                  <InfoCircleOutlined style={{ color: '#bbb' }} />
                </Tooltip>
              </Space>
            }
          >
            {renderDefaultValueField()}
          </Form.Item>
        </Form>
      </div>

      <div
        style={{
          padding: embedded ? '12px 16px' : '12px 20px',
          borderTop: '1px solid #e8e8e8',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" onClick={handleConfirm}>
          确定
        </Button>
      </div>
    </>
  );

  if (!visible) return null;

  const duplicateModal = (
    <Modal
      open={duplicateName !== null}
      title="重命名失败"
      onCancel={() => setDuplicateName(null)}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" onClick={() => setDuplicateName(null)}>确认</Button>
        </div>
      )}
      width={400}
      centered
      destroyOnHidden
    >
      <div style={{ padding: '8px 0', fontSize: 14, color: '#333' }}>
        字段名称「{duplicateName}」已存在，请输入其他名称
      </div>
    </Modal>
  );

  if (embedded) {
    return (
      <>
        <div data-sheet-keep-selection style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {panelContent}
        </div>
        {duplicateModal}
      </>
    );
  }

  return (
    <>
      <Modal
        open={visible}
        title={(
          <Space>
            <FieldTypeIcon type={selectedType} size={18} />
            <span>{selectedTypeInfo.name}</span>
          </Space>
        )}
        onCancel={onClose}
        footer={null}
        width={420}
        centered
        destroyOnHidden
        styles={{ body: { padding: 0, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
        closeIcon={<CloseOutlined />}
      >
        <div data-sheet-keep-selection style={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
          {panelContent}
        </div>
      </Modal>
      {duplicateModal}
    </>
  );
};

export const FieldConfigPanel: React.FC<FieldConfigPanelProps> = FieldConfigPanelInner;
