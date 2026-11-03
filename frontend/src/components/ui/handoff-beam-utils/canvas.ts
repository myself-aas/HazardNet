// Placeholder stub for the handoff-beam element-size hook.
// Replace with the real implementation from the handoff-beam package.

import { useRef, useState, useEffect, type RefObject } from "react";

export function useElementSize(

  ref: RefObject<HTMLDivElement>,

): { width: number; height: number } {

  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {

    const el = ref.current;

    if (!el) return;

    const ro = new ResizeObserver((entries) => {

      const entry = entries[0];

      if (!entry) return;

      setSize({

        width: entry.contentRect.width,

        height: entry.contentRect.height,

      });

    });

    ro.observe(el);

    return () => ro.disconnect();

  }, []);

  return size;

}
