import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { authStore } from '../stores/authStore';
import { CREATE_MENU_KEY_TO_MODULE, isModuleEnabled } from '../utils/membershipModules';

const VIEWPORT_PAD = 8;

export type CreateDocType =
  | 'freeform' | 'base' | 'richtext' | 'mindnote' | 'slides' | 'whiteboard' | 'questionnaire'
  | 'mindmap' | 'flowchart';

interface CreateDocMenuProps {
  open: boolean;
  onClose: () => void;
  onCreate: (type: CreateDocType) => void;
  onStub: (name: string) => void;
  onMigrate?: () => void;
  onCreateFolder?: () => void;
  onCreateKnowledgeBase?: () => void;
  variant?: 'card' | 'dropdown';
  context?: 'default' | 'wikiSpace';
  placement?: 'below' | 'sidebar-right';
  /** sidebar-right 时用于 portal 定位，避免被侧栏 overflow 裁剪 */
  anchorRect?: DOMRect | null;
}

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  chevron?: boolean;
}

function TypeIcon({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      width: 28, height: 28, borderRadius: 6, background: bg, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </span>
  );
}

const DOC_TYPES: MenuItem[] = [
  {
    key: 'doc',
    label: '文档',
    icon: <TypeIcon bg="#e8f0fe"><svg width="16" height="16" viewBox="0 0 24 24" fill="#3370ff"><path d="M6 4h12v16H6V4zm2 3h8v2H8V7zm0 4h8v2H8v-2zm0 4h5v2H8v-2z" /></svg></TypeIcon>,
    onClick: () => {},
  },
  {
    key: 'sheet',
    label: '表格',
    icon: <TypeIcon bg="#e6f4ea"><svg width="16" height="16" viewBox="0 0 24 24" fill="#34a853"><path d="M4 4h16v16H4V4zm2 2v4h4V6H6zm6 0v4h6V6h-6zM6 12v4h4v-4H6zm6 0v4h6v-4h-6zM6 18v2h4v-2H6zm6 0v2h6v-2h-6z" /></svg></TypeIcon>,
    onClick: () => {},
  },
  {
    key: 'slides',
    label: '幻灯片',
    icon: <TypeIcon bg="#fef3e6"><svg width="16" height="16" viewBox="0 0 24 24" fill="#f57c00"><circle cx="12" cy="12" r="6" fill="none" stroke="#f57c00" strokeWidth="2" /><path d="M12 8v8M8 12h8" stroke="#f57c00" strokeWidth="1.5" /></svg></TypeIcon>,
    onClick: () => {},
  },
  {
    key: 'base',
    label: '多维表格',
    icon: <TypeIcon bg="#f3e8fd"><svg width="16" height="16" viewBox="0 0 24 24" fill="#9333ea"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 3h7v4h-7v-4z" /></svg></TypeIcon>,
    onClick: () => {},
  },
  {
    key: 'form',
    label: '问卷',
    icon: <TypeIcon bg="#fef9e6"><svg width="16" height="16" viewBox="0 0 24 24" fill="#f9ab00"><path d="M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-3 3V6a2 2 0 0 1 2-2z" fill="none" stroke="#f9ab00" strokeWidth="2" /></svg></TypeIcon>,
    onClick: () => {},
  },
  {
    key: 'mind',
    label: '思维笔记',
    icon: <TypeIcon bg="#e0f7fa"><svg width="16" height="16" viewBox="0 0 24 24" fill="#00acc1"><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 12h8M16 7l-2 3M16 17l-2-3" stroke="#00acc1" strokeWidth="1.5" /></svg></TypeIcon>,
    onClick: () => {},
  },
];

const APP_TYPES: MenuItem[] = [
  {
    key: 'whiteboard',
    label: '画板',
    icon: <TypeIcon bg="#e6f4ea"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34a853" strokeWidth="2"><path d="M4 20l8-14 12 14H4z" /></svg></TypeIcon>,
    onClick: () => {},
  },
  {
    key: 'mindmap',
    label: '思维导图',
    icon: <TypeIcon bg="#e8f0fe"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3370ff" strokeWidth="2"><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 12h8M16 7l-2 3M16 17l-2-3" /></svg></TypeIcon>,
    onClick: () => {},
  },
  {
    key: 'flow',
    label: '流程图',
    icon: <TypeIcon bg="#fef3e6"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f57c00" strokeWidth="2"><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="9" y="15" width="6" height="6" rx="1" /><path d="M6 9v3h6v3M18 9v6h-3" /></svg></TypeIcon>,
    onClick: () => {},
  },
];

function bindDocTypeItems(
  onCreate: (type: CreateDocType) => void,
  onStub: (name: string) => void,
  onClose: () => void,
): MenuItem[] {
  const map: Record<string, () => void> = {
    doc: () => onCreate('richtext'),
    sheet: () => onCreate('freeform'),
    slides: () => onCreate('slides'),
    base: () => onCreate('base'),
    form: () => onCreate('questionnaire'),
    mind: () => onCreate('mindnote'),
  };
  return DOC_TYPES.map(item => ({
    ...item,
    onClick: () => {
      map[item.key]?.();
      onClose();
    },
  }));
}

function bindAppTypeItems(
  onCreate: (type: CreateDocType) => void,
  onStub: (name: string) => void,
  onClose: () => void,
): MenuItem[] {
  const map: Record<string, () => void> = {
    whiteboard: () => onCreate('whiteboard'),
    mindmap: () => onCreate('mindmap'),
    flow: () => onCreate('flowchart'),
  };
  return APP_TYPES.map(item => ({
    ...item,
    onClick: () => {
      map[item.key]?.();
      onClose();
    },
  }));
}

export const CreateDocMenu: React.FC<CreateDocMenuProps> = ({
  open,
  onClose,
  onCreate,
  onStub,
  onMigrate,
  onCreateFolder,
  onCreateKnowledgeBase,
  variant = 'card',
  context = 'default',
  placement = 'below',
  anchorRect = null,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isDropdown = variant === 'dropdown';
  const isWikiSpace = context === 'wikiSpace';
  const usePortal = placement === 'sidebar-right';
  const modules = useSyncExternalStore(
    authStore.subscribe,
    () => authStore.getState().membershipSummary?.modules,
  );
  const docTypes = useMemo(
    () => bindDocTypeItems(onCreate, onStub, onClose).filter(
      (item) => {
        const mod = CREATE_MENU_KEY_TO_MODULE[item.key];
        return !mod || isModuleEnabled(modules, mod);
      },
    ),
    [onCreate, onStub, onClose, modules],
  );
  const appTypes = useMemo(
    () => bindAppTypeItems(onCreate, onStub, onClose).filter(
      (item) => {
        const mod = CREATE_MENU_KEY_TO_MODULE[item.key];
        return !mod || isModuleEnabled(modules, mod);
      },
    ),
    [onCreate, onStub, onClose, modules],
  );
  const knowledgeEnabled = isModuleEnabled(modules, 'mod.knowledge');
  const [portalStyle, setPortalStyle] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !usePortal || !anchorRect || !ref.current) {
      setPortalStyle(null);
      return;
    }

    const menu = ref.current;
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    let left = anchorRect.right + 6;
    if (left + menuWidth > window.innerWidth - VIEWPORT_PAD) {
      left = anchorRect.left - menuWidth - 6;
    }
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - menuWidth - VIEWPORT_PAD));

    let top = anchorRect.top;
    if (top + menuHeight > window.innerHeight - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, window.innerHeight - VIEWPORT_PAD - menuHeight);
    }

    setPortalStyle({ top, left });
  }, [open, usePortal, anchorRect]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const wikiItem: MenuItem = {
    key: 'wiki',
    label: '知识库',
    icon: <TypeIcon bg="linear-gradient(135deg, #e8f0fe 0%, #e6f4ea 100%)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 19V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14" stroke="#3370ff" strokeWidth="2" /><path d="M8 7h8M8 11h8M8 15h5" stroke="#34a853" strokeWidth="2" /></svg></TypeIcon>,
    onClick: () => {
      if (onCreateKnowledgeBase) onCreateKnowledgeBase();
      else onStub('知识库');
      onClose();
    },
  };

  const importItem: MenuItem = {
    key: 'import',
    label: '上传及导入',
    icon: <TypeIcon bg="#e8f0fe"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3370ff" strokeWidth="2"><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 20h16" /></svg></TypeIcon>,
    onClick: () => { onStub('上传及导入'); onClose(); },
    chevron: true,
  };

  const migrateItem: MenuItem = {
    key: 'migrate',
    label: '迁入已有云文档',
    icon: <TypeIcon bg="#e8f0fe"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3370ff" strokeWidth="2"><path d="M4 12h12M11 7l5 5-5 5" /><path d="M20 4v16" /></svg></TypeIcon>,
    onClick: () => {
      if (onMigrate) onMigrate();
      else onStub('迁入已有云文档');
      onClose();
    },
  };

  const menuPosition: React.CSSProperties = usePortal
    ? {
      position: 'fixed',
      top: portalStyle?.top ?? anchorRect?.top ?? 0,
      left: portalStyle?.left ?? (anchorRect ? anchorRect.right + 6 : 0),
      zIndex: 12000,
    }
    : {
      position: 'absolute',
      right: isDropdown ? 0 : undefined,
      left: isDropdown ? undefined : 0,
      top: '100%',
      marginTop: isDropdown ? 6 : 4,
    };

  const menuNode = (
    <div
      ref={ref}
      style={{
        ...menuPosition,
        width: isDropdown || isWikiSpace ? 220 : 240,
        background: '#fff',
        border: '1px solid #dee0e3',
        borderRadius: 8,
        boxShadow: '0 8px 28px rgba(31, 35, 41, 0.12)',
        zIndex: usePortal ? undefined : 200,
        overflow: 'hidden',
      }}
    >
      {!isDropdown && !isWikiSpace && (
        <div style={{
          padding: '12px 14px',
          background: '#f5f6f7',
          borderBottom: '1px solid #eee',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <TypeIcon bg="#e8f0fe">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#3370ff"><path d="M12 5v14M5 12h14" stroke="#3370ff" strokeWidth="2.5" strokeLinecap="round" /></svg>
          </TypeIcon>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2329' }}>新建</div>
            <div style={{ fontSize: 12, color: '#8f959e', marginTop: 2 }}>新建文档开始协作</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8f959e" strokeWidth="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </div>
      )}

      <div style={{ padding: '6px 0' }}>
        {docTypes.map(item => (
          <MenuRow key={item.key} item={item} />
        ))}
      </div>

      <div style={{ height: 1, background: '#eee', margin: '0 12px' }} />

      {(isWikiSpace || (!isDropdown && !isWikiSpace)) && (
        <>
          <div style={{ padding: '6px 0' }}>
            <MenuRow
              item={{
                key: 'folder',
                label: '文件夹',
                icon: <TypeIcon bg="#fef9e6"><svg width="16" height="16" viewBox="0 0 24 24" fill="#f9ab00"><path d="M4 8h6l2 2h8v10H4V8z" /></svg></TypeIcon>,
                onClick: () => {
                  if (isWikiSpace && onCreateFolder) onCreateFolder();
                  else onStub('文件夹');
                  onClose();
                },
              }}
            />
          </div>
          <div style={{ height: 1, background: '#eee', margin: '0 12px' }} />
        </>
      )}

      {!isWikiSpace && knowledgeEnabled && (
        <div style={{ padding: '6px 0' }}>
          <MenuRow item={wikiItem} />
        </div>
      )}

      {!isWikiSpace && knowledgeEnabled && <div style={{ height: 1, background: '#eee', margin: '0 12px' }} />}

      {appTypes.length > 0 && (
        <div style={{ padding: '8px 0 6px' }}>
          <div style={{ padding: '4px 14px 6px', fontSize: 12, color: '#8f959e' }}>画板</div>
          {appTypes.map(item => (
            <MenuRow key={item.key} item={item} />
          ))}
        </div>
      )}

      {(isDropdown || isWikiSpace) && (
        <>
          <div style={{ height: 1, background: '#eee', margin: '0 12px' }} />
          <div style={{ padding: '6px 0' }}>
            <MenuRow item={importItem} />
            {isWikiSpace && <MenuRow item={migrateItem} />}
          </div>
        </>
      )}
    </div>
  );

  if (usePortal) {
    return createPortal(menuNode, document.body);
  }

  return menuNode;
};

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <button
      type="button"
      onClick={item.onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', border: 'none', background: 'transparent',
        cursor: 'pointer', fontSize: 14, color: '#1f2329', textAlign: 'left',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {item.icon}
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.chevron && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2">
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}
