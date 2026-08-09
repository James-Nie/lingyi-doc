import React, { useCallback, useState, useSyncExternalStore, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { TemplatePickerProvider } from '../templates/TemplatePickerContext';
import { DuplicateTitleModal } from '../DuplicateTitleModal';
import { MembershipQuotaBanner } from '../membership/MembershipQuotaBanner';
import { authStore } from '../../stores/authStore';
import { globalSearchStore } from '../../stores/globalSearchStore';
import { GlobalSearch } from '../search/GlobalSearch';

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
  const [searchOpen, setSearchOpen] = useState(false);
  const workspaceRevision = useSyncExternalStore(
    authStore.subscribe,
    () => authStore.getWorkspaceRevision(),
  );

  // 同步全局搜索 store 状态
  useSyncExternalStore(
    globalSearchStore.subscribe,
    () => globalSearchStore.getState().open,
  );

  useEffect(() => {
    const unsubscribe = globalSearchStore.subscribe(() => {
      setSearchOpen(globalSearchStore.getState().open);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const showStub = useCallback((name: string) => {
    setToast(`${name}功能开发中`);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  // 全局快捷键：Cmd/Ctrl+K 打开搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        globalSearchStore.open();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
        <AppSidebar
          onStub={showStub}
          onToast={showToast}
          workspaceRevision={workspaceRevision}
          onOpenGlobalSearch={() => globalSearchStore.open()}
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {children}
          </main>
        </div>
        {toast && <Toast message={toast} />}
        <MembershipQuotaBanner />
        <DuplicateTitleModal title={duplicateTitle} onClose={() => setDuplicateTitle(null)} />
        <GlobalSearch open={searchOpen} onClose={() => globalSearchStore.close()} />
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
