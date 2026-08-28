import { useState, useEffect } from 'react';
import { StructuredAdvisoryRenderer } from './StructuredAdvisoryRenderer';

interface AdvisoryPanelProps {
  districtName: string;
  hazardType: string;
  severityScore: number;
  confidence: number;
}

interface AdvisoryResponse {
  advisory_id?: string;
  provider_source?: string;
  cached?: boolean;
  tensor_diagnosis?: string;
  bmd_signal_alignment?: string;
  urgency_tier?: string;
  urgency_level?: string;
  health_and_wash_alerts?: string[];
  risk_assessment?: string;
  crop_context?: {
    primary_crop?: string;
    current_stage?: string;
    vulnerability?: string;
  };
  immediate_actions_48h?: string[];
  protective_measures_7d?: string[];
  recommended_varieties?: string[];
  brri_variety_recommendation?: string;
  post_event_recovery?: string[];
  confidence_caveat?: string;
  error?: string;
}

const AdvisoryPanel: React.FC<AdvisoryPanelProps> = ({
  districtName,
  hazardType,
  severityScore,
  confidence
}) => {
  const [advisory, setAdvisory] = useState<AdvisoryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdvisory = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch('/api/advisory', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            district_name: districtName,
            hazard_type: hazardType,
            severity_score: severityScore,
            confidence: confidence,
            target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
            crop_context: 'Aman Rice (Tillering Stage)'
          })
        });

        if (!response.ok) {
          throw new Error('Failed to generate advisory');
        }

        const data: AdvisoryResponse = await response.json();
        setAdvisory(data);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching the advisory.');
      } finally {
        setLoading(false);
      }
    };

    if (hazardType && districtName) {
      fetchAdvisory();
    }
  }, [districtName, hazardType, severityScore, confidence]);

  if (loading) {
    return (
      <div className="w-full bg-white rounded-3xl border border-slate-200/90 shadow-md p-6 sm:p-8 mt-6 animate-pulse space-y-4">
        <div className="h-6 bg-slate-200/80 rounded-full w-1/3 mb-2"></div>
        <div className="h-4 bg-slate-200/80 rounded-full w-full"></div>
        <div className="h-4 bg-slate-200/80 rounded-full w-5/6"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-rose-50/90 rounded-3xl border border-rose-200/90 shadow-md p-6 mt-6 text-rose-950 text-sm space-y-1">
        <p className="font-extrabold text-base">Error generating AI Advisory</p>
        <p className="text-xs text-rose-700 leading-relaxed font-normal">{error}</p>
      </div>
    );
  }

  if (!advisory) return null;

  return (
    <div className="w-full bg-white rounded-3xl border border-slate-200/90 shadow-md p-6 sm:p-8 space-y-6 transition-all duration-300 hover:shadow-lg text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
        <div className="space-y-1">
          <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>AI Agricultural Advisory</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full text-[11px] font-mono font-extrabold bg-amber-50 text-amber-950 border border-amber-200/80 shadow-2xs">
              HA Engine
            </span>
            {advisory.cached && (
              <span className="px-3 py-1 rounded-full text-[11px] font-mono font-extrabold bg-emerald-50 text-emerald-950 border border-emerald-200/80 shadow-2xs">
                Cache Hit (0ms)
              </span>
            )}
            {advisory.provider_source && (
              <span className="px-3 py-1 rounded-full text-[11px] font-mono font-extrabold bg-slate-100 text-slate-800 border border-slate-200/80 shadow-2xs">
                Source: {advisory.provider_source}
              </span>
            )}
          </div>
        </div>

        <span className={`px-4 py-1.5 rounded-full text-xs font-mono font-black border shadow-2xs ${
          (advisory.urgency_tier === 'EMERGENCY' || advisory.urgency_level === 'EMERGENCY' || advisory.urgency_tier === 'WARNING' || advisory.urgency_level === 'WARNING')
            ? 'bg-rose-100 text-rose-950 border-rose-300'
            : 'bg-amber-100 text-amber-950 border-amber-300'
        }`}>
          {advisory.urgency_tier || advisory.urgency_level || 'WATCH'}
        </span>
      </div>

      <div className="pt-4">
        <StructuredAdvisoryRenderer advisoryJson={advisory} />
      </div>
    </div>
  );
};

export default AdvisoryPanel;
