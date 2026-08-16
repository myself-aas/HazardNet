import MaterialIcon from "../components/MaterialIcon";
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { DownloadDoneIcon, SuccessIcon } from '../components/ui/animated-state-icons';

export const AdvisoriesPage: React.FC = () => {
  const { subCategory } = useParams<{ subCategory?: string }>();
  const navigate = useNavigate();
  const activeTab = subCategory || 'crops';

  const categories = [
    { id: 'crops', name: 'BRRI / DAE Crop Protocols', code: 'CROP', desc: 'Resilient Boro, Aman, and Aus paddy flood & salinity mitigation guidelines by Department of Agricultural Extension (DAE) & BRRI.' },
    { id: 'livestock', name: 'DLS / BLRI Livestock Safeguards', code: 'CATTLE', desc: 'Emergency shelter, vaccination schedules, and fodder preservation protocols for cattle and livestock during floods and cyclones.' },
    { id: 'fisheries', name: 'DoF / BFRI Fisheries Management', code: 'FISH', desc: 'Net enclosure reinforcement, pond overflow management, and broodstock protection guidelines by Fisheries Research Institute.' },
    { id: 'health-wash', name: 'WHO / UNICEF WASH Protocols', code: 'WASH', desc: 'Water purification tablet distribution, oral rehydration saline (ORS) stockpiling, and sanitation hygiene emergency guides.' },
    { id: 'seasonal-calendar', name: 'Kharif / Rabi Agro-Calendar', code: 'CALENDAR', desc: 'Precision planting, transplanting, and harvesting window advisories correlated with probabilistic monsoon and drought forecasts.' },
  ];

  const currentCat = categories.find(c => c.id === activeTab) || categories[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6"
    >
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden space-y-3">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#f9a825]"></div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-950 text-xs font-mono font-extrabold mb-3 shadow-2xs">
            <span>NATIONAL ADVISORY REPOSITORY</span>
            <span>•</span>
            <span>BRRI, DLS, DoF, WHO Protocols</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Standard Operating Procedures & Hazard Advisories
          </h1>
          <p className="text-slate-600 mt-2 max-w-3xl text-xs sm:text-sm leading-relaxed font-normal">
            Authorized institutional emergency protocols and seasonal agricultural guidance for Bangladesh climate resilience, real-time risk mitigation, and community protection.
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2.5 border-b border-slate-200/80 pb-4 overflow-x-auto scrollbar-none touch-scroll">
        {categories.map((cat) => (
          <motion.button
            key={cat.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/advisories/${cat.id}`)}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-black transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === cat.id
                ? 'bg-[#f9a825] text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 shadow-2xs'
            }`}
          >
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-black/10 text-slate-950 font-bold">{cat.code}</span>
            <span>{cat.name}</span>
          </motion.button>
        ))}
      </div>

      {/* Selected Advisory Content with Tab Switch Transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="px-3.5 py-2 bg-amber-50 rounded-2xl border border-amber-200 font-mono text-amber-950 font-black text-xs shadow-2xs">
                {currentCat.code}
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{currentCat.name}</h2>
                <p className="text-slate-600 text-xs sm:text-sm mt-1 leading-relaxed">{currentCat.desc}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h3 className="text-xs sm:text-sm font-mono font-extrabold text-slate-900 uppercase tracking-wider">Operational Directives & Field Protocols</h3>
              
              <div className="space-y-3">
                {[
                  {
                    title: '1. Early Warning Lead Time (72-Hour Threshold)',
                    badge: 'Active',
                    badgeStyle: 'bg-amber-100 text-amber-950 border-amber-300',
                    desc: 'Dispatch automated SMS alerts and district office notifications upon tensor anomaly detection exceeding 0.75 severity index.'
                  },
                  {
                    title: '2. Community Mobilization & Resource Staging',
                    badge: 'Mandatory',
                    badgeStyle: 'bg-rose-100 text-rose-950 border-rose-300',
                    desc: 'Coordinate with Upazila Nirbahi Officers (UNO) and local Union Parishad chairmen for immediate shelter readiness and evacuation support.'
                  },
                  {
                    title: '3. Post-Event Impact Assessment & Relief Distribution',
                    badge: 'Scheduled',
                    badgeStyle: 'bg-slate-100 text-slate-800 border-slate-300',
                    desc: 'Upload drone geotagged photos and crop damage telemetry to HazardNet Firestore to trigger rapid agricultural rehabilitation funds.'
                  }
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    whileHover={{ x: 4 }}
                    className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl border border-slate-200/80 hover:border-amber-300/80 hover:shadow-md space-y-1.5 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900">{item.title}</span>
                      <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border font-extrabold ${item.badgeStyle}`}>{item.badge}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-normal">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Info */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-mono font-extrabold text-slate-900 uppercase tracking-widest">Quick Resources</h3>
              <div className="space-y-3 text-xs">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => toast.success('Preparing official PDF protocol manual download...', { icon: <MaterialIcon name="description" className="w-4 h-4 inline-block mr-1" /> })}
                  className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-amber-400 hover:shadow-xs transition-all text-slate-900 font-extrabold flex items-center justify-between cursor-pointer"
                >
                  <span className="text-xs sm:text-sm">Official PDF Manual (Bangla / English)</span>
                  <span className="font-mono text-slate-950 text-xs flex items-center gap-1.5 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200">
                    <DownloadDoneIcon isState={false} size={16} duration={0} /> PDF
                  </span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => toast.success('Protocol verified against 2026 National Disaster Management Framework.', { icon: <MaterialIcon name="shield" className="w-4 h-4 inline-block mr-1" /> })}
                  className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-emerald-400 hover:shadow-xs transition-all text-slate-900 font-extrabold flex items-center justify-between cursor-pointer"
                >
                  <span className="text-xs sm:text-sm">Protocol Verification Status</span>
                  <span className="font-mono text-emerald-900 text-xs font-black flex items-center gap-1 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <SuccessIcon isState={true} size={16} /> Verified
                  </span>
                </motion.button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/90 space-y-2">
              <span className="text-[10px] font-mono font-extrabold text-amber-950 uppercase tracking-wider block">Authority & Issuing Body</span>
              <p className="text-xs font-black text-slate-900">Department of Agrometeorology, BAU Mymensingh</p>
              <p className="text-[11px] text-slate-600 font-medium">Developer: Ashif Ahmed Shuvo</p>
            </div>

            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 text-xs space-y-1.5 shadow-2xs">
              <div className="font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                <span>Emergency Helpline</span>
              </div>
              <p className="text-slate-600 leading-relaxed font-normal">For immediate government coordination or emergency rescue requests, contact the National Disaster Response Cell at <strong className="text-slate-900 font-extrabold">1090</strong> or <strong className="text-slate-900 font-extrabold">999</strong>.</p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

export default AdvisoriesPage;
