import React, { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { TemplatePickerModal } from './TemplatePickerModal';
import { createDocumentFromTemplate } from '../../templates/createFromTemplate';
import type { DocTemplate, TemplateDocType } from '../../templates/docTemplates';
import { CreateKnowledgeBaseModal } from '../wiki/CreateKnowledgeBaseModal';
import type { CreateDocType } from '../CreateDocMenu';
import { authStore } from '../../stores/authStore';
import { knowledgeBaseStore } from '../../stores/knowledgeBaseStore';
import { appPath } from '../../utils/appPaths';
import {
  finalizeDocumentCreation,
  mapMenuTypeToTemplateFilter,
} from '../../utils/createDocumentFromMenu';

export interface WikiKbContext {
  kbId: string;
  parentNodeId: string;
}

interface TemplatePickerContextValue {
  openTemplatePicker: (opts?: {
    typeFilter?: 'all' | TemplateDocType;
    kbContext?: WikiKbContext;
  }) => void;
  createFromMenu: (type: CreateDocType, kbContext?: WikiKbContext) => Promise<void>;
  openCreateKnowledgeBase: () => void;
}

const TemplatePickerContext = createContext<TemplatePickerContextValue | null>(null);

export function useTemplatePicker(): TemplatePickerContextValue {
  const ctx = useContext(TemplatePickerContext);
  if (!ctx) throw new Error('useTemplatePicker must be used within TemplatePickerProvider');
  return ctx;
}

/** 无 Provider 时返回 null，供公开路径等场景安全使用 */
export function useOptionalTemplatePicker(): TemplatePickerContextValue | null {
  return useContext(TemplatePickerContext);
}

interface TemplatePickerProviderProps {
  children: React.ReactNode;
  onError?: (message: string) => void;
  onDuplicateTitle?: (title: string) => void;
  onToast?: (message: string) => void;
}

export const TemplatePickerProvider: React.FC<TemplatePickerProviderProps> = ({
  children,
  onError,
  onDuplicateTitle,
  onToast,
}) => {
  const navigate = useNavigate();
  const authState = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createKbOpen, setCreateKbOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | TemplateDocType>('all');
  const [kbContext, setKbContext] = useState<WikiKbContext | null>(null);

  const organizationName = useMemo(() => {
    const session = authState.session;
    const tenant = authState.tenants.find(t => t.id === session?.currentTenantId);
    return tenant?.name || '当前企业';
  }, [authState.session, authState.tenants]);

  const openTemplatePicker = useCallback((opts?: {
    typeFilter?: 'all' | TemplateDocType;
    kbContext?: WikiKbContext;
  }) => {
    setTypeFilter(opts?.typeFilter ?? 'all');
    setKbContext(opts?.kbContext ?? null);
    setOpen(true);
  }, []);

  const runCreation = useCallback(async (
    create: () => Promise<string>,
    docTitle: string,
    context?: WikiKbContext | null,
  ) => {
    setCreating(true);
    try {
      const id = await create();
      setOpen(false);
      await finalizeDocumentCreation({
        docId: id,
        docTitle,
        kbContext: context ?? undefined,
        navigate,
      });
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('已存在')) {
        onDuplicateTitle?.(message.match(/「(.+?)」/)?.[1] ?? message);
      } else {
        onError?.(message);
      }
    } finally {
      setCreating(false);
      setKbContext(null);
    }
  }, [navigate, onDuplicateTitle, onError]);

  const createFromMenu = useCallback(async (type: CreateDocType, context?: WikiKbContext) => {
    openTemplatePicker({ typeFilter: mapMenuTypeToTemplateFilter(type), kbContext: context });
  }, [openTemplatePicker]);

  const handleUse = useCallback(async (template: DocTemplate) => {
    await runCreation(
      () => createDocumentFromTemplate(template),
      template.documentTitle,
      kbContext,
    );
  }, [kbContext, runCreation]);

  const handleCreateKnowledgeBase = useCallback(async (payload: {
    name: string;
    description: string;
    emoji: string;
    visibility: 'members' | 'organization';
  }) => {
    try {
      const { kb, defaultNodeId } = await knowledgeBaseStore.create(payload);
      setCreateKbOpen(false);
      onToast?.('知识库已创建');
      navigate(appPath.wikiSpaceNode(kb.id, defaultNodeId));
    } catch (err) {
      onError?.(`创建失败: ${(err as Error).message}`);
    }
  }, [navigate, onError, onToast]);

  const openCreateKnowledgeBase = useCallback(() => {
    setCreateKbOpen(true);
  }, []);

  return (
    <TemplatePickerContext.Provider value={{ openTemplatePicker, createFromMenu, openCreateKnowledgeBase }}>
      {children}
      <TemplatePickerModal
        open={open}
        onClose={() => !creating && setOpen(false)}
        onUse={handleUse}
        creating={creating}
        initialTypeFilter={typeFilter}
      />
      <CreateKnowledgeBaseModal
        open={createKbOpen}
        organizationName={organizationName}
        onClose={() => setCreateKbOpen(false)}
        onCreate={handleCreateKnowledgeBase}
      />
    </TemplatePickerContext.Provider>
  );
};
