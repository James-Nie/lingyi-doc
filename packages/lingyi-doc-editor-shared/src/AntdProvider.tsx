import React from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';

/** Ant Design 全局上下文（应用级或局部包裹均可） */
export const SheetAntdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ConfigProvider
    locale={zhCN}
    theme={{
      token: {
        borderRadius: 6,
        controlHeight: 32,
        fontSize: 13,
        sizeUnit: 4,
        sizeStep: 4,
        colorPrimary: '#3370ff',
      },
      components: {
        Popover: {
          titleMinHeight: 44,
        } as Record<string, number>,
        Button: {
          paddingInlineSM: 10,
        },
      },
    }}
  >
    <div
      className="sheet-antd-root"
      style={{ width: '100%', height: '100%', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {children}
    </div>
  </ConfigProvider>
);

/** @deprecated 使用 SheetAntdProvider */
export const EditorAntdProvider = SheetAntdProvider;
