import React from 'react';

const S = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconUndo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M9 7H5v4" /><path d="M5 11c1.5-3 4.5-5 8-5 4.4 0 8 3.6 8 8s-3.6 8-8 8a8 8 0 01-6-2.7" /></svg>
);
export const IconRedo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M15 7h4v4" /><path d="M19 11c-1.5-3-4.5-5-8-5-4.4 0-8 3.6-8 8s3.6 8 8 8a8 8 0 006-2.7" /></svg>
);
export const IconBold = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h5.5a3.5 3.5 0 010 7H8V5zm0 9h6.5a3.5 3.5 0 010 7H8v-7z" /></svg>;
export const IconItalic = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M12 5h4M8 19h4M14 5l-4 14" /></svg>;
export const IconStrike = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M5 12h14M7 7c0-2 2.5-3 5-3s5 1 5 3M7 17c0 2 2.5 3 5 3s5-1 5-3" /></svg>;
export const IconUnderline = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M6 5v6a6 6 0 0012 0V5M4 19h16" /></svg>;
export const IconInlineCode = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M8 8L4 12l4 4M16 8l4 4-4 4" /></svg>;
export const IconAlignLeft = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /></svg>;
export const IconAlignCenter = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M4 6h16M7 10h10M4 14h16M7 18h10" /></svg>;
export const IconAlignRight = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M4 6h16M10 10h10M4 14h16M10 18h10" /></svg>;
export const IconBulletList = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" /><path d="M9 7h10M9 12h10M9 17h10" /></svg>;
export const IconOrderedList = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M9 7h10M9 12h10M9 17h10" /><text x="3" y="9" fontSize="7" fill="currentColor" stroke="none">1</text><text x="3" y="14" fontSize="7" fill="currentColor" stroke="none">2</text><text x="3" y="19" fontSize="7" fill="currentColor" stroke="none">3</text></svg>;
export const IconIndentInc = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /><path d="M18 8l3 4-3 4" /></svg>;
export const IconIndentDec = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M4 6h16M8 10h10M4 14h16M8 18h10" /><path d="M14 8l-3 4 3 4" /></svg>;
export const IconTask = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><rect x="4" y="5" width="14" height="14" rx="2" /><path d="M8 12l2.5 2.5L16 9" /></svg>;
export const IconLink = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M10 14a3.5 3.5 0 004.95 0l2.1-2.1a3.5 3.5 0 00-5-5L11 8" /><path d="M14 10a3.5 3.5 0 00-4.95 0L7 12.1a3.5 3.5 0 005 5l1.05-1.05" /></svg>;
export const IconQuote = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 17h3V10H5v1c0-2 1.5-3 3-3V6C6 6 4 8 4 11v6zm8 0h3V10h-4v1c0-2 1.5-3 3-3V6c-3 0-5 2-5 5v6z" /></svg>;
export const IconDivider = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M4 12h16" /></svg>;
export const IconImage = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M4 16l4-4 4 4 3-3 5 5" /></svg>;
export const IconOutline = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M6 5h12v14H6z" /><path d="M9 9h6M9 12h6M9 15h4" /></svg>;
export const IconFullscreen = () => <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" /></svg>;
/** 查找替换：文本行 + 放大镜 */
export const IconFindReplace = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...S}>
    <path d="M3 6h8M3 10h6M3 14h4" />
    <circle cx="15.5" cy="14.5" r="4" />
    <path d="M18.5 17.5L21 20" />
  </svg>
);
export const IconHighlight = ({ color = '#FBDE28' }: { color?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M4 20h16" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <path d="M7 14l3-8 4 4 3-5 3 9H7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15" />
  </svg>
);
export const IconTextColor = ({ color = '#DF2A3F' }: { color?: string }) => (
  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
    <span style={{ fontWeight: 700, fontSize: 15, color: '#1F2329' }}>A</span>
    <span style={{ width: 14, height: 3, background: color, borderRadius: 1, marginTop: 1 }} />
  </span>
);
export const IconChevronDown = ({ size = 8 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.45 }}>
    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function IconBtnWrap({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: active ? '#165DFF' : '#1F2329' }}>
      {children}
    </span>
  );
}
