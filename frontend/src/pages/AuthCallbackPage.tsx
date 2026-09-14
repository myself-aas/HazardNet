import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRedirectResult } from 'firebase/auth';
import { auth } from '../services/firebase';
import { AuthLayout } from '../components/auth/AuthLayout';
import { describeOAuthError, resolveOAuthReturnTo } from '../lib/oauthProviders';

// Firebase owns /__/auth/handler. This page only completes SDK-managed redirects;
// legacy URL tokens, arbitrary authorization codes and email-link sessions are not accepted.
let redirectResult: ReturnType<typeof getRedirectResult> | undefined;
const completeRedirect = () => redirectResult ??= getRedirectResult(auth).finally(() => { redirectResult = undefined; });
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [failure, setFailure] = useState<string | null>(null);
  const original = useMemo(() => ({ search: window.location.search, hash: window.location.hash }), []);
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(original.search);
    const next = params.get('next');
    const legacy = params.has('code') || params.has('error') || params.has('oobCode') || params.has('apiKey') || Boolean(original.hash);
    window.history.replaceState({}, '', '/auth/callback');
    if (legacy) {
      setFailure('This sign-in link is no longer supported. Sign in with email/password, Google or GitHub.');
      return;
    }
    void completeRedirect().then((result) => {
      if (cancelled) return;
      if (!result) { setFailure('No pending sign-in. Please return to the sign-in page.'); return; }
      navigate(resolveOAuthReturnTo(next), { replace: true });
    }).catch((error) => { if (!cancelled) setFailure(describeOAuthError(error).hint); });
    return () => { cancelled = true; };
  }, [navigate, original]);
  return <AuthLayout mode="login" title="Complete sign-in" subtitle="Secure authentication with Firebase.">
    {failure ? <><p role="alert">{failure}</p><Link className="font-bold text-amber-800" to="/login">Back to sign in</Link></>
      : <p role="status">Completing sign-in…</p>}
  </AuthLayout>;
}
