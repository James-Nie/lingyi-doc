import React from 'react';
import { Collapse } from 'antd';

interface ConfigCollapseSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

/** 图表自定义配置折叠区块：标题左对齐，箭头在右侧，与内容控件同列对齐 */
export const ConfigCollapseSection: React.FC<ConfigCollapseSectionProps> = ({
  title,
  children,
  defaultOpen = false,
}) => (
  <Collapse
    ghost
    size="small"
    bordered={false}
    expandIconPosition="end"
    defaultActiveKey={defaultOpen ? ['1'] : []}
    className="dashboard-config-collapse"
    style={{ marginBottom: 0, background: 'transparent' }}
    items={[{
      key: '1',
      label: (
        <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{title}</span>
      ),
      children: (
        <div className="dashboard-config-collapse-body" style={{ padding: '4px 0 12px' }}>
          {children}
        </div>
      ),
      styles: {
        header: {
          paddingInline: 0,
          paddingBlock: 12,
          alignItems: 'center',
        },
        body: {
          paddingInline: 0,
          paddingBlock: 0,
        },
      },
    }]}
  />
);

export const NestedWell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      marginTop: 8,
      padding: 10,
      background: '#fafafa',
      border: '1px solid #f0f0f0',
      borderRadius: 8,
    }}
  >
    {children}
  </div>
);

export const SwitchRow: React.FC<{
  label: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  children?: React.ReactNode;
  switchNode: React.ReactNode;
}> = ({ label, switchNode, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#595959' }}>{label}</span>
      {switchNode}
    </div>
    {children}
  </div>
);

/** 表单项：标题在上、控件全宽，标题与选择框左边缘对齐 */
export const FormField: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ label, children, style }) => (
  <div className="dashboard-form-field" style={{ marginBottom: 12, width: '100%', ...style }}>
    <div
      className="dashboard-form-field-label"
      style={{
        fontSize: 13,
        color: '#8c8c8c',
        marginBottom: 6,
        lineHeight: '20px',
      }}
    >
      {label}
    </div>
    <div className="dashboard-form-field-control" style={{ width: '100%' }}>
      {children}
    </div>
  </div>
);

/** 两列并排表单项（如边框色 + 边框粗细） */
export const FormFieldRow: React.FC<{ children: React.ReactNode; gap?: number }> = ({
  children,
  gap = 12,
}) => (
  <div
    className="dashboard-form-field-row"
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap,
      width: '100%',
      alignItems: 'start',
      marginBottom: 12,
    }}
  >
    {children}
  </div>
);
