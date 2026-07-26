import React from 'react';

interface WbCommentPinIconProps {
  selected?: boolean;
  size?: number;
}

export const WB_COMMENT_PIN_SCREEN_SIZE = 26;

export const WbCommentPinIcon: React.FC<WbCommentPinIconProps> = ({
  selected = false,
  size = WB_COMMENT_PIN_SCREEN_SIZE,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 26 26"
    fill="none"
    aria-hidden
    style={{ display: 'block', overflow: 'visible' }}
  >
    <defs>
      <filter id="wb-comment-pin-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" floodColor="#000000" floodOpacity="0.16" />
      </filter>
    </defs>
    <g filter="url(#wb-comment-pin-shadow)">
      <path
        d="M5.5 4.5H18.5C20.433 4.5 22 6.067 22 8V16.5C22 18.433 20.433 20 18.5 20H12.5L8.5 23.5V20H5.5C3.567 20 2 18.433 2 16.5V8C2 6.067 3.567 4.5 5.5 4.5Z"
        fill={selected ? '#FFD95A' : '#FFE27A'}
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <line
        x1="9"
        y1="12.5"
        x2="17"
        y2="12.5"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
  </svg>
);
