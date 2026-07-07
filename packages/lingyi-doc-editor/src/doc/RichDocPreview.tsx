import React from 'react';
import type { DocBlock, ListBlock, ListItem, TableBlock, TableCell, WhiteboardBlock } from '@lingyi-doc/core';
import {
  ensureTableSizes,
  getBlockIndentStyle,
  getTableCellTypography,
  isTextBlock,
  marksToHtml,
  orderedListMarker,
  getBulletMarkerForLevel,
} from '@lingyi-doc/core';
import { WhiteboardEmbedPreview } from '../whiteboard/WhiteboardEmbedPreview';
import {
  DOC_COLORS,
  DOC_EDITOR_MAX_WIDTH,
  codeStyle,
  dividerStyle,
  headingStyles,
  paragraphStyle,
  listMarkerStyle,
  listCheckboxStyle,
  quoteStyle,
} from './styles';
import { isDocTitleEmpty } from './DocTitleEditor';

export interface RichDocPreviewProps {
  title: string;
  blocks: DocBlock[];
  /** 与编辑器正文区一致的宽度与内边距 */
  compact?: boolean;
}

export const RichDocPreview: React.FC<RichDocPreviewProps> = ({ title, blocks, compact }) => (
  <div style={{
    maxWidth: DOC_EDITOR_MAX_WIDTH,
    margin: '0 auto',
    background: '#fff',
    padding: compact ? '24px 32px 32px' : '32px 48px 32px 64px',
    userSelect: 'text',
    WebkitUserSelect: 'text',
  }}>
    <div style={{
      fontSize: 26,
      fontWeight: 700,
      lineHeight: 1.5,
      color: DOC_COLORS.text,
      marginBottom: 4,
      wordBreak: 'break-word',
    }}>
      {isDocTitleEmpty(title) ? '未命名文档' : title}
    </div>
    {blocks.map((block, index) => (
      <PreviewBlock key={block.id} block={block} index={index} />
    ))}
  </div>
);

function PreviewBlock({ block, index, items }: { block: DocBlock; index: number; items?: ListItem[] }) {
  if (block.type === 'divider') {
    return <hr style={dividerStyle} />;
  }

  if (block.type === 'list') {
    return <PreviewList block={block} index={index} />;
  }

  if (block.type === 'table') {
    return <PreviewTable block={block} />;
  }

  if (block.type === 'code') {
    return (
      <pre style={codeStyle}>{block.text}</pre>
    );
  }

  if (block.type === 'mermaid') {
    return (
      <pre style={{ ...codeStyle, color: DOC_COLORS.muted, fontSize: 12 }}>
        {block.text || 'Mermaid 图表'}
      </pre>
    );
  }

  if (block.type === 'image') {
    return (
      <div style={{ margin: '12px 0', textAlign: block.align ?? 'left' }}>
        {block.url ? (
          <img
            src={block.url}
            alt={block.alt ?? ''}
            style={{
              maxWidth: block.width ?? '100%',
              height: 'auto',
              borderRadius: 4,
              display: 'inline-block',
            }}
          />
        ) : (
          <div style={{
            width: block.width ?? 320, height: 180, background: '#f2f3f5',
            borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: DOC_COLORS.muted, fontSize: 13,
          }}>
            图片
          </div>
        )}
      </div>
    );
  }

  if (block.type === 'whiteboard') {
    const wb = block as WhiteboardBlock;
    return (
      <div style={{
        margin: '12px 0',
        borderRadius: 8,
        border: `1px solid ${DOC_COLORS.border}`,
        overflow: 'hidden',
        background: '#fff',
      }}>
        <WhiteboardEmbedPreview elements={wb.whiteboardData.elements} height={320} />
      </div>
    );
  }

  if (!isTextBlock(block)) return null;

  const align = block.type === 'quote' ? 'left' : (block.align ?? 'left');
  const indentStyle = getBlockIndentStyle(block);
  const html = marksToHtml(block.text, block.marks);
  const baseStyle: React.CSSProperties = { textAlign: align, ...indentStyle };

  if (block.type === 'heading') {
    const level = block.level as 1 | 2 | 3 | 4 | 5 | 6;
    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    return (
      <Tag
        style={{ ...headingStyles[level], ...baseStyle, margin: headingStyles[level].margin }}
        dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
      />
    );
  }

  if (block.type === 'quote') {
    return (
      <blockquote
        style={{ ...quoteStyle, ...baseStyle, margin: quoteStyle.margin }}
        dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
      />
    );
  }

  return (
    <p
      style={{
        ...paragraphStyle,
        ...baseStyle,
        margin: index === 0 ? '0 0 8px' : paragraphStyle.margin,
      }}
      dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
    />
  );
}

function PreviewList({ block, index }: { block: ListBlock; index: number }) {
  const Tag = block.listType === 'ordered' ? 'ol' : 'ul';
  return (
    <Tag style={{ margin: '8px 0', paddingLeft: 0, listStyle: 'none' }} data-block-index={index}>
      {block.items.map((item, i) => (
        <PreviewListItem key={i} item={item} listType={block.listType} items={block.items} index={i} />
      ))}
    </Tag>
  );
}

function PreviewListItem({
  item,
  listType,
  items,
  index,
}: {
  item: ListItem;
  listType: ListBlock['listType'];
  items: ListItem[];
  index: number;
}) {
  const indent = (item.level - 1) * 24;
  const bullet = listType === 'ordered'
    ? orderedListMarker(items, index)
    : listType === 'task'
      ? null
      : getBulletMarkerForLevel(item.level);
  const html = marksToHtml(item.text, item.marks ?? []);

  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '4px 0', paddingLeft: indent }}>
      {listType === 'task' ? (
        <input type="checkbox" checked={!!item.checked} readOnly style={{ ...listCheckboxStyle }} />
      ) : (
        <span style={listMarkerStyle}>{bullet}</span>
      )}
      <div
        style={{
          ...paragraphStyle,
          margin: 0,
          flex: 1,
          textAlign: item.align ?? 'left',
          textDecoration: item.checked ? 'line-through' : 'none',
          color: item.checked ? DOC_COLORS.muted : DOC_COLORS.text,
        }}
        dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
      />
    </li>
  );
}

function PreviewTable({ block }: { block: TableBlock }) {
  const { columnWidths, rowHeights } = ensureTableSizes(block);

  return (
    <div style={{ margin: '12px 0', overflow: 'auto' }}>
      <div style={{ display: 'inline-block', minWidth: '100%' }}>
        {Array.from({ length: block.rows }, (_, row) => (
          <div key={row} style={{ display: 'flex' }}>
            {Array.from({ length: block.cols }, (_, col) => {
              const cell = block.cells[row]?.[col] ?? { text: '', marks: [] };
              return (
                <PreviewTableCell
                  key={col}
                  cell={cell}
                  row={row}
                  col={col}
                  height={rowHeights[row] ?? 40}
                  width={columnWidths[col] ?? 120}
                  totalRows={block.rows}
                  totalCols={block.cols}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewTableCell({
  cell,
  row,
  col,
  height,
  width,
  totalRows,
  totalCols,
}: {
  cell: TableCell;
  row: number;
  col: number;
  height: number;
  width: number;
  totalRows: number;
  totalCols: number;
}) {
  const align = cell.align ?? 'left';
  const verticalAlign = cell.verticalAlign ?? 'top';
  const typography = getTableCellTypography(cell.cellStyle ?? 'paragraph');
  const justifyContent =
    verticalAlign === 'middle' ? 'center' : verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
  const html = marksToHtml(cell.text, cell.marks);

  return (
    <div
      style={{
        width,
        height,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent,
        background: typography.background ?? '#FAF9F5',
        borderRight: `1px solid ${DOC_COLORS.border}`,
        borderBottom: `1px solid ${DOC_COLORS.border}`,
        ...(row === 0 ? { borderTop: `1px solid ${DOC_COLORS.border}` } : null),
        ...(col === 0 ? { borderLeft: `1px solid ${DOC_COLORS.border}` } : null),
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          boxSizing: 'border-box',
          padding: typography.paddingLeft != null ? `8px 10px 8px ${typography.paddingLeft}px` : '8px 10px',
          fontSize: typography.fontSize,
          fontWeight: typography.fontWeight,
          fontFamily: typography.fontFamily,
          lineHeight: typography.lineHeight,
          textAlign: align,
          color: DOC_COLORS.text,
          overflow: 'auto',
        }}
        dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
      />
    </div>
  );
}
