import mammoth from 'mammoth';
import { RichDocument } from '../doc/model';
import { parseHtmlToBlocks } from '../doc/html';
import { parseDocxBodySegments } from './docx/docxStructure';
import { buildBlocksFromSegments, loadNumberingFormats } from './docx/docxNumbering';

const DOCX_EXTENSIONS = /\.docx$/i;

const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function titleFromFileName(fileName: string): string {
  return fileName.replace(DOCX_EXTENSIONS, '').trim() || '导入的文档';
}

/** 判断是否为 Word docx 文件 */
export function isDocxFile(file: File): boolean {
  if (DOCX_EXTENSIONS.test(file.name)) return true;
  return DOCX_MIME_TYPES.has(file.type);
}

export class DocxIO {
  static isDocxFile = isDocxFile;

  /** 从本地 docx 文件导入为富文本文档 */
  static async importFromFile(file: File): Promise<{ title: string; document: RichDocument }> {
    const arrayBuffer = await file.arrayBuffer();
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);

    const [result, segments, numFormats] = await Promise.all([
      mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.dataUri,
          includeDefaultStyleMap: true,
          ignoreEmptyParagraphs: false,
        },
      ),
      parseDocxBodySegments(arrayBuffer),
      loadNumberingFormats(zip),
    ]);

    const mammothBlocks = parseHtmlToBlocks(result.value);
    const blocks = buildBlocksFromSegments(segments, numFormats, mammothBlocks);
    const title = titleFromFileName(file.name);
    const document = new RichDocument('', title, blocks);
    return { title, document };
  }
}
