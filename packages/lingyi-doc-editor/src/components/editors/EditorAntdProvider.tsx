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
        borderRadius: 4,
        controlHeight: 28,
        fontSize: 13,
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
