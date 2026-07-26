import React from 'react';
import { Checkbox, Input, Select, Segmented, Switch, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import type { DashboardChartDisplayConfig, ChartSeriesStyle, ChartAxisStyle, ChartGridStyle, ChartLegendStyle, ChartTooltipStyle, ChartTextFormat } from '@lingyi-doc/core-types';
import type { WidgetConfigPanelContext } from '../config/panelRegistry';
import { MetricColorField } from './MetricColorField';
import { TextFormatToolbar } from './TextFormatToolbar';
import { ConfigCollapseSection, NestedWell, SwitchRow, FormField, FormFieldRow } from './ConfigCollapse';

const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18, 20, 24].map(n => ({
  value: n,
  label: String(n),
}));

const BORDER_WIDTH_OPTIONS = [0, 1, 2, 3, 4].map(n => ({ value: n, label: String(n) }));
const LINE_WIDTH_OPTIONS = [1, 2, 3, 4, 5].map(n => ({ value: n, label: `${n}px` }));
const GRID_WIDTH_OPTIONS = [0.5, 1, 1.5, 2].map(n => ({ value: n, label: `${n}px` }));
const POINT_SIZE_OPTIONS = [2, 3, 4, 5, 6, 8].map(n => ({ value: n, label: String(n) }));
const LABEL_ANGLE_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: '0', label: '0°' },
  { value: '45', label: '45°' },
  { value: '90', label: '90°' },
  { value: '-45', label: '-45°' },
];

function isCartesian(kind: string) {
  return ['column', 'bar', 'line', 'area', 'combo', 'scatter', 'bubble', 'bidirectionalBar'].includes(kind);
}

function isLineLike(kind: string) {
  return kind === 'line' || kind === 'area' || kind === 'combo';
}

export const ChartCustomForm: React.FC<WidgetConfigPanelContext> = (ctx) => {
  const config = ctx.widget.config as unknown as DashboardChartDisplayConfig;
  const kind = config.chartKind || ctx.widget.componentType.replace('chart.', '');
  const series = config.seriesStyle || {};
  const legend = config.legendStyle || {};
  const tip = config.tooltipStyle || {};
  const xAxis = config.xAxis || {};
  const yAxis = config.yAxis || {};
  const grid = config.grid || {};

  const patch = (next: Partial<DashboardChartDisplayConfig>) => {
    ctx.onChange({
      config: { ...config, ...next } as unknown as Record<string, unknown>,
    });
  };
  const patchSeries = (next: Partial<ChartSeriesStyle>) => patch({ seriesStyle: { ...series, ...next } });
  const patchLegend = (next: Partial<ChartLegendStyle>) => patch({ legendStyle: { ...legend, ...next } });
  const patchTip = (next: Partial<ChartTooltipStyle>) => patch({ tooltipStyle: { ...tip, ...next } });
  const patchX = (next: Partial<ChartAxisStyle>) => patch({ xAxis: { ...xAxis, ...next } });
  const patchY = (next: Partial<ChartAxisStyle>) => patch({ yAxis: { ...yAxis, ...next } });
  const patchGrid = (next: Partial<ChartGridStyle>) => patch({ grid: { ...grid, ...next } });

  const seriesName = ctx.columnDefs.find(c => c.id === config.categoryFieldId)?.name || '系列';

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
              options={BORDER_WIDTH_OPTIONS}
              onChange={(borderWidth: number) => patch({ borderWidth })}
            />
          </FormField>
        </FormFieldRow>
      </ConfigCollapseSection>

      <ConfigCollapseSection title="组件字体样式">
        <FormField label="文字颜色">
          <MetricColorField
            value={config.componentTextColor}
            fallback="#595959"
            defaultLabel="默认"
            disabled={ctx.readOnly}
            onChange={componentTextColor => patch({ componentTextColor })}
          />
        </FormField>
        <FormField label="字号">
          <Select
            disabled={ctx.readOnly}
            value={config.componentFontSize ?? 11}
            options={FONT_SIZE_OPTIONS}
            onChange={(componentFontSize: number) => patch({ componentFontSize })}
          />
        </FormField>
      </ConfigCollapseSection>

      <ConfigCollapseSection title="数据系列与标签">
        <FormField label="选择系列">
          <Select
            disabled={ctx.readOnly}
            value={series.selectedSeriesId || 'default'}
            options={[{ value: 'default', label: seriesName }]}
            onChange={(selectedSeriesId: string) => patchSeries({ selectedSeriesId })}
          />
        </FormField>
        <Checkbox
          style={{ marginBottom: 12 }}
          checked={!!series.customDisplayName}
          disabled={ctx.readOnly}
          onChange={e => patchSeries({ customDisplayName: e.target.checked })}
        >
          自定义展示名称
        </Checkbox>
        {series.customDisplayName && (
          <FormField label="展示名称">
            <Input
              placeholder="请输入展示名称"
              disabled={ctx.readOnly}
              value={series.displayName || ''}
              onChange={e => patchSeries({ displayName: e.target.value })}
            />
          </FormField>
        )}

        {isLineLike(kind) && (
          <>
            <FormField label="线条样式">
              <Segmented
                block
                disabled={ctx.readOnly}
                value={series.lineStyle || 'straight'}
                options={[
                  { value: 'straight', label: '折线' },
                  { value: 'smooth', label: '平滑' },
                  { value: 'step', label: '阶梯' },
                ]}
                onChange={v => patchSeries({ lineStyle: v as ChartSeriesStyle['lineStyle'] })}
              />
            </FormField>
            <FormField label="折线颜色">
              <MetricColorField
                value={series.lineColor}
                fallback="#5B8FF9"
                defaultLabel="默认"
                disabled={ctx.readOnly}
                onChange={lineColor => patchSeries({ lineColor })}
              />
            </FormField>
            <FormFieldRow>
              <FormField label="线型" style={{ marginBottom: 0 }}>
                <Select
                  disabled={ctx.readOnly}
                  value={series.lineDash || 'solid'}
                  options={[
                    { value: 'solid', label: '————' },
                    { value: 'dashed', label: '-----' },
                    { value: 'dotted', label: '·····' },
                  ]}
                  onChange={(lineDash: ChartSeriesStyle['lineDash']) => patchSeries({ lineDash })}
                />
              </FormField>
              <FormField label="线条粗细" style={{ marginBottom: 0 }}>
                <Select
                  disabled={ctx.readOnly}
                  value={series.lineWidth ?? 2}
                  options={LINE_WIDTH_OPTIONS}
                  onChange={(lineWidth: number) => patchSeries({ lineWidth })}
                />
              </FormField>
            </FormFieldRow>

            <FormField label="数据点">
              <Segmented
                block
                disabled={ctx.readOnly}
                value={series.pointVisibility || 'always'}
                options={[
                  { value: 'always', label: '始终显示' },
                  { value: 'hover', label: '悬浮显示' },
                  { value: 'hidden', label: '隐藏' },
                ]}
                onChange={v => patchSeries({ pointVisibility: v as ChartSeriesStyle['pointVisibility'] })}
              />
            </FormField>
            {(series.pointVisibility || 'always') !== 'hidden' && (
              <>
                <FormFieldRow>
                  <FormField label="数据点形状" style={{ marginBottom: 0 }}>
                    <Select
                      disabled={ctx.readOnly}
                      value={series.pointShape || 'circle'}
                      options={[
                        { value: 'circle', label: '● 圆形' },
                        { value: 'square', label: '■ 方形' },
                        { value: 'diamond', label: '◆ 菱形' },
                        { value: 'triangle', label: '▲ 三角' },
                      ]}
                      onChange={(pointShape: ChartSeriesStyle['pointShape']) => patchSeries({ pointShape })}
                    />
                  </FormField>
                  <FormField label="数据点大小" style={{ marginBottom: 0 }}>
                    <Select
                      disabled={ctx.readOnly}
                      value={series.pointSize ?? 3}
                      options={POINT_SIZE_OPTIONS}
                      onChange={(pointSize: number) => patchSeries({ pointSize })}
                    />
                  </FormField>
                </FormFieldRow>
                <FormField label="数据点颜色">
                  <MetricColorField
                    value={series.pointColor}
                    fallback="#5B8FF9"
                    defaultLabel="默认"
                    disabled={ctx.readOnly}
                    onChange={pointColor => patchSeries({ pointColor })}
                  />
                </FormField>
                <FormField label="绘制轴">
                  <Select
                    disabled={ctx.readOnly}
                    value={series.pointAxis || 'left'}
                    options={[
                      { value: 'left', label: '左轴' },
                      { value: 'right', label: '右轴' },
                    ]}
                    onChange={(pointAxis: ChartSeriesStyle['pointAxis']) => patchSeries({ pointAxis })}
                  />
                </FormField>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: '#8c8c8c' }}>自定义数据点颜色</span>
                  <Switch
                    checked={!!series.customPointColor}
                    disabled={ctx.readOnly}
                    onChange={customPointColor => patchSeries({ customPointColor })}
                  />
                </div>
              </>
            )}
          </>
        )}

        <FormField label="数据标签">
          <Segmented
            block
            disabled={ctx.readOnly}
            value={series.labelVisibility || (config.showLabel === false ? 'hidden' : 'always')}
            options={[
              { value: 'always', label: '始终显示' },
              { value: 'hidden', label: '隐藏' },
            ]}
            onChange={v => {
              const labelVisibility = v as ChartSeriesStyle['labelVisibility'];
              patch({
                showLabel: labelVisibility !== 'hidden',
                seriesStyle: { ...series, labelVisibility },
              });
            }}
          />
        </FormField>
        {(series.labelVisibility || (config.showLabel === false ? 'hidden' : 'always')) === 'always' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Checkbox
                checked={series.hideOverlappingLabels !== false}
                disabled={ctx.readOnly}
                onChange={e => patchSeries({ hideOverlappingLabels: e.target.checked })}
              >
                隐藏重叠的数值
              </Checkbox>
              <Tooltip title="自动隐藏相互重叠的数据标签">
                <QuestionCircleOutlined style={{ marginLeft: 4, color: '#bfbfbf' }} />
              </Tooltip>
            </div>
            <FormField label="标签位置">
              <Select
                disabled={ctx.readOnly}
                value={series.labelPosition || 'default'}
                options={[
                  { value: 'default', label: '默认' },
                  { value: 'top', label: '上方' },
                  { value: 'bottom', label: '下方' },
                  { value: 'left', label: '左侧' },
                  { value: 'right', label: '右侧' },
                ]}
                onChange={(labelPosition: ChartSeriesStyle['labelPosition']) => patchSeries({ labelPosition })}
              />
            </FormField>
            <FormField label="标签内容">
              <div style={{
                display: 'flex',
                gap: 16,
                padding: '8px 10px',
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                background: '#fafafa',
              }}>
                {([
                  ['series', '系列'],
                  ['category', '类别'],
                  ['value', '数值'],
                ] as const).map(([key, label]) => (
                  <Checkbox
                    key={key}
                    disabled={ctx.readOnly}
                    checked={
                      key === 'value'
                        ? series.labelContent?.value !== false
                        : !!series.labelContent?.[key]
                    }
                    onChange={e => {
                      patchSeries({
                        labelContent: {
                          series: !!series.labelContent?.series,
                          category: !!series.labelContent?.category,
                          value: series.labelContent?.value !== false,
                          [key]: e.target.checked,
                        },
                      });
                    }}
                  >
                    {label}
                  </Checkbox>
                ))}
              </div>
            </FormField>
            <FormField label="文本格式">
              <TextFormatToolbar
                value={series.labelFormat}
                disabled={ctx.readOnly}
                onChange={(labelFormat: ChartTextFormat) => patchSeries({ labelFormat })}
              />
            </FormField>
          </>
        )}
      </ConfigCollapseSection>

      <ConfigCollapseSection title="图例">
        <SwitchRow
          label="显示图例"
          switchNode={(
            <Switch
              checked={config.showLegend !== false}
              disabled={ctx.readOnly}
              onChange={showLegend => patch({ showLegend })}
            />
          )}
        />
        {config.showLegend !== false && (
          <>
            <FormField label="图例位置">
              <Select
                disabled={ctx.readOnly}
                value={legend.position || 'top'}
                options={[
                  { value: 'top', label: '顶部' },
                  { value: 'bottom', label: '底部' },
                  { value: 'left', label: '左侧' },
                  { value: 'right', label: '右侧' },
                ]}
                onChange={(position: ChartLegendStyle['position']) => {
                  patch({ showLegend: true, legendStyle: { ...legend, position } });
                }}
              />
            </FormField>
            <FormField label="文本格式">
              <TextFormatToolbar
                value={legend.textFormat}
                disabled={ctx.readOnly}
                onChange={textFormat => patchLegend({ textFormat })}
              />
            </FormField>
          </>
        )}
      </ConfigCollapseSection>

      <ConfigCollapseSection title="悬浮提示">
        <SwitchRow
          label="悬浮提示"
          switchNode={(
            <Switch
              checked={tip.enabled !== false}
              disabled={ctx.readOnly}
              onChange={enabled => patchTip({ enabled })}
            />
          )}
        />
        {tip.enabled !== false && (
          <>
            <FormField label="触发类型">
              <Segmented
                block
                disabled={ctx.readOnly}
                value={tip.trigger || 'axis'}
                options={[
                  { value: 'axis', label: '坐标轴' },
                  { value: 'item', label: '数据项' },
                ]}
                onChange={v => patchTip({ trigger: v as ChartTooltipStyle['trigger'] })}
              />
            </FormField>
            <FormField label="宽度">
              <Segmented
                block
                disabled={ctx.readOnly}
                value={tip.width || 'auto'}
                options={[
                  { value: 'auto', label: '自适应' },
                  { value: 'small', label: '小' },
                  { value: 'medium', label: '中' },
                  { value: 'large', label: '大' },
                ]}
                onChange={v => patchTip({ width: v as ChartTooltipStyle['width'] })}
              />
            </FormField>
            <FormField label="背景色">
              <MetricColorField
                value={tip.backgroundColor}
                fallback="#ffffff"
                defaultLabel="默认"
                disabled={ctx.readOnly}
                onChange={backgroundColor => patchTip({ backgroundColor })}
              />
            </FormField>
            <FormFieldRow>
              <FormField label="边框色" style={{ marginBottom: 0 }}>
                <MetricColorField
                  value={tip.borderColor}
                  fallback="#d9d9d9"
                  defaultLabel="默认"
                  disabled={ctx.readOnly}
                  onChange={borderColor => patchTip({ borderColor })}
                />
              </FormField>
              <FormField label="边框粗细" style={{ marginBottom: 0 }}>
                <Select
                  disabled={ctx.readOnly}
                  value={tip.borderWidth ?? 0}
                  options={BORDER_WIDTH_OPTIONS}
                  onChange={(borderWidth: number) => patchTip({ borderWidth })}
                />
              </FormField>
            </FormFieldRow>
            <FormField label="展示内容">
              <div style={{
                display: 'flex',
                gap: 16,
                padding: '8px 10px',
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                background: '#fafafa',
              }}>
                <Checkbox
                  checked={tip.showTitle !== false}
                  disabled={ctx.readOnly}
                  onChange={e => patchTip({ showTitle: e.target.checked })}
                >
                  标题
                </Checkbox>
                <Checkbox
                  checked={!!tip.showTotal}
                  disabled={ctx.readOnly}
                  onChange={e => patchTip({ showTotal: e.target.checked })}
                >
                  总计
                </Checkbox>
                <Checkbox
                  checked={tip.showSeries !== false}
                  disabled={ctx.readOnly}
                  onChange={e => patchTip({ showSeries: e.target.checked })}
                >
                  系列
                </Checkbox>
              </div>
            </FormField>
          </>
        )}
      </ConfigCollapseSection>

      {isCartesian(kind) && (
        <>
          <ConfigCollapseSection title="横轴 (X轴)">
            <SwitchRow
              label="横轴"
              switchNode={(
                <Switch
                  checked={xAxis.enabled !== false}
                  disabled={ctx.readOnly}
                  onChange={enabled => patchX({ enabled })}
                />
              )}
            >
              {xAxis.enabled !== false && (
                <NestedWell>
                  <FormField label="轴标题">
                    <Input
                      placeholder="请输入"
                      disabled={ctx.readOnly}
                      value={xAxis.title || ''}
                      onChange={e => patchX({ title: e.target.value })}
                    />
                  </FormField>
                  <FormField label="文本格式">
                    <TextFormatToolbar
                      value={xAxis.titleFormat}
                      disabled={ctx.readOnly}
                      onChange={titleFormat => patchX({ titleFormat })}
                    />
                  </FormField>
                  <SwitchRow
                    label="显示标签"
                    switchNode={(
                      <Switch
                        checked={xAxis.showLabel !== false}
                        disabled={ctx.readOnly}
                        onChange={showLabel => patchX({ showLabel })}
                      />
                    )}
                  >
                    {xAxis.showLabel !== false && (
                      <NestedWell>
                        <FormField label="最大高度限制">
                          <Select
                            disabled={ctx.readOnly}
                            value={xAxis.labelMaxHeight || '20%'}
                            options={[
                              { value: '10%', label: '10%' },
                              { value: '20%', label: '20%' },
                              { value: '30%', label: '30%' },
                              { value: '40%', label: '40%' },
                              { value: '50%', label: '50%' },
                            ]}
                            onChange={(labelMaxHeight: string) => patchX({ labelMaxHeight })}
                          />
                        </FormField>
                        <FormField label="文字角度">
                          <Select
                            disabled={ctx.readOnly}
                            value={xAxis.labelAngle || 'default'}
                            options={LABEL_ANGLE_OPTIONS}
                            onChange={(labelAngle: string) => patchX({ labelAngle })}
                          />
                        </FormField>
                        <FormField label="文本格式">
                          <TextFormatToolbar
                            value={xAxis.labelFormat}
                            disabled={ctx.readOnly}
                            onChange={labelFormat => patchX({ labelFormat })}
                          />
                        </FormField>
                      </NestedWell>
                    )}
                  </SwitchRow>
                  <SwitchRow
                    label="显示轴线"
                    switchNode={(
                      <Switch
                        checked={!!xAxis.showLine}
                        disabled={ctx.readOnly}
                        onChange={showLine => patchX({ showLine })}
                      />
                    )}
                  />
                </NestedWell>
              )}
            </SwitchRow>
          </ConfigCollapseSection>

          <ConfigCollapseSection title="纵轴">
            <SwitchRow
              label="纵轴"
              switchNode={(
                <Switch
                  checked={yAxis.enabled !== false}
                  disabled={ctx.readOnly}
                  onChange={enabled => patchY({ enabled })}
                />
              )}
            >
              {yAxis.enabled !== false && (
                <NestedWell>
                  <FormField label="轴标题">
                    <Input
                      placeholder="请输入"
                      disabled={ctx.readOnly}
                      value={yAxis.title || ''}
                      onChange={e => patchY({ title: e.target.value })}
                    />
                  </FormField>
                  <FormField label="文本格式">
                    <TextFormatToolbar
                      value={yAxis.titleFormat}
                      disabled={ctx.readOnly}
                      onChange={titleFormat => patchY({ titleFormat })}
                    />
                  </FormField>
                  <SwitchRow
                    label="显示标签"
                    switchNode={(
                      <Switch
                        checked={yAxis.showLabel !== false}
                        disabled={ctx.readOnly}
                        onChange={showLabel => patchY({ showLabel })}
                      />
                    )}
                  >
                    {yAxis.showLabel !== false && (
                      <NestedWell>
                        <FormField label="文字角度">
                          <Select
                            disabled={ctx.readOnly}
                            value={yAxis.labelAngle || 'default'}
                            options={LABEL_ANGLE_OPTIONS}
                            onChange={(labelAngle: string) => patchY({ labelAngle })}
                          />
                        </FormField>
                        <FormField label="文本格式">
                          <TextFormatToolbar
                            value={yAxis.labelFormat}
                            disabled={ctx.readOnly}
                            onChange={labelFormat => patchY({ labelFormat })}
                          />
                        </FormField>
                      </NestedWell>
                    )}
                  </SwitchRow>
                  <SwitchRow
                    label="显示轴线"
                    switchNode={(
                      <Switch
                        checked={!!yAxis.showLine}
                        disabled={ctx.readOnly}
                        onChange={showLine => patchY({ showLine })}
                      />
                    )}
                  />
                  <FormField label="轴范围">
                    <Segmented
                      block
                      disabled={ctx.readOnly}
                      value={yAxis.rangeMode || 'fixed'}
                      options={[
                        { value: 'fixed', label: '固定数值' },
                        { value: 'dynamic', label: '动态比例' },
                      ]}
                      onChange={v => patchY({ rangeMode: v as ChartAxisStyle['rangeMode'] })}
                    />
                  </FormField>
                  {(yAxis.rangeMode || 'fixed') === 'fixed' && (
                    <FormFieldRow>
                      <FormField label="最小值" style={{ marginBottom: 0 }}>
                        <Input
                          placeholder="默认"
                          disabled={ctx.readOnly}
                          value={yAxis.min == null ? '' : String(yAxis.min)}
                          onChange={e => {
                            const t = e.target.value.trim();
                            patchY({ min: t === '' ? null : Number(t) });
                          }}
                        />
                      </FormField>
                      <FormField label="最大值" style={{ marginBottom: 0 }}>
                        <Input
                          placeholder="默认"
                          disabled={ctx.readOnly}
                          value={yAxis.max == null ? '' : String(yAxis.max)}
                          onChange={e => {
                            const t = e.target.value.trim();
                            patchY({ max: t === '' ? null : Number(t) });
                          }}
                        />
                      </FormField>
                    </FormFieldRow>
                  )}
                </NestedWell>
              )}
            </SwitchRow>
          </ConfigCollapseSection>

          <ConfigCollapseSection title="网格线">
            <SwitchRow
              label="横向网格"
              switchNode={(
                <Switch
                  checked={grid.horizontal !== false}
                  disabled={ctx.readOnly}
                  onChange={horizontal => patchGrid({ horizontal })}
                />
              )}
            >
              {grid.horizontal !== false && (
                <NestedWell>
                  <FormField label="网格颜色">
                    <MetricColorField
                      value={grid.horizontalColor}
                      fallback="#f0f0f0"
                      defaultLabel="默认"
                      disabled={ctx.readOnly}
                      onChange={horizontalColor => patchGrid({ horizontalColor })}
                    />
                  </FormField>
                  <FormField label="网格粗细">
                    <Select
                      disabled={ctx.readOnly}
                      value={grid.horizontalWidth ?? 0.5}
                      options={GRID_WIDTH_OPTIONS}
                      onChange={(horizontalWidth: number) => patchGrid({ horizontalWidth })}
                    />
                  </FormField>
                </NestedWell>
              )}
            </SwitchRow>
            <SwitchRow
              label="横向刻度"
              switchNode={(
                <Switch
                  checked={!!grid.horizontalTick}
                  disabled={ctx.readOnly}
                  onChange={horizontalTick => patchGrid({ horizontalTick })}
                />
              )}
            />
            <SwitchRow
              label="纵向网格"
              switchNode={(
                <Switch
                  checked={!!grid.vertical}
                  disabled={ctx.readOnly}
                  onChange={vertical => patchGrid({ vertical })}
                />
              )}
            >
              {!!grid.vertical && (
                <NestedWell>
                  <FormField label="网格颜色">
                    <MetricColorField
                      value={grid.verticalColor}
                      fallback="#f0f0f0"
                      defaultLabel="默认"
                      disabled={ctx.readOnly}
                      onChange={verticalColor => patchGrid({ verticalColor })}
                    />
                  </FormField>
                  <FormField label="网格粗细">
                    <Select
                      disabled={ctx.readOnly}
                      value={grid.verticalWidth ?? 0.5}
                      options={GRID_WIDTH_OPTIONS}
                      onChange={(verticalWidth: number) => patchGrid({ verticalWidth })}
                    />
                  </FormField>
                </NestedWell>
              )}
            </SwitchRow>
          </ConfigCollapseSection>
        </>
      )}
    </div>
  );
};
