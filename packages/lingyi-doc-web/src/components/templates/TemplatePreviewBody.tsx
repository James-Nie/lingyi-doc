import React from 'react';
import type { DocTemplate } from '../../templates/docTemplates';
import { DocEditorPreview } from './DocEditorPreview';
import { SheetEditorPreview } from './SheetEditorPreview';
import { MindNoteEditorPreview } from './MindNoteEditorPreview';
import { WhiteboardEditorPreview } from './WhiteboardEditorPreview';

interface TemplatePreviewBodyProps {
  template: DocTemplate;
}

export const TemplatePreviewBody: React.FC<TemplatePreviewBodyProps> = ({ template }) => {
  if (template.docType === 'richtext' && template.richDocument) {
    return (
      <DocEditorPreview
        title={template.richDocument.title || template.documentTitle}
        blocks={template.richDocument.content}
      />
    );
  }

  if ((template.docType === 'freeform' || template.docType === 'base') && template.buildWorkbook) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <SheetEditorPreview
          key={template.id}
          workbook={template.buildWorkbook()}
          docType={template.docType}
        />
      </div>
    );
  }

  if (template.docType === 'mindnote' && template.mindNoteJson) {
    return (
      <MindNoteEditorPreview
        key={template.id}
        title={template.mindNoteJson.title || template.documentTitle}
        root={template.mindNoteJson.root}
        settings={template.mindNoteJson.settings}
      />
    );
  }

  if (template.docType === 'whiteboard' && template.whiteboardJson) {
    return (
      <WhiteboardEditorPreview
        key={template.id}
        title={template.whiteboardJson.title || template.documentTitle}
        whiteboardJson={template.whiteboardJson}
      />
    );
  }

  return (
    <div style={{ padding: '48px 32px', textAlign: 'center', color: '#8f959e', fontSize: 14 }}>
      {template.isBlank ? '空白文档，创建后可自由编辑' : '暂无预览内容'}
    </div>
  );
};
