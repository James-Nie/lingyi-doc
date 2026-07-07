import React from 'react';

export const APP_LOGO_SRC = '/logo.png';
export const APP_NAME = '零一文档';

interface AppLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

/** 品牌 Logo 图标 */
export const AppLogo: React.FC<AppLogoProps> = ({
  size = 32,
  className,
  style,
  alt = APP_NAME,
}) => (
  <img
    src={APP_LOGO_SRC}
    alt={alt}
    width={size}
    height={size}
    className={className}
    style={{
      display: 'block',
      objectFit: 'contain',
      flexShrink: 0,
      ...style,
    }}
  />
);

interface AppLogoWithNameProps extends AppLogoProps {
  name?: string;
  gap?: number;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
}

/** Logo + 产品名 */
export const AppLogoWithName: React.FC<AppLogoWithNameProps> = ({
  size = 32,
  name = APP_NAME,
  gap = 10,
  fontSize = 15,
  fontWeight = 600,
  color = '#1f2329',
  className,
  style,
  alt,
}) => (
  <span
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap,
      ...style,
    }}
  >
    <AppLogo size={size} alt={alt} />
    <span style={{ fontSize, fontWeight, color, lineHeight: 1.2 }}>{name}</span>
  </span>
);
