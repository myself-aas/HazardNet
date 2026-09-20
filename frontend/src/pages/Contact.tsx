import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import MaterialIcon from '../components/MaterialIcon';
import { SendIcon } from '../components/ui/animated-state-icons';
import { usePageSeo } from '../hooks/usePageSeo';

/**
 * Contact, incident reporting and API access.
 *
 * HONESTY NOTE (audit UX-10 / UX-12 / SEO-13, 2026-09-17)
 * ------------------------------------------------------
 * This page used to run every form through `setTimeout(600)` and then print
 * "Your report … has been logged in the HazardNet validation queue" — nothing
 * was sent anywhere or stored, and the API-request and general-inquiry tabs did
 * not even capture their fields (their inputs were uncontrolled). The sidebar
 * also advertised a non-existent "alert@hazardnet.ai" emergency queue, a
 * research-laboratory street address and a "<2 hours" response SLA.
 *
 * Now: the form builds a complete, prefilled report and hands it to a channel
 * that actually exists — a public GitHub issue (trackable, which a "validation
 * queue" never was) or the maintainer mailbox. Nothing claims to have been sent
 * until the visitor has actually opened one of those channels.
 */

/** Project support mailbox. Override per-deployment with VITE_CONTACT_EMAIL. */
const CONTACT_EMAIL: string =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || 'shuvoasifahmed@gmail.com';

const REPO = 'https://github.com/myself-aas/HazardNet';

type FormKind = 'report' | 'api' | 'general';

interface FormState {
  district: string;
  hazardType: string;
  severityObserved: string;
  reporterName: string;
  contactEmail: string;
  comments: string;
  institution: string;
  institutionEmail: string;
  requestRate: string;
  fullName: string;
  email: string;
  message: string;
}

const INITIAL: FormState = {
  district: 'sylhet',
  hazardType: 'Flash Flood',
  severityObserved: 'High',
  reporterName: '',
  contactEmail: '',
  comments: '',
  institution: '',
  institutionEmail: '',
  requestRate: '1000',
  fullName: '',
  email: '',
  message: '',
};

const SUBJECTS: Record<FormKind, string> = {
  report: 'Ground-truth observation report',
  api: 'API access request',
  general: 'General inquiry',
};

function buildBody(kind: FormKind, form: FormState): string {
  if (kind === 'report') {
    return [
      `District: ${form.district}`,
      `Observed hazard: ${form.hazardType}`,
      `Observed severity: ${form.severityObserved}`,
      `Reporter: ${form.reporterName}`,
      `Reply contact: ${form.contactEmail}`,
      '',
      'Field observations:',
      form.comments,
      '',
      `Environment: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
      `Page: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      `Submitted: ${new Date().toISOString()}`,
    ].join('\n');
  }
  if (kind === 'api') {
    return [
      `Institution: ${form.institution}`,
      `Institutional email: ${form.institutionEmail}`,
      `Requested rate: ${form.requestRate} requests/day`,
      '',
      'Use case:',
      form.message,
      '',
      `Submitted: ${new Date().toISOString()}`,
    ].join('\n');
  }
  return [
    `Name: ${form.fullName}`,
    `Email: ${form.email}`,
    '',
    form.message,
    '',
    `Submitted: ${new Date().toISOString()}`,
  ].join('\n');
}

export const Contact: React.FC = () => {
  // Per-route <head>: see the note in frontend/src/hooks/usePageSeo.ts.
  usePageSeo('/contact');
  const [activeForm, setActiveForm] = useState<FormKind>('report');
  const [form, setForm] = useState<FormState>(INITIAL);
  const [prepared, setPrepared] = useState<{ kind: FormKind; subject: string; body: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const issueUrl = useMemo(() => {
    if (!prepared) return REPO;
    const params = new URLSearchParams({
      title: `[${prepared.subject}] `,
      body: prepared.body,
      labels: prepared.kind === 'report' ? 'ground-truth' : 'inquiry',
    });
    return `${REPO}/issues/new?${params.toString()}`;
  }, [prepared]);

  const mailtoUrl = useMemo(() => {
    if (!prepared) return `mailto:${CONTACT_EMAIL}`;
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[HazardNet] ${prepared.subject}`)}&body=${encodeURIComponent(prepared.body)}`;
  }, [prepared]);

  /** Validation summary (UI-11): explicit messages, announced to screen readers. */
  const validate = (kind: FormKind): string[] => {
    const problems: string[] = [];
    if (kind === 'report') {
      if (!form.reporterName.trim()) problems.push('Add your name or role so the report can be attributed.');
      if (!form.comments.trim()) problems.push('Describe what you observed on the ground.');
      if (!form.contactEmail.trim()) problems.push('Add a reply address (email or phone).');
    }
    if (kind === 'api') {
      if (!form.institution.trim()) problems.push('Institution or organisation name is required.');
      if (!form.institutionEmail.trim()) problems.push('Institutional email is required.');
      if (!form.message.trim()) problems.push('Describe the intended use of the API.');
    }
    if (kind === 'general') {
      if (!form.fullName.trim()) problems.push('Your name is required.');
      if (!form.email.trim()) problems.push('A reply address is required.');
      if (!form.message.trim()) problems.push('Write your message.');
    }
    return problems;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const problems = validate(activeForm);
    setErrors(problems);
    if (problems.length > 0) {
      setPrepared(null);
      return;
    }
    setPrepared({
      kind: activeForm,
      subject: `${SUBJECTS[activeForm]} — ${activeForm === 'report' ? form.district : form.institution || form.fullName}`,
      body: buildBody(activeForm, form),
    });
  };

  const inputClass =
    'w-full p-2.5 border border-carbon-30 bg-carbon-05 text-carbon-90 font-medium outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      <Breadcrumbs />

      <header className="bg-white border border-carbon-20 p-6 md:p-8 space-y-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200 uppercase tracking-wider">
            Support &amp; communications
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-carbon-90 tracking-tight">
          Contact, incident reporting &amp; API access
        </h1>
        <p className="text-carbon-60 text-xs md:text-sm leading-relaxed max-w-3xl">
          Ground-truth reports are how HazardNet improves. Describe the district, hazard and what you saw; the form
          prepares a complete report you can file publicly (GitHub, so it can be tracked) or send by email.
        </p>
        <p
          role="note"
          className="border border-nasa-red bg-white p-3 text-xs font-semibold leading-relaxed text-nasa-red-shade"
        >
          This is not an emergency channel and it is not monitored around the clock. In an emergency call{' '}
          <strong>999</strong>, and follow BMD, FFWC, DDM and local administration instructions.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white border border-carbon-20 p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-2 border-b border-carbon-20 pb-3 text-xs font-bold overflow-x-auto scrollbar-none">
            {(
              [
                ['report', 'Ground-truth report'],
                ['api', 'API access request'],
                ['general', 'General inquiry'],
              ] as Array<[FormKind, string]>
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={activeForm === kind}
                onClick={() => {
                  setActiveForm(kind);
                  setPrepared(null);
                  setErrors([]);
                }}
                className={`px-3.5 py-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  activeForm === kind
                    ? 'bg-amber-500 text-carbon-90 font-bold'
                    : 'bg-carbon-10 text-carbon-60 hover:bg-carbon-20 hover:text-carbon-90'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {errors.length > 0 && (
            <div role="alert" className="border border-nasa-red bg-white p-4 text-xs text-nasa-red-shade">
              <p className="font-bold">Please fix the following before continuing:</p>
              <ul className="mt-1 list-disc pl-5">
                {errors.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          {prepared && (
            <div role="status" className="border border-carbon-20 bg-carbon-05 p-4 text-xs text-carbon-80 space-y-2">
              <p className="font-bold">Your report is prepared — choose how to send it:</p>
              <p className="leading-relaxed">
                Nothing has been submitted yet. HazardNet has no server-side inbox for these forms, so pick a channel
                below: the GitHub issue is public and trackable, the email opens in your mail client. Both are prefilled
                with everything you typed.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-carbon-90 px-4 py-2 font-bold text-white hover:bg-carbon-70"
                >
                  Open a prefilled GitHub issue
                </a>
                <a
                  href={mailtoUrl}
                  className="border border-carbon-30 bg-white px-4 py-2 font-bold text-carbon-80 hover:bg-carbon-05"
                >
                  Send by email instead
                </a>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs" noValidate>
            {activeForm === 'report' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="district" className="block font-bold text-carbon-90 mb-1">
                      District or upazila
                    </label>
                    <select
                      id="district"
                      value={form.district}
                      onChange={(e) => set('district', e.target.value)}
                      className={inputClass}
                    >
                      {['sylhet', 'sunamganj', 'kurigram', 'satkhira', 'rajshahi', 'panchagarh', 'coxsbazar', 'other'].map(
                        (d) => (
                          <option key={d} value={d}>
                            {d === 'other' ? 'Other / not listed' : d.charAt(0).toUpperCase() + d.slice(1)}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="hazardType" className="block font-bold text-carbon-90 mb-1">
                      Observed hazard
                    </label>
                    <select
                      id="hazardType"
                      value={form.hazardType}
                      onChange={(e) => set('hazardType', e.target.value)}
                      className={inputClass}
                    >
                      {[
                        'Flash Flood',
                        'Monsoon Flood',
                        'Tropical Cyclone',
                        'Drought',
                        'Cold Wave',
                        'Heat Wave',
                        'Severe Local Storm',
                        'Fire',
                      ].map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="severityObserved" className="block font-bold text-carbon-90 mb-1">
                      Observed severity vs the forecast
                    </label>
                    <select
                      id="severityObserved"
                      value={form.severityObserved}
                      onChange={(e) => set('severityObserved', e.target.value)}
                      className={inputClass}
                    >
                      <option value="Much lower">Much lower than forecast</option>
                      <option value="Lower">Lower than forecast</option>
                      <option value="Matches">Matches the forecast</option>
                      <option value="High">Higher than forecast</option>
                      <option value="Much higher">Much higher than forecast</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reporterName" className="block font-bold text-carbon-90 mb-1">
                      Your name or role
                    </label>
                    <input
                      id="reporterName"
                      type="text"
                      value={form.reporterName}
                      onChange={(e) => set('reporterName', e.target.value)}
                      placeholder="e.g. Extension Officer, Sunamganj"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="contactEmail" className="block font-bold text-carbon-90 mb-1">
                    Reply address (email or phone)
                  </label>
                  <input
                    id="contactEmail"
                    type="text"
                    value={form.contactEmail}
                    onChange={(e) => set('contactEmail', e.target.value)}
                    placeholder="officer@dae.gov.bd"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="comments" className="block font-bold text-carbon-90 mb-1">
                    What did you observe?
                  </label>
                  <textarea
                    id="comments"
                    rows={4}
                    value={form.comments}
                    onChange={(e) => set('comments', e.target.value)}
                    placeholder="Flooded crop acreage, water depth over danger level, dates, and how it compared with what the district card showed."
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {activeForm === 'api' && (
              <>
                <div>
                  <label htmlFor="institution" className="block font-bold text-carbon-90 mb-1">
                    Institution or organisation
                  </label>
                  <input
                    id="institution"
                    type="text"
                    value={form.institution}
                    onChange={(e) => set('institution', e.target.value)}
                    placeholder="e.g. Bangladesh University of Engineering & Technology"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="institutionEmail" className="block font-bold text-carbon-90 mb-1">
                      Institutional email
                    </label>
                    <input
                      id="institutionEmail"
                      type="email"
                      value={form.institutionEmail}
                      onChange={(e) => set('institutionEmail', e.target.value)}
                      placeholder="researcher@buet.ac.bd"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="requestRate" className="block font-bold text-carbon-90 mb-1">
                      Expected request rate
                    </label>
                    <select
                      id="requestRate"
                      value={form.requestRate}
                      onChange={(e) => set('requestRate', e.target.value)}
                      className={inputClass}
                    >
                      <option value="1000">up to 1,000 requests / day</option>
                      <option value="10000">up to 10,000 requests / day</option>
                      <option value="custom">Custom pipeline / bulk archive</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="message" className="block font-bold text-carbon-90 mb-1">
                    Intended use
                  </label>
                  <textarea
                    id="message"
                    rows={4}
                    value={form.message}
                    onChange={(e) => set('message', e.target.value)}
                    placeholder="What will you query, how often, and will derived outputs be published?"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {activeForm === 'general' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="fullName" className="block font-bold text-carbon-90 mb-1">
                      Full name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={form.fullName}
                      onChange={(e) => set('fullName', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block font-bold text-carbon-90 mb-1">
                      Reply address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => set('email', e.target.value)}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="generalMessage" className="block font-bold text-carbon-90 mb-1">
                    Message
                  </label>
                  <textarea
                    id="generalMessage"
                    rows={4}
                    value={form.message}
                    onChange={(e) => set('message', e.target.value)}
                    placeholder="Dataset licensing, reproducing paper results, partnership questions — anything."
                    className={inputClass}
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              className="px-6 py-3 bg-nasa-red text-carbon-90 font-bold transition-all flex items-center gap-2 text-xs hover:bg-nasa-red-shade cursor-pointer"
            >
              <SendIcon size={18} duration={0} isState={false} />
              <span>Prepare report</span>
            </button>
            <p className="text-xs leading-relaxed text-carbon-60">
              The button prepares your report and shows sending options. It does not transmit anything by itself, and
              HazardNet does not store these forms on its servers.
            </p>
          </form>
        </div>

        <aside className="space-y-6">
          <div className="bg-white text-carbon-90 p-6 space-y-4 border border-carbon-20">
            <h2 className="font-extrabold text-sm uppercase tracking-wider font-mono text-carbon-90">
              Official hotlines
            </h2>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-white border border-nasa-red space-y-1">
                <span className="font-bold text-nasa-red-shade block">National emergency service</span>
                <p className="font-mono text-sm font-bold text-nasa-red-shade">📞 999</p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 space-y-1">
                <span className="font-bold text-amber-900 block">Department of Agricultural Extension (DAE)</span>
                <p className="font-mono text-sm font-bold text-amber-800">📞 16123</p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 space-y-1">
                <span className="font-bold text-amber-900 block">Disaster management helpline</span>
                <p className="font-mono text-sm font-bold text-amber-800">📞 1090</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-carbon-20 p-6 space-y-3 text-xs text-carbon-60">
            <h2 className="font-bold text-carbon-90 text-sm flex items-center gap-2">
              <MaterialIcon name="hub" className="text-amber-800" /> Where reports go
            </h2>
            <p className="leading-relaxed">
              HazardNet is an independent project without a staffed office. Reports are filed on the public issue
              tracker or emailed to the maintainers, and corrections to thresholds are recorded in the same repository
              as the code — so changes can be traced.
            </p>
            <ul className="space-y-1.5">
              <li>
                <a
                  className="font-bold text-amber-700 hover:text-amber-900 underline underline-offset-4"
                  href={`${REPO}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Public issue tracker
                </a>
              </li>
              <li>
                <a className="font-bold text-amber-700 hover:text-amber-900 underline underline-offset-4" href={mailtoUrl}>
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a className="font-bold text-amber-700 hover:text-amber-900 underline underline-offset-4" href="/.well-known/security.txt">
                  Security disclosure policy
                </a>
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <p className="text-xs text-carbon-60">
        HazardNet is decision support, not an official warning service. See the{' '}
        <a className="font-bold text-amber-700 hover:text-amber-900" href="/methodology">
          methodology
        </a>{' '}
        and{' '}
        <a className="font-bold text-amber-700 hover:text-amber-900" href="/data-sources">
          data sources
        </a>{' '}
        pages for scope and limitations.
      </p>
    </motion.div>
  );
};

export default Contact;
