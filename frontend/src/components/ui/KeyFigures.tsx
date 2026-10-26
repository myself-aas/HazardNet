import React from 'react';

/**
 * A row of key figures for a page header — label, then value, on one line.
 *
 * This replaces the 3-tile grid that `/hazards` and `/divisions` both opened with:
 * a boxed card per number, the value set large and bold, the label small beneath it.
 * That arrangement is the design floor's *hero-metric template* — the dashboard
 * kiosk look — and on a Read surface it was carrying two constants of Bangladesh
 * ("8 divisions", "64 districts") at the visual weight of live data while the one
 * live number sat third.
 *
 * The replacement is deliberately typographic rather than structural: a definition
 * list, read in order, with the figures in tabular monospace (they are measurements,
 * which is the one thing monospace is for) and the labels in secondary ink at text
 * size. It wraps as a sentence would, so it survives 360px without a grid, and it
 * cannot out-shout the page's h1 because nothing in it is larger than body copy.
 *
 * `emphasis` marks *the* figure a reader came for — the load-bearing number. Use it
 * once, if at all; two emphasized figures is a hero-metric row again.
 */

export interface KeyFigure {
  /** The quantity's name in the reader's terms ("Recorded events"). */
  label: string;
  /** Already formatted for display — locale separators, units, or an em dash when absent. */
  value: string | number;
  /** Marks the figure the surface exists to show. Reserved for one per row. */
  emphasis?: boolean;
}

export interface KeyFiguresProps {
  figures: KeyFigure[];
  /** Accessible name for the group; without it a screen reader reads a bare list of pairs. */
  label: string;
  className?: string;
}

export const KeyFigures: React.FC<KeyFiguresProps> = ({ figures, label, className = '' }) => (
  <dl aria-label={label} className={`flex flex-wrap items-baseline gap-x-6 gap-y-1.5 ${className}`}>
    {figures.map((figure) => (
      <div key={figure.label} className="flex items-baseline gap-1.5">
        <dt className="text-xs text-carbon-60">{figure.label}</dt>
        <dd
          className={`font-mono text-sm font-semibold tabular-nums ${
            figure.emphasis ? 'text-ap-link' : 'text-carbon-90'
          }`}
        >
          {figure.value}
        </dd>
      </div>
    ))}
  </dl>
);

export default KeyFigures;
