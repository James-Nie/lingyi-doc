import React from 'react';
import type { ColumnType } from '@lingyi-doc/core';

export interface FieldTypeIconProps {
  type: ColumnType;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

const ICON_VIEW = 16;

function IconPaths({ type, color }: { type: ColumnType; color: string }) {
  const stroke = color;
  const fill = color;
  const sw = 1.2;

  switch (type) {
    case 'text':
      return (
        <>
          <text x="8" y="6.5" textAnchor="middle" fontSize="7" fontWeight="600" fill={fill}>A</text>
          {[8.5, 10.5, 12.5].map(y => (
            <line key={y} x1="4" y1={y} x2="12" y2={y} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          ))}
        </>
      );
    case 'select':
      return (
        <>
          <circle cx="8" cy="8" r="5.5" fill="none" stroke={stroke} strokeWidth={sw} />
          <path d="M6 7.5 L8 10 L10 7.5" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'multiSelect':
      return (
        <>
          {[5, 8, 11].map(y => (
            <g key={y}>
              <circle cx="4.5" cy={y} r="1.1" fill={fill} />
              <line x1="7" y1={y} x2="13" y2={y} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
            </g>
          ))}
        </>
      );
    case 'user':
      return (
        <>
          <circle cx="8" cy="5.8" r="2.2" fill="none" stroke={stroke} strokeWidth={sw} />
          <path d="M4.5 13.5 Q8 10.5 11.5 13.5" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </>
      );
    case 'date':
    case 'datetime':
      return (
        <>
          <rect x="3" y="3" width="10" height="10" rx="1.5" fill="none" stroke={stroke} strokeWidth={sw} />
          <line x1="3" y1="6.5" x2="13" y2="6.5" stroke={stroke} strokeWidth={sw} />
          {[0, 1].map(row => [0, 1, 2].map(col => (
            <circle
              key={`${row}-${col}`}
              cx={5 + col * 2.2}
              cy={8.2 + row * 2.2}
              r="0.7"
              fill={fill}
            />
          )))}
        </>
      );
    case 'attachment':
      return (
        <path
          d="M10.5 3.5 L6 8.5 A2.2 2.2 0 1 0 9.5 11.5 L11 10 A2.2 2.2 0 1 0 13.5 7.5 L9 3"
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'number':
      return <text x="8" y="11" textAnchor="middle" fontSize="10" fontWeight="600" fill={fill}>#</text>;
    case 'percent':
      return <text x="8" y="11" textAnchor="middle" fontSize="9" fontWeight="600" fill={fill}>%</text>;
    case 'boolean':
      return (
        <>
          <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="none" stroke={stroke} strokeWidth={sw} />
          <path d="M5.5 8 L7 9.8 L10.8 6.2" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'link':
      return (
        <>
          <circle cx="6" cy="10" r="2.2" fill="none" stroke={stroke} strokeWidth={sw} />
          <circle cx="10" cy="6" r="2.2" fill="none" stroke={stroke} strokeWidth={sw} />
          <line x1="7.6" y1="8.4" x2="8.4" y2="7.6" stroke={stroke} strokeWidth={sw} />
        </>
      );
    case 'formula':
      return <text x="8" y="10.5" textAnchor="middle" fontSize="6.5" fontWeight="600" fill={fill}>fx</text>;
    case 'autoNumber':
      return (
        <>
          {[5, 8, 11].map((y, i) => (
            <g key={y}>
              <text x="3" y={y + 1} fontSize="4.5" fontWeight="500" fill={fill}>{i + 1}</text>
              <line x1="6" y1={y - 1} x2="13" y2={y - 1} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
            </g>
          ))}
        </>
      );
    case 'phone':
      return (
        <path
          d="M10 3.5 L10 12.5 Q10 13.5 8.8 13.5 L7.2 13.5 Q6 13.5 6 12.5 L6 4.5 Q6 3.5 7.2 3.5 L8.8 3.5 Q10 3.5 10 4.5 Z"
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      );
    case 'email':
      return (
        <>
          <rect x="3" y="5" width="10" height="7" rx="1" fill="none" stroke={stroke} strokeWidth={sw} />
          <path d="M3 5 L8 9 L13 5" fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </>
      );
    case 'progress':
      return (
        <>
          <rect x="2.5" y="6" width="11" height="4.5" rx="2.25" fill="none" stroke={stroke} strokeWidth={sw} />
          {[0, 1, 2, 3, 4].map(i => (
            <line
              key={i}
              x1={1 + i * 3}
              y1="11"
              x2={4 + i * 3}
              y2="5"
              stroke={stroke}
              strokeWidth="0.8"
              strokeLinecap="round"
            />
          ))}
        </>
      );
    case 'currency':
      return (
        <>
          <circle cx="8" cy="8" r="5.5" fill="none" stroke={stroke} strokeWidth={sw} />
          <text x="8" y="10.5" textAnchor="middle" fontSize="7" fontWeight="600" fill={fill}>¥</text>
        </>
      );
    case 'rating':
      return (
        <path
          d="M8 3.2 L9.4 6.8 L13.2 7.1 L10.2 9.4 L11.1 13.1 L8 11.2 L4.9 13.1 L5.8 9.4 L2.8 7.1 L6.6 6.8 Z"
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      );
    default:
      return <text x="8" y="11" textAnchor="middle" fontSize="9" fill={fill}>?</text>;
  }
}

/** 字段类型图标（与列头 canvas 图标视觉一致） */
export const FieldTypeIcon: React.FC<FieldTypeIconProps> = ({
  type,
  size = 16,
  color = '#646A73',
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox={`0 0 ${ICON_VIEW} ${ICON_VIEW}`}
    fill="none"
    style={{ display: 'block', flexShrink: 0, ...style }}
    aria-hidden
  >
    <IconPaths type={type} color={color} />
  </svg>
);
