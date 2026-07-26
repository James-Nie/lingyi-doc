import { useLayoutEffect, useRef } from 'react';

/** 在 contentEditable 上绑定原生 paste（bubble 阶段，clipboard 最可靠） */
export function useNativePasteHandler(
  elRef: React.RefObject<HTMLElement | null>,
  handler: ((e: ClipboardEvent, el: HTMLElement) => void) | undefined,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el || !handlerRef.current) return;

    const onPaste = (e: ClipboardEvent) => {
      handlerRef.current?.(e, el);
    };

    el.addEventListener('paste', onPaste, true);
    return () => el.removeEventListener('paste', onPaste, true);
  });
}
