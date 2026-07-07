import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authStore } from '../../stores/authStore';
import { appPath } from '../../utils/appPaths';
import { AppLogoWithName } from '../../components/AppLogo';
import { DemoModal } from './DemoModal';
import {
  ENTERPRISE_CARDS,
  FEATURE_ITEMS,
  FOOTER_COLUMNS,
  HERO_CAROUSEL,
  HERO_CHECKS,
  INDUSTRY_CARDS,
  NAV_LINKS,
  PRICING_PLANS,
  VALUE_CARDS,
} from './homeData';
import './home.css';

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const authState = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const isLoggedIn = Boolean(authState.accessToken);
  const [demoOpen, setDemoOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const openDemo = useCallback(() => setDemoOpen(true), []);
  const closeDemo = useCallback(() => setDemoOpen(false), []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCarouselIndex(i => (i + 1) % HERO_CAROUSEL.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  const goRegister = () => navigate('/register');
  const goWorkspace = () => navigate(appPath.home);

  return (
    <div className="home-page">
      {/* 导航栏 */}
      <header className="home-nav">
        <div className="home-nav-inner">
          <a href="#" className="home-logo" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <AppLogoWithName size={32} fontSize={18} fontWeight={700} color="var(--home-text)" />
          </a>
          <nav className="home-nav-links">
            {NAV_LINKS.map(link => (
              <a key={link.label} href={link.href}>{link.label}</a>
            ))}
          </nav>
          <div className="home-nav-actions">
            {isLoggedIn ? (
              <button type="button" className="home-btn home-btn-primary" onClick={goWorkspace}>
                进入工作台
              </button>
            ) : (
              <>
                <Link to="/login" className="home-btn home-btn-ghost">登录注册</Link>
                <button type="button" className="home-btn home-btn-primary" onClick={openDemo}>预约演示</button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <div>
            <span className="home-hero-tag">一站式智能协同文档平台</span>
            <h1>让知识与协作更高效</h1>
            <p className="home-hero-desc">
              覆盖文档、多维表、画板、问卷、PPT、思维导图、流程图全场景创作，满足个人、团队与企业级知识管理需求
            </p>
            <div className="home-hero-actions">
              {isLoggedIn ? (
                <button type="button" className="home-btn home-btn-white home-btn-lg" onClick={goWorkspace}>
                  进入工作台
                </button>
              ) : (
                <button type="button" className="home-btn home-btn-white home-btn-lg" onClick={goRegister}>
                  立即免费试用
                </button>
              )}
              <button type="button" className="home-btn home-btn-outline-white home-btn-lg" onClick={openDemo}>
                预约演示
              </button>
            </div>
            <div className="home-hero-checks">
              {HERO_CHECKS.map(text => (
                <span key={text} className="home-hero-check">
                  <CheckIcon />
                  {text}
                </span>
              ))}
            </div>
          </div>
          <div className="home-hero-visual">
            <div className="home-hero-carousel" key={carouselIndex}>
              产品界面轮播占位<br />
              {HERO_CAROUSEL[carouselIndex]}
            </div>
            <div className="home-hero-dots">
              {HERO_CAROUSEL.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`home-hero-dot${i === carouselIndex ? ' active' : ''}`}
                  aria-label={`轮播 ${i + 1}`}
                  onClick={() => setCarouselIndex(i)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 价值主张 */}
      <section className="home-section home-section-gray">
        <div className="home-section-inner">
          <h2 className="home-section-title">不止是在线文档，更是全场景知识工作台</h2>
          <div className="home-value-grid">
            {VALUE_CARDS.map(card => (
              <article key={card.title} className="home-value-card">
                <div className="home-value-icon" style={{ background: card.color }} />
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 功能预览 */}
      <section className="home-section" id="features">
        <div className="home-section-inner">
          <h2 className="home-section-title">覆盖全场景创作需求</h2>
          <p className="home-section-subtitle">从文档到数据，从思维到演示，一站式满足团队全部创作场景</p>
          <div className="home-feature-layout">
            <div className="home-feature-preview">
              <div className="home-feature-preview-frame">
                <img
                  key={FEATURE_ITEMS[activeFeature].previewImage}
                  src={FEATURE_ITEMS[activeFeature].previewImage}
                  alt={FEATURE_ITEMS[activeFeature].title}
                  className="home-feature-preview-image"
                />
              </div>
            </div>
            <div className="home-feature-list">
              {FEATURE_ITEMS.map((item, i) => (
                <div
                  key={item.title}
                  className={`home-feature-item${i === activeFeature ? ' active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveFeature(i)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setActiveFeature(i); }}
                >
                  <h4>{item.title}</h4>
                  <p>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 企业级安全 */}
      <section className="home-section home-section-gray">
        <div className="home-section-inner">
          <h2 className="home-section-title">企业级安全与灵活部署</h2>
          <p className="home-section-subtitle">满足不同规模组织的安全合规与定制化需求</p>
          <div className="home-enterprise-grid">
            {ENTERPRISE_CARDS.map(card => (
              <article key={card.title} className="home-enterprise-card">
                <div className="home-enterprise-icon" style={{ background: card.color }} />
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 行业方案 */}
      <section className="home-section" id="industry">
        <div className="home-section-inner">
          <h2 className="home-section-title">覆盖多行业场景，打造专属协作方案</h2>
          <div className="home-industry-grid" style={{ marginTop: 48 }}>
            {INDUSTRY_CARDS.map(card => (
              <article key={card.title} className="home-industry-card">
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 定价 */}
      <section className="home-section home-section-gray" id="pricing">
        <div className="home-section-inner">
          <h2 className="home-section-title">灵活定价，适配不同规模团队与企业</h2>
          <div className="home-pricing-grid" style={{ marginTop: 48 }}>
            {PRICING_PLANS.map(plan => (
              <article key={plan.name} className={`home-pricing-card${plan.recommended ? ' recommended' : ''}`}>
                {plan.recommended && <span className="home-pricing-badge">推荐</span>}
                <div className="home-pricing-name">{plan.name}</div>
                <div className="home-pricing-price">
                  {plan.price}
                  {plan.unit && <span className="home-pricing-unit"> {plan.unit}</span>}
                </div>
                <div className="home-pricing-audience">{plan.audience}</div>
                <ul className="home-pricing-features">
                  {plan.features.map(f => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {plan.variant === 'dark' ? (
                  <button type="button" className="home-btn home-btn-dark home-btn-block" onClick={openDemo}>
                    {plan.cta}
                  </button>
                ) : plan.variant === 'primary' ? (
                  <button type="button" className="home-btn home-btn-primary home-btn-block" onClick={goRegister}>
                    {plan.cta}
                  </button>
                ) : (
                  <button type="button" className="home-btn home-btn-outline home-btn-block" onClick={goRegister}>
                    {plan.cta}
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 定制方案 CTA */}
      <section className="home-contact">
        <div className="home-contact-inner">
          <div>
            <h2>想要定制专属的文档协作方案？</h2>
            <p className="home-contact-desc">
              专业顾问 1 对 1 对接，提供产品演示、方案定制、报价咨询全流程服务
            </p>
            <div className="home-contact-info">
              <span className="home-contact-item">📞 商务咨询热线：400-XXX-XXXX</span>
              <span className="home-contact-item">✉️ 商务合作邮箱：business@zhibencloud.com</span>
              <div className="home-contact-qr">扫码添加<br />商务顾问企业微信</div>
            </div>
          </div>
          <button type="button" className="home-btn home-btn-primary home-btn-lg" onClick={openDemo}>
            立即预约演示 →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer" id="help">
        <div className="home-footer-inner">
          <div className="home-footer-grid">
            {FOOTER_COLUMNS.map(col => (
              <div key={col.title} className="home-footer-col">
                <h4>{col.title}</h4>
                <ul>
                  {col.links.map(link => (
                    <li key={link}><a href="#">{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="home-footer-col">
              <h4>联系我们</h4>
              <ul>
                <li><span>客服电话：400-XXX-XXXX</span></li>
                <li><span>商务合作：business@zhibencloud.com</span></li>
              </ul>
            </div>
          </div>
          <div className="home-footer-bottom">
            © 2026 零一文档 版权所有 | ICP 备案号 | 公安备案号
          </div>
        </div>
      </footer>

      <DemoModal open={demoOpen} onClose={closeDemo} />
    </div>
  );
};

export default HomePage;
