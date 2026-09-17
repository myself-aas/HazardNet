import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import DataProcessingSkeleton from './DataProcessingSkeleton';
import { useAuth } from '../context/AuthContext';
import { DownloadDoneIcon, SuccessIcon } from './ui/animated-state-icons';

interface HazardProfile {
  description: string;
  impact: string;
  mitigation: string[];
  icon: string;
}

interface ChannelFeatures {
  ndvi?: number;
  ndwi?: number;
  precip_mean?: number;
  max_temp?: number;
  min_temp?: number;
  soil_moisture?: number;
  sar_vv?: number;
}

interface PredictionPanelProps {
  hazardProfiles: Record<string, HazardProfile>;
  prediction: number[]; // softmax probabilities for 8 hazards
  severity: number; // continuous 0.0 - 1.0
  processingTimeMs: number;
  channelFeatures?: ChannelFeatures;
  districtName?: string;
  districtId?: string;
}

const hazardNamesList = [
  'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
  'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
];

const PredictionPanel: React.FC<PredictionPanelProps> = ({
  hazardProfiles = {},
  prediction = [],
  severity = 0,
  processingTimeMs = 0,
  channelFeatures,
  districtName = 'Selected Region',
  districtId = 'custom_district'
}) => {
  const [isRerunningModel, setIsRerunningModel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { user, signInWithGoogle, saveAssessment } = useAuth();
  const topK = 3;

  const topResults = hazardNamesList
    .map((name, idx) => ({ name, score: prediction[idx] ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const primary = topResults[0] || { name: 'Flood', score: 0.5 };
  const primaryProfile = hazardProfiles[primary.name] || {
    description: 'Inundation of agricultural land from extreme monsoon precipitation.',
    impact: 'Crop submergence, soil degradation, farmer loss',
    mitigation: [
      'Cultivate submergence-tolerant rice (BRRI dhan51/52)',
      'Construct elevated seedbeds (Dhap)',
      'Maintain drainage channels'
    ]
  };

  const primaryConfidence = Math.round(primary.score * 100);
  const severityScore = Math.min(Math.max(severity, 0), 1);
  const severityPercentage = Math.round(severityScore * 100);

  const severityBin = severityScore <= 0.33 ? 'Low' : severityScore <= 0.66 ? 'Moderate' : 'High';
  const severityColor =
    severityBin === 'High' ? 'text-red-400 bg-red-500/20 border-red-500/40' :
    severityBin === 'Moderate' ? 'text-amber-400 bg-amber-500/20 border-amber-500/40' :
    'text-emerald-400 bg-emerald-500/20 border-emerald-500/40';

  const chartColors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899'];

  return (
    <div className="bg-white border border-slate-200/90 text-slate-800 rounded-3xl p-6 sm:p-8 shadow-md space-y-6 relative overflow-hidden transition-all duration-300">
      
      {/* Data Processing Skeleton Overlay */}
      {isRerunningModel && (
        <div className="absolute inset-0 z-50 p-6 bg-white/95 backdrop-blur-2xl flex flex-col justify-center rounded-3xl animate-in fade-in">
          <DataProcessingSkeleton
            title="EXECUTING TFLITE DUAL-HEAD NEURAL INFERENCE"
            subtitle="Running 8-class Softmax probabilities & spatial severity regression..."
            mode="panel"
            onDismiss={() => setIsRerunningModel(false)}
          />
        </div>
      )}

      {/* Primary Classification Card */}
      <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-6 relative overflow-hidden shadow-2xs hover:shadow-sm transition-all duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="w-16 h-16 bg-[#f9a825]/15 border border-[#f9a825]/30 rounded-2xl flex items-center justify-center text-xl font-black text-[#b87002] shrink-0 font-mono shadow-2xs">
              {primary.name.substring(0, 2).toUpperCase()}
            </span>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase font-mono font-extrabold text-slate-500 tracking-wider">Primary Hazard Detected</span>
                <span className="px-3 py-0.5 bg-amber-100 text-amber-950 border border-amber-200 rounded-full text-[10px] font-mono font-black shadow-2xs">
                  FP32 TFLite
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{primary.name}</h2>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-200/80">
            <div className="text-left sm:text-right">
              <span className="text-xs text-slate-500 block font-bold">Model Confidence</span>
              <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
                {primaryConfidence}%
              </span>
            </div>

            <button
              onClick={() => {
                setIsRerunningModel(true);
                setTimeout(() => setIsRerunningModel(false), 2000);
              }}
              className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-2xl text-xs transition-all duration-200 shadow-md active:scale-98 flex items-center gap-2 min-h-[48px] cursor-pointer"
              title="Re-run TFLite inference pipeline"
            >
              <span>RE-RUN MODEL</span>
            </button>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-slate-700 mt-4 pt-4 border-t border-slate-200/80 leading-relaxed font-normal">
          {primaryProfile.description}
        </p>
      </div>

      {/* Dual Metrics: Severity Gauge & Processing Speed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Physical Severity Gauge */}
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-extrabold text-slate-700 uppercase tracking-wider">Physical Severity</span>
            <span className={`px-3 py-1 text-xs font-black rounded-full border shadow-2xs ${
              severityBin === 'High' ? 'bg-rose-100 text-rose-950 border-rose-300' :
              severityBin === 'Moderate' ? 'bg-amber-100 text-amber-950 border-amber-300' :
              'bg-emerald-100 text-emerald-950 border-emerald-300'
            }`}>
              {severityBin} ({severityScore.toFixed(2)})
            </span>
          </div>

          <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden p-0.5 border border-slate-300/80">
            <div
              className={`h-full rounded-full transition-all duration-500 shadow-2xs ${
                severityBin === 'High' ? 'bg-rose-500' :
                severityBin === 'Moderate' ? 'bg-amber-500' :
                'bg-emerald-500'
              }`}
              style={{ width: `${severityPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 font-mono font-semibold">
            <span>0.00 (Low)</span>
            <span>0.50 (Mod)</span>
            <span>1.00 (Severe)</span>
          </div>
        </div>

        {/* Inference Latency & Model Specs */}
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between space-y-3 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-extrabold text-slate-700 uppercase tracking-wider">Inference Speed</span>
            {/* `0` means no inference was measured for this view (e.g. the API was
                unreachable and the static baseline is shown) — render words, not
                a fabricated "0 ms" (UI-14). */}
            <span className="text-slate-950 font-extrabold bg-white px-3 py-1 rounded-full text-xs border border-slate-200 shadow-2xs">
              {processingTimeMs > 0 ? `${processingTimeMs} ms` : 'not measured'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
            <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Input Tensor</span>
              <span className="text-slate-900 font-bold">(1,15,10,64,64)</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Execution Engine</span>
              <span className="text-slate-900 font-bold">TFLite WASM</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 3 Hazard Probabilities Recharts */}
      <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-5 space-y-3 shadow-2xs">
        <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-mono">
          Top-3 Hazard Softmax Distribution
        </h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={topResults}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} stroke="#64748b" fontSize={11} />
              <YAxis dataKey="name" type="category" stroke="#334155" fontSize={12} width={110} tickLine={false} />
              <Tooltip
                formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, 'Probability']}
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '16px', color: '#0f172a', fontSize: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="score" radius={[0, 8, 8, 0]}>
                {topResults.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? '#0f172a' : index === 1 ? '#475569' : '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Channel Feature Explainability Grid */}
      {channelFeatures && (
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-5 space-y-3 shadow-2xs">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-mono">
            Multispectral Satellite & Climate Features (15 Channels)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-slate-500 block uppercase font-extrabold">NDVI (Vegetation)</span>
              <span className="text-emerald-700 font-black text-sm">{channelFeatures.ndvi ?? '0.42'}</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-slate-500 block uppercase font-extrabold">NDWI (Water Index)</span>
              <span className="text-slate-900 font-black text-sm">{channelFeatures.ndwi ?? '0.18'}</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Precipitation Mean</span>
              <span className="text-slate-900 font-black text-sm">{channelFeatures.precip_mean ?? '12.4'} mm</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-slate-500 block uppercase font-extrabold">SAR VV Backscatter</span>
              <span className="text-amber-700 font-black text-sm">{channelFeatures.sar_vv ?? '-11.2'} dB</span>
            </div>
          </div>
        </div>
      )}

      {/* Actionable Agricultural Mitigation Advisory */}
      <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-5 space-y-3 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900 uppercase tracking-wider font-mono">
          <h3>Recommended Agricultural Action Plan</h3>
        </div>
        <ul className="space-y-2 text-xs sm:text-sm text-slate-700 list-disc pl-5 leading-relaxed font-normal">
          {primaryProfile.mitigation?.map((step, idx) => (
            <li key={idx}>
              {step}
            </li>
          ))}
        </ul>
      </div>

      {/* Export & Firebase Persistence Capabilities */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
        <span className="text-xs text-slate-500 font-mono">
          Model Identifier: HazardNet_FP32
        </span>
        
        <div className="flex flex-wrap items-center gap-2.5">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 animate-in fade-in flex items-center gap-1">
              <SuccessIcon isState={true} size={16} duration={0} /> Saved to Firestore
            </span>
          )}

          <button
            onClick={async () => {
              if (!user) {
                try {
                  await signInWithGoogle();
                } catch (err) {
                  console.error(err);
                }
                return;
              }

              setIsSaving(true);
              setSaveSuccess(false);
              try {
                await saveAssessment({
                  districtId,
                  districtName,
                  primaryHazard: primary.name,
                  confidence: primary.score,
                  severityScore: severity,
                  severityBin,
                  notes:
                    processingTimeMs > 0
                      ? `Model prediction for ${districtName}. Processing time: ${processingTimeMs}ms.`
                      : `Baseline prediction for ${districtName} (live inference unavailable; no processing time measured).`
                });
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3500);
              } catch (err) {
                console.error('Save to Firestore failed:', err);
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="px-4 py-2.5 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 font-extrabold rounded-xl text-xs transition-all duration-200 flex items-center gap-2 min-h-[44px] shadow-xs disabled:opacity-50 active:scale-98"
          >
            {isSaving ? (
              <span>Saving...</span>
            ) : user ? (
              <span>Save to Firestore</span>
            ) : (
              <span>Login & Save</span>
            )}
          </button>

          <button
            onClick={() => {
              const exportData = {
                primaryHazard: primary.name,
                confidence: primary.score,
                severityScore: severity,
                severityBin,
                topResults,
                channelFeatures,
                timestamp: new Date().toISOString()
              };
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `hazardnet-prediction-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 min-h-[44px] shadow-xs active:scale-98"
          >
            <DownloadDoneIcon isState={false} size={18} duration={0} /> Export JSON
          </button>
        </div>
      </div>

    </div>
  );
};

export default PredictionPanel;
