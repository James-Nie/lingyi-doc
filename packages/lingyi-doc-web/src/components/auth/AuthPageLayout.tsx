import React from 'react';
import { Link } from 'react-router-dom';
import './auth.css';

const BRAND_FEATURES = [
  '企业级安全与灵活部署',
  '私有化与信创适配',
  '全端数据实时同步',
];

interface AuthPageLayoutProps {
  children: React.ReactNode;
}

export const AuthPageLayout: React.FC<AuthPageLayoutProps> = ({ children }) => (
  <div className="auth-page">
    <aside className="auth-brand">
      <Link to="/" className="auth-brand-mark" aria-label="零一文档首页">
        <span className="auth-brand-mark-icon" aria-hidden>零</span>
        <span className="auth-brand-mark-name">零一文档</span>
      </Link>

      <div className="auth-brand-center">
        <div className="auth-brand-content">
          <h1 className="auth-brand-title">
            <span>一站式智能协同</span>
            <span>文档平台</span>
          </h1>
          <p className="auth-brand-desc">
            覆盖文档、多维表、画板、问卷、PPT、思维导图、流程图全场景创作
          </p>
          <ul className="auth-brand-features">
            {BRAND_FEATURES.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </aside>

    <main className="auth-panel">
      {children}
    </main>
  </div>
);
