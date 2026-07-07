import React, { forwardRef } from 'react';
import { Empty, Typography } from 'antd';
import type { TemplateDocType } from './templateConstants';
import {
  TemplateRichDocContentEditor,
  type TemplateContentEditorHandle,
} from './editors/TemplateRichDocContentEditor';
import {
  TemplateSheetContentEditor,
} from './editors/TemplateSheetContentEditor';
import {
  TemplateMindNoteContentEditor,
} from './editors/TemplateMindNoteContentEditor';
import {
  TemplateWhiteboardContentEditor,
} from './editors/TemplateWhiteboardContentEditor';

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

    return (
      <div>
        {!previewMode && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            在下方编辑器中设计模板默认内容，保存后将写入模板库。
          </Typography.Paragraph>
        )}
        {docType === 'richtext' && (
          <TemplateRichDocContentEditor
            key={editorKey}
            ref={ref}
            documentTitle={documentTitle}
            contentJson={contentJson}
            previewMode={previewMode}
          />
        )}
        {(docType === 'freeform' || docType === 'base') && (
          <TemplateSheetContentEditor
            key={editorKey}
            ref={ref}
            docType={docType}
            contentJson={contentJson}
            previewMode={previewMode}
          />
        )}
        {docType === 'mindnote' && (
          <TemplateMindNoteContentEditor
            key={editorKey}
            ref={ref}
            documentTitle={documentTitle}
            contentJson={contentJson}
            previewMode={previewMode}
          />
        )}
        {docType === 'whiteboard' && (
          <TemplateWhiteboardContentEditor
            key={editorKey}
            ref={ref}
            documentTitle={documentTitle}
            contentJson={contentJson}
            previewMode={previewMode}
          />
        )}
      </div>
    );
  },
);
