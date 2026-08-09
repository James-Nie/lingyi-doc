import type { NavigateFunction } from 'react-router-dom';
import type { CreateDocType } from '../components/CreateDocMenu';
import type { WikiKbContext } from '../components/templates/TemplatePickerContext';
import type { TemplateDocType } from '../templates/docTemplates';
import { KnowledgeBaseApi } from '../api/knowledgeBase';
import { knowledgeBaseStore } from '../stores/knowledgeBaseStore';
import { appPath } from './appPaths';
import { navigateToDoc } from './navigateToDoc';

export function isDirectCreateMenuType(_type: CreateDocType): boolean {
  return false;
}

export function mapMenuTypeToTemplateFilter(type: CreateDocType): TemplateDocType {
  return type as TemplateDocType;
}

export async function createDocumentFromMenuType(type: CreateDocType): Promise<string> {
  throw new Error(`文档类型 ${type} 需通过模板库创建`);
}

export async function finalizeDocumentCreation(params: {
  docId: string;
  docTitle: string;
  kbContext?: WikiKbContext;
  navigate: NavigateFunction;
}): Promise<void> {
  const { docId, docTitle, kbContext, navigate } = params;
  if (kbContext) {
    await KnowledgeBaseApi.createNode(kbContext.kbId, {
      title: docTitle,
      nodeType: 'doc_ref',
      parentId: kbContext.parentNodeId,
      docId,
    });
    await knowledgeBaseStore.loadNodes(kbContext.kbId);
    knowledgeBaseStore.touchLocal(kbContext.kbId);
    navigate(appPath.wikiSpaceDoc(kbContext.kbId, docId));
    return;
  }
  await navigateToDoc(navigate, docId);
}
