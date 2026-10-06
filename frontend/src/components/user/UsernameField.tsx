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
 *   · availability is checked (debounced) against the profiles collection
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
          setStatusMessage(`@${trimmed} is available. Profile at hazardnet.live${profilePath(trimmed)}`);
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

  /* Status is carried by the ICON and the words; colour stays inside the system. This map used to
     paint "available" with severity-low green, "invalid" with severity-high and "taken" with a
     second amber — three hazard levels spent on a validation state, on a page whose only accent is
     Action Blue. Available now reads as a confirmed fact (ink + check), and a problem reads in ink
     with the reason spelled out next to it, which is also the only thing a greyscale printout keeps. */
  const statusStyles: Record<UsernameStatus, { ring: string; icon: string; text: string; iconClass: string }> = {
    idle: { ring: 'focus-within:border-ap-primary', icon: '', text: 'text-carbon-60', iconClass: '' },
    invalid: { ring: '', icon: 'error', text: 'text-carbon-90', iconClass: 'text-carbon-70' },
    checking: { ring: 'focus-within:border-ap-primary', icon: 'hourglass_top', text: 'text-carbon-60', iconClass: 'text-carbon-60' },
    available: { ring: '', icon: 'check_circle', text: 'text-carbon-90', iconClass: 'text-carbon-70' },
    taken: { ring: '', icon: 'error', text: 'text-carbon-90', iconClass: 'text-carbon-70' },
  };
  const style = statusStyles[status];

  return (
    <div data-testid="username-field">
      <label className="block text-sm font-semibold text-carbon-80 mb-1.5" htmlFor={id}>
        {label}
      </label>
      {/* The same pill the other fields use (`.ap-input`), with the @ set beside it instead of
          inside it — the field is then the system's input rather than a second bordered shell with
          an input nested in it. */}
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-carbon-60 select-none" aria-hidden="true">
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
          className={`ap-input min-w-0 flex-1 ${style.ring}`}
        />
      </div>

      {/* Live status line — icon and words together, never colour alone. */}
      <p
        id={`${id}-status`}
        aria-live="polite"
        className={`mt-1.5 flex items-center gap-1.5 text-sm leading-[1.62] font-semibold ${style.text}`}
        data-testid="username-status"
      >
        {status === 'checking' ? (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-carbon-20 border-t-carbon-60"
          />
        ) : (
          status !== 'idle' && (
            <MaterialIcon name={style.icon} className={`${style.iconClass} shrink-0`} size={16} />
          )
        )}
        {statusMessage}
      </p>

      {/* Rule checklist while typing */}
      {showRules && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1" data-testid="username-rules">
          {USERNAME_RULES.map((rule) => (
            <li key={rule} className="flex items-center gap-1 text-sm leading-[1.62] font-medium text-carbon-60">
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
            <div className="mt-2 bg-carbon-05 p-3">
              <p className="mb-1.5 text-xs font-semibold text-carbon-60">Try one of these</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onChange(suggestion)}
                    className="ap-focusable min-h-[44px] rounded-full border border-carbon-20 bg-white px-4 text-base font-semibold text-carbon-70 hover:border-ap-primary"
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
