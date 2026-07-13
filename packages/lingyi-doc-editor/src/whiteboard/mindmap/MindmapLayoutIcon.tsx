import React from 'react';
import type { MindmapLayout } from '@lingyi-doc/core';

const ROOT_FILL = '#8a8e99';
const ROOT_STROKE = '#1a1a1b';
const LEAF_FILL = '#e5e7eb';
const LINE = { stroke: ROOT_STROKE, strokeWidth: 1.1, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function Node({ x, y, w, h, root }: { x: number; y: number; w: number; h: number; root?: boolean }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={root ? 2.5 : 1.5}
      fill={root ? ROOT_FILL : LEAF_FILL}
      stroke={root ? ROOT_STROKE : 'none'}
      strokeWidth={root ? 1.2 : 0}
    />
  );
}

function Leaf({ x, y, w }: { x: number; y: number; w: number }) {
  return <rect x={x} y={y} width={w} height={3} rx={1.5} fill={LEAF_FILL} />;
}

export function MindmapLayoutIcon({ layout, size = 52 }: { layout: MindmapLayout; size?: number }) {
  const icon = (() => {
    switch (layout) {
      case 'right':
        return (
          <>
            <Node x={4} y={10} w={10} h={6} root />
            <Leaf x={18} y={8} w={10} /><Leaf x={18} y={12} w={10} /><Leaf x={18} y={16} w={10} />
            <path d="M14 13 H16 V9 M16 13 V17 M16 9 H18 M16 17 H18" {...LINE} />
          </>
        );
      case 'left':
        return (
          <>
            <Node x={30} y={10} w={10} h={6} root />
            <Leaf x={16} y={8} w={10} /><Leaf x={16} y={12} w={10} /><Leaf x={16} y={16} w={10} />
            <path d="M30 13 H28 V9 M28 13 V17 M28 9 H26 M28 17 H26" {...LINE} />
          </>
        );
      case 'balanced':
        return (
          <>
            <Node x={15} y={10} w={10} h={6} root />
            <Leaf x={4} y={8} w={8} /><Leaf x={4} y={12} w={8} /><Leaf x={4} y={16} w={8} />
            <Leaf x={28} y={8} w={8} /><Leaf x={28} y={12} w={8} /><Leaf x={28} y={16} w={8} />
            <path d="M15 13 H12 M25 13 H28 M20 13 V9 M20 13 V17" {...LINE} />
          </>
        );
      case 'vertical':
        return (
          <>
            <Node x={15} y={10} w={10} h={6} root />
            <Leaf x={6} y={4} w={8} /><Leaf x={15} y={4} w={8} /><Leaf x={24} y={4} w={8} />
            <Leaf x={10} y={18} w={8} /><Leaf x={22} y={18} w={8} />
            <path d="M20 10 V7 M20 7 H6 M20 7 H15 M20 7 H24 M20 16 V19 M20 19 H10 M20 19 H22" {...LINE} />
          </>
        );
      case 'treeRight':
        return (
          <>
            <Node x={4} y={3} w={12} h={6} root />
            <Leaf x={20} y={11} w={10} /><Leaf x={20} y={15} w={10} /><Leaf x={30} y={11} w={8} />
            <path d="M10 9 V17 M10 12 H20 M10 16 H20 M20 12 H30" {...LINE} />
          </>
        );
      case 'treeLeft':
        return (
          <>
            <Node x={28} y={3} w={12} h={6} root />
            <Leaf x={8} y={11} w={10} /><Leaf x={8} y={15} w={10} /><Leaf x={6} y={11} w={8} />
            <path d="M34 9 V17 M34 12 H18 M34 16 H18 M18 12 H6" {...LINE} />
          </>
        );
      case 'treeBalanced':
        return (
          <>
            <Node x={15} y={4} w={10} h={6} root />
            <Leaf x={4} y={14} w={8} /><Leaf x={4} y={18} w={8} />
            <Leaf x={28} y={14} w={8} /><Leaf x={28} y={18} w={8} />
            <path d="M20 10 V14 M20 14 H12 M20 14 H28" {...LINE} />
          </>
        );
      case 'timelineH':
        return (
          <>
            <Node x={4} y={10} w={8} h={6} root />
            <Leaf x={16} y={10} w={8} /><Leaf x={26} y={10} w={8} /><Leaf x={36} y={10} w={6} />
            <Leaf x={20} y={4} w={6} /><Leaf x={30} y={16} w={6} />
            <path d="M12 13 H40 M20 13 V7 M30 13 V17" {...LINE} />
          </>
        );
      case 'timelineV':
        return (
          <>
            <Node x={15} y={4} w={10} h={6} root />
            <Leaf x={6} y={14} w={8} /><Leaf x={26} y={20} w={8} /><Leaf x={6} y={22} w={8} />
            <Leaf x={2} y={12} w={5} /><Leaf x={32} y={18} w={5} />
            <path d="M20 10 V24 M20 15 H10 M20 21 H30" {...LINE} />
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <svg width={size} height={Math.round(size * 0.55)} viewBox="0 0 44 24" aria-hidden>
      {icon}
    </svg>
  );
}
