/**
 * 工作流编辑器 - 右侧节点配置面板
 *
 * 开放架构：
 * - 优先查找「渲染器注册表」rendererRegistry（插件可通过 registerConfigRenderer 注册自定义配置组件）
 * - 未注册时，若节点元数据含 configFields，则用通用 SchemaForm 自动渲染
 * - 兜底显示「该节点暂无配置项」
 */
import React, { useMemo } from 'react';
import { Button, Checkbox, Empty, Input, InputNumber, Radio, Select, Tabs, Typography, Collapse } from 'antd';
import { DeleteOutlined, PlusOutlined, CloseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  createEmptyConditionGroup,
  createSwitchBranchId,
  getNodeMeta,
  normalizeIfElseConfig,
  normalizeSwitchConfig,
  type Condition,
  type ConditionGroup,
  type NodeConfigField,
  type NodeTypeMeta,
  type SwitchBranchConfig,
  type WorkflowNode,
} from '@lingyi-doc/core-sheet';

const { TextArea } = Input;

export interface FieldOption {
  id: string;
  name: string;
  type: string;
}

export interface TableOption {
  id: string;
  name: string;
}

interface NodeConfigPanelProps {
  node: WorkflowNode | null;
  fieldOptions?: FieldOption[];
  /** 可选：可用数据表列表（触发器「选择数据表」使用） */
  tableOptions?: TableOption[];
  onUpdateNode: (id: string, patch: Partial<WorkflowNode>) => void;
}

/** 自定义配置渲染器注册表明细（插件开放入口） */
export interface NodeConfigRendererProps {
  node: WorkflowNode;
  fields: FieldOption[];
  tables: TableOption[];
  onUpdate: (id: string, patch: Partial<WorkflowNode>) => void;
}

const rendererRegistry = new Map<string, React.FC<NodeConfigRendererProps>>();

/** 插件注册自定义配置渲染器 */
export function registerConfigRenderer(type: string, component: React.FC<NodeConfigRendererProps>): void {
  rendererRegistry.set(type, component);
}

const OPERATORS: Array<{ value: Condition['operator']; label: string; needValue: boolean }> = [
  { value: 'eq', label: '等于', needValue: true },
  { value: 'neq', label: '不等于', needValue: true },
  { value: 'gt', label: '大于', needValue: true },
  { value: 'gte', label: '大于等于', needValue: true },
  { value: 'lt', label: '小于', needValue: true },
  { value: 'lte', label: '小于等于', needValue: true },
  { value: 'contains', label: '包含', needValue: true },
  { value: 'not_contains', label: '不包含', needValue: true },
  { value: 'is_empty', label: '为空', needValue: false },
  { value: 'is_not_empty', label: '不为空', needValue: false },
  { value: 'in', label: '属于', needValue: true },
  { value: 'not_in', label: '不属于', needValue: true },
];

function detectFieldType(fieldId: string | undefined, options: FieldOption[]): string {
  if (!fieldId) return 'text';
  return options.find((f) => f.id === fieldId)?.type ?? 'text';
}

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({ node, fieldOptions, tableOptions, onUpdateNode }) => {
  if (!node) {
    return (
      <aside className="bwf-config">
        <div className="bwf-config__empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选中一个节点以配置参数" />
        </div>
      </aside>
    );
  }

  const meta = getNodeMeta(node.type);
  return (
    <aside className="bwf-config">
      <div className="bwf-config__header">
        <span className="bwf-node__icon" style={{ background: meta?.color ?? '#8c8c8c', width: 22, height: 22, borderRadius: 4, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          {meta?.icon ?? '\u2699\uFE0F'}
        </span>
        <span className="bwf-config__title">{meta?.label ?? node.type}</span>
      </div>
      <div className="bwf-config__body">
        <div className="bwf-config__section">
          <label className="bwf-config__label">节点名称</label>
          <Input value={node.name} placeholder={meta?.label} onChange={(e) => onUpdateNode(node.id, { name: e.target.value })} />
        </div>
        {renderConfigByType(node, fieldOptions ?? [], tableOptions ?? [], onUpdateNode)}
        <div className="bwf-config__section">
          <label className="bwf-config__label">节点 ID</label>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} copyable>{node.id}</Typography.Text>
        </div>
      </div>
    </aside>
  );
};

function renderConfigByType(node: WorkflowNode, fields: FieldOption[], tables: TableOption[], onUpdate: NodeConfigPanelProps['onUpdateNode']): React.ReactNode {
  // 1) 插件自定义渲染器
  const Custom = rendererRegistry.get(node.type);
  if (Custom) {
    return <Custom node={node} fields={fields} tables={tables} onUpdate={onUpdate} />;
  }
  // 2) Schema 驱动的通用配置表单
  const meta = getNodeMeta(node.type);
  if (meta?.configFields?.length) {
    return (
      <SchemaConfigForm
        node={node}
        meta={meta}
        fields={fields}
        tables={tables}
        onChange={(cfg) => onUpdate(node.id, { config: cfg })}
      />
    );
  }
  // 3) 兜底
  switch (node.type) {
    case 'trigger.manual':
      return <div className="bwf-config__section"><label className="bwf-config__label">说明</label><div className="bwf-config__hint">手动触发可在「运行日志」面板中通过"测试运行"按钮启动。测试时需要传入一条样例 record（字段为 key/value 结构）。</div></div>;
    case 'trigger.form_submitted':
      return <div className="bwf-config__section"><label className="bwf-config__label">说明</label><div className="bwf-config__hint">用户提交表单时触发。提交数据以 record 形式传入，后续节点可通过 {'{{record.字段名}}'} 引用。</div></div>;
    case 'trigger.todo_completed':
      return <div className="bwf-config__section"><label className="bwf-config__label">说明</label><div className="bwf-config__hint">待办事项被标记为完成时触发。关联记录以 record 形式传入。</div></div>;
    case 'trigger.scheduled':
      return <div className="bwf-config__section"><label className="bwf-config__label">说明</label><div className="bwf-config__hint">按设定的时间规则定时触发，无需输入记录。</div></div>;
    case 'trigger.webhook':
      return <div className="bwf-config__section"><label className="bwf-config__label">说明</label><div className="bwf-config__hint">通过 Webhook 接口接收外部数据。调用方推送数据即可启动整个工作流，推送的数据以 record 形式传入。</div></div>;
    case 'end': case 'start':
      return <div className="bwf-config__section"><div className="bwf-config__hint">该节点无需配置。</div></div>;
    default:
      return <div className="bwf-config__section"><div className="bwf-config__hint">该节点类型暂无配置项。</div></div>;
  }
}

/* ========== Schema 驱动的通用配置表单（插件节点兜底渲染） ========== */
const SchemaConfigForm: React.FC<{
  node: WorkflowNode;
  meta: NodeTypeMeta;
  fields: FieldOption[];
  tables: TableOption[];
  onChange: (cfg: Record<string, unknown>) => void;
}> = ({ node, meta, fields, tables, onChange }) => {
  const config = node.config ?? {};
  const visible = (meta.configFields ?? []).filter((f) => {
    if (!f.onlyFor) return true;
    return config[f.onlyFor.key] === f.onlyFor.value || (f.onlyFor.value === undefined && !config[f.onlyFor.key]);
  });
  return (
    <>
      {(meta.outputs?.length ? [
        <div key="outputs" className="bwf-config__section">
          <label className="bwf-config__label">输出</label>
          {meta.outputs.map((o) => (
            <div key={o.key} className="bwf-config__map" style={{ alignItems: 'flex-start' }}>
              <code style={{ flexShrink: 0, fontSize: 12 }}>{'{{' + o.key + '}}'}</code>
              <span className="bwf-config__map-arrow">{'\u2190'}</span>
              <span style={{ fontSize: 13, color: '#4e5969' }}>{o.description}</span>
            </div>
          ))}
        </div>,
      ] : [])}
      {visible.map((f) => (
        <SchemaField key={f.key} field={f} value={config[f.key]} config={config} fields={fields} tables={tables}
          onChange={(value) => onChange({ ...config, [f.key]: value })} />
      ))}
    </>
  );
};

const SchemaField: React.FC<{
  field: NodeConfigField;
  value: unknown;
  config: Record<string, unknown>;
  fields: FieldOption[];
  tables: TableOption[];
  onChange: (value: unknown) => void;
}> = ({ field, value, config, fields, tables, onChange }) => {
  const set = (v: unknown) => onChange(v);
  let control: React.ReactNode = null;
  switch (field.type) {
    case 'text': {
      control = <Input value={(value as string) ?? ''} placeholder={field.placeholder} onChange={(e) => set(e.target.value)} />;
      break;
    }
    case 'textarea': {
      control = <TextArea rows={4} value={(value as string) ?? ''} placeholder={field.placeholder} onChange={(e) => set(e.target.value)} />;
      break;
    }
    case 'number': {
      control = <InputNumber style={{ width: '100%' }} value={value as number | undefined} onChange={(v) => set(v)} />;
      break;
    }
    case 'boolean': {
      control = <Checkbox checked={Boolean(value)} onChange={(e) => set(e.target.checked)}>{field.placeholder ?? ''}</Checkbox>;
      break;
    }
    case 'select': {
      control = (
        <Select value={(value as string | undefined) ?? undefined} options={field.options} placeholder={field.placeholder}
          onChange={(v) => set(v)} style={{ width: '100%' }} allowClear />
      );
      break;
    }
    case 'tags': {
      control = (
        <Select mode="tags" value={(value as string[] | undefined) ?? []} tokenSeparators={[',', '，', ' ']} placeholder={field.placeholder}
          options={((value as string[] | undefined) ?? []).map((v) => ({ value: v, label: v }))} onChange={(v) => set(v)} style={{ width: '100%' }} />
      );
      break;
    }
    case 'secret': {
      control = (
        <Input.Password value={typeof value === 'string' && value ? '\u2022\u2022\u2022\u2022' : ''} autoComplete="new-password"
          placeholder={value ? '已配置，输入以覆盖' : field.placeholder}
          onChange={(e) => { if (e.target.value) set(e.target.value); }} />
      );
      break;
    }
    case 'field-select': {
      control = <Select showSearch optionFilterProp="label" value={(value as string | undefined) ?? undefined} placeholder={field.placeholder}
        options={fields.map((f) => ({ value: f.id, label: `${f.name}（${f.type}）` }))} onChange={(v) => set(v)} style={{ width: '100%' }} allowClear />;
      break;
    }
    case 'multi-field-select': {
      control = <Select mode="multiple" showSearch optionFilterProp="label" value={(value as string[] | undefined) ?? []} placeholder={field.placeholder}
        options={fields.map((f) => ({ value: f.id, label: f.name }))} onChange={(v) => set(v)} style={{ width: '100%' }} />;
      break;
    }
    case 'table-select': {
      control = <Select showSearch optionFilterProp="label" value={(value as string | undefined) ?? undefined} placeholder={field.placeholder || '默认使用触发器所在表'}
        options={tables.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => set(v)} style={{ width: '100%' }} allowClear />;
      break;
    }
    default:
      control = <div className="bwf-config__hint">字段类型「{field.type}」请由插件自定义渲染器实现。</div>;
  }
  return (
    <div className="bwf-config__section">
      <label className="bwf-config__label">
        {field.label}
        {field.required && <span className="bwf-config__required"> *</span>}
      </label>
      {control}
      {field.description && <div className="bwf-config__hint">{field.description}</div>}
    </div>
  );
};

/* ========== 触发器：创建记录时（配置 / 输出 两个标签页） ========== */
const RecordAddedTriggerConfigSection: React.FC<{
  config: Record<string, unknown>;
  fields: FieldOption[];
  tables: TableOption[];
  onChange: (cfg: Record<string, unknown>) => void;
}> = ({ config, fields, tables, onChange }) => {
  const tableId = (config.tableId as string) || '';
  const requiredFields = ((config.requiredFields as string[] | undefined) ?? []);
  const group: ConditionGroup = useMemo(() => {
    const g = config.filter as ConditionGroup | undefined;
    return g ?? { op: 'and', conditions: [] };
  }, [config.filter]);
  const updateGroup = (next: ConditionGroup) => onChange({ ...config, filter: next });

  const tableOptions = tables.length > 0 ? tables : [{ id: tableId, name: tableId || '当前数据表' }];
  const selectedTableId = tableOptions.some((t) => t.id === tableId) ? tableId : (tableOptions[0]?.id ?? '');

  const outputItems = [
    { key: 'record', desc: '触发记录（新建的这条记录 / 补填必填字段的记录）' },
  ];

  return (
    <Tabs
      size="small"
      defaultActiveKey="config"
      items={[
        {
          key: 'config',
          label: '配置',
          children: (
            <>
              <div className="bwf-config__section">
                <label className="bwf-config__label">选择数据表 <span className="bwf-config__required">*</span></label>
                <Select
                  showSearch optionFilterProp="label" placeholder="选择数据表" style={{ width: '100%' }}
                  value={selectedTableId || undefined}
                  options={tableOptions.map((t) => ({ value: t.id, label: t.name }))}
                  onChange={(v) => onChange({ ...config, tableId: v })}
                />
              </div>
              <div className="bwf-config__section">
                <label className="bwf-config__label">选择必填字段 <span className="bwf-config__required">*</span></label>
                <Select
                  mode="multiple" showSearch optionFilterProp="label" placeholder="选择必填字段" style={{ width: '100%' }}
                  value={requiredFields}
                  options={fields.map((f) => ({ value: f.id, label: f.name }))}
                  onChange={(v) => onChange({ ...config, requiredFields: v })}
                />
                <div className="bwf-config__hint">记录创建后最长等待 24 小时，期间填写必填字段将立即触发。</div>
                <div className="bwf-config__logic">💡 逻辑：不是新建记录立刻触发；是这条记录补填了该必填字段之后，才会触发流程，最大等待窗口期 24h。</div>
              </div>
              <div className="bwf-config__section">
                <label className="bwf-config__label">筛选条件</label>
                <div style={{ marginBottom: 8 }}>
                  <Select
                    value={group.op} style={{ width: '100%' }}
                    options={[
                      { value: 'and', label: '满足所有条件（AND，全部条件成立）' },
                      { value: 'or', label: '满足任一条条件（OR，任意一条成立）' },
                    ]}
                    onChange={(v) => updateGroup({ ...group, op: v })}
                  />
                </div>
                {group.conditions.map((c, i) => (
                  <ConditionRow key={i} condition={c} fields={fields}
                    onChange={(next) => { const arr = [...group.conditions]; arr[i] = next; updateGroup({ ...group, conditions: arr }); }}
                    onRemove={() => { const arr = group.conditions.filter((_, idx) => idx !== i); updateGroup({ ...group, conditions: arr }); }} />
                ))}
                <div className="bwf-config__add" onClick={() => updateGroup({ ...group, conditions: [...group.conditions, { field: '', operator: 'eq' as const, value: '' }] })}>
                  <PlusOutlined /> 添加筛选
                </div>
              </div>
            </>
          ),
        },
        {
          key: 'output',
          label: '输出',
          children: (
            <div className="bwf-config__section">
              <label className="bwf-config__label">触发时输出</label>
              {outputItems.map((item) => (
                <div key={item.key} className="bwf-config__map" style={{ alignItems: 'flex-start' }}>
                  <code style={{ flexShrink: 0, fontSize: 12 }}>{'{{' + item.key + '}}'}</code>
                  <span className="bwf-config__map-arrow">{'\u2190'}</span>
                  <span style={{ fontSize: 13, color: '#4e5969' }}>{item.desc}</span>
                </div>
              ))}
              <div className="bwf-config__hint">后续节点可通过 {'{{record.字段名}}'} 引用该记录中的字段值。</div>
            </div>
          ),
        },
      ]}
    />
  );
};

/* ========== 触发器：记录变更时（配置 / 输出 两个标签页） ========== */
interface ConditionSectionProps { config: Record<string, unknown>; fields: FieldOption[]; onChange: (cfg: Record<string, unknown>) => void; }
interface RecordChangedTriggerSectionProps {
  config: Record<string, unknown>;
  fields: FieldOption[];
  tables: TableOption[];
  onChange: (cfg: Record<string, unknown>) => void;
}
const RecordChangedTriggerConfigSection: React.FC<RecordChangedTriggerSectionProps> = ({ config, fields, tables, onChange }) => {
  const tableId = (config.tableId as string) || '';
  const watchFields = ((config.watchFields as string[] | undefined) ?? []);
  const group: ConditionGroup = useMemo(() => {
    const g = config.filter as ConditionGroup | undefined;
    return g ?? { op: 'and', conditions: [] };
  }, [config.filter]);
  const updateGroup = (next: ConditionGroup) => onChange({ ...config, filter: next });

  const tableOptions = tables.length > 0 ? tables : [{ id: tableId, name: tableId || '当前数据表' }];
  const selectedTableId = tableOptions.some((t) => t.id === tableId) ? tableId : (tableOptions[0]?.id ?? '');

  const outputItems = [
    { key: 'record', desc: '触发记录（本次发生变更的记录）' },
  ];

  return (
    <Tabs
      size="small"
      defaultActiveKey="config"
      items={[
        {
          key: 'config',
          label: '配置',
          children: (
            <>
              <div className="bwf-config__section">
                <label className="bwf-config__label">选择数据表 <span className="bwf-config__required">*</span></label>
                <Select
                  showSearch optionFilterProp="label" placeholder="选择数据表" style={{ width: '100%' }}
                  value={selectedTableId || undefined}
                  options={tableOptions.map((t) => ({ value: t.id, label: t.name }))}
                  onChange={(v) => onChange({ ...config, tableId: v })}
                />
              </div>
              <div className="bwf-config__section">
                <label className="bwf-config__label">监听指定字段 <span className="bwf-config__required">*</span></label>
                <Select
                  mode="multiple" showSearch optionFilterProp="label" placeholder="选择要监听的字段" style={{ width: '100%' }}
                  value={watchFields}
                  options={fields.map((f) => ({ value: f.id, label: f.name }))}
                  onChange={(v) => onChange({ ...config, watchFields: v })}
                />
                <div className="bwf-config__hint">可点击「+ 选择字段」继续增加监听字段。</div>
                <div className="bwf-config__logic">💡 触发逻辑：只有被监听的字段发生修改，才会触发该流程；其他字段变更不会触发。</div>
              </div>
              <div className="bwf-config__section">
                <label className="bwf-config__label">筛选条件</label>
                <div style={{ marginBottom: 8 }}>
                  <Select
                    value={group.op} style={{ width: '100%' }}
                    options={[
                      { value: 'and', label: '满足所有条件（AND，全部条件成立）' },
                      { value: 'or', label: '满足任一条条件（OR，任意一条成立）' },
                    ]}
                    onChange={(v) => updateGroup({ ...group, op: v })}
                  />
                </div>
                {group.conditions.map((c, i) => (
                  <ConditionRow key={i} condition={c} fields={fields}
                    onChange={(next) => { const arr = [...group.conditions]; arr[i] = next; updateGroup({ ...group, conditions: arr }); }}
                    onRemove={() => { const arr = group.conditions.filter((_, idx) => idx !== i); updateGroup({ ...group, conditions: arr }); }} />
                ))}
                <div className="bwf-config__add" onClick={() => updateGroup({ ...group, conditions: [...group.conditions, { field: '', operator: 'eq' as const, value: '' }] })}>
                  <PlusOutlined /> 添加筛选
                </div>
                <div className="bwf-config__hint">配置后，只有字段变更并且满足筛选条件，流程才会执行。</div>
              </div>
            </>
          ),
        },
        {
          key: 'output',
          label: '输出',
          children: (
            <div className="bwf-config__section">
              <label className="bwf-config__label">触发时输出</label>
              {outputItems.map((item) => (
                <div key={item.key} className="bwf-config__map" style={{ alignItems: 'flex-start' }}>
                  <code style={{ flexShrink: 0, fontSize: 12 }}>{'{{' + item.key + '}}'}</code>
                  <span className="bwf-config__map-arrow">{'\u2190'}</span>
                  <span style={{ fontSize: 13, color: '#4e5969' }}>{item.desc}</span>
                </div>
              ))}
              <div className="bwf-config__hint">后续节点可通过 {'{{record.字段名}}'} 引用该记录中的字段值。</div>
            </div>
          ),
        },
      ]}
    />
  );
};

const ConditionRow: React.FC<{ condition: Condition; fields: FieldOption[]; onChange: (c: Condition) => void; onRemove: () => void }> = ({ condition, fields, onChange, onRemove }) => {
  const opMeta = OPERATORS.find((o) => o.value === condition.operator);
  const fieldType = detectFieldType(condition.field, fields);
  return (
    <div className="bwf-config__row" style={{ flexWrap: 'wrap' }}>
      <div className="bwf-config__row-field">
        <Select showSearch value={condition.field || undefined} placeholder="选择字段" optionFilterProp="label"
          options={fields.map((f) => ({ value: f.id, label: `${f.name}（${f.type}）` }))}
          onChange={(v) => onChange({ ...condition, field: v })} style={{ width: '100%' }} />
      </div>
      <div className="bwf-config__row-op">
        <Select value={condition.operator} options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => onChange({ ...condition, operator: v })} style={{ width: '100%' }} />
      </div>
      {opMeta?.needValue && (
        <div className="bwf-config__row-val">
          {fieldType === 'boolean' ? (
            <Select value={condition.value != null ? String(condition.value) : undefined} placeholder="值"
              options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]}
              onChange={(v) => onChange({ ...condition, value: v })} style={{ width: '100%' }} />
          ) : fieldType === 'number' ? (
            <Input type="number" value={condition.value as number | undefined} placeholder="值"
              onChange={(e) => onChange({ ...condition, value: e.target.value === '' ? '' : Number(e.target.value) })} />
          ) : (
            <Input value={condition.value as string | undefined} placeholder="值，支持 {{record.field}}"
              onChange={(e) => onChange({ ...condition, value: e.target.value })} />
          )}
        </div>
      )}
      <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={onRemove} />
    </div>
  );
};

/* ========== 共享条件组编辑器（If/Else 与 Switch 分支复用） ========== */
const ConditionGroupsEditor: React.FC<{
  groups: ConditionGroup[];
  fields: FieldOption[];
  onChange: (groups: ConditionGroup[]) => void;
  showOrHint?: boolean;
}> = ({ groups, fields, onChange, showOrHint }) => (
  <>
    {groups.map((group, gi) => (
      <React.Fragment key={gi}>
        {gi > 0 && <div className="bwf-ifelse-divider">或者</div>}
        <div className="bwf-ifelse-group">
          <div className="bwf-ifelse-group__header">
            <span className="bwf-ifelse-group__label">{gi === 0 ? '如果' : '或者'}</span>
            {groups.length > 1 && (
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(groups.filter((_, idx) => idx !== gi))} />
            )}
          </div>
          {group.conditions.map((c, ci) => (
            <ConditionRow key={ci} condition={c} fields={fields}
              onChange={(next) => { const arr = [...group.conditions]; arr[ci] = next; const gs = [...groups]; gs[gi] = { ...group, conditions: arr }; onChange(gs); }}
              onRemove={() => { const arr = group.conditions.filter((_, idx) => idx !== ci); const gs = [...groups]; gs[gi] = { ...group, conditions: arr }; onChange(gs); }} />
          ))}
          <div className="bwf-config__add" onClick={() => {
            const arr = [...group.conditions, { field: '', operator: 'eq' as const, value: '' }];
            const gs = [...groups]; gs[gi] = { ...group, op: 'and', conditions: arr }; onChange(gs);
          }}>
            <PlusOutlined /> 并且
          </div>
        </div>
      </React.Fragment>
    ))}
    <div className="bwf-config__add" style={{ marginTop: 8 }} onClick={() => onChange([...groups, createEmptyConditionGroup()])}>
      <PlusOutlined /> 或者
    </div>
    {showOrHint && <div className="bwf-config__hint">满足任一条件组即视为匹配。</div>}
  </>
);

/* ========== 条件判断 If/Else ========== */
const IfElseConfigSection: React.FC<ConditionSectionProps> = ({ config, fields, onChange }) => {
  const groups: ConditionGroup[] = useMemo(() => normalizeIfElseConfig(config).groups, [config]);
  const updateGroups = (next: ConditionGroup[]) => onChange({ ...config, groups: next });

  return (
    <div className="bwf-config__section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label className="bwf-config__label" style={{ marginBottom: 0 }}>条件设置</label>
        <Button size="small" type="link" icon={<ThunderboltOutlined />} style={{ fontSize: 12, padding: 0 }}>智能填充</Button>
      </div>
      <ConditionGroupsEditor groups={groups} fields={fields} onChange={updateGroups} />
      <div className="bwf-config__hint">满足任一条件组即走「满足」分支，都不满足走「不满足」分支。</div>
    </div>
  );
};

/* ========== 多分支 Switch ========== */
const SwitchConfigSection: React.FC<ConditionSectionProps> = ({ config, fields, onChange }) => {
  const switchCfg = useMemo(() => normalizeSwitchConfig(config), [config]);
  const mode = switchCfg.executionMode;
  const branches = switchCfg.branches;

  const updateBranches = (next: SwitchBranchConfig[]) => onChange({ ...config, branches: next });

  return (
    <>
      <div className="bwf-config__section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="bwf-config__label" style={{ marginBottom: 0 }}>执行逻辑</label>
          <Button size="small" type="link" icon={<ThunderboltOutlined />} style={{ fontSize: 12, padding: 0 }}>智能填充</Button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className={`bwf-switch-mode ${mode === 'first' ? 'bwf-switch-mode--active' : ''}`} onClick={() => onChange({ ...config, executionMode: 'first' })}>
            <div className="bwf-switch-mode__title">仅执行一条</div>
            <div className="bwf-switch-mode__desc">执行第一条满足条件的分支</div>
          </div>
          <div className={`bwf-switch-mode ${mode === 'all' ? 'bwf-switch-mode--active' : ''}`} onClick={() => onChange({ ...config, executionMode: 'all' })}>
            <div className="bwf-switch-mode__title">同时执行多条</div>
            <div className="bwf-switch-mode__desc">执行所有满足条件的分支</div>
          </div>
        </div>
      </div>
      <div className="bwf-config__section">
        <label className="bwf-config__label">分支列表</label>
        <Collapse size="small" defaultActiveKey={branches.map((_, i) => String(i))} items={branches.map((branch, bi) => ({
          key: String(bi),
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>{branch.name || `分支${bi + 1}`}</span>
              {branches.length > 1 && (
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); updateBranches(branches.filter((_, idx) => idx !== bi)); }} />
              )}
            </div>
          ),
          children: (
            <SwitchBranchEditor branch={branch} fields={fields}
              onChange={(next) => { const arr = [...branches]; arr[bi] = next; updateBranches(arr); }} />
          ),
        }))} />
        <div className="bwf-config__add" style={{ marginTop: 8 }} onClick={() => updateBranches([...branches, { id: createSwitchBranchId(branches.length + 1), name: `分支 ${branches.length + 1}`, groups: [createEmptyConditionGroup()] }])}>
          <PlusOutlined /> 添加分支
        </div>
      </div>
      <div className="bwf-config__section">
        <div className="bwf-config__hint">所有分支都不满足时，走「其他」分支。</div>
      </div>
    </>
  );
};

const SwitchBranchEditor: React.FC<{ branch: SwitchBranchConfig; fields: FieldOption[]; onChange: (b: SwitchBranchConfig) => void }> = ({ branch, fields, onChange }) => {
  const groups: ConditionGroup[] = useMemo(() => branch.groups ?? (branch.conditions ? [branch.conditions] : [createEmptyConditionGroup()]), [branch.groups, branch.conditions]);
  return (
    <>
      <Input size="small" value={branch.name} placeholder="分支名称" onChange={(e) => onChange({ ...branch, name: e.target.value })} style={{ marginBottom: 8 }} />
      <ConditionGroupsEditor groups={groups} fields={fields} onChange={(next) => onChange({ ...branch, groups: next })} />
    </>
  );
};

/* ========== record.create ========== */
const RecordCreateConfigSection: React.FC<ConditionSectionProps> = ({ config, fields, onChange }) => {
  const fieldMap = (config.fields as Record<string, unknown>) ?? {};
  const targetTableId = (config.tableId as string) || '';
  const setMap = (key: string, val: string | null) => {
    const next = { ...fieldMap };
    if (val === null || val === '') delete next[key];
    else next[key] = val;
    onChange({ ...config, fields: next });
  };
  return (<>
    <div className="bwf-config__section">
      <label className="bwf-config__label">目标数据表</label>
      <Input value={targetTableId} placeholder="默认使用触发器所在表（可填其他表 id）" onChange={(e) => onChange({ ...config, tableId: e.target.value })} />
      <div className="bwf-config__hint">留空则使用触发器所在表。</div>
    </div>
    <div className="bwf-config__section">
      <label className="bwf-config__label">字段映射</label>
      {Object.keys(fieldMap).length === 0 && <div className="bwf-config__hint" style={{ marginBottom: 6 }}>未配置字段</div>}
      {Object.entries(fieldMap).map(([target, src]) => (
        <div key={target} className="bwf-config__map">
          <Select value={target} showSearch optionFilterProp="label" placeholder="目标字段"
            options={fields.map((f) => ({ value: f.id, label: f.name }))}
            onChange={(v) => { const next: Record<string, unknown> = {}; for (const [k, val] of Object.entries(fieldMap)) { if (k === target) next[v] = val; else next[k] = val; } onChange({ ...config, fields: next }); }}
            style={{ width: '100%' }} />
          <span className="bwf-config__map-arrow">{'\u2190'}</span>
          <Input value={src as string} placeholder="支持 {{record.field}} 或静态值" onChange={(e) => setMap(target, e.target.value)} />
        </div>
      ))}
      <div className="bwf-config__add" onClick={() => { const used = new Set(Object.keys(fieldMap)); const next = fields.find((f) => !used.has(f.id)); if (!next) return; setMap(next.id, ''); }}>
        <PlusOutlined /> 添加字段
      </div>
    </div>
  </>);
};

/* ========== record.update ========== */
const RecordUpdateConfigSection: React.FC<ConditionSectionProps> = ({ config, fields, onChange }) => {
  const fieldMap = (config.fields as Record<string, unknown>) ?? {};
  const conds = ((config.conditions as Condition[] | undefined) ?? []);
  return (<>
    <div className="bwf-config__section">
      <label className="bwf-config__label">匹配条件（与 = AND）</label>
      {conds.map((c, i) => (
        <ConditionRow key={i} condition={c} fields={fields}
          onChange={(next) => { const arr = [...conds]; arr[i] = next; onChange({ ...config, conditions: arr }); }}
          onRemove={() => { const arr = conds.filter((_, idx) => idx !== i); onChange({ ...config, conditions: arr }); }} />
      ))}
      <div className="bwf-config__add" onClick={() => onChange({ ...config, conditions: [...conds, { field: '', operator: 'eq' as const, value: '' }] })}>
        <PlusOutlined /> 添加条件
      </div>
    </div>
    <div className="bwf-config__section">
      <label className="bwf-config__label">要更新的字段</label>
      {Object.entries(fieldMap).map(([target, src]) => (
        <div key={target} className="bwf-config__map">
          <Select value={target} showSearch optionFilterProp="label" placeholder="目标字段"
            options={fields.map((f) => ({ value: f.id, label: f.name }))}
            onChange={(v) => { const next: Record<string, unknown> = {}; for (const [k, val] of Object.entries(fieldMap)) { if (k === target) next[v] = val; else next[k] = val; } onChange({ ...config, fields: next }); }}
            style={{ width: '100%' }} />
          <span className="bwf-config__map-arrow">{'\u2190'}</span>
          <Input value={src as string} placeholder="支持 {{record.field}} 或静态值"
            onChange={(e) => { const next = { ...fieldMap }; if (!e.target.value) delete next[target]; else next[target] = e.target.value; onChange({ ...config, fields: next }); }} />
        </div>
      ))}
      <div className="bwf-config__add" onClick={() => { const used = new Set(Object.keys(fieldMap)); const next = fields.find((f) => !used.has(f.id)); if (!next) return; onChange({ ...config, fields: { ...fieldMap, [next.id]: '' } }); }}>
        <PlusOutlined /> 添加字段
      </div>
    </div>
  </>);
};

/* ========== record.find ========== */
const RecordFindConfigSection: React.FC<ConditionSectionProps> = ({ config, fields, onChange }) => {
  const conds = ((config.conditions as Condition[] | undefined) ?? []);
  return (
    <div className="bwf-config__section">
      <label className="bwf-config__label">查找条件</label>
      {conds.map((c, i) => (
        <ConditionRow key={i} condition={c} fields={fields}
          onChange={(next) => { const arr = [...conds]; arr[i] = next; onChange({ ...config, conditions: arr }); }}
          onRemove={() => { const arr = conds.filter((_, idx) => idx !== i); onChange({ ...config, conditions: arr }); }} />
      ))}
      <div className="bwf-config__add" onClick={() => onChange({ ...config, conditions: [...conds, { field: '', operator: 'eq' as const, value: '' }] })}>
        <PlusOutlined /> 添加条件
      </div>
      <div className="bwf-config__hint">找到的记录会写入 variables.records 供后续节点使用。</div>
    </div>
  );
};

/* ========== ai.* ========== */
const AiConfigSection: React.FC<ConditionSectionProps & { nodeType: string }> = ({ config, fields, nodeType, onChange }) => (
  <>
    <div className="bwf-config__section">
      <label className="bwf-config__label">Prompt</label>
      <TextArea rows={4} value={(config.prompt as string) ?? ''} placeholder="例如：根据 {{record.title}} 总结一句话"
        onChange={(e) => onChange({ ...config, prompt: e.target.value })} />
      <div className="bwf-config__hint">支持 <code>{'{{record.field}}'}</code> 引用触发记录的字段值。</div>
    </div>
    <div className="bwf-config__section">
      <label className="bwf-config__label">输出到字段（可选）</label>
      <Select allowClear value={config.outputField as string | undefined} placeholder="选择结果写入的字段"
        options={fields.map((f) => ({ value: f.id, label: f.name }))}
        onChange={(v) => onChange({ ...config, outputField: v ?? '' })} style={{ width: '100%' }} />
      {nodeType === 'ai.classify' && (<>
        <label className="bwf-config__label" style={{ marginTop: 8 }}>分类选项</label>
        <Select mode="tags" value={(config.categories as string[]) ?? []} placeholder="例如：紧急 / 普通 / 低优"
          onChange={(v) => onChange({ ...config, categories: v })} style={{ width: '100%' }} />
      </>)}
    </div>
  </>
);

/* ========== notify ========== */
const NotifyConfigSection: React.FC<Omit<ConditionSectionProps, 'fields'> & { nodeType: string }> = ({ config, nodeType, onChange }) => {
  const isFeishu = nodeType === 'notify.feishu_message';
  return (<>
    <div className="bwf-config__section">
      <label className="bwf-config__label">{isFeishu ? '飞书机器人 Webhook' : '钉钉机器人 Webhook'}</label>
      <Input.Password value={(config.webhook as string) ?? ''} placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
        onChange={(e) => onChange({ ...config, webhook: e.target.value })} />
      <div className="bwf-config__hint">签名校验密钥（可选）</div>
      <Input.Password value={(config.secret as string) ?? ''} placeholder="SEC..." onChange={(e) => onChange({ ...config, secret: e.target.value })} />
    </div>
    <div className="bwf-config__section">
      <label className="bwf-config__label">标题</label>
      <Input value={(config.title as string) ?? ''} placeholder="支持 {{record.field}}" onChange={(e) => onChange({ ...config, title: e.target.value })} />
    </div>
    <div className="bwf-config__section">
      <label className="bwf-config__label">正文（Markdown / 纯文本）</label>
      <TextArea rows={5} value={(config.body as string) ?? ''} placeholder="支持 {{record.field}} 占位" onChange={(e) => onChange({ ...config, body: e.target.value })} />
    </div>
  </>);
};

/* ========== notify.dingtalk_message ========== */
interface DingTalkMessageConfig {
  webhook: string;
  secret: string;
  msgType: 'text' | 'markdown';
  title: string;
  body: string;
  atMobiles: string[];
  atAll: boolean;
}

const DingTalkMessageConfigSection: React.FC<{ config: Record<string, unknown>; onChange: (cfg: Record<string, unknown>) => void }> = ({ config, onChange }) => {
  const cfg: DingTalkMessageConfig = {
    webhook: (config.webhook as string) ?? '',
    secret: (config.secret as string) ?? '',
    msgType: ((config.msgType as string) ?? 'text') === 'markdown' ? 'markdown' : 'text',
    title: (config.title as string) ?? '',
    body: (config.body as string) ?? '',
    atMobiles: ((config.atMobiles as string[] | undefined) ?? []),
    atAll: (config.atAll as boolean) ?? false,
  };
  const set = (patch: Partial<DingTalkMessageConfig>) => onChange({ ...config, ...cfg, ...patch });

  return (<>
    <div className="bwf-config__section">
      <label className="bwf-config__label">钉钉机器人 Webhook <span className="bwf-config__required">*</span></label>
      <Input value={cfg.webhook} placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." onChange={(e) => set({ webhook: e.target.value })} />
      <div className="bwf-config__hint">在钉钉群中添加自定义机器人后获取 Webhook 地址。</div>
    </div>
    <div className="bwf-config__section">
      <label className="bwf-config__label">加签密钥（可选）</label>
      <Input.Password value={cfg.secret} placeholder="SEC..." onChange={(e) => set({ secret: e.target.value })} />
      <div className="bwf-config__hint">机器人安全设置选择「加签」时填写，留空则不加签。</div>
    </div>
    <div className="bwf-config__section">
      <label className="bwf-config__label">消息类型</label>
      <Radio.Group value={cfg.msgType} onChange={(e) => set({ msgType: e.target.value })} size="small" className="bwf-config__op-switch">
        <Radio.Button value="text">文本</Radio.Button>
        <Radio.Button value="markdown">Markdown</Radio.Button>
      </Radio.Group>
    </div>
    {cfg.msgType === 'markdown' && (
      <div className="bwf-config__section">
        <label className="bwf-config__label">标题</label>
        <Input value={cfg.title} placeholder="支持 {{record.field}}" onChange={(e) => set({ title: e.target.value })} />
      </div>
    )}
    <div className="bwf-config__section">
      <label className="bwf-config__label">消息内容 <span className="bwf-config__required">*</span></label>
      <TextArea rows={5} value={cfg.body} placeholder="支持 {{record.field}} 占位" onChange={(e) => set({ body: e.target.value })} />
    </div>
    <div className="bwf-config__section">
      <label className="bwf-config__label">@ 提醒</label>
      <Checkbox checked={cfg.atAll} onChange={(e) => set({ atAll: e.target.checked })}>@ 所有人</Checkbox>
      <Select
        mode="tags" tokenSeparators={[',', '，', ' ']} placeholder="@ 指定成员手机号（回车分隔）" style={{ width: '100%', marginTop: 6 }}
        value={cfg.atMobiles}
        options={cfg.atMobiles.map((m) => ({ value: m, label: m }))}
        onChange={(v) => set({ atMobiles: v })}
      />
    </div>
  </>);
};

/* ============ 内置自定义渲染器注册（插件化；第三方可另注册覆盖） ============ */
registerConfigRenderer('trigger.record_added', (p) => (
  <RecordAddedTriggerConfigSection config={p.node.config ?? {}} fields={p.fields} tables={p.tables} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
));
registerConfigRenderer('trigger.record_updated', (p) => (
  <RecordChangedTriggerConfigSection config={p.node.config ?? {}} fields={p.fields} tables={p.tables} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
));
registerConfigRenderer('trigger.record_match', (p) => (
  <RecordChangedTriggerConfigSection config={p.node.config ?? {}} tables={p.tables} fields={p.fields} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
));
registerConfigRenderer('condition.if', (p) => (
  <IfElseConfigSection config={p.node.config ?? {}} fields={p.fields} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
));
registerConfigRenderer('condition.switch', (p) => (
  <SwitchConfigSection config={p.node.config ?? {}} fields={p.fields} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
));
registerConfigRenderer('record.create', (p) => (
  <RecordCreateConfigSection config={p.node.config ?? {}} fields={p.fields} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
));
registerConfigRenderer('record.update', (p) => (
  <RecordUpdateConfigSection config={p.node.config ?? {}} fields={p.fields} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
));
registerConfigRenderer('record.find', (p) => (
  <RecordFindConfigSection config={p.node.config ?? {}} fields={p.fields} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
));
for (const t of ['ai.analyze', 'ai.classify', 'ai.generate_text', 'ai.agent']) {
  registerConfigRenderer(t, (p) => (
    <AiConfigSection config={p.node.config ?? {}} fields={p.fields} nodeType={p.node.type} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
  ));
}
for (const t of ['notify.feishu_message', 'notify.dingtalk_bot']) {
  registerConfigRenderer(t, (p) => (
    <NotifyConfigSection config={p.node.config ?? {}} nodeType={p.node.type} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
  ));
}
registerConfigRenderer('notify.dingtalk_message', (p) => (
  <DingTalkMessageConfigSection config={p.node.config ?? {}} onChange={(cfg) => p.onUpdate(p.node.id, { config: cfg })} />
));
