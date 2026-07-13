import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { TemplatePickerProvider } from '../templates/TemplatePickerContext';
import { DuplicateTitleModal } from '../DuplicateTitleModal';
import { MembershipQuotaBanner } from '../membership/MembershipQuotaBanner';
import { authStore } from '../../stores/authStore';

function Toast({ message }: { message: string }) {
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      padding: '10px 18px', background: '#1f2329', color: '#fff',
      borderRadius: 8, fontSize: 13, zIndex: 200,
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }}>
      {message}
    </div>
  );
}

/** 全局应用壳：左侧菜单 + 主内容区（编辑页/主页共用） */
export const AppShellFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<string | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState<string | null>(null);
  const workspaceRevision = useSyncExternalStore(
    authStore.subscribe,
    () => authStore.getWorkspaceRevision(),
  );

  const showStub = useCallback((name: string) => {
    setToast(`${name}功能开发中`);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  return (
    <TemplatePickerProvider
      onError={showToast}
      onDuplicateTitle={setDuplicateTitle}
      onToast={showToast}
    >
      <div style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        minWidth: 0,
        overflow: 'hidden',
        background: '#fff',
      }}>
        <AppSidebar onStub={showStub} onToast={showToast} workspaceRevision={workspaceRevision} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {children}
          </main>
        </div>
        {toast && <Toast message={toast} />}
        <MembershipQuotaBanner />
        <DuplicateTitleModal title={duplicateTitle} onClose={() => setDuplicateTitle(null)} />
      </div>
    </TemplatePickerProvider>
  );
};

export const AppShell: React.FC = () => {
  const workspaceRevision = useSyncExternalStore(
    authStore.subscribe,
    () => authStore.getWorkspaceRevision(),
  );
  return (
    <AppShellFrame>
      <Outlet key={workspaceRevision} />
    </AppShellFrame>
  );
};

interface AppLayoutProps {
  children: React.ReactNode;
  onStub?: (name: string) => void;
}

/** @deprecated 请使用 AppShell 路由布局 */
export const AppLayout: React.FC<AppLayoutProps> = ({ children, onStub }) => (
  <div style={{ display: 'flex', width: '100%', height: '100%', background: '#fff' }}>
    <AppSidebar onStub={onStub} />
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {children}
    </main>
  </div>
);
