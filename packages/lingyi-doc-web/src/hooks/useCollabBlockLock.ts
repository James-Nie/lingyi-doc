import { useCallback, useEffect, useRef } from 'react';
import {
  mindnoteNodeLock,
  type ActiveCellEditor,
  type BlockLockTarget,
  type DocumentCollabBridge,
} from '@lingyi-doc/core';

interface UseCollabBlockLockOptions {
  readOnly: boolean;
  collabBridgeRef: React.RefObject<DocumentCollabBridge | null>;
  resolveLock: (target: HTMLElement) => BlockLockTarget | null;
  isComposing?: () => boolean;
  fallbackNodeIdRef?: React.RefObject<string | null>;
}

export function useCollabBlockLock({
  readOnly,
  collabBridgeRef,
  resolveLock,
  isComposing,
  fallbackNodeIdRef,
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
        target.blur();
        return;
      }
      localLockRef.current = lock;
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        if (isComposing?.()) return;
        if (!localLockRef.current) return;
        endLocalLock();
      }, 0);
    };

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [readOnly, collabBridgeRef, resolveLock, isComposing, fallbackNodeIdRef, endLocalLock]);
}

export function isCollabViewOnly(
  readOnly: boolean,
  collabState: string,
  activeBlockEditor: ActiveCellEditor | null,
  myUserId: string,
): boolean {
  return !readOnly
    && collabState === 'connected'
    && activeBlockEditor != null
    && activeBlockEditor.userId !== myUserId;
}
