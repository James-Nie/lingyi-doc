import React from 'react';
import { getDocTypeMeta } from '../../../utils/docTypeMeta';
import { SIDEBAR_ACTIVE_COLOR } from './sidebarTheme';

interface SidebarDocTypeIconProps {
  docType?: string;
  active?: boolean;
}

export const SidebarDocTypeIcon: React.FC<SidebarDocTypeIconProps> = ({ docType, active }) => {
  const meta = getDocTypeMeta(docType);
  return (
    <span style={{
      width: 18,
      height: 18,
      borderRadius: 4,
      background: active ? '#fff' : meta.bg,
      flexShrink: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      color: active ? SIDEBAR_ACTIVE_COLOR : meta.color,
      fontWeight: 600,
    }}>
      {meta.icon}
    </span>
  );
};
