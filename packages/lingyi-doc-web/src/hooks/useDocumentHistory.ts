import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message } from 'antd';
import type { SaveManager } from '@lingyi-doc/core';
import {
  getDocumentVersion,
  restoreDocumentVersion,
  type DocumentVersionListItem,
} from '../api/documentVersion';
import { confirmDialog } from '../utils/appDialog';

export interface UseDocumentHistoryOptions {
  docId: string | undefined;
  canRestore: boolean;
  saveManagerRef: React.RefObject<SaveManager | null>;
  /** 预览历史版本内容（不应 markDirty） */
  applyPreviewSnapshot: (snapshot: Record<string, unknown>) => void;
  /** 退出历史 / 还原后重新加载当前文档 */
  reloadCurrentDocument: () => Promise<void>;
  onBeforeOpen?: () => void;
}

export function useDocumentHistory(options: UseDocumentHistoryOptions) {
  const {
    docId,
    canRestore,
    saveManagerRef,
    applyPreviewSnapshot,
    reloadCurrentDocument,
    onBeforeOpen,
  } = options;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<DocumentVersionListItem[]>([]);
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<number | null>(null);
  const [historyPreviewLoading, setHistoryPreviewLoading] = useState(false);
  const [historyRestoring, setHistoryRestoring] = useState(false);
  const historyOpenRef = useRef(false);
  const historyPreviewSeqRef = useRef(0);
  const applyPreviewSnapshotRef = useRef(applyPreviewSnapshot);
  const reloadCurrentDocumentRef = useRef(reloadCurrentDocument);
  const onBeforeOpenRef = useRef(onBeforeOpen);

  applyPreviewSnapshotRef.current = applyPreviewSnapshot;
  reloadCurrentDocumentRef.current = reloadCurrentDocument;
  onBeforeOpenRef.current = onBeforeOpen;

  useEffect(() => {
    historyOpenRef.current = historyOpen;
  }, [historyOpen]);

  const selectedHistoryIndex = useMemo(() => {
    if (selectedHistoryVersion == null) return -1;
    return historyItems.findIndex((item) => item.version === selectedHistoryVersion);
  }, [historyItems, selectedHistoryVersion]);

  const previewHistoryVersion = useCallback(async (version: number) => {
    if (!docId) return;
    const seq = ++historyPreviewSeqRef.current;
    setSelectedHistoryVersion(version);
    setHistoryPreviewLoading(true);
    try {
      const detail = await getDocumentVersion(docId, version);
      if (seq !== historyPreviewSeqRef.current || !historyOpenRef.current) return;
      if (detail.snapshotData && typeof detail.snapshotData === 'object') {
        applyPreviewSnapshotRef.current(detail.snapshotData as Record<string, unknown>);
      } else {
        message.warning('该版本没有可预览的内容');
      }
    } catch (err) {
      if (seq !== historyPreviewSeqRef.current) return;
      message.error(err instanceof Error ? err.message : '加载历史版本失败');
    } finally {
      if (seq === historyPreviewSeqRef.current) {
        setHistoryPreviewLoading(false);
      }
    }
  }, [docId]);

  const closeHistory = useCallback(async () => {
    setHistoryOpen(false);
    setSelectedHistoryVersion(null);
    setHistoryItems([]);
    try {
      await reloadCurrentDocumentRef.current();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '恢复当前文档失败');
    }
  }, []);

  const openHistory = useCallback(async () => {
    if (!docId) return;
    try {
      await saveManagerRef.current?.flush();
    } catch {
      // 继续进入历史模式
    }
    onBeforeOpenRef.current?.();
    setHistoryOpen(true);
  }, [docId, saveManagerRef]);

  const restoreHistoryVersion = useCallback(async () => {
    if (!docId || selectedHistoryVersion == null || !canRestore) return;
    const ok = await confirmDialog({
      title: '还原历史记录',
      content: '确定将文档还原到所选历史版本吗？还原后会生成一条新的历史记录，当前内容可在历史中查看。',
      okText: '还原',
    });
    if (!ok) return;

    setHistoryRestoring(true);
    try {
      await restoreDocumentVersion(docId, selectedHistoryVersion);
      message.success('已还原到所选版本');
      setHistoryOpen(false);
      setSelectedHistoryVersion(null);
      setHistoryItems([]);
      await reloadCurrentDocumentRef.current();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '还原失败');
    } finally {
      setHistoryRestoring(false);
    }
  }, [canRestore, docId, selectedHistoryVersion]);

  const handleHistoryVersionsChange = useCallback((items: DocumentVersionListItem[]) => {
    setHistoryItems(items);
  }, []);

  const goPrevHistory = useCallback(() => {
    if (selectedHistoryIndex < 0 || selectedHistoryIndex >= historyItems.length - 1) return;
    void previewHistoryVersion(historyItems[selectedHistoryIndex + 1].version);
  }, [historyItems, previewHistoryVersion, selectedHistoryIndex]);

  const goNextHistory = useCallback(() => {
    if (selectedHistoryIndex <= 0) return;
    void previewHistoryVersion(historyItems[selectedHistoryIndex - 1].version);
  }, [historyItems, previewHistoryVersion, selectedHistoryIndex]);

  return {
    historyOpen,
    historyOpenRef,
    historyItems,
    selectedHistoryVersion,
    selectedHistoryIndex,
    historyPreviewLoading,
    historyRestoring,
    openHistory,
    closeHistory,
    previewHistoryVersion,
    restoreHistoryVersion,
    handleHistoryVersionsChange,
    goPrevHistory,
    goNextHistory,
  };
}
