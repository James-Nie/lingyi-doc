import React from 'react';
import { Card, Form, Input, InputNumber, Select, Space, Switch } from 'antd';
import type { FormInstance } from 'antd';
import {
  TEMPLATE_CATEGORY_OPTIONS,
  TEMPLATE_DOC_TYPE_LABELS,
  TEMPLATE_STATUS_LABELS,
  type TemplateDocType,
} from './templateConstants';

export interface TemplateBasicFormValues {
  id?: string;
  title: string;
  subtitle?: string;
  docType: TemplateDocType;
  documentTitle: string;
  categories: string[];
  usageLabel?: string;
  isNew?: boolean;
  isBlank?: boolean;
  sortOrder?: number;
  status?: string;
}

interface TemplateBasicInfoFormProps {
  form: FormInstance<TemplateBasicFormValues>;
  isEdit: boolean;
  /** 编辑模式下禁止修改 docType，避免与已有内容结构冲突 */
  lockDocType?: boolean;
  /** 查看模式：与编辑相同布局，全部只读 */
  readOnly?: boolean;
}

export const TemplateBasicInfoForm: React.FC<TemplateBasicInfoFormProps> = ({
  form,
  isEdit,
  lockDocType = isEdit,
  readOnly = false,
}) => (
  <Card bordered={false} style={{ background: 'transparent', padding: 0 }}>
    <Form
      form={form}
      layout="vertical"
      preserve
      initialValues={{
        docType: 'richtext',
        categories: ['recommended'],
        status: 'draft',
        sortOrder: 0,
        isNew: false,
        isBlank: false,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 24px' }}>
        {(isEdit || readOnly) && (
          <Form.Item name="id" label="模板 ID">
            <Input disabled />
          </Form.Item>
        )}
        <Form.Item
          name="docType"
          label="文档类型"
          rules={readOnly ? undefined : [{ required: true, message: '请选择文档类型' }]}
          style={isEdit || readOnly ? undefined : { gridColumn: '1 / -1' }}
        >
          <Select
            disabled={readOnly || lockDocType}
            options={Object.entries(TEMPLATE_DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item
          name="title"
          label="展示标题"
          rules={readOnly ? undefined : [{ required: true, message: '请输入标题' }]}
        >
          <Input placeholder="模板中心卡片标题" disabled={readOnly} />
        </Form.Item>
        <Form.Item
          name="documentTitle"
          label="创建文档标题"
          rules={readOnly ? undefined : [{ required: true, message: '请输入创建文档标题' }]}
        >
          <Input placeholder="用户使用模板时的默认文档名" disabled={readOnly} />
        </Form.Item>
        <Form.Item name="subtitle" label="副标题" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="模板中心卡片副标题" disabled={readOnly} />
        </Form.Item>
        <Form.Item name="categories" label="分类" style={{ gridColumn: '1 / -1' }}>
          <Select
            mode="multiple"
            placeholder="选择展示分类"
            disabled={readOnly}
            options={TEMPLATE_CATEGORY_OPTIONS.map(c => ({ value: c.id, label: c.label }))}
          />
        </Form.Item>
        <Form.Item name="usageLabel" label="用量文案">
          <Input placeholder="如 39.9 万人已使用" disabled={readOnly} />
        </Form.Item>
        <Form.Item name="sortOrder" label="排序权重">
          <InputNumber min={0} max={9999} style={{ width: '100%' }} disabled={readOnly} />
        </Form.Item>
        <Form.Item name="status" label="发布状态">
          <Select
            disabled={readOnly}
            options={Object.entries(TEMPLATE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Space size="large" wrap style={{ gridColumn: '1 / -1' }}>
          <Form.Item name="isNew" label="NEW 标记" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch disabled={readOnly} />
          </Form.Item>
          <Form.Item name="isBlank" label="空白模板" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch disabled={readOnly} />
          </Form.Item>
        </Space>
      </div>
    </Form>
  </Card>
);
