import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { DailySnapshot } from '../lib/reports';

/**
 * Custom MDX-style report template.
 *
 * Daily reports are markdown documents (committed under /reports/) that may embed
 * template directives the renderer resolves against the live daily snapshot:
 *
 *   {{chart:tier-distribution}}      interactive pie of advisory tiers
 *   {{chart:hazard-distribution}}    interactive pie of hazard mix
 *   {{chart:severity-by-division}}   bar chart of mean severity per division
 *   {{table:top-advisories}}         sortable table of the 15 highest-severity rows
 *   :::info / :::warning / :::danger … :::   callout block (the only "card" used,
 *                                       reserved for notices that must stand out)
 *
 * Everything else is plain markdown, so the document stays readable as raw text
 * (and in the committed artifact) while the page renders it interactively.
 */

/** Tier and hazard hues come from the design-system severity ramp, never raw hex. */
const TIER_FILL: Record<string, string> = {
  EMERGENCY: 'var(--color-rose-600)',
  WARNING: 'var(--color-orange-600)',
  WATCH: 'var(--color-amber-600)',
  ADVISORY: 'var(--ap-link)',
  NORMAL: 'var(--color-emerald-600)',
};
const TIER_TEXT: Record<string, string> = {
  EMERGENCY: 'text-rose-600',
  WARNING: 'text-orange-600',
  WATCH: 'text-amber-600',
  ADVISORY: 'text-ap-link',
  NORMAL: 'text-emerald-600',
};
const HAZARD_PALETTE = [
  'var(--ap-link)',
  'var(--color-amber-600)',
  'var(--color-rose-600)',
  'var(--color-emerald-600)',
  'var(--color-violet-600)',
  'var(--color-cyan-600)',
  'var(--color-pink-600)',
  'var(--color-lime-600)',
];

type Block =
  | { kind: 'markdown'; text: string }
  | { kind: 'directive'; name: string }
  | { kind: 'callout'; tone: string; text: string };

const CALLOUT_STYLES: Record<string, string> = {
  info: 'border-blue-300 bg-blue-50 text-blue-950',
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  danger: 'border-rose-300 bg-rose-50 text-rose-950',
};

export function parseReportBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let callout: { tone: string; lines: string[] } | null = null;
  const flush = () => {
    if (buffer.length) { blocks.push({ kind: 'markdown', text: buffer.join('\n') }); buffer = []; }
  };
  for (const line of lines) {
    const directive = line.match(/^\{\{(\w[\w:-]*)\}\}\s*$/);
    const calloutOpen = line.match(/^:::(info|warning|danger)\s*$/);
    if (callout) {
      if (line.trim() === ':::') {
        blocks.push({ kind: 'callout', tone: callout.tone, text: callout.lines.join('\n').trim() });
        callout = null;
      } else {
        callout.lines.push(line);
      }
      continue;
    }
    if (calloutOpen) { flush(); callout = { tone: calloutOpen[1], lines: [] }; continue; }
    if (directive) { flush(); blocks.push({ kind: 'directive', name: directive[1] }); continue; }
    buffer.push(line);
  }
  flush();
  if (callout) blocks.push({ kind: 'callout', tone: callout.tone, text: callout.lines.join('\n').trim() });
  return blocks;
}

const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <figure className="my-6">
    <figcaption className="mb-2 text-sm font-bold text-carbon-80">{title}</figcaption>
    <div className="h-64 w-full">{children}</div>
  </figure>
);

type SortKey = 'district' | 'division' | 'hazard' | 'targetDate' | 'tier' | 'severityScore';

const TopAdvisoriesTable: React.FC<{ rows: DailySnapshot['advisories'] }> = ({ rows }) => {
  const [sortKey, setSortKey] = useState<SortKey>('severityScore');
  const [desc, setDesc] = useState(true);
  const sorted = useMemo(() => {
    const top = [...rows].sort((a, b) => (Number(b.severityScore) || 0) - (Number(a.severityScore) || 0)).slice(0, 15);
    return [...top].sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });
  }, [rows, sortKey, desc]);
  const toggle = (key: SortKey) => {
    if (key === sortKey) setDesc((d) => !d);
    else { setSortKey(key); setDesc(true); }
  };
  const headers: { key: SortKey; label: string }[] = [
    { key: 'district', label: 'District' },
    { key: 'division', label: 'Division' },
    { key: 'hazard', label: 'Hazard' },
    { key: 'targetDate', label: 'Target date' },
    { key: 'tier', label: 'Tier' },
    { key: 'severityScore', label: 'Severity' },
  ];
  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-carbon-30 text-left">
            {headers.map((h) => (
              <th key={h.key}>
                <button
                  type="button"
                  onClick={() => toggle(h.key)}
                  className="px-2 py-1 font-bold text-carbon-80 hover:text-ap-link"
                >
                  {h.label}{sortKey === h.key ? (desc ? ' (desc)' : ' (asc)') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={`${r.district}-${r.targetDate}-${r.hazard}-${i}`} className="border-b border-carbon-10">
              <td className="px-2 py-1 font-semibold">{r.district}</td>
              <td className="px-2 py-1">{r.division}</td>
              <td className="px-2 py-1">{r.hazard}</td>
              <td className="px-2 py-1">{r.targetDate}</td>
              <td className="px-2 py-1">
                <span className={`font-bold ${TIER_TEXT[String(r.tier).toUpperCase()] || 'text-carbon-80'}`}>
                  {r.tier}
                </span>
              </td>
              <td className="px-2 py-1">{Number(r.severityScore).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Markdown: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown
    components={{
      h1: ({ children }) => <h1 className="mt-8 mb-3 text-2xl font-bold text-carbon-90">{children}</h1>,
      h2: ({ children }) => <h2 className="mt-8 mb-3 text-xl font-bold text-carbon-90">{children}</h2>,
      h3: ({ children }) => <h3 className="mt-6 mb-2 text-lg font-bold text-carbon-80">{children}</h3>,
      p: ({ children }) => <p className="my-3 leading-relaxed text-carbon-80">{children}</p>,
      ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 text-carbon-80">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-carbon-80">{children}</ol>,
      table: ({ children }) => (
        <div className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => <thead className="border-b border-carbon-30 bg-carbon-05">{children}</thead>,
      th: ({ children }) => <th className="px-2 py-1 text-left font-bold text-carbon-80">{children}</th>,
      td: ({ children }) => <td className="border-b border-carbon-10 px-2 py-1 text-carbon-80">{children}</td>,
      code: ({ children }) => <code className="rounded bg-carbon-05 px-1 py-0.5 text-[0.85em] text-carbon-90">{children}</code>,
      hr: () => <hr className="my-6 border-carbon-30" />,
    }}
  >
    {text}
  </ReactMarkdown>
);

const ReportTemplate: React.FC<{ markdown: string; snapshot: DailySnapshot | null }> = ({ markdown, snapshot }) => {
  const blocks = useMemo(() => parseReportBlocks(markdown), [markdown]);
  const advisories = snapshot?.advisories ?? [];

  const chartData = useMemo(() => {
    const tiers: Record<string, number> = {};
    const hazards: Record<string, number> = {};
    const divisions: Record<string, { sum: number; count: number }> = {};
    for (const row of advisories) {
      const tier = String(row.tier || 'UNKNOWN').toUpperCase();
      tiers[tier] = (tiers[tier] || 0) + 1;
      hazards[row.hazard] = (hazards[row.hazard] || 0) + 1;
      const d = row.division || 'Unknown';
      divisions[d] = divisions[d] || { sum: 0, count: 0 };
      divisions[d].sum += Number(row.severityScore) || 0;
      divisions[d].count += 1;
    }
    return {
      tier: Object.entries(tiers).map(([name, value]) => ({ name, value })),
      hazard: Object.entries(hazards).map(([name, value]) => ({ name, value })),
      division: Object.entries(divisions)
        .map(([name, v]) => ({ name, mean: Number((v.sum / Math.max(v.count, 1)).toFixed(2)) }))
        .sort((a, b) => b.mean - a.mean),
    };
  }, [advisories]);

  const renderDirective = (name: string) => {
    switch (name) {
      case 'chart:tier-distribution':
        return (
          <ChartCard title="Advisory tier distribution (live from the published snapshot)">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData.tier} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                  {chartData.tier.map((entry) => (
                    <Cell key={entry.name} fill={TIER_FILL[entry.name] || 'var(--color-carbon-60)'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      case 'chart:hazard-distribution':
        return (
          <ChartCard title="Hazard mix across all published rows">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData.hazard} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                  {chartData.hazard.map((entry, i) => (
                    <Cell key={entry.name} fill={HAZARD_PALETTE[i % HAZARD_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      case 'chart:severity-by-division':
        return (
          <ChartCard title="Mean severity score by division">
            <ResponsiveContainer>
              <BarChart data={chartData.division}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="mean" fill="var(--ap-link)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      case 'table:top-advisories':
        return <TopAdvisoriesTable rows={advisories} />;
      default:
        return <p className="my-3 text-sm text-carbon-60">Unknown directive: {name}</p>;
    }
  };

  return (
    <article>
      {blocks.map((block, i) => {
        if (block.kind === 'directive') return <React.Fragment key={i}>{renderDirective(block.name)}</React.Fragment>;
        if (block.kind === 'callout') {
          return (
            <div key={i} className={`my-4 rounded-xl border px-4 py-3 text-sm ${CALLOUT_STYLES[block.tone] || CALLOUT_STYLES.info}`}>
              <Markdown text={block.text} />
            </div>
          );
        }
        return <Markdown key={i} text={block.text} />;
      })}
    </article>
  );
};

export default ReportTemplate;
