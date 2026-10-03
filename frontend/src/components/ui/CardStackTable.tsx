/**
 * CardStackTable — the table, with a card stack for phones.
 *
 * The rule it implements is criterion 1 of the mobile-conversion acceptance list in
 * `docs/audits/2026-10-03-frontend-design-system-audit.md` §5.5: *no page renders a table as its
 * primary content below 768px*. On a 390px viewport a table is either a sideways scroll — content
 * off-screen with no affordance that it exists — or five columns squeezed into 12px type, which the
 * type floor has just outlawed. It is also the one pattern with no React Native port at all (there
 * is no `<table>` in the shell), so a screen built around one has to be rewritten rather than
 * restyled when Phase 11 lands.
 *
 * Two exports, because the repo has two kinds of table:
 *
 *   · `CardStackTable` — the editorial table: `columns: string[]`, `rows: string[][]`, straight
 *     from `content/site-routes.json`. Renders the table at `md`+ and one card per row below it.
 *   · `CardStackRows`  — the phone branch on its own, for console tables whose cells are JSX
 *     (status chips, sort buttons, per-row links). The caller builds `{ heading, fields[] }` from
 *     the same row object the table maps, so the two branches can never disagree.
 *
 * Both are static markup: they are rendered into the prerendered HTML too, where the table is the
 * only copy of this content for a crawler or a reader without JavaScript.
 */

import React from 'react';

/** One label/value pair inside a phone card. */
export interface CardStackField {
  label: string;
  value: React.ReactNode;
}

/** One phone card. */
export interface CardStackRow {
  key: React.Key;
  /** The row's identity — the first cell of the table row. */
  heading: React.ReactNode;
  fields: readonly CardStackField[];
  /** Optional trailing control (a link, a toggle) rendered as a full-width row. */
  footer?: React.ReactNode;
}

export interface CardStackRowsProps {
  rows: readonly CardStackRow[];
  /** Accessible name when the stack stands in for a captioned table. */
  labelledBy?: string;
  className?: string;
  /** `md:hidden` by default: the stack is the phone branch. Pass `''` for a stack-only panel. */
  visibility?: string;
  /**
   * `onDark` for the console panels that are dark in either theme (`bg-carbon-black/40` with
   * `text-white` rows). The default reads the page's carbon roles; `onDark` reads the panel's,
   * so a card never inherits near-black ink on a near-black surface.
   */
  tone?: 'default' | 'onDark';
}

const TONES = {
  default: {
    list: 'divide-carbon-20 border-carbon-20',
    heading: 'text-carbon-90',
    label: 'text-carbon-60',
    value: 'text-carbon-70',
    footer: 'border-carbon-10',
  },
  onDark: {
    list: 'divide-carbon-80/80 border-carbon-80',
    heading: 'text-white',
    label: 'text-carbon-40',
    value: 'text-carbon-30',
    footer: 'border-carbon-80',
  },
} as const;

/**
 * The phone branch: one card per table row, the first cell promoted to the card's heading and the
 * remaining cells turned into a description list, so a screen reader announces the column name with
 * each value exactly as a `<th scope="col">` row does.
 */
export const CardStackRows: React.FC<CardStackRowsProps> = ({
  rows,
  labelledBy,
  className,
  visibility = 'md:hidden',
  tone = 'default',
}) => {
  const ink = TONES[tone];
  return (
    <ul
      className={`divide-y border ${ink.list} ${visibility} ${className ?? ''}`}
      aria-labelledby={labelledBy}
    >
      {rows.map((row) => (
        <li key={row.key} className="p-3">
          <p className={`text-sm font-bold ${ink.heading}`}>{row.heading}</p>
          {row.fields.length > 0 && (
            <dl className="mt-2 space-y-1.5">
              {row.fields.map((field, index) => (
                <div key={`${index}-${field.label}`} className="flex gap-3 text-xs leading-[1.5]">
                  <dt className={`w-[38%] shrink-0 font-mono font-bold uppercase tracking-wide ${ink.label}`}>
                    {field.label}
                  </dt>
                  <dd className={`min-w-0 flex-1 break-words ${ink.value}`}>{field.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {row.footer && (
            <div className={`mt-3 border-t pt-2 text-xs ${ink.footer}`}>{row.footer}</div>
          )}
        </li>
      ))}
    </ul>
  );
};

export interface CardStackTableProps {
  /** Header cells, in order. The first one doubles as the card's field name for the leading cell. */
  columns: readonly string[];
  /** One array per row, one entry per column. */
  rows: readonly (readonly string[])[];
  /** Rendered as the table's `<caption>` and as the card list's accessible name. */
  caption?: string;
  className?: string;
}

export const CardStackTable: React.FC<CardStackTableProps> = ({ columns, rows, caption, className }) => {
  const captionId = React.useId();

  const cards: CardStackRow[] = rows.map((row, rowIndex) => ({
    key: `${rowIndex}-${row[0] ?? ''}`,
    heading: row[0],
    fields: row.slice(1).map((cell, cellIndex) => ({ label: columns[cellIndex + 1] ?? '', value: cell })),
  }));

  return (
    <div className={`w-full min-w-0 ${className ?? ''}`}>
      <CardStackRows rows={cards} labelledBy={caption ? captionId : undefined} />

      <div className="hidden w-full min-w-0 overflow-x-auto border border-carbon-20 md:block">
        <table className="w-full border-collapse text-left text-xs">
          {caption && (
            <caption id={captionId} className="bg-carbon-05 px-3 py-2 text-left text-xs text-carbon-60">
              {caption}
            </caption>
          )}
          <thead>
            <tr className="border-b border-carbon-20 bg-carbon-05">
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-carbon-60"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row[0] ?? ''}`} className="border-b border-carbon-10 last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`px-3 py-2 align-top ${cellIndex === 0 ? 'font-bold text-carbon-90' : 'text-carbon-70'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CardStackTable;
