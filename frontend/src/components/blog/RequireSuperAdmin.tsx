import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Route guard for the authenticated blog studio. Renders full pages (never a
 * popup): signed-out users are redirected to login with a return path;
 * registered users enter their author-scoped studio; rules enforce ownership.
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
          Registered users may publish and manage their own articles. Sign in to continue.
        </p>
        <Link
          to={`/login?next=${encodeURIComponent(location.pathname)}`}
          className="rounded-2xl bg-[#f9a825] px-5 py-3 text-sm font-black text-slate-950 shadow-md transition-colors hover:bg-[#d08305]"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireSuperAdmin;
