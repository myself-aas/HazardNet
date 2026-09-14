import { downloadDraft } from '../lib/hazardUx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import MaterialIcon from '../components/MaterialIcon';
import { SuccessIcon, SendIcon } from '../components/ui/animated-state-icons';

export const Contact: React.FC = () => {
  const [activeForm, setActiveForm] = useState<'report' | 'api' | 'general'>('report');
  
  // Incident Report Form State
  const [district, setDistrict] = useState('sylhet');
  const [hazardType, setHazardType] = useState('Flash Flood');
  const [severityObserved, setSeverityObserved] = useState('High');
  const [comments, setComments] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(false);
    const fields = Array.from(new FormData(e.currentTarget as HTMLFormElement).entries()).map(([name, value]) => `${name}: ${value}`).join('\n');
    downloadDraft(`UNSENT DRAFT — HazardNet has not received this request.\nType: ${activeForm}\n${fields}`);
    setSubmittedMessage('Unsent draft prepared for download. Nothing was submitted or logged. Your inputs are retained; use a verified contact channel to send it.');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      <Breadcrumbs />

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200 uppercase tracking-wider">
            Support & Communications
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-500 font-medium">Disaster Hotline & API Access</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
          HazardNet Contact, Incident Reporting & API Access
        </h1>
        <p className="text-slate-600 text-xs md:text-sm leading-relaxed max-w-3xl">
          Online submission is unavailable. Prepare and download an unsent draft, then send it through a verified contact channel. This page does not notify emergency responders.
        </p>
      </div>

      {/* Contact Form Container & Emergency Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Form Box */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
          
          {/* Form Switcher */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-xs font-bold overflow-x-auto scrollbar-none">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setActiveForm('report'); setSubmittedMessage(null); }}
              className={`px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                activeForm === 'report'
                  ? 'bg-amber-500 text-slate-900 font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              Ground-Truth Incident Report
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setActiveForm('api'); setSubmittedMessage(null); }}
              className={`px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeForm === 'api'
                  ? 'bg-amber-500 text-slate-900 font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <MaterialIcon name="key" className="text-sm" />
              <span>Academic API Key Request</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setActiveForm('general'); setSubmittedMessage(null); }}
              className={`px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeForm === 'general'
                  ? 'bg-amber-500 text-slate-900 font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <MaterialIcon name="mail" className="text-sm" />
              <span>General Inquiries</span>
            </motion.button>
          </div>

          {/* Submitted Message Box */}
          <AnimatePresence>
            {submittedMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <SuccessIcon size={24} duration={0} isState={true} className="text-amber-600" />
                  <span>{submittedMessage}</span>
                </div>
                <button onClick={() => setSubmittedMessage(null)} className="font-bold text-slate-500 hover:text-slate-900 cursor-pointer">
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {/* Form 1: Ground-Truth Incident Report */}
            {activeForm === 'report' && (
              <motion.form
                key="report"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSubmit}
                className="space-y-4 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-1">Target District:</label>
                    <select id="contact-1" name="target-district"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                    >
                      <option value="sylhet">Sylhet (Haor Basin)</option>
                      <option value="sunamganj">Sunamganj (Haor Basin)</option>
                      <option value="kurigram">Kurigram (Jamuna Riverine)</option>
                      <option value="satkhira">Satkhira (Coastal Surge)</option>
                      <option value="rajshahi">Rajshahi (Barind Drought)</option>
                      <option value="panchagarh">Panchagarh (Sub-Himalayan Cold Wave)</option>
                      <option value="coxsbazar">Cox's Bazar (Coastal Cyclone)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-2">Observed Hazard Type:</label>
                    <select id="contact-2" name="observed-hazard-type"
                      value={hazardType}
                      onChange={(e) => setHazardType(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                    >
                      <option value="Flash Flood">Flash Flood</option>
                      <option value="Monsoon Flood">Monsoon Riverine Flood</option>
                      <option value="Tropical Cyclone">Tropical Cyclone & Storm Surge</option>
                      <option value="Drought">Agricultural Drought</option>
                      <option value="Cold Wave">Winter Cold Wave</option>
                      <option value="Severe Storm">Kalbaishakhi Squall</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-3">Your Name / Agent Title:</label>
                    <input id="contact-3" name="your-name-agent-title"
                      type="text"
                      required
                      value={reporterName}
                      onChange={(e) => setReporterName(e.target.value)}
                      placeholder="e.g. Ashikur Rahman (Extension Officer)"
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-4">Contact Email / Phone:</label>
                    <input id="contact-4" name="contact-email-phone"
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="officer@dae.gov.bd"
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-5">Field Observations & Water Depth:</label>
                  <textarea id="contact-5" name="field-observations-water-depth"
                    rows={3}
                    required
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Describe flooded crop acreage, polder breach status, or water depth over danger level..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isSending}
                  className="px-6 py-3 rounded-xl bg-[#f9a825] text-slate-900 font-bold transition-all shadow-xs flex items-center gap-2 text-xs hover:bg-[#d08305] cursor-pointer"
                >
                  <SendIcon size={18} duration={0} isState={isSending} />
                  <span>{isSending ? 'Preparing draft…' : 'Download unsent observation'}</span>
                </motion.button>
              </motion.form>
            )}

            {/* Form 2: API Key Request */}
            {activeForm === 'api' && (
              <motion.form
                key="api"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSubmit}
                className="space-y-4 text-xs"
              >
                <div>
                  <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-6">Institution / Organization Name:</label>
                  <input id="contact-6" name="institution-organization-name"
                    type="text"
                    required
                    placeholder="e.g. Bangladesh University of Engineering & Technology (BUET)"
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-7">Institutional Email:</label>
                    <input id="contact-7" name="institutional-email"
                      type="email"
                      required
                      placeholder="researcher@buet.ac.bd"
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-8">Estimated Request Rate:</label>
                    <select id="contact-8" name="estimated-request-rate" className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600">
                      <option value="1000">1,000 req / day (Academic Free)</option>
                      <option value="10000">10,000 req / day (Government/NGO)</option>
                      <option value="unlimited">Custom Pipeline (Dedicated Server)</option>
                    </select>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isSending}
                  className="px-6 py-3 rounded-xl bg-[#f9a825] text-slate-900 font-bold transition-all shadow-xs flex items-center gap-2 text-xs hover:bg-[#d08305] cursor-pointer"
                >
                  <SendIcon size={18} duration={0} isState={isSending} />
                  <span>{isSending ? 'Preparing draft…' : 'Download unsent API request'}</span>
                </motion.button>
              </motion.form>
            )}

            {/* Form 3: General Inquiry */}
            {activeForm === 'general' && (
              <motion.form
                key="general"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSubmit}
                className="space-y-4 text-xs"
              >
                <div>
                  <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-9">Full Name:</label>
                  <input id="contact-9" name="full-name"
                    type="text"
                    required
                    placeholder="Your Name"
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-10">Email Address:</label>
                  <input id="contact-10" name="email-address"
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-900 mb-1" htmlFor="contact-11">Message Details:</label>
                  <textarea id="contact-11" name="message-details"
                    rows={4}
                    required
                    placeholder="Inquire about dataset licensing, paper code reproduction, or partnership opportunities..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium outline-none focus:border-amber-600"
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isSending}
                  className="px-6 py-3 rounded-xl bg-[#f9a825] text-slate-900 font-bold transition-all shadow-xs flex items-center gap-2 text-xs hover:bg-[#d08305] cursor-pointer"
                >
                  <SendIcon size={18} duration={0} isState={isSending} />
                  <span>{isSending ? 'Preparing draft…' : 'Download unsent message'}</span>
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>

        </div>

        {/* Emergency Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xs space-y-4 border border-slate-200">
            <h3 className="font-extrabold text-sm uppercase tracking-wider font-mono text-slate-900">
              Emergency Hotlines
            </h3>

            <div className="space-y-3 text-xs">
              <motion.div whileHover={{ scale: 1.02 }} className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                <span className="font-bold text-amber-900 block">Department of Agricultural Extension (DAE)</span>
                <p className="font-mono text-sm font-bold text-amber-800">📞 16123</p>
              </motion.div>

              <motion.div whileHover={{ scale: 1.02 }} className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                <span className="font-bold text-amber-900 block">National Disaster Early Warning Helpline</span>
                <p className="font-mono text-sm font-bold text-amber-800">📞 1090</p>
              </motion.div>

              <motion.div whileHover={{ scale: 1.02 }} className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                <span className="font-bold text-amber-900 block">HazardNet Emergency Data Queue</span>
                <p className="font-mono text-xs text-amber-800">alert@hazardnet.ai</p>
              </motion.div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3 text-xs text-slate-600">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <MaterialIcon name="location_on" className="text-amber-800" /> Research & Data Center
            </h3>
            <p>
              HazardNet Research Laboratory<br />
              SPARRSO & BUET GIS Research Wing<br />
              Agargaon, Dhaka-1207, Bangladesh
            </p>
            <div className="pt-2 border-t border-slate-200 font-mono text-[11px] text-slate-500">
              Response Time: &lt;2 hours for field incidents
            </div>
          </div>
        </div>

      </div>

    </motion.div>
  );
};

export default Contact;
