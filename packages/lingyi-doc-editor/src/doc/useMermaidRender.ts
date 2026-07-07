import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let mermaidReady = false;

function ensureMermaid() {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  });
  mermaidReady = true;
}

let renderCounter = 0;

export function useMermaidRender(source: string, blockId: string) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);

    const trimmed = source.trim();
    if (!trimmed) {
      setSvg('');
      setError(null);
      setRendering(false);
      return;
    }

    setRendering(true);
    timerRef.current = window.setTimeout(async () => {
      ensureMermaid();
      const renderId = `mermaid-${blockId}-${++renderCounter}`;
      try {
        const { svg: rendered } = await mermaid.render(renderId, trimmed);
        setSvg(rendered);
        setError(null);
      } catch (err) {
        setSvg('');
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setRendering(false);
      }
    }, 280);

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [source, blockId]);

  return { svg, error, rendering };
}
