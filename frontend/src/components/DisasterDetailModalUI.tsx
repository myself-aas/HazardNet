import MaterialIcon from "./MaterialIcon";
import { motion, AnimatePresence } from 'framer-motion';
import { GranularDisasterData } from '../data/disasterDetails';
import { PdfExportButton } from './PdfExportButton';
import { PrintQrCode } from './PrintQrCode';

export interface DisasterDetailModalUIProps {
  data: GranularDisasterData;
  isOpen: boolean;
  activeTab: 'upazilas' | 'aiModel' | 'emergency' | 'history';
  copiedAlert: boolean;
  sheetMode: 'peek' | 'half' | 'full';
  onClose: () => void;
  onSetActiveTab: (tab: 'upazilas' | 'aiModel' | 'emergency' | 'history') => void;
  onDownloadReport: () => void;
  onShareAlert: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onToggleSheetExpand: () => void;
  onSetSheetMode: (mode: 'peek' | 'half' | 'full') => void;
  getRiskBadgeColor: (risk: string) => string;
}

export const DisasterDetailModalUI: React.FC<DisasterDetailModalUIProps> = ({
  data,
  isOpen,
  activeTab,
  copiedAlert,
  sheetMode,
  onClose,
  onSetActiveTab,
  onDownloadReport,
  onShareAlert,
  onTouchStart,
  onTouchEnd,
  onToggleSheetExpand,
  onSetSheetMode,
  getRiskBadgeColor
}) => {
  const renderReportBody = () => (
    <>
      {/* PRINT-ONLY OFFICIAL DIRECTIVE BANNER */}
      <div className="print-only mb-4 p-4 bg-white border-2 border-slate-900 rounded-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-300 pb-2 text-[8pt] font-mono font-bold text-slate-700">
          <span>GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH</span>
          <span>SOD 2019 COMPLIANT DISPATCH</span>
          <span>PUBLIC SAFETY DIRECTIVE</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[7pt] font-extrabold uppercase">
              DISTRICT SITUATION REPORT
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {data.districtName} District • {data.hazardType} Operational Brief
            </h2>
            <div className="flex items-center gap-3 text-[8pt] font-mono text-slate-600">
              <span>Division: <strong>{data.division}</strong></span>
              <span>•</span>
              <span>Severity: <strong className="text-rose-600">{data.modelAssessment.riskCategory} Risk</strong></span>
              <span>•</span>
              <span className="print-last-updated text-[7pt]">
                <strong>TIMESTAMP:</strong> {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} BST
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <PrintQrCode
              url={`https://www.hazardnet.live/forecast/district/${data.districtName.toLowerCase().replace(/\s+/g, '-')}`}
              title="Live Telemetry"
              subtitle="Scan for mobile updates"
              districtOrSector={data.districtName}
              size={64}
            />
          </div>
        </div>
      </div>

      {/* Key Disaster Metrics Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 flex items-center justify-between">
            <span>Incident Date</span>
          </div>
          <div className="text-xs sm:text-sm font-bold text-slate-900 font-mono">
            {data.incidentDate}
          </div>
          <div className="text-[11px] text-slate-600 font-medium">
            Peak: {data.peakImpactWindow}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 flex items-center justify-between">
            <span>Estimated Impact Area</span>
          </div>
          <div className="text-sm sm:text-base font-extrabold text-rose-600 font-mono">
            {data.estimatedImpactAreaKm2.toLocaleString()} <span className="text-xs font-normal text-slate-500">sq km</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className="bg-rose-500 h-full rounded-full"
              style={{ width: `${data.impactAreaPercentage}%` }}
            ></div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono text-right mt-0.5">
            {data.impactAreaPercentage}% of District Area
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 flex items-center justify-between">
            <span>Impacted Population</span>
          </div>
          <div className="text-sm sm:text-base font-extrabold text-amber-600 font-mono">
            {data.affectedPopulation.toLocaleString()} <span className="text-xs font-normal text-slate-500">people</span>
          </div>
          <div className="text-[11px] text-slate-600">
            ~{data.affectedHouseholds.toLocaleString()} Households
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 flex items-center justify-between">
            <span>Crop Land Vulnerability</span>
          </div>
          <div className="text-sm sm:text-base font-extrabold text-emerald-600 font-mono">
            {data.affectedCropLandHectares.toLocaleString()} <span className="text-xs font-normal text-slate-500">Ha</span>
          </div>
          <div className="text-[11px] text-slate-600 truncate">
            Crops: {data.primaryCropsAtRisk.join(', ')}
          </div>
        </div>
      </div>

      {/* Physical Sensor Telemetry Bar */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500">
              Live Hydro-Meteorological Telemetry
            </h4>
            <p className="text-xs font-bold text-slate-900 mt-0.5">
              {data.physicalSensorMetrics.sensorStationName} (Elevation: {data.elevationMeters}m MSL)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full md:w-auto font-mono text-xs">
          <div className="bg-white px-3.5 py-2 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-slate-500 block text-[10px]">{data.physicalSensorMetrics.primaryMetricName}</span>
            <strong className="text-rose-600 text-sm font-extrabold">{data.physicalSensorMetrics.primaryMetricValue}</strong>
          </div>
          <div className="bg-white px-3.5 py-2 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-slate-500 block text-[10px]">{data.physicalSensorMetrics.secondaryMetricName}</span>
            <strong className="text-slate-800 text-sm font-extrabold">{data.physicalSensorMetrics.secondaryMetricValue}</strong>
          </div>
        </div>
      </div>

      {/* Screen Navigation Tabs */}
      <div className="screen-only border-b border-slate-200 flex items-center gap-2 overflow-x-auto text-xs py-1">
        <button
          onClick={() => onSetActiveTab('upazilas')}
          className={`pb-2.5 px-3 font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'upazilas'
              ? 'border-[#f9a825] text-[#d08305]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Upazila Breakdown ({data.impactedUpazilas.length})</span>
        </button>

        <button
          onClick={() => onSetActiveTab('aiModel')}
          className={`pb-2.5 px-3 font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'aiModel'
              ? 'border-[#f9a825] text-[#d08305]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>AI Model Assessment</span>
        </button>

        <button
          onClick={() => onSetActiveTab('emergency')}
          className={`pb-2.5 px-3 font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'emergency'
              ? 'border-[#f9a825] text-[#d08305]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Emergency Response</span>
        </button>

        <button
          onClick={() => onSetActiveTab('history')}
          className={`pb-2.5 px-3 font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'border-[#f9a825] text-[#d08305]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Historical Context</span>
        </button>
      </div>

      {/* Screen Active Tab Content */}
      <div className="screen-only">
        {activeTab === 'upazilas' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
              <span>Granular Upazila-level disaster impact index</span>
              <span>Sorted by Severity</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {data.impactedUpazilas.map((up, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{up.name}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Households Affected: <span className="text-amber-600 font-mono font-bold">{up.householdsAffected.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold block ${
                      up.status === 'Critically Inundated'
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : up.status === 'High Risk'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {up.status}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-900 block">
                      {(up.severityScore * 100).toFixed(0)}% Sev
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'aiModel' && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-800 font-bold">Continuous Severity Regression Head</span>
                <span className="text-slate-500" title="The classifier's own softmax for its chosen class. It is not a calibrated probability of the event.">
                  Model score: <strong className="text-slate-900">{data.modelAssessment.confidenceLevel}%</strong> <span className="text-slate-400">(uncalibrated)</span>
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span>District Severity Score:</span>
                  <span className="text-rose-600 font-mono">
                    {(data.modelAssessment.continuousSeverityIndex * 100).toFixed(1)}% (Index: {data.modelAssessment.continuousSeverityIndex})
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden p-0.5 border border-slate-300">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      data.modelAssessment.continuousSeverityIndex < 0.33
                        ? 'bg-emerald-500'
                        : data.modelAssessment.continuousSeverityIndex < 0.66
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${data.modelAssessment.continuousSeverityIndex * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500">
                Hazard Probability Breakdown
              </h4>

              <div className="space-y-2.5">
                {data.modelAssessment.softmaxProbabilities.map((prob, idx) => (
                  <div key={idx} className="space-y-1 text-xs">
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-700 font-medium">{prob.hazard}</span>
                      <span className="text-slate-900 font-bold">{(prob.probability * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden border border-slate-300">
                      <div
                        className={`h-full rounded-full ${
                          idx === 0 ? 'bg-purple-600' : idx === 1 ? 'bg-blue-500' : 'bg-slate-500'
                        }`}
                        style={{ width: `${prob.probability * 100}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'emergency' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-500 text-[10px] block">Active Shelters</span>
                <strong className="text-slate-900 text-base font-bold">{data.emergencyResponse.activeShelters}</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-500 text-[10px] block">Capacity Used</span>
                <strong className="text-amber-600 text-base font-bold">{data.emergencyResponse.shelterCapacityUsedPercent}%</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-500 text-[10px] block">Relief Dispatched</span>
                <strong className="text-emerald-600 text-base font-bold">{data.emergencyResponse.reliefDistributedTons} Tons</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-500 text-[10px] block">Medical Teams</span>
                <strong className="text-slate-800 text-base font-bold">{data.emergencyResponse.medicalTeamsDeployed} Units</strong>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span>Actionable Emergency Advisories</span>
              </h4>
              <ul className="space-y-2 text-xs text-slate-700">
                {data.emergencyResponse.advisoryBullets.map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[#f9a825] font-bold">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <span>Historical Disaster Benchmark Analysis</span>
            </h4>
            <p className="text-slate-700 leading-relaxed bg-white p-3.5 rounded-lg border border-slate-200">
              {data.historicalComparison}
            </p>

            <div className="text-[11px] text-slate-600 font-mono space-y-1">
              <div>• Elevation Profile: <strong className="text-slate-900">{data.elevationMeters} meters MSL</strong></div>
              <div>• Agro-Zone: <strong className="text-slate-900">{data.division} Belt</strong></div>
              <div>• Return Period: <strong className="text-slate-800">1-in-10 Year Hazard Event</strong></div>
            </div>
          </div>
        )}
      </div>

      {/* Print-Only: All 4 Sections Rendered Sequentially for Complete A4 Situation Report */}
      <div className="print-only space-y-5">
        {/* Section 1: Upazila Breakdown Table */}
        <div className="space-y-2">
          <h3 className="font-black text-xs text-slate-900 uppercase tracking-wider font-mono border-b border-slate-300 pb-1">
            1. Impacted Upazila Assessment ({data.impactedUpazilas.length} Upazilas)
          </h3>
          <table className="w-full text-left text-xs border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-[8pt] font-mono">
                <th className="p-2 border border-slate-300">Upazila Name</th>
                <th className="p-2 border border-slate-300">Inundation Status</th>
                <th className="p-2 border border-slate-300">Households Affected</th>
                <th className="p-2 border border-slate-300">Severity Index</th>
              </tr>
            </thead>
            <tbody>
              {data.impactedUpazilas.map((up, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="p-2 font-bold text-slate-900 border border-slate-200">{up.name}</td>
                  <td className="p-2 font-semibold text-slate-800 border border-slate-200">{up.status}</td>
                  <td className="p-2 font-mono text-slate-700 border border-slate-200">{up.householdsAffected.toLocaleString()}</td>
                  <td className="p-2 font-mono font-bold text-slate-900 border border-slate-200">{(up.severityScore * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 2: AI Multi-Spectral Assessment */}
        <div className="space-y-2">
          <h3 className="font-black text-xs text-slate-900 uppercase tracking-wider font-mono border-b border-slate-300 pb-1">
            2. Multi-Spectral AI Model Diagnostics
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono">
            <div>
              <span className="text-slate-500 block text-[9pt]">Continuous Severity Index:</span>
              <strong className={`text-sm font-black ${
                data.modelAssessment.continuousSeverityIndex < 0.33 ? 'text-emerald-600' :
                data.modelAssessment.continuousSeverityIndex < 0.66 ? 'text-amber-600' :
                'text-rose-600'
              }`}>
                {(data.modelAssessment.continuousSeverityIndex * 100).toFixed(1)}% (model score: {data.modelAssessment.confidenceLevel}%, uncalibrated)
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[9pt]">Predicted Hazard Type:</span>
              <strong className="text-sm font-black text-slate-900">{data.hazardSubtype}</strong>
            </div>
          </div>
        </div>

        {/* Section 3: Emergency Operational Response */}
        <div className="space-y-2">
          <h3 className="font-black text-xs text-slate-900 uppercase tracking-wider font-mono border-b border-slate-300 pb-1">
            3. Operational Relief & Logistics Dispatch
          </h3>
          <div className="grid grid-cols-4 gap-2 text-xs font-mono mb-2">
            <div className="p-2 bg-slate-50 border border-slate-300 rounded">
              <span className="text-slate-500 text-[8pt] block">Active Shelters</span>
              <strong className="text-slate-900">{data.emergencyResponse.activeShelters} Units</strong>
            </div>
            <div className="p-2 bg-slate-50 border border-slate-300 rounded">
              <span className="text-slate-500 text-[8pt] block">Capacity Used</span>
              <strong className="text-slate-900">{data.emergencyResponse.shelterCapacityUsedPercent}%</strong>
            </div>
            <div className="p-2 bg-slate-50 border border-slate-300 rounded">
              <span className="text-slate-500 text-[8pt] block">Relief Dispatched</span>
              <strong className="text-slate-900">{data.emergencyResponse.reliefDistributedTons} Tons</strong>
            </div>
            <div className="p-2 bg-slate-50 border border-slate-300 rounded">
              <span className="text-slate-500 text-[8pt] block">Medical Teams</span>
              <strong className="text-slate-900">{data.emergencyResponse.medicalTeamsDeployed} Teams</strong>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-300">
            <div className="font-bold text-xs uppercase mb-1 text-slate-900">Immediate Standing Directives:</div>
            <ul className="space-y-1 text-xs text-slate-800">
              {data.emergencyResponse.advisoryBullets.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="font-bold text-slate-900">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Section 4: Historical Context & Benchmarking */}
        <div className="space-y-2">
          <h3 className="font-black text-xs text-slate-900 uppercase tracking-wider font-mono border-b border-slate-300 pb-1">
            4. Historical Hydrological & Climatological Benchmark
          </h3>
          <p className="text-xs text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
            {data.historicalComparison}
          </p>
        </div>
      </div>
    </>
  );

    return (
    <AnimatePresence>
      {isOpen && data && (
        <>
          {/* 1. Desktop Modal View (Centered Dialog for sm screens and above) */}
          <motion.div
            key="desktop-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1200] hidden sm:flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 backdrop-blur-md"
            onClick={onClose}
          >
            <motion.div
              key="desktop-modal-content"
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden relative text-slate-800"
              onClick={(e) => e.stopPropagation()}
            >
          {/* Top Header & Close Button */}
          <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  {data.districtName} District
                </h2>
                <span className="text-slate-500 font-medium text-xs sm:text-sm">
                  ({data.division} Division)
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${getRiskBadgeColor(data.modelAssessment.riskCategory)}`}>
                  {data.modelAssessment.riskCategory} Risk
                </span>
              </div>
              
              <p className="text-xs text-slate-600 font-semibold mt-1 flex items-center gap-2">
                <span>{data.hazardSubtype}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500 font-mono text-[11px]">{data.lastSatelliteUpdate}</span>
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition-all text-xs font-black shadow-xs min-h-[40px] px-3 flex items-center gap-1.5 cursor-pointer"
              title="Close modal (Esc)"
              aria-label="Close modal"
            >
              <MaterialIcon name="close" className="w-4 h-4" />
              <span>CLOSE</span>
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div id="disaster-situation-report" className="p-4 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
            {renderReportBody()}
          </div>

          {/* Action Bar Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <PdfExportButton
                elementId="disaster-situation-report"
                title={`${data.districtName} Disaster Situation Handout`}
                documentType={`${data.hazardType} Situation Report`}
                filename={`HazardNet_${data.districtName}_{hazard}_{docType}_{date}.pdf`}
                filenameTemplate="HazardNet_{docType}_{region}_{date}.pdf"
                regionName={data.districtName}
                districtName={data.districtName}
                hazardType={data.hazardType}
                filenameContext={{
                  region: data.districtName,
                  district: data.districtName,
                  division: data.division,
                  hazard: data.hazardType,
                  hazardType: data.hazardType,
                  docType: 'Situation_Report',
                  documentType: `${data.hazardType} Situation Report`,
                }}
                variant="split"
              />

              <button
                onClick={onDownloadReport}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl border border-slate-900 transition-all flex items-center gap-2 shadow-xs min-h-[44px]"
              >
                <span>Download JSON</span>
              </button>

              <button
                onClick={onShareAlert}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl border border-slate-200 transition-all flex items-center gap-2 shadow-xs min-h-[44px]"
              >
                <span>{copiedAlert ? 'Copied to Clipboard! ✓' : 'Share Alert'}</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="px-5 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl border border-slate-200 transition-all shadow-xs min-h-[44px]"
            >
              Close Dialog
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* 2. Mobile Collapsible Bottom Sheet View (< sm screens for one-handed usability) */}
      <div className="fixed inset-0 z-[1200] sm:hidden flex flex-col justify-end pointer-events-none">
        {/* Dim Backdrop when expanded */}
        {sheetMode !== 'peek' && (
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs pointer-events-auto transition-opacity"
            onClick={() => onSetSheetMode('peek')}
          />
        )}

        {/* Collapsible Sheet Container */}
        <div
          className={`w-full bg-white border-t border-slate-200 rounded-t-[28px] shadow-2xl flex flex-col pointer-events-auto transition-all duration-300 relative z-10 text-slate-800 overflow-hidden ${
            sheetMode === 'peek'
              ? 'max-h-[160px]'
              : sheetMode === 'half'
              ? 'max-h-[60vh]'
              : 'max-h-[92vh]'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Tactile Drag Handle Header */}
          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="pt-2.5 pb-2 px-4 bg-slate-50 border-b border-slate-200 cursor-grab active:cursor-grabbing select-none flex flex-col items-center shrink-0"
          >
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mb-2" />
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f9a825] animate-pulse shrink-0"></span>
                <h3 className="text-base font-black text-slate-900 tracking-tight leading-none truncate">
                  {data.districtName} Hazard Report
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold border shrink-0 ${getRiskBadgeColor(data.modelAssessment.riskCategory)}`}>
                  {data.modelAssessment.riskCategory}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  onClick={onToggleSheetExpand}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-800 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-colors min-h-[36px]"
                  title="Toggle Sheet Height"
                >
                  <span>{sheetMode === 'peek' ? 'Expand ▲' : sheetMode === 'half' ? 'Max ⤢' : 'Peek ▼'}</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-9 h-9 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-700 rounded-lg text-xs font-black flex items-center justify-center transition-colors shrink-0 min-h-[36px]"
                  title="Close Sheet"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          {/* Peek State Content (compact one-handed summary) */}
          {sheetMode === 'peek' ? (
            <div className="p-3 bg-white flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Hazard: <strong className="text-slate-900">{data.hazardSubtype}</strong></span>
                <span className="font-mono text-rose-600 font-extrabold">
                  {(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}% Sev Index
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                <div
                  className={`h-full rounded-full ${
                    data.modelAssessment.continuousSeverityIndex < 0.33
                      ? 'bg-emerald-500'
                      : data.modelAssessment.continuousSeverityIndex < 0.66
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${data.modelAssessment.continuousSeverityIndex * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onSetSheetMode('half')}
                  className="flex-1 py-2.5 bg-[#f9a825] active:bg-[#d08305] text-slate-900 font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  <span>View Detailed Analytics & Action Plan ▲</span>
                </button>
                <button
                  onClick={onShareAlert}
                  className="px-3 py-2.5 bg-slate-100 active:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 transition-all min-h-[44px]"
                >
                  {copiedAlert ? 'Copied ✓' : 'Share 📢'}
                </button>
              </div>
            </div>
          ) : (
            /* Half or Full Sheet Content */
            <div className="p-4 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
              {renderReportBody()}

              {/* Mobile Bottom Footer Actions */}
              <div className="pt-3 border-t border-slate-200 flex flex-col gap-2">
                <PdfExportButton
                  elementId="disaster-situation-report"
                  title={`${data.districtName} Disaster Situation Handout`}
                  documentType={`${data.hazardType} Situation Report`}
                  filename={`HazardNet_${data.districtName}_{hazard}_{docType}_{date}.pdf`}
                  filenameTemplate="HazardNet_{docType}_{region}_{date}.pdf"
                  regionName={data.districtName}
                  districtName={data.districtName}
                  hazardType={data.hazardType}
                  filenameContext={{
                    region: data.districtName,
                    district: data.districtName,
                    division: data.division,
                    hazard: data.hazardType,
                    hazardType: data.hazardType,
                    docType: 'Situation_Report',
                    documentType: `${data.hazardType} Situation Report`,
                  }}
                  variant="primary"
                  className="w-full justify-center"
                />

                <button
                  onClick={onDownloadReport}
                  className="w-full py-3 bg-slate-900 active:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <span>Download Situation Report (JSON)</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onShareAlert}
                    className="flex-1 py-3 bg-slate-100 active:bg-slate-200 text-slate-800 font-bold rounded-xl border border-slate-200 text-xs transition-all min-h-[44px]"
                  >
                    {copiedAlert ? 'Copied to Clipboard! ✓' : 'Share Alert 📢'}
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-3 bg-slate-100 active:bg-slate-200 text-slate-700 font-bold rounded-xl border border-slate-200 text-xs transition-all min-h-[44px]"
                  >
                    Close Sheet
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )}
</AnimatePresence>
);
};


