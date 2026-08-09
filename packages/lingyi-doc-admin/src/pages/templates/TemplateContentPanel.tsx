import React, { forwardRef, Suspense } from 'react';
import { Empty, Typography } from 'antd';
import type { TemplateDocType } from './templateConstants';
import type { TemplateContentEditorHandle } from './editors/TemplateContentEditorHandle';
import { createDefaultContentJson } from './templateContentUtils';

const TemplateRichDocContentEditor = React.lazy(() =>
  import('./editors/TemplateRichDocContentEditor').then(m => ({ default: m.TemplateRichDocContentEditor })),
);
const TemplateSheetContentEditor = React.lazy(() =>
  import('./editors/TemplateSheetContentEditor').then(m => ({ default: m.TemplateSheetContentEditor })),
);
const TemplateMindNoteContentEditor = React.lazy(() =>
  import('./editors/TemplateMindNoteContentEditor').then(m => ({ default: m.TemplateMindNoteContentEditor })),
);
const TemplateWhiteboardContentEditor = React.lazy(() =>
  import('./editors/TemplateWhiteboardContentEditor').then(m => ({ default: m.TemplateWhiteboardContentEditor })),
);

interface TemplateContentPanelProps {
  docType: TemplateDocType;
  documentTitle: string;
  isBlank: boolean;
  contentJson: unknown | null;
  /** 切换文档类型时 remount 编辑器 */
  editorKey: string;
  /** 查看模式：与编辑相同布局，只读预览 */
  previewMode?: boolean;
}

function EditorLoading() {
  return (
    <div style={{ padding: '80px 0', textAlign: 'center', color: '#8f959e' }}>
      正在加载编辑器…
    </div>
  );
}

export type { TemplateContentEditorHandle };

export const TemplateContentPanel = forwardRef<TemplateContentEditorHandle, TemplateContentPanelProps>(
  function TemplateContentPanel({
    docType, documentTitle, isBlank, contentJson, editorKey, previewMode = false,
  }, ref) {
    if (isBlank) {
      return (
        <Empty
          description={previewMode
            ? '空白模板，用户使用时将创建空文档'
            : '已标记为空白模板，用户使用时将创建空文档，无需编辑内容'}
          style={{ padding: '80px 0' }}
        />
      );
    }

    if (docType === 'slides') {
      return (
        <Empty
          description="幻灯片模板暂不支持可视化编辑"
          style={{ padding: '80px 0' }}
        />
      );
    }

    if (previewMode && contentJson == null) {
      return (
        <Empty
          description="暂无模板内容数据"
          style={{ padding: '80px 0' }}
        />
      );
    }

    let editor: React.ReactNode = null;
    if (docType === 'richtext') {
      editor = (
        <TemplateRichDocContentEditor
          key={editorKey}
          ref={ref}
          documentTitle={documentTitle}
          contentJson={contentJson}
          previewMode={previewMode}
        />
      );
    } else if (docType === 'freeform' || docType === 'base' || docType === 'questionnaire') {
      const sheetContent = contentJson
        ?? (docType === 'questionnaire' ? createDefaultContentJson('questionnaire', documentTitle) : null);
      editor = (
        <TemplateSheetContentEditor
          key={editorKey}
          ref={ref}
          docType={docType === 'questionnaire' ? 'base' : docType}
          contentJson={sheetContent}
          previewMode={previewMode}
        />
      );
    } else if (docType === 'mindnote') {
      editor = (
        <TemplateMindNoteContentEditor
          key={editorKey}
          ref={ref}
          documentTitle={documentTitle}
          contentJson={contentJson}
          previewMode={previewMode}
        />
      );
    } else if (docType === 'whiteboard') {
      editor = (
        <TemplateWhiteboardContentEditor
          key={editorKey}
          ref={ref}
          documentTitle={documentTitle}
          contentJson={contentJson}
          previewMode={previewMode}
        />
      );
    }

    return (
      <div>
        {!previewMode && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            在下方编辑器中设计模板默认内容，保存后将写入模板库。
          </Typography.Paragraph>
        )}
        <Suspense fallback={<EditorLoading />}>
          {editor}
        </Suspense>
      </div>
    );
  },
);
