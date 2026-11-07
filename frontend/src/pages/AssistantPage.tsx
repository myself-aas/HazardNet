import { useCallback, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Cpu, Database, Loader2, Search, Send, ShieldAlert, Wrench, XCircle } from 'lucide-react';
import { usePageSeo } from '../hooks/usePageSeo';

/**
 * The Assistant — the surface for multi-step work.
 *
 * WHY THIS EXISTS NEXT TO THE CHAT WIDGET
 * ---------------------------------------
 * `ChatBot.tsx` is a quick answer in a corner of the screen. It cannot show what
 * the agent actually did, because a 380px popover has no room for a tool trace —
 * and an answer you cannot inspect is an answer you cannot check.
 *
 * This page shows the whole loop: what the agent understood the question to be,
 * which artifacts it read, what each read returned, which knowledge-base
 * documents it cited, and what the review phase objected to. That is the point.
 * The claim this product makes is that every number is traceable; this is where
 * a visitor can hold the assistant to it.
 *
 * It uses the SAME `/api/chat/query` contract as the widget, so the two can
 * never disagree about what the pipeline returns.
 *
 * HONESTY
 * -------
 * The page states plainly when live data was not read, when retrieval ran on the
 * lexical engine alone, and that HazardNet is not an official warning service.
 * It never renders a review flag as a footnote: an unsupported figure is shown
 * as a warning, because the alternative is publishing it as fact.
 */

interface AgentStep {
  step: number;
  tool: string | null;
  args: Record<string, unknown> | null;
  purpose: string | null;
  ok: boolean;
  digest: string | null;
  skipped: string | null;
  error: string | null;
  ms: number | null;
}

interface ReviewFlag {
  code: string;
  detail: string;
}

interface RetrievedSource {
  id: string;
  title: string;
  category: string;
  authority?: string;
  url?: string | null;
  basis?: string | null;
  relevanceScore?: number;
  snippet?: string;
}

interface AssistantResponse {
  answer: string;
  suggested_followups?: string[];
  retrieved_sources?: RetrievedSource[];
  retrieval?: { engine?: string; applied?: boolean; reason?: string; candidates?: number; cited?: number; omitted?: number };
  routed_skills?: { skill?: string; label?: string; urgency?: string; owners?: string[]; helplines?: string[] };
  agent?: {
    enabled: boolean;
    reason: string | null;
    goal: string | null;
    district: string | null;
    hazard: string | null;
    intents: string[];
    steps: AgentStep[];
    tools_called: string[];
    review?: { ok: boolean; flags: ReviewFlag[] };
  };
  provider_source?: string;
}

interface Turn {
  question: string;
  response: AssistantResponse;
}

const FLAG_COPY: Record<string, { title: string; tone: 'warning' | 'danger' }> = {
  unsupported_metric: { title: 'Figure without a source', tone: 'danger' },
  all_clear_claim: { title: 'Claims there is no risk', tone: 'danger' },
  official_warning_claim: { title: 'Implies an official warning', tone: 'danger' },
  live_claim_without_data: { title: 'Current conditions, nothing read', tone: 'warning' },
};

const STARTERS = [
  'Is there any flood warning for Sunamganj in the next 15 days?',
  'How do I protect my nursery seedlings and cattle in a cold wave?',
  'What should I do in the first 48 hours after a flash flood?',
];

export default function AssistantPage() {
  usePageSeo('/assistant');

  const [question, setQuestion] = useState('');
  const [district, setDistrict] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ask = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          district: district.trim() || undefined,
          conversationHistory: turns.map((turn) => [
            { role: 'user', content: turn.question },
            { role: 'assistant', content: turn.response.answer },
          ]).flat(),
        }),
      });
      if (!res.ok) throw new Error(`The assistant could not be reached (HTTP ${res.status}).`);
      const data = (await res.json()) as AssistantResponse;
      if (!data?.answer) throw new Error('The assistant returned no answer. Try rephrasing the question.');
      setTurns((previous) => [...previous, { question: trimmed, response: data }]);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [busy, district, turns]);

  const latest = turns.at(-1) ?? null;
  const stepsRun = useMemo(() => (latest?.response.agent?.steps ?? []).length, [latest]);

  return (
    <div className="min-h-screen bg-[var(--ap-bg-grouped)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[var(--ap-label-secondary)]">
          <Link to="/" className="underline decoration-[var(--ap-separator-opaque)] underline-offset-4 hover:text-[var(--ap-label)]">Home</Link>
          <span aria-hidden="true" className="mx-2">/</span>
          <span className="text-[var(--ap-label)]">Assistant</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ap-label)] sm:text-4xl">
            Hazard assistant
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--ap-label-secondary)]">
            Ask about a hazard, a district or a decision. The assistant reads the published
            outlook, alert and freshness artifacts before it answers, and every step it took is
            shown below the answer so you can check it.
          </p>
        </header>

        <section aria-labelledby="ask-heading" className="rounded-2xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-elevated)] p-5">
          <h2 id="ask-heading" className="sr-only">Ask a question</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <label htmlFor="assistant-question" className="mb-2 block text-sm font-medium text-[var(--ap-label)]">
              Your question
            </label>
            <textarea
              id="assistant-question"
              ref={inputRef}
              rows={3}
              value={question}
              maxLength={3000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Is there a flood warning for my district, and what should I do first?"
              className="w-full resize-y rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-input-fill)] px-4 py-3 text-base text-[var(--ap-label)] placeholder:text-[var(--ap-label-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary"
            />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:w-64">
                <label htmlFor="assistant-district" className="mb-2 block text-sm font-medium text-[var(--ap-label)]">
                  District <span className="font-normal text-[var(--ap-label-secondary)]">(optional)</span>
                </label>
                <input
                  id="assistant-district"
                  value={district}
                  onChange={(event) => setDistrict(event.target.value)}
                  placeholder="e.g. Sunamganj"
                  className="w-full rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-input-fill)] px-4 py-2.5 text-base text-[var(--ap-label)] placeholder:text-[var(--ap-label-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !question.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ap-label)] px-5 py-2.5 text-base font-medium text-[var(--ap-bg-elevated)] transition-opacity disabled:opacity-40"
              >
                {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}
                {busy ? 'Working…' : 'Ask'}
              </button>
            </div>
          </form>

          {turns.length === 0 && (
            <div className="mt-5 border-t border-[var(--ap-separator-opaque)] pt-4">
              <p className="mb-2 text-sm font-medium text-[var(--ap-label)]">Try one of these</p>
              <ul className="flex flex-wrap gap-2">
                {STARTERS.map((starter) => (
                  <li key={starter}>
                    <button
                      type="button"
                      onClick={() => void ask(starter)}
                      disabled={busy}
                      className="rounded-full border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-card)] px-3 py-1.5 text-sm text-[var(--ap-label-secondary)] transition-colors hover:text-[var(--ap-label)] disabled:opacity-40"
                    >
                      {starter}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--ap-sev-high)] bg-[var(--ap-bg-card)] px-4 py-3 text-sm text-[var(--ap-label)]">
              <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ap-sev-high)]" />
              {error}
            </p>
          )}
        </section>

        {latest && (
          <div className="mt-8 space-y-6">
            <section aria-labelledby="answer-heading" className="rounded-2xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-elevated)] p-6">
              <h2 id="answer-heading" className="mb-1 text-lg font-semibold text-[var(--ap-label)]">Answer</h2>
              <p className="mb-4 text-sm text-[var(--ap-label-secondary)]">{latest.question}</p>

              {latest.response.agent?.review && latest.response.agent.review.flags.length > 0 && (
                <div className="mb-5 space-y-2">
                  {latest.response.agent.review.flags.map((flag) => {
                    const copy = FLAG_COPY[flag.code] ?? { title: flag.code, tone: 'warning' as const };
                    const Icon = copy.tone === 'danger' ? ShieldAlert : AlertTriangle;
                    return (
                      <p key={flag.code} className="flex items-start gap-2 rounded-xl border border-[var(--ap-sev-high)] bg-[var(--ap-bg-card)] px-4 py-3 text-sm text-[var(--ap-label)]">
                        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ap-sev-high)]" />
                        <span><strong className="font-semibold">{copy.title}.</strong> {flag.detail}</span>
                      </p>
                    );
                  })}
                </div>
              )}

              <div className="prose prose-sm max-w-none text-[var(--ap-label)] [&_a]:underline [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_li]:my-1 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown>{latest.response.answer}</ReactMarkdown>
              </div>

              {latest.response.provider_source && (
                <p className="mt-5 flex items-center gap-2 border-t border-[var(--ap-separator-opaque)] pt-4 text-xs text-[var(--ap-label-secondary)]">
                  <Cpu aria-hidden="true" className="h-3.5 w-3.5" />
                  Answered by {latest.response.provider_source}
                  {latest.response.retrieval?.engine ? ` · retrieval: ${latest.response.retrieval.engine}` : ''}
                </p>
              )}
            </section>

            <section aria-labelledby="trace-heading" className="rounded-2xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-elevated)] p-6">
              <h2 id="trace-heading" className="text-lg font-semibold text-[var(--ap-label)]">What the assistant did</h2>

              {latest.response.agent?.enabled ? (
                <>
                  <p className="mt-1 text-sm text-[var(--ap-label-secondary)]">
                    {latest.response.agent.goal}
                  </p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-[var(--ap-bg-inset)] px-4 py-3">
                      <dt className="text-xs text-[var(--ap-label-secondary)]">Understood as</dt>
                      <dd className="mt-1 text-sm font-medium text-[var(--ap-label)]">
                        {latest.response.agent.intents.length ? latest.response.agent.intents.join(', ') : 'general question'}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-[var(--ap-bg-inset)] px-4 py-3">
                      <dt className="text-xs text-[var(--ap-label-secondary)]">Place and hazard</dt>
                      <dd className="mt-1 text-sm font-medium text-[var(--ap-label)]">
                        {latest.response.agent.district ?? 'no district'} · {latest.response.agent.hazard ?? 'any hazard'}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-[var(--ap-bg-inset)] px-4 py-3">
                      <dt className="text-xs text-[var(--ap-label-secondary)]">Artifacts read</dt>
                      <dd className="mt-1 text-sm font-medium text-[var(--ap-label)]">
                        {latest.response.agent.tools_called.length
                          ? latest.response.agent.tools_called.join(', ')
                          : 'none'}
                      </dd>
                    </div>
                  </dl>

                  <ol className="mt-5 space-y-2">
                    {latest.response.agent.steps.map((step) => (
                      <li key={step.step} className="rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-card)]">
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === step.step ? null : step.step)}
                          aria-expanded={expanded === step.step}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left"
                        >
                          <span aria-hidden="true" className="mt-0.5 shrink-0">
                            {step.ok
                              ? <CheckCircle2 className="h-4 w-4 text-[var(--ap-sev-low)]" />
                              : <XCircle className="h-4 w-4 text-[var(--ap-sev-high)]" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[var(--ap-label)]">
                              <Wrench aria-hidden="true" className="h-3.5 w-3.5 text-[var(--ap-label-secondary)]" />
                              {step.tool ?? 'step skipped'}
                              {typeof step.ms === 'number' && (
                                <span className="inline-flex items-center gap-1 text-xs font-normal text-[var(--ap-label-secondary)]">
                                  <Clock aria-hidden="true" className="h-3 w-3" />{step.ms} ms
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block text-sm text-[var(--ap-label-secondary)]">
                              {step.purpose}
                            </span>
                          </span>
                          <ChevronRight
                            aria-hidden="true"
                            className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--ap-label-secondary)] transition-transform ${expanded === step.step ? 'rotate-90' : ''}`}
                          />
                        </button>

                        {expanded === step.step && (
                          <div className="border-t border-[var(--ap-separator-opaque)] px-4 py-3 text-sm">
                            {step.args && Object.keys(step.args).length > 0 && (
                              <p className="mb-2 text-[var(--ap-label-secondary)]">
                                <span className="font-medium text-[var(--ap-label)]">Arguments:</span>{' '}
                                <code className="rounded bg-[var(--ap-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--ap-label)]">
                                  {JSON.stringify(step.args)}
                                </code>
                              </p>
                            )}
                            <p className="text-[var(--ap-label)]">
                              <span className="font-medium">{step.ok ? 'Returned: ' : 'Not available: '}</span>
                              {step.ok ? step.digest : step.skipped ?? step.error ?? 'no detail recorded'}
                            </p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>

                  {stepsRun > 0 && latest.response.agent.reason && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--ap-bg-inset)] px-4 py-3 text-sm text-[var(--ap-label-secondary)]">
                      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                      {latest.response.agent.reason}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--ap-bg-inset)] px-4 py-3 text-sm text-[var(--ap-label-secondary)]">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  Live artifacts were not read ({latest.response.agent?.reason ?? 'reason not given'}), so this
                  answer rests on the public knowledge base alone and does not describe current conditions.
                </p>
              )}
            </section>

            {Boolean(latest.response.retrieved_sources?.length) && (
              <section aria-labelledby="sources-heading" className="rounded-2xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-elevated)] p-6">
                <h2 id="sources-heading" className="text-lg font-semibold text-[var(--ap-label)]">
                  Sources cited
                </h2>
                <p className="mt-1 text-sm text-[var(--ap-label-secondary)]">
                  {latest.response.retrieved_sources?.length} knowledge-base document(s) reached the answer
                  {typeof latest.response.retrieval?.omitted === 'number' && latest.response.retrieval.omitted > 0
                    ? ` · ${latest.response.retrieval.omitted} further match(es) were left out to stay inside the prompt budget`
                    : ''}.
                </p>
                <ul className="mt-4 space-y-3">
                  {latest.response.retrieved_sources?.map((source) => (
                    <li key={source.id} className="rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-card)] px-4 py-3">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[var(--ap-label)]">
                        <Database aria-hidden="true" className="h-3.5 w-3.5 text-[var(--ap-label-secondary)]" />
                        {source.title}
                        <span className="rounded-full bg-[var(--ap-bg-inset)] px-2 py-0.5 text-xs font-normal text-[var(--ap-label-secondary)]">
                          {source.category}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-[var(--ap-label-secondary)]">{source.authority}</p>
                      {source.snippet && (
                        <p className="mt-2 text-sm text-[var(--ap-label)]">{source.snippet}</p>
                      )}
                      {source.url && (
                        <a
                          href={source.url}
                          rel="noreferrer noopener"
                          className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--ap-label)] underline decoration-[var(--ap-separator-opaque)] underline-offset-4"
                        >
                          {source.url.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {Boolean(latest.response.suggested_followups?.length) && (
              <section aria-labelledby="followups-heading" className="rounded-2xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-elevated)] p-6">
                <h2 id="followups-heading" className="text-lg font-semibold text-[var(--ap-label)]">Ask next</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {latest.response.suggested_followups?.map((followup) => (
                    <li key={followup}>
                      <button
                        type="button"
                        onClick={() => void ask(followup)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-card)] px-3 py-1.5 text-sm text-[var(--ap-label-secondary)] transition-colors hover:text-[var(--ap-label)] disabled:opacity-40"
                      >
                        <Search aria-hidden="true" className="h-3.5 w-3.5" />
                        {followup}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <footer className="mt-10 rounded-2xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-card)] p-5 text-sm text-[var(--ap-label-secondary)]">
          <h2 className="sr-only">Limits of this assistant</h2>
          <p>
            HazardNet is a decision-support tool, not an official warning service. Official warnings come
            from the{' '}
            <a href="http://www.bmd.gov.bd" rel="noreferrer noopener" className="text-[var(--ap-label)] underline decoration-[var(--ap-separator-opaque)] underline-offset-4">
              Bangladesh Meteorological Department
            </a>{' '}
            and river forecasts from the{' '}
            <a href="http://www.ffwc.gov.bd" rel="noreferrer noopener" className="text-[var(--ap-label)] underline decoration-[var(--ap-separator-opaque)] underline-offset-4">
              Flood Forecasting and Warning Centre
            </a>
            . In an emergency call <strong className="font-semibold text-[var(--ap-label)]">999</strong>; for
            agricultural advice call <strong className="font-semibold text-[var(--ap-label)]">16123</strong>.
          </p>
        </footer>
      </div>
    </div>
  );
}
