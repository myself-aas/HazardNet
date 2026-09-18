import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isPrimarySuperAdmin, primarySuperAdminEmails } from '../../lib/superadmins';

/**
 * Route guard for the superadmin blog studio. Renders full pages (never a
 * popup): signed-out users are redirected to login with a return path;
 * signed-in non-superadmins get an explicit 403 page.
 */
export const RequireSuperAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Checking permissions">
        <span className="w-8 h-8 border-[3px] border-slate-200 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <span className="text-3xl">🔐</span>
        <h1 className="text-xl font-black text-slate-900">Sign in required</h1>
        <p className="text-sm text-slate-600 max-w-md">
          The Blog Studio is restricted to HazardNet primary superadmins. Sign in with a superadmin account to continue.
        </p>
        <Link
          to={`/login?next=${encodeURIComponent(location.pathname)}`}
          className="rounded-2xl bg-nasa-red px-5 py-3 text-sm font-black text-slate-950 shadow-md transition-colors hover:bg-nasa-red-shade"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (!isPrimarySuperAdmin(user.email)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4" role="alert">
        <span className="text-3xl">⛔</span>
        <h1 className="text-xl font-black text-slate-900">Superadmins only</h1>
        <p className="text-sm text-slate-600 max-w-md leading-relaxed">
          Blog publishing is restricted to HazardNet&apos;s primary superadmins. You are signed in as{' '}
          <span className="font-mono font-bold text-slate-800">{user.email}</span>, which does not have article
          management rights.
        </p>
        <div className="flex items-center gap-2">
          <Link to="/" className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">
            Back to home
          </Link>
          <Link to="/blogs" className="rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-700">
            Read the blog
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireSuperAdmin;
