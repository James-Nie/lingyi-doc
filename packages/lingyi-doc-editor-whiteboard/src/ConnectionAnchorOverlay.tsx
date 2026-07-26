import React from 'react';
import type { AnchorId, WhiteboardElement } from '@lingyi-doc/core-whiteboard';
import { getElementAnchors } from '@lingyi-doc/core-whiteboard';
import { WB_COLORS } from './styles';

interface ConnectionAnchorOverlayProps {
  element: WhiteboardElement;
  activeAnchor?: AnchorId | null;
  showAnchors?: boolean;
}

/** 连接吸附目标：高亮边框 + 锚点 */
export const ConnectionAnchorOverlay: React.FC<ConnectionAnchorOverlayProps> = ({
  element,
  activeAnchor = null,
  showAnchors = true,
}) => {
  const anchors = getElementAnchors(element);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: element.x - 2,
          top: element.y - 2,
          width: element.width + 4,
          height: element.height + 4,
          border: `2px solid ${WB_COLORS.accent}`,
          borderRadius: element.type === 'shape' ? 6 : 4,
          pointerEvents: 'none',
          zIndex: 9996,
          boxShadow: '0 0 0 4px rgba(51, 112, 255, 0.12)',
        }}
      />
      {showAnchors && anchors.map(a => (
        <div
          key={a.id}
          style={{
            position: 'absolute',
            left: a.x - 5,
            top: a.y - 5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: activeAnchor === a.id ? WB_COLORS.accent : '#fff',
            border: `2px solid ${WB_COLORS.accent}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 9997,
            boxShadow: activeAnchor === a.id ? '0 0 0 3px rgba(51,112,255,0.25)' : undefined,
          }}
        />
      ))}
    </>
  );
};
