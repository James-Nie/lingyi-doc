import React from 'react';
import type { ShapeKind } from '@lingyi-doc/core';
import { PLUS_SHAPE_PATH_D } from './canvas/shapePaths';

const S = { fill: 'none', stroke: '#333', strokeWidth: 1.5, strokeLinejoin: 'round' as const };

export function ShapeIcon({ kind }: { kind: ShapeKind }) {
  const icon = (() => {
    switch (kind) {
      case 'roundRect':
        return <rect x="4" y="6" width="16" height="12" rx="3" {...S} />;
      case 'ellipse':
        return <rect x="2" y="9" width="20" height="6" rx="3" ry="3" {...S} />;
      case 'diamond':
        return <polygon points="12,4 20,12 12,20 4,12" {...S} />;
      case 'rect':
        return <rect x="5" y="6" width="14" height="12" {...S} />;
      case 'circle':
        return <circle cx="12" cy="12" r="7" {...S} />;
      case 'cylinder':
        return (
          <>
            <ellipse cx="12" cy="7" rx="7" ry="2.5" {...S} />
            <path d="M5 7v10 M19 7v10" {...S} />
            <ellipse cx="12" cy="17" rx="7" ry="2.5" {...S} />
          </>
        );
      case 'chevron':
        return <polygon points="6,5 18,12 6,19 10,12" {...S} />;
      case 'dShape':
        return <path d="M5 5h8a5 5 0 0 1 0 10H5V5z" {...S} />;
      case 'parallelogram':
        return <polygon points="7,5 20,5 17,19 4,19" {...S} />;
      case 'trapezoid':
        return <polygon points="6,5 18,5 20,19 4,19" {...S} />;
      case 'speechBubble':
        return (
          <>
            <ellipse cx="12" cy="10" rx="7.8" ry="5.5" {...S} />
            <path d="M7.5 14.2L5.2 18.2 9.2 16.8" {...S} strokeLinejoin="round" />
          </>
        );
      case 'speechBubbleRect':
        return (
          <path
            d="M5.5 6h13a2 2 0 0 1 2 2v4.8a2 2 0 0 1-2 2h-4.6l1.4 3.2 1.8-3.2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
            {...S}
            strokeLinejoin="round"
          />
        );
      case 'triangleRight':
        return <polygon points="5,5 5,19 19,19" {...S} />;
      case 'triangle':
        return <polygon points="12,5 20,19 4,19" {...S} />;
      case 'star':
        return <polygon points="12,3 14.5,9 21,9 16,13 18,20 12,16 6,20 8,13 3,9 9.5,9" {...S} />;
      case 'hexagon':
        return <polygon points="12,4 18,7.5 18,16.5 12,20 6,16.5 6,7.5" {...S} />;
      case 'pentagon':
        return <polygon points="12,4 18.5,9 16,17 8,17 5.5,9" {...S} />;
      case 'octagon':
        return <polygon points="8,4 16,4 20,8 20,16 16,20 8,20 4,16 4,8" {...S} />;
      case 'arrowLeft':
        return <polygon points="19,6 10,6 10,4 4,12 10,20 10,18 19,18" {...S} />;
      case 'arrowRight':
        return <polygon points="5,6 14,6 14,4 20,12 14,20 14,18 5,18" {...S} />;
      case 'arrowDouble':
        return <polygon points="4,12 8,8 8,10 16,10 16,8 20,12 16,16 16,14 8,14 8,16" {...S} />;
      case 'cloud':
        return <path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6-1A3.5 3.5 0 0 0 7 18z" {...S} />;
      case 'braceLeft':
        return (
          <>
            <path d="M19 4C13 4 12 8 14 12C12 16 13 20 19 20" {...S} strokeLinecap="round" />
            <path d="M4 7H14M4 12H14M4 17H14" {...S} strokeLinecap="round" />
          </>
        );
      case 'braceRight':
        return (
          <>
            <path d="M5 4C11 4 12 8 10 12C12 16 11 20 5 20" {...S} strokeLinecap="round" />
            <path d="M10 7H20M10 12H20M10 17H20" {...S} strokeLinecap="round" />
          </>
        );
      case 'plus':
        return <path d={PLUS_SHAPE_PATH_D} {...S} />;
      case 'process':
        return <rect x="4" y="8" width="16" height="8" rx="4" {...S} />;
      case 'document':
        return <path d="M7 4h10v16H7z M7 4l4 4h6" {...S} />;
      default:
        return <rect x="5" y="6" width="14" height="12" {...S} />;
    }
  })();

  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
      {icon}
    </svg>
  );
}
