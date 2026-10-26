import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';

// 样式引入顺序（不可调整）：
// 1) tokens.css          —— 定义全部 CSS 变量，必须先于任何使用方
// 2) admin-overrides.css —— 覆盖 antd 的结构性样式（focus-visible / 指示条 / 表头吸顶等）
// 3) antd 的 CSS-in-JS 在组件渲染时动态注入，因此用变量而非硬编码来避免优先级之争
import './styles/tokens.css';
import './styles/admin-overrides.css';
import { adminTheme } from './styles/theme';

import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={adminTheme}>
      {/*
        AntdApp 提供 message / notification / modal 的 context 版本。
        相比静态的 message.success() / Modal.confirm()，它有两个好处：
          1. 能读取 ConfigProvider 的主题（否则弹层会是 antd 默认皮肤，与全站不一致）
          2. 不触发 React 18 并发渲染下「Static function can not consume context」告警
        用法：const { message, modal } = App.useApp();
      */}
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
