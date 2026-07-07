import React, { useLayoutEffect, useState } from 'react';
import type { DocBlock, DocSelection } from '@lingyi-doc/core';
import {
  collectDocSelectionRects,
  DOC_SELECTION_BG,
  isCollapsedDocSelection,
} from '@lingyi-doc/core';

interface DocSelectionOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  docSelection: DocSelection | null;
  blocks: DocBlock[];
  blockRefs: React.RefObject<Map<string, HTMLElement>>;
}

export const DocSelectionOverlay: React.FC<DocSelectionOverlayProps> = ({
  containerRef,
  docSelection,
  blocks,
  blockRefs,
}) => {
  const [rects, setRects] = useState<DOMRect[]>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !docSelection || isCollapsedDocSelection(docSelection)) {
      setRects([]);
      return;
    }

    const update = () => {
      const refs = blockRefs.current;
      if (!refs) {
        setRects([]);
        return;
      }
      const next = collectDocSelectionRects(
        docSelection,
        blocks,
        refs,
        container,
      );
      setRects(next);
    };

    update();
    container.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      container.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [containerRef, docSelection, blocks, blockRefs]);

  if (!rects.length) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'hidden',
      }}
    >
      {rects.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.width,
            height: r.height,
            background: DOC_SELECTION_BG,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
};
