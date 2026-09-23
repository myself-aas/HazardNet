import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { HazardNetBrand } from './HazardNetLogo';

export const Footer: React.FC = () => {
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    <footer className="relative z-10 border-t border-carbon-20 bg-carbon-05 py-16 px-4 md:px-8 text-xs text-carbon-80 shadow-sm">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Top Header Row */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-carbon-20">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <HazardNetBrand size="lg" />
            </div>
            <p className="text-carbon-60 text-xs leading-relaxed">
              A multi-hazard forecasting platform for 7- and 15-day multi-hazard outlooks across Bangladesh, with dual-track severity and agronomic context.
            </p>
            <div className="pt-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-carbon-10 border border-carbon-20 font-mono text-[10px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-carbon-80 font-bold">Provenance-stamped forecast snapshots</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/download"
              className="min-h-[44px] px-4 py-2.5 rounded-control bg-nasa-red hover:bg-nasa-red-shade text-white font-semibold shadow-sm transition-all flex items-center gap-2 tap-target"
            >
              <span>Download Software & Apps</span>
            </Link>

            <a
              href="https://github.com/myself-aas/HazardNet"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 py-2.5 rounded-control bg-carbon-10 text-carbon-80 font-semibold border border-carbon-20 hover:bg-carbon-20 transition-all flex items-center gap-2 tap-target"
            >
              <span>GitHub Repository</span>
            </a>

            <button
              type="button"
              onClick={() => setIsFeedbackModalOpen(true)}
              className="min-h-[44px] px-4 py-2.5 rounded-control bg-carbon-10 text-carbon-80 font-semibold border border-carbon-20 hover:bg-carbon-20 transition-all flex items-center gap-2 tap-target cursor-pointer"
              title="Report AI False Positive or Model Anomaly"
              aria-label="Open model feedback modal"
            >
              <span>Feedback</span>
            </button>
          </div>
        </div>

        {/* Navigation Grid Links */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          
          {/* Column 1: Core Platform */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-carbon-90 uppercase text-[11px] tracking-wider font-mono">
              Core Platform
            </h4>
            <ul className="space-y-1 text-carbon-60">
              <li>
                <Link to="/live" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  GIS Live Map
                </Link>
              </li>
              <li>
                <Link to="/analytics" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Risk Analytics
                </Link>
              </li>
              <li>
                <Link to="/upload" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Raster Ingestion
                </Link>
              </li>
              <li>
                <Link to="/use-cases" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Regional Profiles
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Applications & Use Cases */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-carbon-90 uppercase text-[11px] tracking-wider font-mono">
              Use Cases
            </h4>
            <ul className="space-y-1 text-carbon-60">
              <li>
                <Link to="/use-cases?case=haor" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Haor Pre-Monsoon Flash Flood
                </Link>
              </li>
              <li>
                <Link to="/use-cases?case=cyclone" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Coastal Cyclone Storm Surge
                </Link>
              </li>
              <li>
                <Link to="/use-cases?case=barind" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Barind Agricultural Drought
                </Link>
              </li>
              <li>
                <Link to="/use-cases?case=coldwave" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Sub-Himalayan Cold Snap
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Software & Downloads */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-carbon-90 uppercase text-[11px] tracking-wider font-mono">
              Downloads & SDKs
            </h4>
            <ul className="space-y-1 text-carbon-60">
              <li>
                <Link to="/download?platform=android" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Android APK Mobile App
                </Link>
              </li>
              <li>
                <Link to="/download?platform=windows" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Windows Desktop GUI
                </Link>
              </li>
              <li>
                <Link to="/download?platform=linux" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Linux Daemon & CLI
                </Link>
              </li>
              <li>
                <Link to="/download?platform=python" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Python Library (source)
                </Link>
              </li>
              <li>
                <Link to="/download?platform=npm" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  JavaScript Library (source)
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Knowledge & Insights */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-carbon-90 uppercase text-[11px] tracking-wider font-mono">
              Research & Insights
            </h4>
            <ul className="space-y-1 text-carbon-60">
              <li>
                <Link to="/docs" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  System Documentation
                </Link>
              </li>
              <li>
                <Link to="/status" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  System Status
                </Link>
              </li>
              <li>
                <Link to="/blogs" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Research Blogs & Field Insights
                </Link>
              </li>
              {/* Phase 8 content engine: the hazard-by-hazard methodology and the per-district
                  outlooks are crawlable reference pages, so they belong in the footer nav. */}
              <li>
                <Link to="/hazards" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Hazard Methodology
                </Link>
              </li>
              <li>
                <Link to="/districts" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  District Outlooks
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Mission & Collaborators
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Contact & Emergency Hotline
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setIsFeedbackModalOpen(true)}
                  className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link cursor-pointer text-left bg-transparent border-0 p-0"
                  title="Report AI False Positive or Model Anomaly"
                >
                  Model Feedback
                </button>
              </li>
            </ul>
          </div>

          {/* Column 5: Legal & Open Data */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-carbon-90 uppercase text-[11px] tracking-wider font-mono">
              Legal & License
            </h4>
            <ul className="space-y-1 text-carbon-60">
              <li>
                <Link to="/terms" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link">
                  Privacy & Telemetry Policy
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/myself-aas/HazardNet/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all min-h-[44px] inline-flex items-center touch-target-link"
                >
                  CC BY 4.0 Open License
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar: Single unified baseline with standardized 24px gap */}
        <div className="pt-8 border-t border-carbon-20 flex flex-row flex-wrap items-center justify-center gap-6 text-center w-full">
          <span className="font-mono font-bold text-xs text-carbon-80">© {new Date().getFullYear()} HazardNet</span>
          <Link to="/terms" className="touch-target-link min-h-[44px] inline-flex items-center py-2 px-1 text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all touch-manipulation">Terms</Link>
          <Link to="/privacy" className="touch-target-link min-h-[44px] inline-flex items-center py-2 px-1 text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all touch-manipulation">Privacy</Link>
          <Link to="/docs" className="touch-target-link min-h-[44px] inline-flex items-center py-2 px-1 text-[13px] font-medium text-carbon-80 hover:text-nasa-red-shade hover:underline transition-all touch-manipulation">Docs</Link>
        </div>

      </div>

      {/* Feedback Modal */}
      {isFeedbackModalOpen && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-carbon-90/40 backdrop-blur-sm" onClick={() => setIsFeedbackModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-carbon-20 p-6 animate-fadeIn text-carbon-80">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-extrabold text-carbon-90">Submit Model Feedback</h3>
              <button 
                onClick={() => setIsFeedbackModalOpen(false)}
                className="text-carbon-60 hover:text-carbon-80 text-xl font-bold"
              >
                ×
              </button>
            </div>
            
            {feedbackSuccess ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center text-2xl font-bold">✓</div>
                <h4 className="font-bold text-carbon-90">Feedback Submitted!</h4>
                <p className="text-carbon-60">Your report helps improve our classification algorithms.</p>
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1 text-carbon-70">Feedback Type</label>
                  <select required className="w-full p-2.5 bg-carbon-05 border border-carbon-20 rounded-xl text-sm focus:outline-none focus:border-nasa-blue text-carbon-80">
                    <option value="">Select type...</option>
                    <option value="false_positive">Report False Positive (False Alarm)</option>
                    <option value="false_negative">Report False Negative (Missed Hazard)</option>
                    <option value="improvement">Suggest Feature/Improvement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-carbon-70">Description</label>
                  <textarea 
                    required 
                    rows={4} 
                    className="w-full p-2.5 bg-carbon-05 border border-carbon-20 rounded-xl text-sm focus:outline-none focus:border-nasa-blue text-carbon-80 resize-none"
                    placeholder="Describe the discrepancy..."
                  ></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsFeedbackModalOpen(false)}
                    className="px-4 py-2 font-bold text-carbon-60 hover:bg-carbon-10 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-nasa-red text-white font-extrabold rounded-xl hover:bg-nasa-red-shade transition-colors shadow-sm"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Scroll to Top Button - Fixed Position Crisp Square Aesthetic (44x44px) */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-[var(--z-sticky)] h-11 w-11 rounded-control bg-white shadow-md border border-carbon-20 text-carbon-80 hover:text-carbon-90 hover:bg-carbon-05 transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-nasa-red focus:ring-offset-2 touch-manipulation tap-target animate-fadeIn"
          title="Back to Top"
          aria-label="Scroll to top"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m18 15-6-6-6 6"/>
          </svg>
        </button>
      )}

    </footer>
  );
};

export default Footer;
