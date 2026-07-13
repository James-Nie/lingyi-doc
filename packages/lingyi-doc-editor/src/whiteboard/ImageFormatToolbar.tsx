import React, { useState } from 'react';
import type { ImageElement } from '@lingyi-doc/core';
import {
  Chevron,
  Divider,
  MenuRow,
  MOD,
  Popover,
  STROKE_SWATCHES,
  Swatches,
  TbBtn,
  ToolbarShell,
  Wrap,
} from './formatToolbarUi';
import { WB_COLORS } from './styles';
import type { WhiteboardContextMenuAction } from './WhiteboardContextMenu';
import type { ZOrderAction } from './elementActions';

type Panel = 'border' | 'more' | null;

export interface ImageFormatToolbarProps {
  element: ImageElement;
  anchorX: number;
  anchorY: number;
  onPatch: (patch: Partial<ImageElement>, recordHistory?: boolean) => void;
  onCrop: () => void;
  onDownload: () => void;
  onAddComment?: () => void;
  onMenuAction: (action: WhiteboardContextMenuAction) => void;
  onLayerAction?: (action: ZOrderAction) => void;
  canPaste?: boolean;
}

export const ImageFormatToolbar: React.FC<ImageFormatToolbarProps> = ({
  element,
  anchorX,
  anchorY,
  onPatch,
  onCrop,
  onDownload,
  onAddComment,
  onMenuAction,
  onLayerAction,
  canPaste = false,
}) => {
  const [panel, setPanel] = useState<Panel>(null);
  const [layerOpen, setLayerOpen] = useState(false);
  const toggle = (p: Panel) => setPanel(cur => (cur === p ? null : p));

  const borderWidth = element.borderWidth ?? 0;
  const borderColor = element.borderColor ?? '#dee0e3';
  const hasBorder = borderWidth > 0;

  return (
    <ToolbarShell anchorX={anchorX} anchorY={anchorY}>
      <TbBtn title="图片" disabled>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <circle cx="9" cy="11" r="1.2" fill="currentColor" stroke="none" />
          <path d="M4 15l4-3 3 2 5-4 4 3" strokeLinejoin="round" />
        </svg>
      </TbBtn>

      <Divider />

      <TbBtn title="裁剪" onClick={onCrop}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M6 3v3M3 6h3M18 21v-3M21 18h-3" />
          <path d="M9 9h10v10H9z" />
        </svg>
      </TbBtn>

      <TbBtn title="下载" onClick={onDownload}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      </TbBtn>

      <Wrap>
        <TbBtn active={panel === 'border'} onClick={() => toggle('border')} title="边框">
          {hasBorder ? (
            <span style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: `2px solid ${borderColor}`,
              display: 'inline-block',
              boxSizing: 'border-box',
            }} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="8" />
              <path d="M5 5l14 14" />
            </svg>
          )}
          <Chevron />
        </TbBtn>
        {panel === 'border' && (
          <Popover width={168} anchor="center">
            <button
              type="button"
              onClick={() => {
                onPatch({ borderWidth: 0 }, true);
                setPanel(null);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 4px',
                marginBottom: 8,
                border: 'none',
                borderRadius: 6,
                background: !hasBorder ? '#eef3ff' : 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: WB_COLORS.text,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="8" />
                <path d="M5 5l14 14" />
              </svg>
              无边框
            </button>
            <Swatches
              colors={STROKE_SWATCHES}
              value={borderColor}
              onPick={c => {
                onPatch({ borderColor: c, borderWidth: Math.max(borderWidth, 2) }, true);
                setPanel(null);
              }}
            />
          </Popover>
        )}
      </Wrap>

      {onAddComment && (
        <>
          <Divider />
          <TbBtn title="添加评论" onClick={onAddComment}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </TbBtn>
        </>
      )}

      <Divider />

      <Wrap>
        <TbBtn active={panel === 'more'} onClick={() => toggle('more')} title="更多">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          </svg>
        </TbBtn>
        {panel === 'more' && (
          <Popover width={220} anchor="right">
            <MenuRow label="复制" shortcut={`${MOD} + C`} onClick={() => { onMenuAction('copy'); setPanel(null); }} />
            <MenuRow label="复制为图片" shortcut={`${MOD} + Shift + C`} onClick={() => { onMenuAction('copyImage'); setPanel(null); }} />
            <MenuRow label="粘贴" shortcut={`${MOD} + V`} disabled={!canPaste} onClick={() => { onMenuAction('paste'); setPanel(null); }} />
            <MenuRow label="创建副本" shortcut={`${MOD} + D`} onClick={() => { onMenuAction('duplicate'); setPanel(null); }} />
            <div style={{ height: 1, background: WB_COLORS.border, margin: '4px 0' }} />
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => setLayerOpen(true)}
              onMouseLeave={() => setLayerOpen(false)}
            >
              <MenuRow label="层级" arrow onClick={() => setLayerOpen(v => !v)} />
              {layerOpen && onLayerAction && (
                <div style={{
                  position: 'absolute',
                  right: '100%',
                  top: 0,
                  marginRight: 4,
                  minWidth: 140,
                  background: '#fff',
                  borderRadius: 10,
                  border: `1px solid ${WB_COLORS.border}`,
                  boxShadow: '0 8px 28px rgba(31, 35, 41, 0.12)',
                  padding: '6px 0',
                }}>
                  {([
                    ['front', '置于顶层'],
                    ['forward', '上移一层'],
                    ['backward', '下移一层'],
                    ['back', '置于底层'],
                  ] as const).map(([action, label]) => (
                    <MenuRow
                      key={action}
                      label={label}
                      onClick={() => { onLayerAction(action); setPanel(null); setLayerOpen(false); }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div style={{ height: 1, background: WB_COLORS.border, margin: '4px 0' }} />
            <MenuRow label="锁定" shortcut={`${MOD} + ⌥ + L`} onClick={() => { onMenuAction('lock'); setPanel(null); }} />
            <MenuRow label="删除" onClick={() => { onMenuAction('delete'); setPanel(null); }} danger />
          </Popover>
        )}
      </Wrap>
    </ToolbarShell>
  );
};

export async function downloadImageElement(element: ImageElement): Promise<void> {
  const filename = element.alt?.trim() || 'image.png';
  const src = element.src;
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    const a = document.createElement('a');
    a.href = src;
    a.download = filename;
    a.click();
    return;
  }
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.open(src, '_blank');
  }
}
