import React, { useRef, useState } from 'react';
import { Button, Flex, Segmented } from 'antd';
import { EditOutlined, FormOutlined, LockOutlined } from '@ant-design/icons';
import { BASE_THEME } from '@lingyi-doc/core';

export interface FormSharePanelContext {
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

interface FormViewToolbarProps {
  tab: 'edit' | 'fill';
  onTabChange: (tab: 'edit' | 'fill') => void;
  renderFormSharePanel?: (ctx: FormSharePanelContext) => React.ReactNode;
}

export const FormViewToolbar: React.FC<FormViewToolbarProps> = ({
  tab,
  onTabChange,
  renderFormSharePanel,
}) => {
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <Flex
      align="center"
      justify="center"
      style={{
        position: 'relative',
        padding: '8px 16px',
        borderBottom: `1px solid ${BASE_THEME.toolbarBorder}`,
        background: BASE_THEME.toolbarBg,
        minHeight: 44,
        flexShrink: 0,
      }}
    >
      <Segmented
        value={tab}
        onChange={value => onTabChange(value as 'edit' | 'fill')}
        options={[
          { value: 'edit', label: '编辑表单', icon: <EditOutlined /> },
          { value: 'fill', label: '填写表单', icon: <FormOutlined /> },
        ]}
      />
      {tab === 'edit' && renderFormSharePanel && (
        <Flex align="center" gap={8} style={{ position: 'absolute', right: 16 }}>
          <Button
            ref={shareBtnRef}
            type={shareOpen ? 'primary' : 'text'}
            size="small"
            icon={<LockOutlined />}
            onClick={() => setShareOpen(v => !v)}
          >
            分享表单
          </Button>
          {renderFormSharePanel({
            open: shareOpen,
            anchorRef: shareBtnRef,
            onClose: () => setShareOpen(false),
          })}
        </Flex>
      )}
    </Flex>
  );
};
