import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider 
      locale={zhCN} 
      theme={{
        token: {
          borderRadius: 4,
          controlHeight: 28,
          fontSize: 13,
          colorPrimary: '#1890ff',
          size: 16
        },
    }}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
