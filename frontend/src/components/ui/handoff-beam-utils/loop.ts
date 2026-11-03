// Placeholder stub for the handoff-beam visibility loop hook.
// Replace with the real implementation from the handoff-beam package.

import { useEffect, useRef, type RefObject } from "react";

export function useVisibleLoop(

  ref: RefObject<HTMLDivElement>,

  frame: (dt: number) => void,

  opts?: { fpsCap?: number },

): void {

  useEffect(() => {

    const el = ref.current;

    if (!el) return;

    let raf: number;

    let last = performance.now();

    const loop = (now: number) => {

      const dt = (now - last) / 1000;

      last = now;

      frame(dt);

      raf = requestAnimationFrame(loop);

    };

    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);

  }, [frame]);

}
