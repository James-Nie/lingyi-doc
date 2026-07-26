import { useCallback, useEffect, useRef, useState } from 'react';

interface EditorDropdownOpenOptions {
  /** 是否在挂载后自动展开（单元格编辑用；详情抽屉等内联场景应关闭） */
  autoOpen?: boolean;
  closeDelayMs?: number;
}

/** 延迟展开下拉，避免打开编辑器的同一次 mousedown 被判定为 click-outside */
export function useEditorDropdownOpen(options: EditorDropdownOpenOptions = {}) {
  const { autoOpen = true, closeDelayMs = 150 } = options;
  const [open, setOpen] = useState(false);
  const allowCloseRef = useRef(false);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!autoOpen) {
      allowCloseRef.current = true;
      return;
    }
    closedRef.current = false;
    const openTimer = window.setTimeout(() => setOpen(true), 0);
    const closeTimer = window.setTimeout(() => {
      allowCloseRef.current = true;
    }, closeDelayMs);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    };
  }, [autoOpen, closeDelayMs]);

  const handleOpenChange = useCallback((nextOpen: boolean, onClose: () => void) => {
    if (!nextOpen && !allowCloseRef.current) return;
    setOpen(nextOpen);
    if (!nextOpen && !closedRef.current) {
      closedRef.current = true;
      onClose();
    }
  }, []);

  return { open, setOpen, handleOpenChange };
}
