import React from 'react';
import { DocHistoryPanel } from './DocHistoryPanel';
import { DocHistoryToolbar } from './DocHistoryToolbar';
import type { DocumentVersionListItem } from '../../api/documentVersion';

export interface DocumentHistoryChromeProps {
  docId: string;
  historyOpen: boolean;
  selectedVersion: number | null;
  selectedIndex: number;
  items: DocumentVersionListItem[];
  canRestore: boolean;
  previewLoading?: boolean;
  restoring?: boolean;
  onSelectVersion: (version: number) => void;
  onVersionsChange: (items: DocumentVersionListItem[]) => void;
  onRestore: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/** 历史模式顶栏；需单独放在 DocumentBar 下方 */
export const DocumentHistoryToolbarSlot: React.FC<Pick<
  DocumentHistoryChromeProps,
  | 'historyOpen'
  | 'selectedIndex'
  | 'items'
  | 'canRestore'
  | 'previewLoading'
  | 'restoring'
  | 'onRestore'
  | 'onPrev'
  | 'onNext'
  | 'onClose'
>> = ({
  historyOpen,
  selectedIndex,
  items,
  canRestore,
  previewLoading,
  restoring,
  onRestore,
  onPrev,
  onNext,
  onClose,
}) => {
  if (!historyOpen) return null;
  return (
    <DocHistoryToolbar
      currentIndex={Math.max(0, selectedIndex)}
      total={items.length}
      canRestore={canRestore}
      restoring={restoring}
      previewLoading={previewLoading}
      onRestore={onRestore}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
    />
  );
};

/** 右侧历史列表面板；放入内容区 flex row 中 */
export const DocumentHistoryPanelSlot: React.FC<Pick<
  DocumentHistoryChromeProps,
  | 'docId'
  | 'historyOpen'
  | 'selectedVersion'
  | 'onSelectVersion'
  | 'onVersionsChange'
  | 'onClose'
>> = ({
  docId,
  historyOpen,
  selectedVersion,
  onSelectVersion,
  onVersionsChange,
  onClose,
}) => {
  if (!historyOpen) return null;
  return (
    <DocHistoryPanel
      docId={docId}
      selectedVersion={selectedVersion}
      onSelectVersion={onSelectVersion}
      onVersionsChange={onVersionsChange}
      onClose={onClose}
    />
  );
};
