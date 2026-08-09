import { useState, type Dispatch, type SetStateAction } from 'react';
import type { CreateDocType } from '../components/CreateDocMenu';
import { useOptionalTemplatePicker, useTemplatePicker, type WikiKbContext } from '../components/templates/TemplatePickerContext';

export interface UseCreateDocumentOptions {
  /** 动态获取知识库上下文（创建到知识库目录时使用） */
  getKbContext?: () => WikiKbContext | undefined;
  /** 知识库空间内创建文件夹 */
  onCreateFolder?: () => void;
}

export interface CreateDocumentControls {
  available: boolean;
  menuOpen: boolean;
  menuAnchor: DOMRect | null;
  handlePickDocType: (type: CreateDocType) => void;
  openTemplateLibrary: () => void;
  openCreateKnowledgeBase: () => void;
  closeMenu: () => void;
  openMenuAt: (anchor: DOMRect) => void;
  toggleMenuAt: (anchor: DOMRect) => void;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  onCreateFolder?: () => void;
}

function buildCreateDocumentControls(
  picker: {
    openTemplatePicker: (opts?: { typeFilter?: 'all' | import('../templates/docTemplates').TemplateDocType; kbContext?: WikiKbContext }) => void;
    createFromMenu: (type: CreateDocType, kbContext?: WikiKbContext) => Promise<void>;
    openCreateKnowledgeBase: () => void;
  } | null,
  options: UseCreateDocumentOptions | undefined,
  menuOpen: boolean,
  setMenuOpen: Dispatch<SetStateAction<boolean>>,
  menuAnchor: DOMRect | null,
  setMenuAnchor: Dispatch<SetStateAction<DOMRect | null>>,
): CreateDocumentControls {
  const resolveKbContext = (): WikiKbContext | undefined => options?.getKbContext?.();

  const handlePickDocType = (type: CreateDocType) => {
    if (!picker) return;
    setMenuOpen(false);
    setMenuAnchor(null);
    void picker.createFromMenu(type, resolveKbContext());
  };

  const openTemplateLibrary = () => {
    if (!picker) return;
    picker.openTemplatePicker({ kbContext: resolveKbContext() });
  };

  const openCreateKnowledgeBase = () => {
    if (!picker) return;
    setMenuOpen(false);
    setMenuAnchor(null);
    picker.openCreateKnowledgeBase();
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setMenuAnchor(null);
  };

  const openMenuAt = (anchor: DOMRect) => {
    setMenuAnchor(anchor);
    setMenuOpen(true);
  };

  const toggleMenuAt = (anchor: DOMRect) => {
    setMenuOpen(v => {
      if (v) {
        setMenuAnchor(null);
        return false;
      }
      setMenuAnchor(anchor);
      return true;
    });
  };

  return {
    available: !!picker,
    menuOpen,
    menuAnchor,
    handlePickDocType,
    openTemplateLibrary,
    openCreateKnowledgeBase,
    closeMenu,
    openMenuAt,
    toggleMenuAt,
    setMenuOpen,
    onCreateFolder: options?.onCreateFolder,
  };
}

/** 统一新建文档交互：类型菜单 → 模板库 / 直接创建 */
export function useCreateDocument(options?: UseCreateDocumentOptions): CreateDocumentControls {
  const picker = useTemplatePicker();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  return buildCreateDocumentControls(
    picker,
    options,
    menuOpen,
    setMenuOpen,
    menuAnchor,
    setMenuAnchor,
  );
}

/** 无 Provider 时 available=false，供顶栏等可选场景 */
export function useOptionalCreateDocument(options?: UseCreateDocumentOptions): CreateDocumentControls {
  const picker = useOptionalTemplatePicker();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  return buildCreateDocumentControls(
    picker,
    options,
    menuOpen,
    setMenuOpen,
    menuAnchor,
    setMenuAnchor,
  );
}
