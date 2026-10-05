import { useEffect, useId, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { INFINITY as G } from '../../design-system/brand/infinity.generated';

/**
 * The HazardNet infinity loop as a loading animation — and a small toy you can play with while you wait.
 *
 * It draws exactly what `public/hazardnet-loader.svg` draws (same generated geometry, `infinity.generated.ts`): a faint
 * track, two comets half a lap apart (each a stack of four dashes whose heads line up: tail, mid, head, white core) and
 * a node at each lobe's apex that pulses as a comet head passes. What the SVG file cannot do, this can:
 *
 *   hover / touch   the comets speed up, smoothly (Web Animations `playbackRate`, eased — changing
 *                   `animation-duration` would make the comets jump), and the glow brightens
 *   pointer move    the whole loop tilts in 3D toward the pointer (perspective rotateX / rotateY, ≤ 16° / 22°)
 *   tap / click     a burst: a short surge of speed and a ring that expands from each apex node
 *
 * Calm by default for everyone who should not get motion: with `prefers-reduced-motion` (or Low-bandwidth mode,
 * which sets `data-low-bandwidth` on <html>) nothing moves — the comets freeze in a lit composition — and no
 * listeners are attached. It never traps focus or takes a tab stop; it is a polite `role="status"` whose only text is
 * the visually hidden `label`.
 */
export interface InfinityLoaderProps {
  /** Rendered width in px; the height follows the 128:72 viewBox. */
  size?: number;
  /** Spoken, not shown. */
  label?: string;
  /** Hover speed-up, pointer tilt and tap burst. Off → a plain loader. */
  interactive?: boolean;
  /** Announce `label` politely (role="status"). Turn off inside a wrapper that is already a status region. */
  announce?: boolean;
  className?: string;
}

const HOVER_RATE = 2.4;
const BURST_RATE = 4.4;
const BURST_MS = 900;

export const InfinityLoader: React.FC<InfinityLoaderProps> = ({
  size = 112,
  label = 'Loading',
  interactive = true,
  announce = true,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const gradientId = `hn-loop-g-${uid}`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const reduceMotion = useReducedMotion();

  const maxLen = Math.max(...G.layers.map((l) => l.len));
  // Comet delays line the dash HEADS up (longest tail starts earliest); the second comet runs half a lap behind.
  const delay = (len: number, comet: 0 | 1) => -((G.lap * (maxLen - len)) / 100 + (comet === 1 ? G.lap / 2 : 0));
  // The nodes flash as a head passes: timing derived from where the right apex sits on the path.
  const half = G.lap / 2;
  const hit = ((G.fraction.rightApex - maxLen + 100) % 50) / 100;
  const nodeDelay = -((half - ((hit * G.lap) % half) + 0.12 * half) % half);
  const still = (len: number, comet: 0 | 1) => -(maxLen - len) - (comet === 1 ? 50 : 0);

  useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    if (!root || !svg || !interactive || reduceMotion) return undefined;
    if (typeof svg.getAnimations !== 'function') return undefined;

    let rate = 1;
    let target = 1;
    let burstUntil = 0;
    let raf = 0;

    const tick = () => {
      raf = 0;
      const goal = performance.now() < burstUntil ? BURST_RATE : target;
      rate += (goal - rate) * 0.14;
      svg.getAnimations({ subtree: true }).forEach((animation) => {
        animation.playbackRate = rate;
      });
      root.dataset.hot = rate > 1.35 ? 'true' : 'false';
      if (Math.abs(goal - rate) > 0.01 || goal !== 1) raf = requestAnimationFrame(tick);
      else if (rate !== 1) {
        rate = 1;
        raf = requestAnimationFrame(tick);
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onEnter = () => {
      target = HOVER_RATE;
      kick();
    };
    const onLeave = () => {
      target = 1;
      svg.style.transform = '';
      kick();
    };
    const onMove = (event: PointerEvent) => {
      const box = root.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const nx = ((event.clientX - box.left) / box.width - 0.5) * 2;
      const ny = ((event.clientY - box.top) / box.height - 0.5) * 2;
      svg.style.transform = `rotateX(${(-ny * 16).toFixed(1)}deg) rotateY(${(nx * 22).toFixed(1)}deg)`;
    };
    const onDown = () => {
      burstUntil = performance.now() + BURST_MS;
      root.classList.remove('is-burst');
      void root.offsetWidth; // restart the one-shot ring animation
      root.classList.add('is-burst');
      kick();
    };

    root.addEventListener('pointerenter', onEnter);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerdown', onDown);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerdown', onDown);
      svg.style.transform = '';
      svg.getAnimations?.({ subtree: true }).forEach((animation) => {
        animation.playbackRate = 1;
      });
    };
  }, [interactive, reduceMotion]);

  return (
    <span
      ref={rootRef}
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
      className={`hn-loop ${className}`.trim()}
      data-interactive={interactive && !reduceMotion ? 'true' : 'false'}
      data-hot="false"
      style={{ width: size }}
    >
      {announce && <span className="sr-only">{label}</span>}
      <svg
        ref={svgRef}
        className="hn-loop__svg"
        viewBox={G.loaderViewBox}
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={-G.halfWidth}
            y1="0"
            x2={G.halfWidth}
            y2="0"
          >
            {G.gradient.map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
        <path className="hn-loop__track" d={G.full} stroke={`url(#${gradientId})`} />
        <g className="hn-loop__glow">
          {([0, 1] as const).map((comet) => (
            <g key={comet}>
              {G.layers.map((layer) => (
                <path
                  key={layer.name}
                  className="hn-loop__comet"
                  d={G.full}
                  pathLength={100}
                  stroke={layer.color}
                  strokeOpacity={layer.opacity}
                  strokeWidth={layer.width}
                  strokeDasharray={`${layer.len} ${100 - layer.len}`}
                  style={{
                    animationDelay: `${delay(layer.len, comet).toFixed(3)}s`,
                    ['--ap-loop-still' as string]: still(layer.len, comet),
                  }}
                />
              ))}
            </g>
          ))}
        </g>
        {[G.apex.left, G.apex.right].map(([cx, cy]) => (
          <g key={cx}>
            <circle className="hn-loop__ring" cx={cx} cy={cy} r={3.3} />
            <circle
              className="hn-loop__node"
              cx={cx}
              cy={cy}
              r={3.3}
              style={{ animationDuration: `${half}s`, animationDelay: `${nodeDelay.toFixed(3)}s` }}
            />
          </g>
        ))}
      </svg>
    </span>
  );
};

export default InfinityLoader;
