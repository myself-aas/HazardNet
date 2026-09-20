import MaterialIcon from "./MaterialIcon";
import { motion, AnimatePresence } from 'framer-motion';
import { UserAssessment } from '../context/AuthContext';

export interface SavedAssessmentsModalUIProps {
  isOpen: boolean;
  loading: boolean;
  assessments: UserAssessment[];
  onClose: () => void;
  onSelectDistrict?: (districtId: string) => void;
  onDelete: (id: string) => void;
}

export const SavedAssessmentsModalUI: React.FC<SavedAssessmentsModalUIProps> = ({
  isOpen,
  loading,
  assessments,
  onClose,
  onSelectDistrict,
  onDelete,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="saved-assessments-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-carbon-90/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            key="saved-assessments-modal"
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="bg-white border border-carbon-20 max-w-2xl w-full p-6 space-y-5 max-h-[90vh] flex flex-col text-carbon-90"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-carbon-20">
              <div>
                <h2 className="text-lg font-extrabold text-carbon-90">Saved Cloud Assessments</h2>
                <p className="text-xs text-carbon-60 font-medium">
                  Persistent predictions stored in Firebase Firestore
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="px-2.5 py-1 text-xs font-black text-carbon-60 hover:text-carbon-90 rounded-lg hover:bg-carbon-10 transition-colors border border-carbon-20 cursor-pointer flex items-center gap-1"
                title="Close Modal"
                aria-label="Close Modal"
              >
                <MaterialIcon name="close" className="w-4 h-4" />
                <span>CLOSE</span>
              </motion.button>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loading ? (
                <div className="py-12 text-center text-carbon-60 text-sm animate-pulse">
                  Loading assessments from Firestore...
                </div>
              ) : assessments.length === 0 ? (
                <div className="py-12 text-center text-carbon-60 space-y-2">
                  <p className="text-sm font-semibold text-carbon-90">No saved assessments found.</p>
                  <p className="text-xs text-carbon-60">
                    Run an AI hazard prediction on any district and click "Save to Cloud" to persist it in Firestore.
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  {assessments.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, x: -20 }}
                      className="bg-carbon-05 border border-carbon-20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-carbon-90">{item.districtName}</span>
                          <span className="px-2 py-0.5 bg-white text-carbon-70 text-xs font-mono font-bold border border-carbon-20">
                            {item.primaryHazard}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-mono font-bold ${
                            item.severityBin === 'High' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            item.severityBin === 'Moderate' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {item.severityBin || 'Moderate'} ({item.severityScore.toFixed(2)})
                          </span>
                        </div>
                        <div className="text-xs text-carbon-60 mt-1 flex items-center gap-3 font-mono">
                          <span>Confidence: <strong>{(item.confidence * 100).toFixed(1)}%</strong></span>
                          <span>Saved: {new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                        {item.notes && (
                          <p className="text-xs text-carbon-70 italic mt-1.5 bg-white p-2 rounded-xl border border-carbon-20">
                            "{item.notes}"
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {onSelectDistrict && (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              onSelectDistrict(item.districtId);
                              onClose();
                            }}
                            className="px-3 py-1.5 bg-nasa-red hover:bg-nasa-red-shade text-carbon-90 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                          >
                            View Map
                          </motion.button>
                        )}
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onDelete(item.id)}
                          className="px-2.5 py-1 text-xs font-bold text-rose-700 hover:text-rose-900 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                          title="Delete record"
                        >
                          DELETE
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-carbon-20 flex items-center justify-between text-xs text-carbon-60">
              <span>Total Saved: <strong className="text-carbon-90">{assessments.length}</strong></span>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                className="px-4 py-2 bg-carbon-10 hover:bg-carbon-20 text-carbon-80 font-bold rounded-xl border border-carbon-20 transition-all cursor-pointer"
              >
                Close
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
