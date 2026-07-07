import React, { createContext, useCallback, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TemplatePickerModal } from './TemplatePickerModal';
import { createDocumentFromTemplate } from '../../templates/createFromTemplate';
import type { DocTemplate, TemplateDocType } from '../../templates/docTemplates';
import { KnowledgeBaseApi } from '../../api/knowledgeBase';
import { knowledgeBaseStore } from '../../stores/knowledgeBaseStore';
import { appPath } from '../../utils/appPaths';
import { navigateToDoc } from '../../utils/navigateToDoc';

export interface WikiKbContext {
  kbId: string;
  parentNodeId: string;
}

interface TemplatePickerContextValue {
  openTemplatePicker: (opts?: {
    typeFilter?: 'all' | TemplateDocType;
    kbContext?: WikiKbContext;
  }) => void;
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
}

export const TemplatePickerProvider: React.FC<TemplatePickerProviderProps> = ({
  children,
  onError,
  onDuplicateTitle,
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | TemplateDocType>('all');
  const [kbContext, setKbContext] = useState<WikiKbContext | null>(null);

  const openTemplatePicker = useCallback((opts?: {
    typeFilter?: 'all' | TemplateDocType;
    kbContext?: WikiKbContext;
  }) => {
    setTypeFilter(opts?.typeFilter ?? 'all');
    setKbContext(opts?.kbContext ?? null);
    setOpen(true);
  }, []);

  const handleUse = useCallback(async (template: DocTemplate) => {
    setCreating(true);
    try {
      const id = await createDocumentFromTemplate(template);
      setOpen(false);

      if (kbContext) {
        await KnowledgeBaseApi.createNode(kbContext.kbId, {
          title: template.documentTitle,
          nodeType: 'doc_ref',
          parentId: kbContext.parentNodeId,
          docId: id,
        });
        await knowledgeBaseStore.loadNodes(kbContext.kbId);
        knowledgeBaseStore.touchLocal(kbContext.kbId);
        navigate(appPath.wikiSpaceDoc(kbContext.kbId, id));
        return;
      }

      await navigateToDoc(navigate, id);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('已存在')) {
        onDuplicateTitle?.(message.match(/「(.+?)」/)?.[1] ?? message);
      } else if (message.includes('开发中')) {
        onError?.(message);
      } else {
        onError?.(message);
      }
    } finally {
      setCreating(false);
      setKbContext(null);
    }
  }, [navigate, onError, onDuplicateTitle, kbContext]);

  return (
    <TemplatePickerContext.Provider value={{ openTemplatePicker }}>
      {children}
      <TemplatePickerModal
        open={open}
        onClose={() => !creating && setOpen(false)}
        onUse={handleUse}
        creating={creating}
        initialTypeFilter={typeFilter}
      />
    </TemplatePickerContext.Provider>
  );
};
