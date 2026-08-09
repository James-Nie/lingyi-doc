import React from 'react';
import './doc-history-panel.css';

export interface DocHistoryToolbarProps {
  currentIndex: number;
  total: number;
  canRestore: boolean;
  restoring?: boolean;
  previewLoading?: boolean;
  onRestore: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export const DocHistoryToolbar: React.FC<DocHistoryToolbarProps> = ({
  currentIndex,
  total,
  canRestore,
  restoring,
  previewLoading,
  onRestore,
  onPrev,
  onNext,
  onClose,
}) => {
  const displayIndex = total > 0 ? currentIndex + 1 : 0;
  const canPrev = currentIndex < total - 1;
  const canNext = currentIndex > 0;

  return (
    <div className="doc-history-toolbar">
      <button
        type="button"
        className="doc-history-toolbar-btn doc-history-toolbar-restore"
        disabled={!canRestore || restoring || total === 0}
        onClick={onRestore}
      >
        {restoring ? '还原中...' : '还原此历史记录'}
      </button>

      <div className="doc-history-toolbar-center">
        <span className="doc-history-toolbar-counter" aria-live="polite">
          编辑记录 {displayIndex}/{total}
          <span
            className={`doc-history-toolbar-loading${previewLoading ? ' is-visible' : ''}`}
            aria-hidden={!previewLoading}
          >
            <span className="doc-history-toolbar-spinner" />
            加载中
          </span>
        </span>
        <button
          type="button"
          className="doc-history-toolbar-btn is-ghost"
          disabled={!canPrev || restoring}
          onClick={onPrev}
        >
          上一项
        </button>
        <button
          type="button"
          className="doc-history-toolbar-btn is-ghost"
          disabled={!canNext || restoring}
          onClick={onNext}
        >
          下一项
        </button>
      </div>

      <button type="button" className="doc-history-toolbar-close" onClick={onClose}>
        退出历史
      </button>
    </div>
  );
};
