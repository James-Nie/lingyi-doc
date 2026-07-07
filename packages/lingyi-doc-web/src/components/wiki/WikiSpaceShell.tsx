import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { Outlet } from 'react-router-dom';
import { TemplatePickerProvider } from '../templates/TemplatePickerContext';
import { DuplicateTitleModal } from '../DuplicateTitleModal';
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

/** 知识库空间独立壳层：无全局侧栏，保留模板选择器 */
export const WikiSpaceShell: React.FC = () => {
  const [toast, setToast] = useState<string | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState<string | null>(null);
  const workspaceRevision = useSyncExternalStore(
    authStore.subscribe,
    authStore.getWorkspaceRevision,
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  return (
    <TemplatePickerProvider
      onError={showToast}
      onDuplicateTitle={setDuplicateTitle}
    >
      <div style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        minWidth: 0,
        overflow: 'hidden',
        background: '#fff',
      }}>
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Outlet key={workspaceRevision} />
        </main>
      </div>
      {toast && <Toast message={toast} />}
      <DuplicateTitleModal title={duplicateTitle} onClose={() => setDuplicateTitle(null)} />
    </TemplatePickerProvider>
  );
};
