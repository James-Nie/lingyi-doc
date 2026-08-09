import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { authStore } from '../../stores/authStore';

const SHOWN_KEY = 'lingyi_membership_warn_shown';

/** 配额使用超过 80% 或只读态时提示用户 */
export const MembershipQuotaBanner: React.FC = () => {
  const summary = useSyncExternalStore(authStore.subscribe, () => authStore.getState().membershipSummary);
  const shownRef = useRef<string | null>(sessionStorage.getItem(SHOWN_KEY));

  useEffect(() => {
    if (!summary) return;
    const signature = JSON.stringify({
      readOnly: summary.readOnly,
      warnings: summary.warnings.map(w => w.metric),
    });
    if (shownRef.current === signature) return;
    shownRef.current = signature;
    sessionStorage.setItem(SHOWN_KEY, signature);
  }, [summary]);

  if (!summary) return null;

  if (summary.readOnly) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 520,
        padding: '12px 16px',
        background: '#fff2f0',
        border: '1px solid #ffccc7',
        borderRadius: 8,
        fontSize: 13,
        color: '#cf1322',
        zIndex: 190,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}>
        当前空间配额已超限，文档仅可只读查看。请升级会员或清理空间后恢复编辑。
      </div>
    );
  }

  const warning = summary.warnings[0];
  if (!warning) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 520,
      padding: '12px 16px',
      background: '#fffbe6',
      border: '1px solid #ffe58f',
      borderRadius: 8,
      fontSize: 13,
      color: '#ad6800',
      zIndex: 190,
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    }}>
      {warning.message}
    </div>
  );
};
