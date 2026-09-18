import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import MaterialIcon from '../MaterialIcon';
import {
  USERNAME_MAX,
  USERNAME_RULES,
  profilePath,
  sanitizeUsernameInput,
  suggestUsernames,
  validateUsername,
} from '../../lib/username';

/**
 * Username field with as-you-type validation:
 *   · input is sanitized live (lowercase, a–z / 0–9 / underscore only)
 *   · format problems + the rule list render while typing
 *   · availability is checked (debounced) against Supabase
 *   · when invalid or taken, suggestion chips (lowercase / _ / number
 *     variants) appear — one tap applies the suggestion
 */

export type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

export interface UsernameFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Full name / email used to seed suggestions. */
  fullName?: string | null;
  email?: string | null;
  /** The user's current username — never reported as "taken" for them. */
  currentUsername?: string | null;
  /** Auto-focus the input on mount. */
  autoFocus?: boolean;
  /** Show the compact rule checklist (default true). */
  showRules?: boolean;
  placeholder?: string;
}

const RULE_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

export const UsernameField: React.FC<UsernameFieldProps> = ({
  id = 'username-field',
  label = 'Username',
  value,
  onChange,
  fullName,
  email,
  currentUsername,
  autoFocus,
  showRules = true,
  placeholder = 'e.g. ashif_ahmed',
}) => {
  const { checkUsernameAvailability } = useAuth();
  const [status, setStatus] = useState<UsernameStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);

  const validation = validateUsername(value);
  const suggestions = suggestUsernames({ username: value, fullName, email });

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const trimmed = sanitizeUsernameInput(value);

    if (!trimmed) {
      setStatus('idle');
      setStatusMessage(null);
      return;
    }
    if (!validation.valid) {
      setStatus('invalid');
      setStatusMessage(validation.message);
      return;
    }
    if (trimmed === currentUsername) {
      setStatus('available');
      setStatusMessage('This is your current username.');
      return;
    }

    setStatus('checking');
    setStatusMessage('Checking availability…');
    const sequence = ++sequenceRef.current;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const available = await checkUsernameAvailability(trimmed);
        if (sequenceRef.current !== sequence) return; // stale response
        if (available) {
          setStatus('available');
          setStatusMessage(`@${trimmed} is available — profile at hazardnet.live${profilePath(trimmed)}`);
        } else {
          setStatus('taken');
          setStatusMessage(`@${trimmed} is already taken.`);
        }
      } catch {
        if (sequenceRef.current !== sequence) return;
        setStatus('idle');
        setStatusMessage(null);
      }
    }, 450);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, currentUsername, checkUsernameAvailability]);

  const statusStyles: Record<UsernameStatus, { ring: string; icon: string; text: string; iconClass: string }> = {
    idle: { ring: 'focus-within:border-nasa-blue focus-within:ring-nasa-blue/40', icon: '', text: 'text-slate-500', iconClass: '' },
    invalid: { ring: 'border-rose-300 focus-within:ring-rose-200', icon: 'error', text: 'text-rose-700', iconClass: 'text-rose-500' },
    checking: { ring: 'focus-within:border-nasa-blue focus-within:ring-nasa-blue/40', icon: 'hourglass_top', text: 'text-slate-500', iconClass: 'text-slate-400' },
    available: { ring: 'border-emerald-300 focus-within:ring-emerald-200', icon: 'check_circle', text: 'text-emerald-700', iconClass: 'text-emerald-600' },
    taken: { ring: 'border-orange-300 focus-within:ring-orange-200', icon: 'error', text: 'text-orange-700', iconClass: 'text-orange-500' },
  };
  const style = statusStyles[status];

  return (
    <div data-testid="username-field">
      <label className="block text-xs font-bold text-slate-800 mb-1.5" htmlFor={id}>
        {label}
      </label>
      <div
        className={`flex items-center gap-0 rounded-2xl border border-slate-200 bg-slate-50 transition-all focus-within:ring-2 ${style.ring}`}
      >
        <span className="pl-4 text-sm font-bold text-slate-400 select-none" aria-hidden="true">
          @
        </span>
        <input
          id={id}
          name="username"
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoComplete="username"
          spellCheck={false}
          maxLength={USERNAME_MAX + 8}
          placeholder={placeholder}
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => onChange(sanitizeUsernameInput(event.target.value))}
          aria-describedby={`${id}-status`}
          className="w-full bg-transparent px-2 py-3 text-base sm:text-sm text-slate-900 placeholder-slate-400 font-medium outline-none"
        />
        {status !== 'idle' && (
          <span className="pr-4 flex items-center" aria-hidden="true">
            {status === 'checking' ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
            ) : (
              <MaterialIcon name={style.icon} className={style.iconClass} size={18} />
            )}
          </span>
        )}
      </div>

      {/* Live status line */}
      <p id={`${id}-status`} aria-live="polite" className={`mt-1 text-[11px] font-semibold ${style.text}`} data-testid="username-status">
        {statusMessage}
      </p>

      {/* Rule checklist while typing */}
      {showRules && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1" data-testid="username-rules">
          {USERNAME_RULES.map((rule) => (
            <li key={rule} className="flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
              <span aria-hidden="true">•</span>
              {rule}
            </li>
          ))}
        </ul>
      )}

      {/* Suggestions */}
      <AnimatePresence>
        {suggestions.length > 0 && (status === 'invalid' || status === 'taken') && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
            data-testid="username-suggestions"
          >
            <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Try one of these</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onChange(suggestion)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700 shadow-xs transition-all hover:border-nasa-blue hover:bg-amber-50 hover:text-amber-900 cursor-pointer"
                  >
                    @{suggestion}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
