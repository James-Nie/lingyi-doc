import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ChartHostProps {
  children: (size: { width: number; height: number }) => React.ReactNode;
}

/**
 * 为 Ant Charts 提供稳定的像素宽高。
 * 缩放过程中（父级 .react-grid-item.resizing）忽略尺寸变化，松手后再同步一次。
 */
export const ChartHost: React.FC<ChartHostProps> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const next = { width: Math.max(0, Math.floor(width)), height: Math.max(0, Math.floor(height)) };
    setSize(prev => (prev.width === next.width && prev.height === next.height ? prev : next));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    sync();

    const ro = new ResizeObserver(() => {
      const item = el.closest('.react-grid-item');
      if (item?.classList.contains('resizing')) return;
      sync();
    });
    ro.observe(el);

    const item = el.closest('.react-grid-item');
    let mo: MutationObserver | null = null;
    if (item) {
      mo = new MutationObserver(() => {
        if (!item.classList.contains('resizing')) sync();
      });
      mo.observe(item, { attributes: true, attributeFilter: ['class'] });
    }

    return () => {
      ro.disconnect();
      mo?.disconnect();
    };
  }, [sync]);

  return (
    <div
      ref={ref}
      className="dashboard-chart-host"
      style={{
        position: 'absolute',
        inset: 0,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
};
