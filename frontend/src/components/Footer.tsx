import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HazardNetBrand } from './HazardNetLogo';

export const Footer: React.FC = () => {
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackSuccess(true);
    setTimeout(() => {
      setFeedbackSuccess(false);
      setIsFeedbackModalOpen(false);
    }, 2000);
  };

  return (
    <footer className="relative z-10 border-t border-slate-200 bg-white pt-12 pb-8 px-4 md:px-8 text-xs text-slate-600 shadow-sm">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Top Header Row */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-slate-200">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <HazardNetBrand size="lg" />
            </div>
            <p className="text-slate-500 text-xs leading-relaxed">
              High-resolution 15-band satellite AI engine for real-time disaster early warning, physical severity quantification, and agronomic mitigation in South Asia.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/download"
              className="px-4 py-2.5 rounded-xl bg-[#f9a825] hover:bg-[#d08305] text-white font-extrabold shadow-sm transition-all flex items-center gap-2"
            >
              <span>Download Software & Apps</span>
            </Link>

            <a
              href="https://github.com/hazardnet/hazardnet-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold border border-slate-200 hover:bg-slate-200 transition-all flex items-center gap-2"
            >
              <span>GitHub Repository</span>
            </a>
          </div>
        </div>

        {/* Navigation Grid Links */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          
          {/* Column 1: Core Platform */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider font-mono">
              Core Platform
            </h4>
            <ul className="space-y-2 text-slate-600">
              <li>
                <Link to="/" className="hover:text-slate-900 transition-colors">
                  GIS Live Map
                </Link>
              </li>
              <li>
                <Link to="/analytics" className="hover:text-slate-900 transition-colors">
                  Risk Analytics
                </Link>
              </li>
              <li>
                <Link to="/upload" className="hover:text-slate-900 transition-colors">
                  Raster Ingestion
                </Link>
              </li>
              <li>
                <Link to="/use-cases" className="hover:text-slate-900 transition-colors">
                  Regional Profiles
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Applications & Use Cases */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider font-mono">
              Use Cases
            </h4>
            <ul className="space-y-2 text-slate-600">
              <li>
                <Link to="/use-cases?case=haor" className="hover:text-slate-900 transition-colors">
                  Haor Pre-Monsoon Flash Flood
                </Link>
              </li>
              <li>
                <Link to="/use-cases?case=cyclone" className="hover:text-slate-900 transition-colors">
                  Coastal Cyclone Storm Surge
                </Link>
              </li>
              <li>
                <Link to="/use-cases?case=barind" className="hover:text-slate-900 transition-colors">
                  Barind Agricultural Drought
                </Link>
              </li>
              <li>
                <Link to="/use-cases?case=coldwave" className="hover:text-slate-900 transition-colors">
                  Sub-Himalayan Cold Snap
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Software & Downloads */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider font-mono">
              Downloads & SDKs
            </h4>
            <ul className="space-y-2 text-slate-600">
              <li>
                <Link to="/download?platform=android" className="hover:text-slate-900 transition-colors">
                  Android APK Mobile App
                </Link>
              </li>
              <li>
                <Link to="/download?platform=windows" className="hover:text-slate-900 transition-colors">
                  Windows Desktop GUI
                </Link>
              </li>
              <li>
                <Link to="/download?platform=linux" className="hover:text-slate-900 transition-colors">
                  Linux Daemon & CLI
                </Link>
              </li>
              <li>
                <Link to="/download?platform=python" className="hover:text-slate-900 transition-colors">
                  Python PyPI Package
                </Link>
              </li>
              <li>
                <Link to="/download?platform=npm" className="hover:text-slate-900 transition-colors">
                  npm JavaScript Library
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Knowledge & Insights */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider font-mono">
              Research & Insights
            </h4>
            <ul className="space-y-2 text-slate-600">
              <li>
                <Link to="/docs" className="hover:text-slate-900 transition-colors">
                  System Documentation
                </Link>
              </li>
              <li>
                <Link to="/blogs" className="hover:text-slate-900 transition-colors">
                  Research Blogs & Field Insights
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-slate-900 transition-colors">
                  Mission & Collaborators
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-slate-900 transition-colors">
                  Contact & Emergency Hotline
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 5: Legal & Open Data */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider font-mono">
              Legal & License
            </h4>
            <ul className="space-y-2 text-slate-600">
              <li>
                <Link to="/terms" className="hover:text-slate-900 transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-slate-900 transition-colors">
                  Privacy & Telemetry Policy
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/hazardnet/hazardnet-ai/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900 transition-colors"
                >
                  CC BY 4.0 Open License
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar & Status */}
        <div className="pt-8 border-t border-slate-200 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 text-slate-600 text-xs sm:text-sm">
          <div className="flex flex-col gap-2.5 w-full">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-sans">
              <span className="font-mono text-slate-400 font-bold text-xs">© {new Date().getFullYear()}</span>
              <span className="font-brand font-black text-slate-900 tracking-tight">
                Hazard<span className="text-[#d08305]">Net</span>
                <span className="font-sans font-semibold text-slate-700 ml-1">Research Team.</span>
              </span>
              <span className="text-slate-300 font-black">•</span>
              <span className="font-semibold text-slate-800 tracking-tight flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
                Disaster Early Warning Platform
              </span>
              <span className="text-slate-300 font-black">•</span>
              <Link to="/privacy" className="font-semibold text-slate-600 hover:text-amber-600 transition-colors underline-offset-4 hover:underline">Privacy</Link>
              <span className="text-slate-300 font-black">•</span>
              <Link to="/terms" className="font-semibold text-slate-600 hover:text-amber-600 transition-colors underline-offset-4 hover:underline">Terms</Link>
            </div>

            <div className="text-slate-500 text-xs leading-relaxed flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Built by</span>
              <strong className="font-bold text-slate-800 tracking-tight">
                Department of Agrometeorology, Bangladesh Agricultural University, Mymensingh 2202
              </strong>
              <span className="text-slate-300 font-black">•</span>
              <span>Developer -</span>
              <span className="inline-flex items-center gap-1 font-brand font-black text-slate-900 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md text-[11px] tracking-tight text-amber-950">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
                Ashif Ahmed Shuvo
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono text-[10px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-700 font-bold">WASM Edge Engine: Ready</span>
            </div>

            <button
              onClick={() => setIsFeedbackModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-colors flex items-center gap-1 font-bold text-xs"
              title="Report AI False Positive"
            >
              <span>Feedback</span>
            </button>
            <button
              onClick={scrollToTop}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-colors flex items-center gap-1 font-bold text-xs"
              title="Back to Top"
            >
              <span>&uarr; Top</span>
            </button>
          </div>
        </div>

      </div>

      {/* Feedback Modal */}
      {isFeedbackModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsFeedbackModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 animate-fadeIn text-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-extrabold text-slate-900">Submit Model Feedback</h3>
              <button 
                onClick={() => setIsFeedbackModalOpen(false)}
                className="text-slate-400 hover:text-slate-800 text-xl font-bold"
              >
                ×
              </button>
            </div>
            
            {feedbackSuccess ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center text-2xl font-bold">✓</div>
                <h4 className="font-bold text-slate-900">Feedback Submitted!</h4>
                <p className="text-slate-500">Your report helps improve our classification algorithms.</p>
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700">Feedback Type</label>
                  <select required className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#f9a825] text-slate-800">
                    <option value="">Select type...</option>
                    <option value="false_positive">Report False Positive (False Alarm)</option>
                    <option value="false_negative">Report False Negative (Missed Hazard)</option>
                    <option value="improvement">Suggest Feature/Improvement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700">Description</label>
                  <textarea 
                    required 
                    rows={4} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#f9a825] text-slate-800 resize-none"
                    placeholder="Describe the discrepancy..."
                  ></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsFeedbackModalOpen(false)}
                    className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#f9a825] text-white font-extrabold rounded-xl hover:bg-[#d08305] transition-colors shadow-sm"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </footer>
  );
};

export default Footer;
