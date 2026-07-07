import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import type { ImageBlock } from '@lingyi-doc/core';
import { DOC_COLORS } from './styles';
import { DocImageToolbar } from './DocImageToolbar';
import { prepareImageFileForInsert } from './imageUtils';

const MIN_WIDTH = 80;
const HANDLE_SIZE = 8;

interface DocImageBlockProps {
  block: ImageBlock;
  index: number;
  selected: boolean;
  maxWidth: number;
  onSelect: () => void;
  onChange: (block: ImageBlock, recordHistory?: boolean) => void;
  onPatch?: (patch: Partial<ImageBlock>, recordHistory?: boolean) => void;
}

/** 屏幕坐标系下的缩放手柄，不随图片旋转 */
function ResizeHandle({ position, onMouseDown }: {
  position: 'nw' | 'ne' | 'sw' | 'se';
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const pos: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    background: DOC_COLORS.primary,
    border: '2px solid #fff',
    borderRadius: '50%',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    cursor: position === 'nw' || position === 'se' ? 'nwse-resize' : 'nesw-resize',
    zIndex: 3,
    pointerEvents: 'auto',
  };
  if (position.includes('n')) pos.top = -HANDLE_SIZE / 2;
  else pos.bottom = -HANDLE_SIZE / 2;
  if (position.includes('w')) pos.left = -HANDLE_SIZE / 2;
  else pos.right = -HANDLE_SIZE / 2;

  return <div role="presentation" style={pos} onMouseDown={onMouseDown} />;
}

function getImageContentStyle(imageStyle: ImageBlock['imageStyle']): React.CSSProperties {
  switch (imageStyle) {
    case 'border':
      return { border: `1px solid ${DOC_COLORS.border}`, borderRadius: 4, boxSizing: 'border-box' as const };
    case 'shadow':
      return { boxShadow: '0 4px 16px rgba(0,0,0,0.14)', borderRadius: 4 };
    default:
      return { borderRadius: 4 };
  }
}

function getRotatedBoxSize(width: number, height: number, rotation: number) {
  const swap = rotation === 90 || rotation === 270;
  return {
    boxWidth: swap ? height : width,
    boxHeight: swap ? width : height,
  };
}

function ImageCaption({
  caption,
  editing,
  width,
  onChange,
}: {
  caption?: string;
  editing: boolean;
  width: number;
  onChange: (value: string, recordHistory?: boolean) => void;
}) {
  if (!editing) return null;

  return (
    <input
      type="text"
      value={caption ?? ''}
      placeholder="图片描述"
      autoFocus
      onChange={e => onChange(e.target.value, false)}
      onBlur={e => onChange(e.target.value.trim(), true)}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      style={{
        width,
        marginTop: 6,
        padding: '4px 8px',
        border: 'none',
        borderRadius: 4,
        background: 'transparent',
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 1.6,
        color: DOC_COLORS.muted,
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

export const DocImageBlock: React.FC<DocImageBlockProps> = ({
  block,
  index,
  selected,
  maxWidth,
  onSelect,
  onChange,
  onPatch,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [naturalRatio, setNaturalRatio] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [captionEditing, setCaptionEditing] = useState(false);

  useEffect(() => {
    if (!selected) setCaptionEditing(false);
  }, [selected]);

  const displayWidth = block.width ?? maxWidth;
  const rotation = block.rotation ?? 0;
  const align = block.align ?? 'left';
  const imageStyle = block.imageStyle ?? 'none';
  const displayHeight = Math.round(displayWidth / naturalRatio);
  const { boxWidth, boxHeight } = getRotatedBoxSize(displayWidth, displayHeight, rotation);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) setNaturalRatio(img.naturalWidth / img.naturalHeight);
    };
    img.src = block.url;
  }, [block.url]);

  const applyPatch = useCallback((patch: Partial<ImageBlock>, recordHistory = true) => {
    if (onPatch) {
      onPatch(patch, recordHistory);
      return;
    }
    onChange({ ...block, ...patch }, recordHistory);
  }, [block, onChange, onPatch]);

  const clampWidth = useCallback((w: number) => {
    return Math.round(Math.max(MIN_WIDTH, Math.min(maxWidth, w)));
  }, [maxWidth]);

  /** 缩放手柄始终在屏幕坐标系：向右拖增大宽度 */
  const startResize = useCallback((e: React.MouseEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = displayWidth;
    const sign = corner.includes('w') ? -1 : 1;
    let latestWidth = startWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientX - startX) * sign;
      latestWidth = clampWidth(startWidth + delta);
      applyPatch({ width: latestWidth }, false);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      applyPatch({ width: latestWidth }, true);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [applyPatch, clampWidth, displayWidth]);

  const handleReplace = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    try {
      const payload = await prepareImageFileForInsert(file);
      onChange({
        ...block,
        url: payload.url,
        width: Math.min(payload.naturalWidth, maxWidth),
        naturalWidth: payload.naturalWidth,
        naturalHeight: payload.naturalHeight,
        rotation: 0,
      }, true);
    } catch (err) {
      console.error('替换图片上传失败', err);
    }
  };

  const handleReset = () => {
    const nw = block.naturalWidth ?? block.width ?? maxWidth;
    applyPatch({
      width: Math.min(nw, maxWidth),
      align: 'left',
      imageStyle: 'none',
      rotation: 0,
      link: undefined,
    }, true);
  };

  const contentStyle = getImageContentStyle(imageStyle);
  const captionText = block.caption?.trim();

  const imgElement = (
    <div style={{ ...contentStyle, lineHeight: 0, overflow: 'visible' }}>
      <img
        src={block.url}
        alt={captionText || ''}
        draggable={false}
        style={{
          width: displayWidth,
          height: displayHeight,
          display: 'block',
          userSelect: 'none',
        }}
      />
    </div>
  );

  const columnMargin: React.CSSProperties = {
    width: boxWidth,
    flexShrink: 0,
    marginLeft: align === 'right' || align === 'center' ? 'auto' : 0,
    marginRight: align === 'left' || align === 'center' ? 'auto' : 0,
  };

  return (
    <>
      <div
        data-block-id={block.id}
        data-block-index={index}
        style={{
          margin: 0,
          padding: '12px 0',
          width: '100%',
        }}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        <div style={columnMargin}>
          <div
            style={{
              position: 'relative',
              width: boxWidth,
              height: boxHeight,
              flexShrink: 0,
              overflow: 'visible',
            }}
          >
            {selected && (
              <DocImageToolbar
                block={block}
                displayWidth={displayWidth}
                displayHeight={displayHeight}
                maxWidth={maxWidth}
                minWidth={MIN_WIDTH}
                captionEditing={captionEditing}
                onToggleCaption={() => setCaptionEditing(v => !v)}
                onPatch={applyPatch}
                onReplace={() => fileInputRef.current?.click()}
                onPreview={() => setPreviewOpen(true)}
                onReset={handleReset}
              />
            )}

            {/* 仅图片旋转 */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: displayWidth,
                height: displayHeight,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                pointerEvents: 'none',
              }}
            >
              {block.link ? (
                <a
                  href={block.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ display: 'block', lineHeight: 0, pointerEvents: 'auto' }}
                >
                  {imgElement}
                </a>
              ) : imgElement}
            </div>

            {/* 选中框与手柄：屏幕坐标系，不随图片旋转 */}
            {selected && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: `2px solid ${DOC_COLORS.primary}`,
                  borderRadius: 4,
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                }}
              >
                <ResizeHandle position="nw" onMouseDown={e => startResize(e, 'nw')} />
                <ResizeHandle position="ne" onMouseDown={e => startResize(e, 'ne')} />
                <ResizeHandle position="sw" onMouseDown={e => startResize(e, 'sw')} />
                <ResizeHandle position="se" onMouseDown={e => startResize(e, 'se')} />
              </div>
            )}
          </div>

          <ImageCaption
            caption={block.caption}
            editing={selected && captionEditing}
            width={boxWidth}
            onChange={(value, recordHistory) => {
              onChange({ ...block, caption: value || undefined }, recordHistory);
            }}
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void handleReplace(file);
          e.target.value = '';
        }}
      />

      <Modal
        open={previewOpen}
        footer={null}
        onCancel={() => setPreviewOpen(false)}
        width="auto"
        centered
        destroyOnClose
        styles={{ body: { padding: 0, lineHeight: 0 } }}
      >
        <img
          src={block.url}
          alt={captionText || ''}
          style={{ maxWidth: '90vw', maxHeight: '85vh', display: 'block' }}
        />
      </Modal>
    </>
  );
};
