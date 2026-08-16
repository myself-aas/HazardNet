import { Link, useNavigate } from 'react-router-dom';
import { HazardNetBrand } from '../components/HazardNetLogo';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 text-center shadow-xl space-y-5">
        <div className="flex justify-center">
          <HazardNetBrand size="md" />
        </div>

        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-3xl font-extrabold text-amber-900 shadow-inner">
          404
        </div>

        <div className="space-y-1.5">
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Page Not Found
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            The page or route you are attempting to access does not exist or has been moved.
          </p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] text-slate-500 font-mono text-left">
          Status: 404 HTTP / Client Router Unmatched
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-2xl text-xs transition-colors cursor-pointer"
          >
            ← Go Back
          </button>
          <Link
            to="/"
            className="flex-1 py-2.5 px-4 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 font-extrabold rounded-2xl text-xs text-center transition-colors shadow-xs"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
