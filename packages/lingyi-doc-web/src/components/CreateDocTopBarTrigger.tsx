import React from 'react';
import { CreateDocMenu, type CreateDocType } from './CreateDocMenu';
import { TopBarIconButton } from './layout/topBar/TopBarIconButton';

interface CreateDocTopBarTriggerProps {
  menuOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCreate: (type: CreateDocType) => void;
  onStub: (name: string) => void;
  context?: 'default' | 'wikiSpace';
  onCreateFolder?: () => void;
  onMigrate?: () => void;
  onCreateKnowledgeBase?: () => void;
}

/** 顶栏「+」：与主页一致的类型选择菜单 */
export const CreateDocTopBarTrigger: React.FC<CreateDocTopBarTriggerProps> = ({
  menuOpen,
  onToggle,
  onClose,
  onCreate,
  onStub,
  context = 'default',
  onCreateFolder,
  onMigrate,
  onCreateKnowledgeBase,
}) => (
  <div style={{ position: 'relative' }}>
    <TopBarIconButton
      title="新建"
      filled
      active={menuOpen}
      onClick={onToggle}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </TopBarIconButton>
    <CreateDocMenu
      open={menuOpen}
      variant="dropdown"
      context={context}
      onClose={onClose}
      onCreate={onCreate}
      onStub={onStub}
      onCreateFolder={onCreateFolder}
      onMigrate={onMigrate}
      onCreateKnowledgeBase={onCreateKnowledgeBase}
    />
  </div>
);
