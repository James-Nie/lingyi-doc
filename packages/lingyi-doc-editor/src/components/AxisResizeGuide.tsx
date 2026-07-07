import React from 'react';

export interface AxisResizeGuideProps {
  type: 'col' | 'row';
  /** 虚线位置（相对 canvas 容器） */
  linePos: number;
  /** 行调整时的上边界虚线 */
  linePosSecondary?: number;
  /** 尺寸提示位置（相对 canvas 容器） */
  tooltipX: number;
  tooltipY: number;
  size: number;
  containerHeight: number;
}

export const AxisResizeGuide: React.FC<AxisResizeGuideProps> = ({
  type,
  linePos,
  linePosSecondary,
  tooltipX,
  tooltipY,
  size,
  containerHeight,
}) => (
  <>
    {type === 'col' ? (
      <div
        style={{
          position: 'absolute',
          left: linePos,
          top: 0,
          height: containerHeight,
          width: 0,
          borderLeft: '1px dashed #b0b0b0',
          pointerEvents: 'none',
          zIndex: 150,
        }}
      />
    ) : (
      <>
        {linePosSecondary != null && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: linePosSecondary,
              width: '100%',
              height: 0,
              borderTop: '1px dashed #b0b0b0',
              pointerEvents: 'none',
              zIndex: 150,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: linePos,
            width: '100%',
            height: 0,
            borderTop: '1px dashed #b0b0b0',
            pointerEvents: 'none',
            zIndex: 150,
          }}
        />
      </>
    )}
    <div
      style={{
        position: 'absolute',
        left: tooltipX,
        top: tooltipY,
        transform: 'translate(-50%, -50%)',
        padding: '4px 10px',
        background: '#fff',
        border: '1px solid #dee0e3',
        borderRadius: 6,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        fontSize: 12,
        color: '#1f2329',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 151,
        userSelect: 'none',
      }}
    >
      {Math.round(size)} 像素
    </div>
  </>
);
