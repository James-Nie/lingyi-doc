import React, { useState } from 'react';
import { Modal, Input, Select, message } from 'antd';
import {
  DEMO_COMPANY_SIZE_OPTIONS,
  DEMO_HELP_ITEMS,
  DEMO_PRODUCT_OPTIONS,
  DEMO_SCENARIO_OPTIONS,
} from './homeData';
import { submitDemoRequest } from '../../api/demoRequest';
import { AppLogo, AppLogoWithName } from '../../components/AppLogo';
import './demoModal.css';

const { TextArea } = Input;

interface DemoFormState {
  name: string;
  phone: string;
  product: string[];
  company: string;
  companySize: string | undefined;
  scenario: string | undefined;
  questions: string;
}

const EMPTY_FORM: DemoFormState = {
  name: '',
  phone: '',
  product: [],
  company: '',
  companySize: undefined,
  scenario: undefined,
  questions: '',
};

interface DemoModalProps {
  open: boolean;
  onClose: () => void;
}

function DemoIllustration() {
  return (
    <svg className="home-demo-illustration" viewBox="0 0 320 200" fill="none" aria-hidden>
      <rect x="40" y="60" width="240" height="120" rx="8" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="1.5" />
      <rect x="56" y="120" width="32" height="48" rx="4" fill="#93c5fd" />
      <rect x="96" y="100" width="32" height="68" rx="4" fill="#60a5fa" />
      <rect x="136" y="88" width="32" height="80" rx="4" fill="#3b82f6" />
      <rect x="176" y="108" width="32" height="60" rx="4" fill="#60a5fa" />
      <path d="M56 108 Q120 80 200 96 T264 88" stroke="#93c5fd" strokeWidth="2" fill="none" />
      <circle cx="72" cy="48" r="14" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1.5" />
      <path d="M64 58 L72 48 L80 56" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="248" cy="44" r="14" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1.5" />
      <rect x="240" y="38" width="16" height="12" rx="2" fill="#93c5fd" />
      <circle cx="160" cy="36" r="16" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1.5" />
      <rect x="148" y="28" width="24" height="16" rx="3" fill="#fff" stroke="#bfdbfe" />
      <rect x="152" y="32" width="8" height="6" rx="1" fill="#93c5fd" />
      <rect x="162" y="32" width="8" height="6" rx="1" fill="#60a5fa" />
      <rect x="220" y="24" width="28" height="22" rx="4" fill="#fff" stroke="#bfdbfe" strokeWidth="1.5" />
      <circle cx="234" cy="35" r="6" fill="#fef3c7" stroke="#fcd34d" strokeWidth="1" />
      <rect x="28" y="28" width="28" height="22" rx="4" fill="#fff" stroke="#bfdbfe" strokeWidth="1.5" />
      <path d="M36 42 L42 36 L48 44" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HelpCheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#dcfce7" />
      <path d="M5 8l2 2 4-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="home-demo-field-label">
      <span className="home-demo-required">*</span>
      {children}
    </label>
  );
}

export const DemoModal: React.FC<DemoModalProps> = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<DemoFormState>(EMPTY_FORM);

  const resetAndClose = () => {
    setForm(EMPTY_FORM);
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      message.warning('请填写姓名');
      return;
    }
    if (!form.phone.trim()) {
      message.warning('请填写联系电话');
      return;
    }
    if (!form.product.length) {
      message.warning('请至少选择一项申请演示的产品');
      return;
    }
    if (!form.company.trim()) {
      message.warning('请填写公司名称');
      return;
    }
    if (!form.companySize) {
      message.warning('请选择企业规模');
      return;
    }
    if (!form.scenario) {
      message.warning('请选择使用场景');
      return;
    }
    if (!form.questions.trim()) {
      message.warning('请填写主要想了解的问题');
      return;
    }

    setLoading(true);
    try {
      const result = await submitDemoRequest({
        name: form.name.trim(),
        phone: form.phone.trim(),
        company: form.company.trim(),
        companySize: form.companySize!,
        scenario: form.scenario!,
        products: form.product,
        questions: form.questions.trim(),
      });
      message.success(result.message || '申请已提交，顾问将尽快与您联系');
      setForm(EMPTY_FORM);
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={resetAndClose}
      footer={null}
      width={860}
      centered
      destroyOnClose
      closable={false}
      className="home-demo-modal"
    >
      <button type="button" className="home-demo-close" aria-label="关闭" onClick={resetAndClose}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="home-demo-layout">
        <aside className="home-demo-aside">
          <div className="home-demo-aside-header">
            <AppLogo size={22} className="home-demo-aside-logo" />
            <span className="home-demo-aside-brand">零一文档</span>
            <span className="home-demo-aside-divider" />
            <span className="home-demo-aside-title">申请演示</span>
          </div>

          <DemoIllustration />

          <p className="home-demo-aside-heading">
            我们很乐意为您提供以下帮助，以加深您对零一文档的了解
          </p>

          <ul className="home-demo-help-list">
            {DEMO_HELP_ITEMS.map(item => (
              <li key={item}>
                <HelpCheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>

        <form
          className="home-demo-form"
          onSubmit={e => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="home-demo-field">
            <RequiredLabel>姓名：</RequiredLabel>
            <Input
              placeholder="希望我们怎么称呼您"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="home-demo-field">
            <RequiredLabel>联系电话：</RequiredLabel>
            <Input
              placeholder="请输入您的联系电话"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>

          <div className="home-demo-field">
            <RequiredLabel>申请演示的产品：</RequiredLabel>
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择申请演示的产品（可多选）"
              value={form.product}
              onChange={v => setForm(f => ({ ...f, product: v }))}
              options={DEMO_PRODUCT_OPTIONS.map(v => ({ label: v, value: v }))}
              style={{ width: '100%' }}
              maxTagCount="responsive"
            />
          </div>

          <div className="home-demo-field">
            <RequiredLabel>公司名称：</RequiredLabel>
            <Input
              placeholder="请输入公司的全称"
              value={form.company}
              onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
            />
          </div>

          <div className="home-demo-field">
            <RequiredLabel>企业规模：</RequiredLabel>
            <Select
              placeholder="请选择您企业的规模"
              value={form.companySize}
              onChange={v => setForm(f => ({ ...f, companySize: v }))}
              options={DEMO_COMPANY_SIZE_OPTIONS.map(v => ({ label: v, value: v }))}
              style={{ width: '100%' }}
            />
          </div>

          <div className="home-demo-field">
            <RequiredLabel>使用场景：</RequiredLabel>
            <Select
              placeholder="请选择使用场景"
              value={form.scenario}
              onChange={v => setForm(f => ({ ...f, scenario: v }))}
              options={DEMO_SCENARIO_OPTIONS.map(v => ({ label: v, value: v }))}
              style={{ width: '100%' }}
            />
          </div>

          <div className="home-demo-field">
            <RequiredLabel>主要想了解的问题：</RequiredLabel>
            <TextArea
              placeholder="请输入您主要想了解的问题"
              rows={4}
              value={form.questions}
              onChange={e => setForm(f => ({ ...f, questions: e.target.value }))}
            />
          </div>

          <button type="submit" className="home-demo-submit" disabled={loading}>
            {loading ? '提交中…' : '提交申请'}
          </button>
        </form>
      </div>
    </Modal>
  );
};
