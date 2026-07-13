import React from 'react';
import {
  QUICK_DOT_SIZE,
  QUICK_PLUS_SIZE,
  type MindmapAddChildSlot,
  type MindmapGrowDirection,
  type MindmapQuickActionLayout,
} from '@lingyi-doc/mind-map';

export interface MindmapNodeQuickActionsProps {
  actions: MindmapQuickActionLayout;
  /** 节点在屏幕上的矩形 */
  screenRect: { left: number; top: number; width: number; height: number; zoom: number };
  /** 节点在布局坐标系中的原点（布局局部坐标，与 actions 一致） */
  layoutOrigin: { x: number; y: number };
  accent?: string;
  onAddSiblingBefore: () => void;
  onAddSiblingAfter: () => void;
  onAddChild: (dir?: MindmapGrowDirection) => void;
}

function toScreen(
  pt: { x: number; y: number },
  screenRect: MindmapNodeQuickActionsProps['screenRect'],
  layoutOrigin: MindmapNodeQuickActionsProps['layoutOrigin'],
): { left: number; top: number } {
  const z = screenRect.zoom;
  return {
    left: screenRect.left + (pt.x - layoutOrigin.x) * z,
    top: screenRect.top + (pt.y - layoutOrigin.y) * z,
  };
}

/** 节点上下边缘：添加同级（小圆点） */
function SiblingDotButton({
  left,
  top,
  zoom,
  accent,
  title,
  onClick,
}: {
  left: number;
  top: number;
  zoom: number;
  accent: string;
  title: string;
  onClick: () => void;
}) {
  const size = QUICK_DOT_SIZE * zoom;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'absolute',
        left: left - size / 2,
        top: top - size / 2,
        width: size,
        height: size,
        padding: 0,
        border: 'none',
        borderRadius: '50%',
        background: `${accent}40`,
        boxShadow: `0 0 0 ${Math.max(1, zoom)}px ${accent}30`,
        cursor: 'pointer',
        pointerEvents: 'auto',
        transition: 'transform 0.12s ease, background 0.12s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `${accent}66`;
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = `${accent}40`;
        e.currentTarget.style.transform = 'scale(1)';
      }}
    />
  );
}

/** 子节点方向：节点边缘到 + 号的连接线 */
function ChildConnectorLine({
  screenRect,
  addChildScreen,
  addChildDir,
  zoom,
  accent,
}: {
  screenRect: MindmapNodeQuickActionsProps['screenRect'];
  addChildScreen: { left: number; top: number };
  addChildDir: MindmapGrowDirection;
  zoom: number;
  accent: string;
}) {
  const plusHalf = (QUICK_PLUS_SIZE * zoom) / 2;
  const cx = screenRect.left + screenRect.width / 2;
  const cy = screenRect.top + screenRect.height / 2;

  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;

  switch (addChildDir) {
    case 'up':
      x1 = cx;
      y1 = screenRect.top;
      x2 = addChildScreen.left;
      y2 = addChildScreen.top + plusHalf;
      break;
    case 'down':
      x1 = cx;
      y1 = screenRect.top + screenRect.height;
      x2 = addChildScreen.left;
      y2 = addChildScreen.top - plusHalf;
      break;
    case 'left':
      x1 = screenRect.left;
      y1 = cy;
      x2 = addChildScreen.left + plusHalf;
      y2 = addChildScreen.top;
      break;
    case 'right':
    default:
      x1 = screenRect.left + screenRect.width;
      y1 = cy;
      x2 = addChildScreen.left - plusHalf;
      y2 = addChildScreen.top;
      break;
  }

  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={accent}
        strokeWidth={Math.max(1.5, 1.5 * zoom)}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 子节点方向连接线上的 + 号 */
function ChildPlusButton({
  left,
  top,
  zoom,
  accent,
  title = '添加子节点 (Tab)',
  onClick,
}: {
  left: number;
  top: number;
  zoom: number;
  accent: string;
  title?: string;
  onClick: () => void;
}) {
  const size = QUICK_PLUS_SIZE * zoom;
  return (
    <button
      type="button"
      title={title}
      aria-label="添加子节点"
      onClick={onClick}
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'absolute',
        left: left - size / 2,
        top: top - size / 2,
        width: size,
        height: size,
        padding: 0,
        border: 'none',
        borderRadius: '50%',
        background: accent,
        color: '#fff',
        fontSize: Math.round(14 * zoom),
        fontWeight: 500,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: `0 1px ${4 * zoom}px rgba(31, 35, 41, 0.12)`,
        pointerEvents: 'auto',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.08)';
        e.currentTarget.style.boxShadow = `0 2px ${8 * zoom}px ${accent}55`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = `0 1px ${4 * zoom}px rgba(31, 35, 41, 0.12)`;
      }}
    >
      +
    </button>
  );
}

function addChildTitle(dir: MindmapGrowDirection): string {
  switch (dir) {
    case 'up': return '向上添加子节点';
    case 'down': return '向下添加子节点';
    case 'left': return '向左添加子节点';
    case 'right': return '向右添加子节点';
    default: return '添加子节点 (Tab)';
  }
}

function renderAddChildSlots(
  slots: MindmapAddChildSlot[],
  screenRect: MindmapNodeQuickActionsProps['screenRect'],
  layoutOrigin: MindmapNodeQuickActionsProps['layoutOrigin'],
  zoom: number,
  accent: string,
  onAddChild: (dir?: MindmapGrowDirection) => void,
) {
  return slots.map(slot => {
    const pt = toScreen(slot.point, screenRect, layoutOrigin);
    return (
      <React.Fragment key={slot.dir}>
        <ChildConnectorLine
          screenRect={screenRect}
          addChildScreen={pt}
          addChildDir={slot.dir}
          zoom={zoom}
          accent={accent}
        />
        <ChildPlusButton
          left={pt.left}
          top={pt.top}
          zoom={zoom}
          accent={accent}
          title={addChildTitle(slot.dir)}
          onClick={() => onAddChild(slot.dir)}
        />
      </React.Fragment>
    );
  });
}

export const MindmapNodeQuickActions: React.FC<MindmapNodeQuickActionsProps> = ({
  actions,
  screenRect,
  layoutOrigin,
  accent = '#3370FF',
  onAddSiblingBefore,
  onAddSiblingAfter,
  onAddChild,
}) => {
  const z = screenRect.zoom;
  const siblingTop = toScreen(actions.siblingA, screenRect, layoutOrigin);
  const siblingBottom = toScreen(actions.siblingB, screenRect, layoutOrigin);
  const addChildPt = toScreen(actions.addChild, screenRect, layoutOrigin);
  const childSlots = actions.addChildSlots;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10040,
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {childSlots?.length
        ? renderAddChildSlots(childSlots, screenRect, layoutOrigin, z, accent, onAddChild)
        : (
          <>
            <ChildConnectorLine
              screenRect={screenRect}
              addChildScreen={addChildPt}
              addChildDir={actions.addChildDir}
              zoom={z}
              accent={accent}
            />
            <ChildPlusButton
              left={addChildPt.left}
              top={addChildPt.top}
              zoom={z}
              accent={accent}
              onClick={() => onAddChild(actions.addChildDir)}
            />
          </>
        )}
      <SiblingDotButton
        left={siblingTop.left}
        top={siblingTop.top}
        zoom={z}
        accent={accent}
        title="添加上方同级节点"
        onClick={onAddSiblingBefore}
      />
      <SiblingDotButton
        left={siblingBottom.left}
        top={siblingBottom.top}
        zoom={z}
        accent={accent}
        title="添加下方同级节点"
        onClick={onAddSiblingAfter}
      />
    </div>
  );
};
