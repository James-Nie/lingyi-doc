import React, { useRef } from 'react';
import { CreateDocMenu, type CreateDocType } from './CreateDocMenu';
import { SidebarIconBtn } from './layout/sidebar/SidebarIconBtn';

interface CreateDocSidebarTriggerProps {
  title?: string;
  context?: 'default' | 'wikiSpace';
  menuOpen: boolean;
  menuAnchor: DOMRect | null;
  onToggle: (anchor: DOMRect) => void;
  onClose: () => void;
  onCreate: (type: CreateDocType) => void;
  onStub: (name: string) => void;
  onCreateFolder?: () => void;
  onMigrate?: () => void;
  onCreateKnowledgeBase?: () => void;
}

/** 侧栏目录区「+」：与主页一致的类型选择菜单 */
export const CreateDocSidebarTrigger: React.FC<CreateDocSidebarTriggerProps> = ({
  title = '新建',
  context = 'default',
  menuOpen,
  menuAnchor,
  onToggle,
  onClose,
  onCreate,
  onStub,
  onCreateFolder,
  onMigrate,
  onCreateKnowledgeBase,
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <SidebarIconBtn
        ref={btnRef}
        title={title}
        active={menuOpen}
        onClick={() => {
          const rect = btnRef.current?.getBoundingClientRect();
          if (rect) onToggle(rect);
        }}
      >
        +
      </SidebarIconBtn>
      <CreateDocMenu
        open={menuOpen}
        variant="dropdown"
        context={context}
        placement="sidebar-right"
        anchorRect={menuAnchor}
        onClose={onClose}
        onCreate={onCreate}
        onStub={onStub}
        onCreateFolder={onCreateFolder}
        onMigrate={onMigrate}
        onCreateKnowledgeBase={onCreateKnowledgeBase}
      />
    </>
  );
};
