import React, { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { UserAccountMenu } from '../../auth/UserAccountMenu';
import { authStore } from '../../../stores/authStore';
import { CreateDocTopBarTrigger } from '../../CreateDocTopBarTrigger';
import { useOptionalCreateDocument } from '../../../hooks/useCreateDocument';
import { DocumentMoreMenu, type DocumentMoreMenuItem } from './DocumentMoreMenu';
import { TopBarDivider } from './TopBarDivider';
import { TopBarIconButton } from './TopBarIconButton';
import { TopBarShareButton } from './TopBarShareButton';

export interface TopBarToolbarProps {
  onStub?: (name: string) => void;
  onShare?: () => void;
  onMoreAction?: (key: string) => void;
  moreMenuItems?: DocumentMoreMenuItem[];
  showShare?: boolean;
  showNotification?: boolean;
  showMore?: boolean;
  showSearch?: boolean;
  showCreate?: boolean;
  extra?: React.ReactNode;
}

export const TopBarToolbar: React.FC<TopBarToolbarProps> = ({
  onStub,
  onShare,
  onMoreAction,
  moreMenuItems,
  showShare = true,
  showNotification = true,
  showMore = true,
  showSearch = true,
  showCreate = true,
  extra,
}) => {
  const authState = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const createDoc = useOptionalCreateDocument();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLDivElement>(null);
  const [moreAnchor, setMoreAnchor] = useState<DOMRect | null>(null);

  const stub = useCallback((name: string) => onStub?.(name), [onStub]);

  const handleShare = () => {
    if (onShare) onShare();
    else stub('分享');
  };

  const handleMoreAction = (key: string) => {
    setMoreOpen(false);
    if (onMoreAction) onMoreAction(key);
    else stub(key);
  };

  const openMoreMenu = () => {
    const rect = moreBtnRef.current?.getBoundingClientRect() ?? null;
    setMoreAnchor(rect);
    setMoreOpen(v => !v);
    createDoc.closeMenu();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {extra}

      {showShare && <TopBarShareButton onClick={handleShare} />}

      {showNotification && (
        <TopBarIconButton title="通知" onClick={() => stub('通知')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </TopBarIconButton>
      )}

      {showMore && (
        <div ref={moreBtnRef} style={{ position: 'relative' }}>
          <TopBarIconButton
            title="更多"
            active={moreOpen}
            filled
            onClick={openMoreMenu}
          >
            <span style={{ fontSize: 16, lineHeight: 1, letterSpacing: 1 }}>···</span>
          </TopBarIconButton>
        </div>
      )}

      {(showSearch || showCreate) && <TopBarDivider />}

      {showSearch && (
        <TopBarIconButton title="搜索" onClick={() => stub('搜索')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
          </svg>
        </TopBarIconButton>
      )}

      {showCreate && createDoc.available && (
        <CreateDocTopBarTrigger
          menuOpen={createDoc.menuOpen}
          onToggle={() => {
            createDoc.setMenuOpen(v => !v);
            setMoreOpen(false);
          }}
          onClose={createDoc.closeMenu}
          onCreate={createDoc.handlePickDocType}
          onStub={stub}
          onCreateKnowledgeBase={createDoc.openCreateKnowledgeBase}
        />
      )}

      <TopBarDivider />

      <UserAccountMenu
        variant="avatar"
        displayName={authState.user?.displayName}
        email={authState.user?.email}
      />

      <DocumentMoreMenu
        open={moreOpen}
        anchorRect={moreAnchor}
        items={moreMenuItems}
        onClose={() => setMoreOpen(false)}
        onAction={handleMoreAction}
      />
    </div>
  );
};
