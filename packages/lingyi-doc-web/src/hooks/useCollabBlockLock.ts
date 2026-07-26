import { useCallback, useEffect, useRef } from 'react';
import {
  mindnoteNodeLock,
  type BlockLockTarget,
  type DocumentCollabBridge,
} from '@lingyi-doc/core';

interface UseCollabBlockLockOptions {
  readOnly: boolean;
  collabBridgeRef: React.RefObject<DocumentCollabBridge | null>;
  resolveLock: (target: HTMLElement) => BlockLockTarget | null;
  isComposing?: () => boolean;
  fallbackNodeIdRef?: React.RefObject<string | null>;
  /** 抢锁失败时回调（通常用于 toast） */
  onLockDenied?: (lock: BlockLockTarget) => void;
}

/**
 * 聚焦可编辑区域时抢占区域锁；同一区域被他人占用则失焦。
 * 不同区域可并行编辑，不再把整文档切成只读。
 */
export function useCollabBlockLock({
  readOnly,
  collabBridgeRef,
  resolveLock,
  isComposing,
  fallbackNodeIdRef,
  onLockDenied,
}: UseCollabBlockLockOptions): void {
  const localLockRef = useRef<BlockLockTarget | null>(null);

  const endLocalLock = useCallback(() => {
    const bridge = collabBridgeRef.current;
    if (!bridge || !localLockRef.current) return;
    bridge.endBlockEdit();
    localLockRef.current = null;
  }, [collabBridgeRef]);

  useEffect(() => {
    if (readOnly) return;

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.isContentEditable && target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') return;

      const bridge = collabBridgeRef.current;
      if (!bridge) return;

      let lock = resolveLock(target);
      if (!lock && fallbackNodeIdRef?.current) {
        lock = mindnoteNodeLock(fallbackNodeIdRef.current);
      }
      if (!lock) return;

      if (!bridge.tryStartBlockEdit(lock)) {
        onLockDenied?.(lock);
        target.blur();
        return;
      }
      localLockRef.current = lock;
    };

    const onFocusOut = () => {
      const lockAtBlur = localLockRef.current;
      window.setTimeout(() => {
        if (isComposing?.()) return;
        if (!localLockRef.current) return;
        // focus 已切到另一区域时，focusin 会更新 localLockRef，此处勿误释新锁
        if (localLockRef.current !== lockAtBlur) return;
        const active = document.activeElement;
        if (
          active instanceof HTMLElement
          && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')
        ) {
          return;
        }
        endLocalLock();
      }, 0);
    };

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [readOnly, collabBridgeRef, resolveLock, isComposing, fallbackNodeIdRef, endLocalLock, onLockDenied]);
}
