import React from 'react';
import type { MindmapLayout } from '@lingyi-doc/core';

const S = { stroke: '#646a73', strokeWidth: 1.2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function Node({ x, y, w, h, root }: { x: number; y: number; w: number; h: number; root?: boolean }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={root ? 2 : 1}
      fill={root ? '#646a73' : '#d0d3d6'}
      stroke="#333"
      strokeWidth={0.8}
    />
  );
}

function Leaf({ x, y, w }: { x: number; y: number; w: number }) {
  return <rect x={x} y={y} width={w} height={2.5} rx={1} fill="#d0d3d6" />;
}

export function MindmapLayoutIcon({ layout, size = 52 }: { layout: MindmapLayout; size?: number }) {
  const icon = (() => {
    switch (layout) {
      case 'right':
        return (
          <>
            <Node x={4} y={10} w={10} h={6} root />
            <Leaf x={18} y={8} w={10} /><Leaf x={18} y={12} w={10} /><Leaf x={18} y={16} w={10} />
            <path d="M14 13 H16 V9 M16 13 V17 M16 9 H18 M16 17 H18" {...S} />
          </>
        );
      case 'left':
        return (
          <>
            <Node x={30} y={10} w={10} h={6} root />
            <Leaf x={16} y={8} w={10} /><Leaf x={16} y={12} w={10} /><Leaf x={16} y={16} w={10} />
            <path d="M30 13 H28 V9 M28 13 V17 M28 9 H26 M28 17 H26" {...S} />
          </>
        );
      case 'balanced':
        return (
          <>
            <Node x={15} y={10} w={10} h={6} root />
            <Leaf x={4} y={8} w={8} /><Leaf x={4} y={12} w={8} /><Leaf x={4} y={16} w={8} />
            <Leaf x={28} y={8} w={8} /><Leaf x={28} y={12} w={8} /><Leaf x={28} y={16} w={8} />
            <path d="M15 13 H12 M25 13 H28 M20 13 V9 M20 13 V17" {...S} />
          </>
        );
      case 'vertical':
        return (
          <>
            <Node x={15} y={4} w={10} h={6} root />
            <Leaf x={6} y={16} w={8} /><Leaf x={15} y={16} w={8} /><Leaf x={24} y={16} w={8} />
            <path d="M20 10 V14 M20 14 H10 M20 14 H16 M20 14 H24" {...S} />
          </>
        );
      case 'treeRight':
        return (
          <>
            <Node x={4} y={4} w={12} h={6} root />
            <Leaf x={22} y={10} w={10} /><Leaf x={22} y={14} w={10} /><Leaf x={22} y={18} w={10} />
            <path d="M10 10 V20 M10 12 H22 M10 16 H22 M10 20 H22" {...S} />
          </>
        );
      case 'treeLeft':
        return (
          <>
            <Node x={24} y={4} w={12} h={6} root />
            <Leaf x={8} y={10} w={10} /><Leaf x={8} y={14} w={10} /><Leaf x={8} y={18} w={10} />
            <path d="M30 10 V20 M30 12 H18 M30 16 H18 M30 20 H18" {...S} />
          </>
        );
      case 'treeBalanced':
        return (
          <>
            <Node x={15} y={4} w={10} h={6} root />
            <Leaf x={4} y={14} w={8} /><Leaf x={4} y={18} w={8} />
            <Leaf x={28} y={14} w={8} /><Leaf x={28} y={18} w={8} />
            <path d="M20 10 V14 M20 14 H12 M20 14 H28" {...S} />
          </>
        );
      case 'timelineH':
        return (
          <>
            <Node x={4} y={10} w={8} h={6} root />
            <Leaf x={18} y={6} w={10} /><Leaf x={28} y={14} w={10} />
            <path d="M12 13 H36 M22 13 V8 M32 13 V16" {...S} />
          </>
        );
      case 'timelineV':
        return (
          <>
            <Node x={15} y={4} w={10} h={6} root />
            <Leaf x={6} y={16} w={8} /><Leaf x={26} y={22} w={8} />
            <path d="M20 10 V32 M20 18 H10 M20 26 H28" {...S} />
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
