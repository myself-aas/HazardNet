import React from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { InfinityLoader } from '../brand/InfinityLoader';

/**
 * The three non-happy states a data surface owes a reader, in one place so a page cannot ship
 * two of them and forget the third.
 *
 * Backlog 13 of docs/audits/2026-10-03-frontend-design-system-audit.md asks for a four-state
 * checklist (loading / empty / error+retry / success) across the page surface. The rule this file
 * implements is the one the audit's P2-3 recommendation states:
 *
 *   - loading is announced, and never a blank frame: `role="status"`, `aria-live="polite"`;
 *   - empty says which kind of empty it is (nothing matched a filter is a different sentence from
 *     nothing was published), so the copy is a prop, not a constant;
 *   - error is `role="alert"` and carries a retry, because a dead end is the failure mode the
 *     audit measured on most of the pages that had an error state at all.
 *
 * Deliberately not a general layout component: it renders inside whatever container the page
 * already has, at the page's own width, so adopting it is a one-line change per branch.
 */

export interface DataStateLoadingProps {
  /** What is being read, in the reader's terms ("Loading hazard archive"). */
  label: string;
  /** A sentence under the label, for the cases where the wait is long enough to need one. */
  detail?: string;
  className?: string;
  /** Show the brand loop. Off for a one-line inline state where a 96px loader would dominate. */
  loader?: boolean;
}

export const DataStateLoading: React.FC<DataStateLoadingProps> = ({ label, detail, className = '', loader = true }) => (
  <div className={`flex items-center justify-center p-8 ${className}`} role="status" aria-live="polite">
    <div className="text-center">
      {loader && <InfinityLoader size={72} label={label} announce={false} className="mx-auto mb-3 block" />}
      <p className="text-sm font-medium text-carbon-70">{label}</p>
      {detail && <p className="mt-1 text-xs text-carbon-60">{detail}</p>}
    </div>
  </div>
);

export interface DataStateEmptyProps {
  title: string;
  body?: string;
  className?: string;
}

export const DataStateEmpty: React.FC<DataStateEmptyProps> = ({ title, body, className = '' }) => (
  <div className={`ap-enter border border-carbon-20 rounded-2xl bg-white p-6 text-center ${className}`}>
    <Inbox className="mx-auto mb-3 h-6 w-6 text-carbon-50" aria-hidden="true" />
    <h3 className="text-sm font-bold text-carbon-90">{title}</h3>
    {body && <p className="mx-auto mt-1 max-w-prose text-xs text-carbon-60">{body}</p>}
  </div>
);

export interface DataStateErrorProps {
  title?: string;
  /** The technical reason, when the loader reported one. Rendered small and monospaced. */
  detail?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const DataStateError: React.FC<DataStateErrorProps> = ({
  title = 'This data could not be loaded',
  detail = null,
  onRetry,
  retryLabel = 'Try again',
  className = '',
}) => (
  <div className={`ap-enter border border-carbon-20 rounded-2xl bg-white p-6 text-center ${className}`} role="alert">
    <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-ap-link" aria-hidden="true" />
    <h3 className="text-sm font-bold text-carbon-90">{title}</h3>
    <p className="mx-auto mt-1 max-w-prose text-xs text-carbon-60">
      The page is showing what it has; nothing is filled in to cover the gap.
    </p>
    {detail && <p className="mt-2 font-mono text-xs text-carbon-60">{detail}</p>}
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-[44px] items-center gap-2 border border-carbon-20 rounded-full bg-carbon-05 px-4 text-sm font-semibold text-carbon-90 hover:bg-carbon-10 touch-manipulation"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        {retryLabel}
      </button>
    )}
  </div>
);

export default DataStateLoading;
