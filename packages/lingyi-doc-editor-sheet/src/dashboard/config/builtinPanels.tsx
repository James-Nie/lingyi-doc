import React from 'react';
import { Input, Select, Checkbox, Switch, Segmented, Space, Tag, Button, InputNumber, Tooltip } from 'antd';
import { FilterOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { AggregateMetric, ColumnDef, DashboardChartDisplayConfig, DashboardChartKind, DashboardGridViewConfig, DashboardMetricCardConfig, DashboardProgressConfig, DashboardProgressShape, DashboardProgressUnit, DashboardWidget, MetricLargeNumberAbbrev, MetricNumberFormat } from '@lingyi-doc/core-types';
import { isBaseSheet } from '@lingyi-doc/core-types';
import type { WidgetConfigPanelContext } from './panelRegistry';
import { registerWidgetConfigPanel } from './panelRegistry';
import { CHART_KIND_OPTIONS } from '../charts/toAntChartsSpec';
import { MetricColorField } from '../components/MetricColorField';
import { ChartCustomForm } from '../components/ChartCustomForm';
import { ChartColorThemeSelect } from '../components/ChartColorThemeSelect';
import { ConfigCollapseSection, FormField, FormFieldRow } from '../components/ConfigCollapse';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: 4,
      paddingTop: 12,
      borderTop: '1px solid #f0f0f0',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function SourceTableBlock({ ctx }: { ctx: WidgetConfigPanelContext }) {
  return (
    <>
      <FieldLabel>源数据表</FieldLabel>
      <Select
        style={{ width: '100%', marginBottom: 8 }}
        value={ctx.widget.dataBinding?.query.sheetId || ctx.table.sheetId}
        options={[{ value: ctx.table.sheetId, label: ctx.sheetName }]}
        disabled
      />
      <Checkbox disabled>
        多数据源模式 <Tag color="orange" style={{ marginLeft: 4 }}>增值功能</Tag>
      </Checkbox>
    </>
  );
}

function DataRangeBlock({ ctx, label }: { ctx: WidgetConfigPanelContext; label?: string }) {
  return (
    <>
      <FieldLabel>数据范围</FieldLabel>
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Select
          style={{ flex: 1 }}
          value={label || '全部数据'}
          options={[{ value: '全部数据', label: '全部数据' }]}
          disabled={ctx.readOnly}
        />
        <Button icon={<FilterOutlined />} disabled>
          筛选
        </Button>
      </Space.Compact>
    </>
  );
}

function groupableFields(columnDefs: ColumnDef[]) {
  return columnDefs.filter(c =>
    !['attachment', 'formula'].includes(c.type),
  ).map(c => ({ value: c.id, label: c.name }));
}

function numericFields(columnDefs: ColumnDef[]) {
  return columnDefs.filter(c => isNumericColumnType(c.type)).map(c => ({ value: c.id, label: c.name }));
}

function allSelectableFields(columnDefs: ColumnDef[]) {
  return columnDefs
    .filter(c => !['attachment'].includes(c.type))
    .map(c => ({ value: c.id, label: c.name }));
}

function isNumericColumnType(type?: string): boolean {
  return !!type && ['number', 'currency', 'percent', 'rating', 'progress'].includes(type);
}

function rebuildChartQuery(
  ctx: WidgetConfigPanelContext,
  config: DashboardChartDisplayConfig,
) {
  const sheetId = ctx.widget.dataBinding?.query.sheetId || ctx.table.sheetId;
  const valueMode = config.valueMode || 'recordCount';
  const metrics = valueMode === 'fieldValue' && config.valueFieldId
    ? [{
        id: 'metric',
        fieldId: config.valueFieldId,
        op: config.valueAgg || 'count',
        label: '数值',
      }]
    : [{ id: 'count', fieldId: '*' as const, op: 'count' as const, label: '计数' }];

  const chartKind = config.chartKind
    || (ctx.widget.componentType.replace('chart.', '') as DashboardChartKind);
  const categoryFieldId = config.categoryFieldId;
  const axisSort = config.axisSort
    || (config.sortBy === 'value' ? 'value' : config.sortBy === 'name' ? 'category' : undefined);
  const sortBy = axisSort === 'value'
    ? 'value'
    : axisSort === 'record'
      ? 'record'
      : (config.sortBy || 'name');
  // 折线/面积默认按类目升序，避免时间趋势被倒过来画成乱折线
  const sortOrder = config.sortOrder
    || ((chartKind === 'line' || chartKind === 'area') ? 'asc' : 'desc');

  // `__time_<fieldId>` 或横轴选了日期字段时，走 timeBucket，勿按虚拟字段 groupBy
  const timeFieldId = categoryFieldId?.startsWith('__time_')
    ? categoryFieldId.slice('__time_'.length)
    : undefined;
  const categoryCol = categoryFieldId
    ? ctx.columnDefs.find(c => c.id === (timeFieldId || categoryFieldId))
    : undefined;
  const useTimeBucket = !!(
    (timeFieldId && categoryCol)
    || (
      (chartKind === 'line' || chartKind === 'area')
      && categoryCol
      && (categoryCol.type === 'date' || categoryCol.type === 'datetime')
    )
  );
  const resolvedTimeFieldId = timeFieldId || categoryFieldId;
  const resolvedCategoryId = useTimeBucket && resolvedTimeFieldId
    ? `__time_${resolvedTimeFieldId}`
    : categoryFieldId;

  ctx.onChange({
    config: {
      ...config,
      categoryFieldId: resolvedCategoryId,
      metricIds: [metrics[0].id],
      sortBy: sortBy === 'record' ? 'name' : sortBy,
      axisSort: axisSort || (sortBy === 'value' ? 'value' : sortBy === 'record' ? 'record' : 'category'),
      sortOrder,
    } as unknown as Record<string, unknown>,
    dataBinding: {
      listenGlobalFilters: true,
      query: {
        sheetId,
        groupBy: !useTimeBucket && categoryFieldId
          ? [{
              fieldId: categoryFieldId,
              order: sortBy === 'name' ? sortOrder : 'asc',
            }]
          : undefined,
        timeBucket: useTimeBucket && resolvedTimeFieldId
          ? {
              fieldId: resolvedTimeFieldId,
              unit: 'day' as const,
              order: sortBy === 'value' || sortBy === 'record' ? 'asc' : sortOrder,
            }
          : undefined,
        metrics,
        topN: sortBy === 'value'
          ? { metricId: metrics[0].id, n: 50, order: sortOrder }
          : undefined,
        preserveBucketOrder: sortBy === 'record',
        sort: undefined,
      },
    },
  });
}

function ChartBasicForm(ctx: WidgetConfigPanelContext) {
  const config = ctx.widget.config as unknown as DashboardChartDisplayConfig;
  const chartKind = config.chartKind
    || (ctx.widget.componentType.replace('chart.', '') as DashboardChartKind);
  const fields = groupableFields(ctx.columnDefs);
  const nums = numericFields(ctx.columnDefs);

  const isPie = chartKind === 'pie' || chartKind === 'donut';
  const isBar = chartKind === 'bar' || chartKind === 'bidirectionalBar';
  const isCartesian = ['column', 'bar', 'line', 'area', 'combo', 'scatter', 'bubble', 'bidirectionalBar'].includes(chartKind);
  const showFill = chartKind === 'bar' || chartKind === 'column' || chartKind === 'area';

  /** 条形图：类目在纵轴、数值在横轴；其余笛卡尔：类目在横轴、数值在纵轴 */
  const categorySectionTitle = isPie ? '分组依据' : isBar ? '纵轴' : '横轴';
  const valueSectionTitle = isPie ? '扇区数值' : isBar ? '横轴' : '纵轴';

  const patch = (next: Partial<DashboardChartDisplayConfig>) => {
    ctx.onChange({
      config: { ...config, ...next } as unknown as Record<string, unknown>,
    });
  };

  return (
    <div className="dashboard-config-form">
      <FormField label="名称">
        <Input
          value={ctx.widget.title || config.title || ''}
          disabled={ctx.readOnly}
          onChange={e => {
            const title = e.target.value;
            ctx.onChange({
              title,
              config: { ...config, title } as unknown as Record<string, unknown>,
            });
          }}
        />
      </FormField>

      <SourceTableBlock ctx={ctx} />
      <div style={{ height: 12 }} />
      <DataRangeBlock ctx={ctx} label={config.dataRangeLabel} />

      <Section title="图表">
        <FormField label="图表类型">
          <Select
            value={chartKind}
            disabled={ctx.readOnly}
            options={CHART_KIND_OPTIONS}
            onChange={(v: DashboardChartKind) => {
              const nextType = `chart.${v}` as DashboardWidget['componentType'];
              ctx.onChange({
                componentType: nextType,
                config: { ...config, chartKind: v } as unknown as Record<string, unknown>,
              });
            }}
          />
        </FormField>
        <FormField label="颜色主题">
          <ChartColorThemeSelect
            value={config.colorThemeId}
            colors={config.colors}
            disabled={ctx.readOnly}
            onChange={(colorThemeId, colors) => patch({ colorThemeId, colors })}
          />
        </FormField>
        {showFill && (
          <FormField label="填充样式">
            <Segmented
              block
              disabled={ctx.readOnly}
              value={config.fillStyle || 'solid'}
              options={[
                { label: '纯色', value: 'solid' },
                { label: '渐变', value: 'gradient' },
              ]}
              onChange={(v) => patch({ fillStyle: v as 'solid' | 'gradient' })}
            />
          </FormField>
        )}
      </Section>

      <Section title={categorySectionTitle}>
        <FormField label="字段">
          <Select
            value={
              config.categoryFieldId?.startsWith('__time_')
                ? config.categoryFieldId.slice('__time_'.length)
                : config.categoryFieldId
            }
            options={fields}
            disabled={ctx.readOnly || fields.length === 0}
            placeholder="选择分组字段"
            onChange={(fieldId: string) => {
              rebuildChartQuery(ctx, { ...config, categoryFieldId: fieldId });
            }}
          />
        </FormField>
        <FormField label="排序字段">
          {isCartesian ? (
            <Segmented
              block
              disabled={ctx.readOnly}
              value={config.axisSort || (config.sortBy === 'value' ? 'value' : 'category')}
              options={[
                { label: isBar ? '纵轴值' : '横轴值', value: 'category' },
                { label: isBar ? '横轴值' : '纵轴值', value: 'value' },
                { label: '记录顺序', value: 'record' },
              ]}
              onChange={(v) => {
                const axisSort = v as 'category' | 'value' | 'record';
                rebuildChartQuery(ctx, {
                  ...config,
                  axisSort,
                  sortBy: axisSort === 'value' ? 'value' : 'name',
                });
              }}
            />
          ) : (
            <Segmented
              block
              disabled={ctx.readOnly}
              value={config.sortBy || 'name'}
              options={[
                { label: '按名称', value: 'name' },
                { label: '按数值', value: 'value' },
              ]}
              onChange={(v) => {
                rebuildChartQuery(ctx, { ...config, sortBy: v as 'name' | 'value' });
              }}
            />
          )}
        </FormField>
        {(isCartesian || isPie) && (
          <FormField label="排序方向">
            <Segmented
              block
              disabled={ctx.readOnly}
              value={config.sortOrder || 'desc'}
              options={[
                { label: '升序', value: 'asc' },
                { label: '降序', value: 'desc' },
              ]}
              onChange={(v) => {
                rebuildChartQuery(ctx, { ...config, sortOrder: v as 'asc' | 'desc' });
              }}
            />
          </FormField>
        )}
      </Section>

      <Section title={valueSectionTitle}>
        <FormField label="统计方式">
          <Segmented
            block
            disabled={ctx.readOnly}
            value={config.valueMode || 'recordCount'}
            options={[
              { label: '记录数', value: 'recordCount' },
              { label: '字段值', value: 'fieldValue' },
            ]}
            onChange={(v) => {
              rebuildChartQuery(ctx, {
                ...config,
                valueMode: v as 'recordCount' | 'fieldValue',
                valueFieldId: config.valueFieldId || nums[0]?.value || fields[0]?.value,
                valueAgg: config.valueAgg || 'sum',
              });
            }}
          />
        </FormField>
        {(config.valueMode || 'recordCount') === 'fieldValue' && (
          <FormField label="字段值">
            <Space.Compact style={{ width: '100%' }}>
              <Select
                style={{ flex: 1 }}
                value={config.valueFieldId}
                options={[...nums, ...fields]}
                disabled={ctx.readOnly}
                onChange={(fieldId: string) => {
                  rebuildChartQuery(ctx, {
                    ...config,
                    valueFieldId: fieldId,
                    valueMode: 'fieldValue',
                  });
                }}
              />
              <Select
                style={{ width: 100 }}
                value={config.valueAgg || 'sum'}
                options={[
                  { value: 'count', label: '计数' },
                  { value: 'sum', label: '求和' },
                  { value: 'avg', label: '平均' },
                  { value: 'max', label: '最大' },
                  { value: 'min', label: '最小' },
                ]}
                disabled={ctx.readOnly}
                onChange={(op) => {
                  rebuildChartQuery(ctx, {
                    ...config,
                    valueAgg: op as DashboardChartDisplayConfig['valueAgg'],
                    valueMode: 'fieldValue',
                  });
                }}
              />
            </Space.Compact>
          </FormField>
        )}
        <FormField label="数字格式">
          <Select
            disabled={ctx.readOnly}
            value={config.valueNumberFormat || 'follow'}
            options={[
              { value: 'follow', label: '跟随源数据' },
              { value: 'number', label: '数字' },
              { value: 'percent', label: '百分比' },
              { value: 'cny', label: '人民币' },
              { value: 'usd', label: '美元' },
            ]}
            onChange={(valueNumberFormat: DashboardChartDisplayConfig['valueNumberFormat']) => {
              patch({ valueNumberFormat });
            }}
          />
        </FormField>
        <FormField
          label={(
            <span>
              空值显示为
              <Tooltip title="源数据为空时在图表上的展示方式">
                <QuestionCircleOutlined style={{ marginLeft: 4, color: '#bfbfbf' }} />
              </Tooltip>
            </span>
          )}
        >
          <Select
            disabled={ctx.readOnly}
            value={config.emptyValueDisplay || 'blank'}
            options={[
              { value: 'blank', label: '留空/断开' },
              { value: 'zero', label: '显示为 0' },
              { value: 'skip', label: '跳过' },
            ]}
            onChange={(emptyValueDisplay: DashboardChartDisplayConfig['emptyValueDisplay']) => {
              patch({ emptyValueDisplay });
            }}
          />
        </FormField>
        <FormField label="分组聚合">
          <Select
            disabled={ctx.readOnly}
            value={config.groupAgg || 'none'}
            options={[
              { value: 'none', label: '不分组' },
              { value: 'sum', label: '求和' },
              { value: 'avg', label: '平均值' },
              { value: 'max', label: '最大值' },
              { value: 'min', label: '最小值' },
            ]}
            onChange={(groupAgg: DashboardChartDisplayConfig['groupAgg']) => {
              patch({ groupAgg });
            }}
          />
        </FormField>
        {!isPie && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#8c8c8c' }}>
              行列转置
              <Tooltip title="交换类目轴与数值轴的方向">
                <QuestionCircleOutlined style={{ marginLeft: 4, color: '#bfbfbf' }} />
              </Tooltip>
            </span>
            <Switch
              checked={!!config.transpose}
              disabled={ctx.readOnly}
              onChange={(transpose) => {
                // 柱/条互转更直观；其它笛卡尔图种只交换轴字段
                if (transpose && chartKind === 'column') {
                  ctx.onChange({
                    componentType: 'chart.bar',
                    config: { ...config, transpose: true, chartKind: 'bar' } as unknown as Record<string, unknown>,
                  });
                } else if (!transpose && chartKind === 'bar' && config.transpose) {
                  ctx.onChange({
                    componentType: 'chart.column',
                    config: { ...config, transpose: false, chartKind: 'column' } as unknown as Record<string, unknown>,
                  });
                } else {
                  patch({ transpose });
                }
              }}
            />
          </div>
        )}
      </Section>
    </div>
  );
}

function MetricBasicForm(ctx: WidgetConfigPanelContext) {
  const config = ctx.widget.config as DashboardMetricCardConfig;
  const fields = allSelectableFields(ctx.columnDefs);
  const selectedField = ctx.columnDefs.find(c => c.id === config.valueFieldId);
  const fieldIsNumeric = isNumericColumnType(selectedField?.type);

  const applyMetricQuery = (next: DashboardMetricCardConfig) => {
    const sheetId = ctx.widget.dataBinding?.query.sheetId || ctx.table.sheetId;
    const isField = next.statMode === 'fieldValue' && next.valueFieldId;
    ctx.onChange({
      config: next as unknown as Record<string, unknown>,
      dataBinding: {
        listenGlobalFilters: true,
        query: {
          sheetId,
          metrics: isField
            ? [{
                id: 'metric',
                fieldId: next.valueFieldId!,
                op: next.valueAgg || 'count',
                label: '数值',
              }]
            : [{ id: 'count', fieldId: '*', op: 'count', label: '计数' }],
        },
      },
    });
  };

  const aggOptions = [
    { value: 'count', label: '计数', disabled: false },
    { value: 'countDistinct', label: '去重计数', disabled: false },
    { value: 'sum', label: '求和', disabled: !fieldIsNumeric },
    { value: 'max', label: '最大值', disabled: !fieldIsNumeric },
    { value: 'min', label: '最小值', disabled: !fieldIsNumeric },
    { value: 'avg', label: '平均值', disabled: !fieldIsNumeric },
    { value: 'median', label: '中位数', disabled: true },
    { value: 'range', label: '极差', disabled: true },
  ];

  return (
    <div className="dashboard-config-form">
      <FormField label="名称">
        <Input
          value={ctx.widget.title || config.title || ''}
          disabled={ctx.readOnly}
          onChange={e => {
            const title = e.target.value;
            ctx.onChange({
              title,
              config: { ...config, title } as unknown as Record<string, unknown>,
            });
          }}
        />
      </FormField>

      <SourceTableBlock ctx={ctx} />
      <div style={{ height: 12 }} />
      <DataRangeBlock ctx={ctx} label={config.dataRangeLabel} />

      <FormField label="统计方式">
        <Select
          disabled={ctx.readOnly}
          value={config.statMode || 'recordCount'}
          options={[
            { value: 'recordCount', label: '记录数' },
            { value: 'fieldValue', label: '字段值' },
          ]}
          onChange={(statMode: 'recordCount' | 'fieldValue') => {
            const next: DashboardMetricCardConfig = {
              ...config,
              statMode,
              valueFieldId: config.valueFieldId || fields[0]?.value,
              valueAgg: config.valueAgg || 'count',
            };
            applyMetricQuery(next);
          }}
        />
      </FormField>

      {(config.statMode || 'recordCount') === 'fieldValue' && (
        <FormField label="字段值">
          <Space.Compact style={{ width: '100%' }}>
            <Select
              style={{ flex: 1, minWidth: 0 }}
              disabled={ctx.readOnly || fields.length === 0}
              value={config.valueFieldId || fields[0]?.value}
              options={fields}
              placeholder="选择字段"
              onChange={(valueFieldId: string) => {
                const col = ctx.columnDefs.find(c => c.id === valueFieldId);
                const numeric = isNumericColumnType(col?.type);
                const currentAgg = config.valueAgg || 'count';
                const valueAgg = (!numeric && ['sum', 'avg', 'max', 'min'].includes(currentAgg))
                  ? 'count'
                  : currentAgg;
                applyMetricQuery({ ...config, statMode: 'fieldValue', valueFieldId, valueAgg });
              }}
            />
            <Select
              style={{ width: 110 }}
              disabled={ctx.readOnly}
              value={config.valueAgg || 'count'}
              options={aggOptions}
              onChange={(valueAgg: string) => {
                if (valueAgg === 'median' || valueAgg === 'range') return;
                applyMetricQuery({
                  ...config,
                  statMode: 'fieldValue',
                  valueFieldId: config.valueFieldId || fields[0]?.value,
                  valueAgg: valueAgg as DashboardMetricCardConfig['valueAgg'],
                });
              }}
            />
          </Space.Compact>
        </FormField>
      )}

      <FormField label="数值说明">
        <Input
          placeholder="请输入"
          value={config.valueDescription || ''}
          disabled={ctx.readOnly}
          onChange={e => {
            ctx.onChange({
              config: { ...config, valueDescription: e.target.value } as unknown as Record<string, unknown>,
            });
          }}
        />
      </FormField>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#595959' }}>
          同比/环比
          <Tooltip title="开启后展示同比区域；完整按时间维度对比上期数值将在后续版本补齐">
            <QuestionCircleOutlined style={{ marginLeft: 4, color: '#bfbfbf' }} />
          </Tooltip>
        </span>
        <Switch
          checked={!!config.showYoy}
          disabled={ctx.readOnly}
          onChange={checked => {
            ctx.onChange({
              config: { ...config, showYoy: checked } as unknown as Record<string, unknown>,
            });
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 12,
          borderTop: '1px solid #f0f0f0',
        }}
      >
        <span style={{ fontSize: 13, color: '#595959' }}>
          趋势图
          <Tooltip title="开启后展示迷你趋势；若当前聚合仅有单点则显示基线">
            <QuestionCircleOutlined style={{ marginLeft: 4, color: '#bfbfbf' }} />
          </Tooltip>
        </span>
        <Switch
          checked={!!config.showTrend}
          disabled={ctx.readOnly}
          onChange={checked => {
            ctx.onChange({
              config: { ...config, showTrend: checked } as unknown as Record<string, unknown>,
            });
          }}
        />
      </div>
    </div>
  );
}

function MetricCustomForm(ctx: WidgetConfigPanelContext) {
  const config = ctx.widget.config as DashboardMetricCardConfig;
  const patch = (next: Partial<DashboardMetricCardConfig>) => {
    ctx.onChange({
      config: { ...config, ...next } as unknown as Record<string, unknown>,
    });
  };

  return (
    <div className="dashboard-config-form">
      <FormField label="标题颜色">
        <MetricColorField
          value={config.titleColor}
          fallback="#262626"
          defaultLabel="默认"
          disabled={ctx.readOnly}
          onChange={titleColor => patch({ titleColor })}
        />
      </FormField>

      <FormField label="背景">
        <MetricColorField
          value={config.background}
          fallback="#FFFFFF"
          defaultLabel="默认"
          disabled={ctx.readOnly}
          onChange={background => patch({ background: background || '#FFFFFF' })}
        />
      </FormField>

      <FormFieldRow>
        <FormField label="边框色" style={{ marginBottom: 0 }}>
          <MetricColorField
            value={config.borderColor && config.borderColor !== 'default' ? config.borderColor : undefined}
            fallback="#f0f0f0"
            defaultLabel="默认"
            disabled={ctx.readOnly}
            onChange={borderColor => patch({ borderColor: borderColor || 'default' })}
          />
        </FormField>
        <FormField label="边框粗细" style={{ marginBottom: 0 }}>
          <Select
            disabled={ctx.readOnly}
            value={config.borderWidth ?? 1}
            options={[0, 1, 2, 3, 4].map(n => ({ value: n, label: String(n) }))}
            onChange={(borderWidth: number) => patch({ borderWidth })}
          />
        </FormField>
      </FormFieldRow>

      <FormField label="数值颜色">
        <MetricColorField
          value={config.valueColor}
          fallback="#262626"
          defaultLabel="默认"
          disabled={ctx.readOnly}
          onChange={valueColor => patch({ valueColor })}
        />
      </FormField>

      <div style={{ marginBottom: 12 }}>
        <Checkbox
          checked={!!config.rangeColorEnabled}
          disabled={ctx.readOnly}
          onChange={e => patch({ rangeColorEnabled: e.target.checked })}
        >
          区间配色
        </Checkbox>
        <Tooltip title="按数值区间自动切换颜色，后续版本可配置区间阈值">
          <QuestionCircleOutlined style={{ marginLeft: 4, color: '#bfbfbf' }} />
        </Tooltip>
      </div>

      <FormField label="指标字号">
        <Segmented
          block
          disabled={ctx.readOnly}
          value={config.valueFontSizeMode || 'adaptive'}
          options={[
            { value: 'adaptive', label: '自适应' },
            { value: 'custom', label: '自定义' },
          ]}
          onChange={(valueFontSizeMode) => {
            patch({
              valueFontSizeMode: valueFontSizeMode as 'adaptive' | 'custom',
              valueFontSize: config.valueFontSize || 42,
            });
          }}
        />
      </FormField>
      {config.valueFontSizeMode === 'custom' && (
        <FormField label="字号大小">
          <InputNumber
            min={12}
            max={96}
            disabled={ctx.readOnly}
            value={config.valueFontSize ?? 42}
            addonAfter="px"
            onChange={v => patch({ valueFontSize: typeof v === 'number' ? v : 42 })}
          />
        </FormField>
      )}

      <FormField label="数字格式">
        <Select
          disabled={ctx.readOnly}
          value={config.numberFormat || 'number'}
          options={[
            { value: 'number', label: '数字' },
            { value: 'percent', label: '百分比' },
            { value: 'cny', label: '人民币' },
            { value: 'usd', label: '美元' },
          ] as Array<{ value: MetricNumberFormat; label: string }>}
          onChange={(numberFormat: MetricNumberFormat) => patch({ numberFormat })}
        />
      </FormField>

      <FormField label="小数位数">
        <InputNumber
          min={0}
          max={8}
          disabled={ctx.readOnly}
          value={config.decimalPlaces ?? 0}
          onChange={v => patch({ decimalPlaces: typeof v === 'number' ? v : 0 })}
        />
      </FormField>

      <FormField label="大数缩写">
        <Select
          disabled={ctx.readOnly}
          value={config.largeNumberAbbrev || 'none'}
          optionLabelProp="label"
          options={[
            { value: 'none', label: '不缩写' },
            { value: 'k', label: '1,000 → K' },
            { value: 'm', label: '1,000,000 → M' },
            { value: 'b', label: '1,000,000,000 → B' },
            { value: 'qian', label: '1,000 → 千' },
            { value: 'wan', label: '10,000 → 万' },
            { value: 'baiwan', label: '1,000,000 → 百万' },
            { value: 'yi', label: '100,000,000 → 亿' },
          ] as Array<{ value: MetricLargeNumberAbbrev; label: string }>}
          onChange={(largeNumberAbbrev: MetricLargeNumberAbbrev) => patch({ largeNumberAbbrev })}
        />
      </FormField>

      <Checkbox
        checked={config.useThousandSeparator !== false}
        disabled={ctx.readOnly}
        onChange={e => patch({ useThousandSeparator: e.target.checked })}
      >
        使用千位分隔符 (,)
      </Checkbox>
    </div>
  );
}

function PlaceholderTab({ text }: { text: string }) {
  return (
    <div style={{ color: '#8c8c8c', fontSize: 13, padding: '24px 8px', textAlign: 'center' }}>
      {text}
    </div>
  );
}

function rebuildProgressQuery(ctx: WidgetConfigPanelContext, config: DashboardProgressConfig) {
  const sheetId = ctx.widget.dataBinding?.query.sheetId || ctx.table.sheetId;
  const metrics: AggregateMetric[] = [];

  if (config.currentMode !== 'custom') {
    const isField = (config.currentStatMode || 'recordCount') === 'fieldValue' && config.currentFieldId;
    metrics.push(isField
      ? {
          id: 'current',
          fieldId: config.currentFieldId!,
          op: config.currentAgg || 'count',
          label: config.currentLabel || '当前',
        }
      : {
          id: 'current',
          fieldId: '*',
          op: 'count',
          label: config.currentLabel || '当前',
        });
  }

  if (config.targetMode === 'field' && config.targetFieldId) {
    metrics.push({
      id: 'target',
      fieldId: config.targetFieldId,
      op: config.targetAgg || 'sum',
      label: config.targetLabel || '目标',
    });
  }

  // 双自定义时仍需合法 query（空 metrics 会回退 count，不影响展示）
  if (metrics.length === 0) {
    metrics.push({ id: 'current', fieldId: '*', op: 'count', label: '当前' });
  }

  ctx.onChange({
    config: config as unknown as Record<string, unknown>,
    dataBinding: {
      listenGlobalFilters: true,
      query: { sheetId, metrics },
    },
  });
}

const PROGRESS_SHAPE_OPTIONS: Array<{ value: DashboardProgressShape; label: string; icon: React.ReactNode }> = [
  {
    value: 'bar',
    label: '条形',
    icon: (
      <svg width="28" height="18" viewBox="0 0 28 18">
        <rect x="2" y="3" width="24" height="4" rx="2" fill="#d9d9d9" />
        <rect x="2" y="3" width="14" height="4" rx="2" fill="#5B8FF9" />
        <rect x="2" y="11" width="24" height="4" rx="2" fill="#d9d9d9" />
        <rect x="2" y="11" width="8" height="4" rx="2" fill="#5B8FF9" />
      </svg>
    ),
  },
  {
    value: 'semicircle',
    label: '半圆环',
    icon: (
      <svg width="28" height="18" viewBox="0 0 28 18">
        <path d="M4 15 A10 10 0 0 1 24 15" fill="none" stroke="#d9d9d9" strokeWidth="3" strokeLinecap="round" />
        <path d="M4 15 A10 10 0 0 1 18 6" fill="none" stroke="#5B8FF9" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'ring',
    label: '圆环',
    icon: (
      <svg width="28" height="18" viewBox="0 0 28 18">
        <circle cx="14" cy="9" r="6.5" fill="none" stroke="#d9d9d9" strokeWidth="2.5" />
        <circle
          cx="14"
          cy="9"
          r="6.5"
          fill="none"
          stroke="#5B8FF9"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="20 41"
          transform="rotate(-90 14 9)"
        />
      </svg>
    ),
  },
];

function ProgressBasicForm(ctx: WidgetConfigPanelContext) {
  const config = ctx.widget.config as unknown as DashboardProgressConfig;
  const fields = allSelectableFields(ctx.columnDefs);
  const nums = numericFields(ctx.columnDefs);
  const patch = (next: Partial<DashboardProgressConfig>) => {
    rebuildProgressQuery(ctx, { ...config, ...next });
  };

  const shape = config.shape || 'ring';

  return (
    <div className="dashboard-config-form">
      <FormField label="名称">
        <Input
          value={ctx.widget.title || config.title || ''}
          disabled={ctx.readOnly}
          onChange={e => {
            const title = e.target.value;
            ctx.onChange({
              title,
              config: { ...config, title } as unknown as Record<string, unknown>,
            });
          }}
        />
      </FormField>

      <FormField label="图表形状">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {PROGRESS_SHAPE_OPTIONS.map(opt => {
            const active = shape === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={ctx.readOnly}
                onClick={() => patch({ shape: opt.value })}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 6px',
                  borderRadius: 8,
                  border: `1px solid ${active ? '#1677ff' : '#f0f0f0'}`,
                  background: active ? '#e6f4ff' : '#fafafa',
                  color: active ? '#1677ff' : '#595959',
                  cursor: ctx.readOnly ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                }}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField label="类型">
        <Segmented
          block
          disabled={ctx.readOnly}
          value={config.valueType || 'number'}
          options={[
            { value: 'number', label: '数值' },
            { value: 'date', label: '日期' },
          ]}
          onChange={v => patch({ valueType: v as 'number' | 'date' })}
        />
      </FormField>

      <Section title="目标值">
        <Segmented
          block
          disabled={ctx.readOnly}
          style={{ marginBottom: 12 }}
          value={config.targetMode || 'custom'}
          options={[
            { value: 'custom', label: '自定义值' },
            { value: 'field', label: '字段值' },
          ]}
          onChange={v => patch({ targetMode: v as 'custom' | 'field' })}
        />
        {(config.targetMode || 'custom') === 'custom' ? (
          <FormField label="自定义目标值">
            <InputNumber
              style={{ width: '100%' }}
              disabled={ctx.readOnly}
              value={config.targetValue ?? 200}
              onChange={v => patch({ targetValue: Number(v) || 0 })}
            />
          </FormField>
        ) : (
          <FormField label="字段值">
            <Space.Compact style={{ width: '100%' }}>
              <Select
                style={{ flex: 1 }}
                disabled={ctx.readOnly}
                value={config.targetFieldId}
                options={[...nums, ...fields]}
                placeholder="选择字段"
                onChange={(fieldId: string) => patch({ targetFieldId: fieldId, targetMode: 'field' })}
              />
              <Select
                style={{ width: 100 }}
                disabled={ctx.readOnly}
                value={config.targetAgg || 'sum'}
                options={[
                  { value: 'count', label: '计数' },
                  { value: 'sum', label: '求和' },
                  { value: 'avg', label: '平均' },
                  { value: 'max', label: '最大' },
                  { value: 'min', label: '最小' },
                ]}
                onChange={op => patch({ targetAgg: op as AggregateMetric['op'], targetMode: 'field' })}
              />
            </Space.Compact>
          </FormField>
        )}
        <FormField label="自定义描述">
          <Input
            disabled={ctx.readOnly}
            value={config.targetLabel ?? '目标'}
            onChange={e => patch({ targetLabel: e.target.value })}
          />
        </FormField>
      </Section>

      <Section title="当前值">
        <Segmented
          block
          disabled={ctx.readOnly}
          style={{ marginBottom: 12 }}
          value={config.currentMode || 'field'}
          options={[
            { value: 'custom', label: '自定义值' },
            { value: 'field', label: '字段值' },
          ]}
          onChange={v => patch({ currentMode: v as 'custom' | 'field' })}
        />
        {(config.currentMode || 'field') === 'custom' ? (
          <FormField label="自定义当前值">
            <InputNumber
              style={{ width: '100%' }}
              disabled={ctx.readOnly}
              value={config.currentValue ?? 0}
              onChange={v => patch({ currentValue: Number(v) || 0 })}
            />
          </FormField>
        ) : (
          <>
            <SourceTableBlock ctx={ctx} />
            <div style={{ height: 8 }} />
            <DataRangeBlock ctx={ctx} label={config.dataRangeLabel} />
            <FormField label="统计方式">
              <Segmented
                block
                disabled={ctx.readOnly}
                value={config.currentStatMode || 'recordCount'}
                options={[
                  { value: 'recordCount', label: '记录数' },
                  { value: 'fieldValue', label: '字段值' },
                ]}
                onChange={v => patch({
                  currentStatMode: v as 'recordCount' | 'fieldValue',
                  currentFieldId: config.currentFieldId || nums[0]?.value || fields[0]?.value,
                  currentAgg: config.currentAgg || 'sum',
                })}
              />
            </FormField>
            {(config.currentStatMode || 'recordCount') === 'fieldValue' && (
              <FormField label="字段值">
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    style={{ flex: 1 }}
                    disabled={ctx.readOnly}
                    value={config.currentFieldId}
                    options={[...nums, ...fields]}
                    onChange={(fieldId: string) => patch({
                      currentFieldId: fieldId,
                      currentStatMode: 'fieldValue',
                    })}
                  />
                  <Select
                    style={{ width: 100 }}
                    disabled={ctx.readOnly}
                    value={config.currentAgg || 'count'}
                    options={[
                      { value: 'count', label: '计数' },
                      { value: 'sum', label: '求和' },
                      { value: 'avg', label: '平均' },
                      { value: 'max', label: '最大' },
                      { value: 'min', label: '最小' },
                    ]}
                    onChange={op => patch({
                      currentAgg: op as AggregateMetric['op'],
                      currentStatMode: 'fieldValue',
                    })}
                  />
                </Space.Compact>
              </FormField>
            )}
          </>
        )}
        <FormField label="自定义描述">
          <Input
            disabled={ctx.readOnly}
            value={config.currentLabel ?? '当前'}
            onChange={e => patch({ currentLabel: e.target.value })}
          />
        </FormField>
      </Section>

      <FormField label="进度值小数位数">
        <InputNumber
          style={{ width: '100%' }}
          min={0}
          max={6}
          disabled={ctx.readOnly}
          value={config.progressDecimalPlaces ?? 0}
          onChange={v => patch({ progressDecimalPlaces: Number(v) || 0 })}
        />
      </FormField>
      <FormField label="小数位数">
        <InputNumber
          style={{ width: '100%' }}
          min={0}
          max={6}
          disabled={ctx.readOnly}
          value={config.decimalPlaces ?? 0}
          onChange={v => patch({ decimalPlaces: Number(v) || 0 })}
        />
      </FormField>
      <FormField label="大数缩写">
        <Select
          disabled={ctx.readOnly}
          value={config.largeNumberAbbrev || 'none'}
          options={[
            { value: 'none', label: '不缩写' },
            { value: 'k', label: 'K' },
            { value: 'm', label: 'M' },
            { value: 'wan', label: '万' },
            { value: 'yi', label: '亿' },
          ]}
          onChange={(largeNumberAbbrev: MetricLargeNumberAbbrev) => patch({ largeNumberAbbrev })}
        />
      </FormField>
      <Checkbox
        checked={config.useThousandSeparator !== false}
        disabled={ctx.readOnly}
        onChange={e => patch({ useThousandSeparator: e.target.checked })}
        style={{ marginBottom: 12 }}
      >
        使用千位分隔符 (,)
      </Checkbox>
      <FormField label="数值单位">
        <Space.Compact style={{ width: '100%' }}>
          <Segmented
            disabled={ctx.readOnly}
            value={config.unit || 'none'}
            options={[
              { value: 'none', label: '无' },
              { value: 'cny', label: '¥' },
              { value: 'usd', label: '$' },
            ]}
            onChange={v => patch({ unit: v as DashboardProgressUnit })}
          />
          <Input
            disabled={ctx.readOnly || (config.unit || 'none') !== 'custom'}
            placeholder="请输入"
            value={config.customUnit || ''}
            onChange={e => patch({ unit: 'custom', customUnit: e.target.value })}
            onFocus={() => {
              if ((config.unit || 'none') !== 'custom') patch({ unit: 'custom' });
            }}
            style={{ flex: 1 }}
          />
        </Space.Compact>
      </FormField>
      <FormField label="单位位置">
        <Segmented
          block
          disabled={ctx.readOnly}
          value={config.unitPosition || 'left'}
          options={[
            { value: 'left', label: '左' },
            { value: 'right', label: '右' },
          ]}
          onChange={v => patch({ unitPosition: v as 'left' | 'right' })}
        />
      </FormField>
    </div>
  );
}

function ProgressCustomForm(ctx: WidgetConfigPanelContext) {
  const config = ctx.widget.config as unknown as DashboardProgressConfig;
  const patch = (next: Partial<DashboardProgressConfig>) => {
    ctx.onChange({
      config: { ...config, ...next } as unknown as Record<string, unknown>,
    });
  };

  return (
    <div className="dashboard-config-form">
      <ConfigCollapseSection title="背景与标题" defaultOpen>
        <FormField label="标题颜色">
          <MetricColorField
            value={config.titleColor}
            fallback="#262626"
            defaultLabel="默认"
            disabled={ctx.readOnly}
            onChange={titleColor => patch({ titleColor })}
          />
        </FormField>
        <FormField label="背景颜色">
          <MetricColorField
            value={config.background}
            fallback="#FFFFFF"
            defaultLabel="默认"
            disabled={ctx.readOnly}
            onChange={background => patch({ background })}
          />
        </FormField>
        <FormFieldRow>
          <FormField label="边框色" style={{ marginBottom: 0 }}>
            <MetricColorField
              value={config.borderColor && config.borderColor !== 'default' ? config.borderColor : undefined}
              fallback="#f0f0f0"
              defaultLabel="默认"
              disabled={ctx.readOnly}
              onChange={borderColor => patch({ borderColor: borderColor || 'default' })}
            />
          </FormField>
          <FormField label="边框粗细" style={{ marginBottom: 0 }}>
            <Select
              disabled={ctx.readOnly}
              value={config.borderWidth ?? 1}
              options={[0, 1, 2, 3, 4].map(n => ({ value: n, label: String(n) }))}
              onChange={(borderWidth: number) => patch({ borderWidth })}
            />
          </FormField>
        </FormFieldRow>
      </ConfigCollapseSection>

      <ConfigCollapseSection title="文字颜色" defaultOpen>
        <FormField label="百分比数字">
          <MetricColorField
            value={config.percentColor}
            fallback="#262626"
            defaultLabel="默认"
            disabled={ctx.readOnly}
            onChange={percentColor => patch({ percentColor })}
          />
        </FormField>
        <FormField label="当前值">
          <MetricColorField
            value={config.currentValueColor}
            fallback="#5B8FF9"
            defaultLabel="默认"
            disabled={ctx.readOnly}
            onChange={currentValueColor => patch({ currentValueColor })}
          />
        </FormField>
        <FormField label="目标值">
          <MetricColorField
            value={config.targetValueColor}
            fallback="#8c8c8c"
            defaultLabel="默认"
            disabled={ctx.readOnly}
            onChange={targetValueColor => patch({ targetValueColor })}
          />
        </FormField>
      </ConfigCollapseSection>

      <FormField label="进度条颜色">
        <MetricColorField
          value={config.progressColor}
          fallback="#5B8FF9"
          defaultLabel="默认"
          disabled={ctx.readOnly}
          onChange={progressColor => patch({ progressColor })}
        />
      </FormField>

      <div style={{ marginBottom: 12 }}>
        <Checkbox
          checked={!!config.rangeColorEnabled}
          disabled={ctx.readOnly}
          onChange={e => patch({ rangeColorEnabled: e.target.checked })}
        >
          区间配色
        </Checkbox>
        <Tooltip title="按完成度自动切换进度条颜色：偏低偏暖、接近目标偏蓝、达标偏绿">
          <QuestionCircleOutlined style={{ marginLeft: 4, color: '#bfbfbf' }} />
        </Tooltip>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Checkbox
          checked={!!config.achieveEffectEnabled}
          disabled={ctx.readOnly}
          onChange={e => patch({ achieveEffectEnabled: e.target.checked })}
        >
          进度达成效果
        </Checkbox>
      </div>
    </div>
  );
}

/** 注册内置面板；在应用入口调用一次即可 */
export function registerBuiltinWidgetConfigPanels(): void {
  registerWidgetConfigPanel({
    id: 'metric.card',
    match: t => t === 'metric.card' || t === 'metric.number',
    getTitle: () => '指标卡',
    tabs: [
      { key: 'basic', label: '基础配置' },
      { key: 'custom', label: '自定义配置' },
    ],
    renderTab: (tab, ctx) => {
      if (tab === 'basic') return <MetricBasicForm {...ctx} />;
      return <MetricCustomForm {...ctx} />;
    },
  });

  registerWidgetConfigPanel({
    id: 'chart.*',
    match: t => t.startsWith('chart.'),
    getTitle: (widget) => {
      const kind = (widget.config as unknown as DashboardChartDisplayConfig).chartKind
        || widget.componentType.replace('chart.', '');
      return CHART_KIND_OPTIONS.find(o => o.value === kind)?.label || '图表';
    },
    tabs: [
      { key: 'basic', label: '基础配置' },
      { key: 'custom', label: '自定义配置' },
      { key: 'analysis', label: '分析' },
    ],
    renderTab: (tab, ctx) => {
      if (tab === 'basic') return <ChartBasicForm {...ctx} />;
      if (tab === 'custom') return <ChartCustomForm {...ctx} />;
      return <PlaceholderTab text="同环比、TopN 等分析能力将陆续开放" />;
    },
  });

  registerWidgetConfigPanel({
    id: 'progress',
    match: t => t === 'progress',
    getTitle: () => '进度图',
    tabs: [
      { key: 'basic', label: '基础配置' },
      { key: 'custom', label: '自定义配置' },
    ],
    renderTab: (tab, ctx) => {
      if (tab === 'basic') return <ProgressBasicForm {...ctx} />;
      return <ProgressCustomForm {...ctx} />;
    },
  });

  registerWidgetConfigPanel({
    id: 'view.grid',
    match: t => t === 'view.grid',
    getTitle: () => '表格',
    tabs: [
      { key: 'basic', label: '基础配置' },
      { key: 'custom', label: '自定义配置' },
    ],
    renderTab: (tab, ctx) => {
      const config = ctx.widget.config as unknown as DashboardGridViewConfig;
      const patch = (next: Partial<DashboardGridViewConfig>) => {
        ctx.onChange({
          config: { ...config, ...next } as unknown as Record<string, unknown>,
        });
      };
      const viewOptions = isBaseSheet(ctx.table.sheet)
        ? (ctx.table.sheet.views || [])
            .filter(v => v.viewType === 'grid' || v.viewType === 'form')
            .filter(v => v.viewType === 'grid')
            .map(v => ({ value: v.viewId, label: v.viewName || '表格' }))
        : [];

      if (tab === 'basic') {
        return (
          <div className="dashboard-config-form">
            <FormField label="名称">
              <Input
                value={ctx.widget.title || config.title || ''}
                disabled={ctx.readOnly}
                onChange={e => {
                  const title = e.target.value;
                  ctx.onChange({
                    title,
                    config: { ...config, title } as unknown as Record<string, unknown>,
                  });
                }}
              />
            </FormField>
            <SourceTableBlock ctx={ctx} />
            <div style={{ height: 12 }} />
            <FormField label="绑定视图">
              <Select
                style={{ width: '100%' }}
                value={config.viewId}
                options={viewOptions}
                disabled={ctx.readOnly || viewOptions.length === 0}
                placeholder="选择多维表视图"
                onChange={(viewId: string) => {
                  ctx.onChange({
                    config: { ...config, viewId } as unknown as Record<string, unknown>,
                    dataBinding: {
                      listenGlobalFilters: true,
                      query: {
                        sheetId: ctx.table.sheetId,
                        viewId,
                        metrics: [],
                      },
                    },
                  });
                }}
              />
            </FormField>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 13, color: '#595959' }}>显示工具栏</span>
              <Switch
                checked={config.showToolbar !== false}
                disabled={ctx.readOnly}
                onChange={showToolbar => patch({ showToolbar })}
              />
            </div>
          </div>
        );
      }

      return (
        <div className="dashboard-config-form">
          <FormField label="标题颜色">
            <MetricColorField
              value={config.titleColor}
              fallback="#262626"
              defaultLabel="默认"
              disabled={ctx.readOnly}
              onChange={titleColor => patch({ titleColor })}
            />
          </FormField>
          <FormField label="背景">
            <MetricColorField
              value={config.background}
              fallback="#FFFFFF"
              defaultLabel="默认"
              disabled={ctx.readOnly}
              onChange={background => patch({ background: background || '#FFFFFF' })}
            />
          </FormField>
          <FormFieldRow>
            <FormField label="边框色" style={{ marginBottom: 0 }}>
              <MetricColorField
                value={config.borderColor && config.borderColor !== 'default' ? config.borderColor : undefined}
                fallback="#f0f0f0"
                defaultLabel="默认"
                disabled={ctx.readOnly}
                onChange={borderColor => patch({ borderColor: borderColor || 'default' })}
              />
            </FormField>
            <FormField label="边框粗细" style={{ marginBottom: 0 }}>
              <Select
                disabled={ctx.readOnly}
                value={config.borderWidth ?? 1}
                options={[0, 1, 2, 3, 4].map(n => ({ value: n, label: String(n) }))}
                onChange={(borderWidth: number) => patch({ borderWidth })}
              />
            </FormField>
          </FormFieldRow>
        </div>
      );
    },
  });

  registerWidgetConfigPanel({
    id: 'rank.list',
    match: t => t === 'rank.list',
    getTitle: () => '排行榜',
    tabs: [
      { key: 'basic', label: '基础配置' },
      { key: 'custom', label: '自定义配置' },
    ],
    renderTab: (tab, ctx) => {
      if (tab === 'basic') {
        const config = ctx.widget.config as { title?: string; labelFieldId?: string };
        const fields = groupableFields(ctx.columnDefs);
        return (
          <div>
            <FieldLabel>名称</FieldLabel>
            <Input
              style={{ marginBottom: 12 }}
              value={ctx.widget.title || config.title || ''}
              disabled={ctx.readOnly}
              onChange={e => {
                const title = e.target.value;
                ctx.onChange({
                  title,
                  config: { ...config, title } as unknown as Record<string, unknown>,
                });
              }}
            />
            <SourceTableBlock ctx={ctx} />
            <div style={{ height: 12 }} />
            <FieldLabel>排行字段</FieldLabel>
            <Select
              style={{ width: '100%' }}
              value={config.labelFieldId}
              options={fields}
              disabled={ctx.readOnly}
              onChange={(fieldId: string) => {
                ctx.onChange({
                  config: { ...config, labelFieldId: fieldId, metricId: 'count' } as unknown as Record<string, unknown>,
                  dataBinding: {
                    listenGlobalFilters: true,
                    query: {
                      sheetId: ctx.table.sheetId,
                      groupBy: [{ fieldId, order: 'asc' }],
                      metrics: [{ id: 'count', fieldId: '*', op: 'count', label: '计数' }],
                      topN: { metricId: 'count', n: 10, order: 'desc' },
                    },
                  },
                });
              }}
            />
          </div>
        );
      }
      return <PlaceholderTab text="自定义配置将陆续开放" />;
    },
  });
}

// 模块加载时自动注册
registerBuiltinWidgetConfigPanels();
