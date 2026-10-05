import { useState, useEffect } from 'react';
import { StructuredAdvisoryRenderer } from './StructuredAdvisoryRenderer';
import { PdfExportButton } from './PdfExportButton';

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
      <div className="w-full bg-white rounded-lg sm:rounded-xl border border-carbon-20 shadow-sm sm:shadow-md p-3 sm:p-6 mt-4 sm:mt-6 animate-pulse space-y-4">
        <div className="h-5 sm:h-6 bg-carbon-10 rounded-full w-1/3 mb-2"></div>
        <div className="h-3 sm:h-4 bg-carbon-10 rounded-full w-full"></div>
        <div className="h-3 sm:h-4 bg-carbon-10 rounded-full w-5/6"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-rose-50 rounded-lg sm:rounded-xl border border-rose-300 shadow-sm sm:shadow-md p-3 sm:p-4 mt-4 sm:mt-6 text-rose-900 text-xs sm:text-sm space-y-2">
        <p className="font-bold text-sm sm:text-base">Error generating AI Advisory</p>
        <p className="text-xs leading-relaxed font-normal">{error}</p>
      </div>
    );
  }

  if (!advisory) return null;

  return (
    <div id="advisory-panel-container" className="w-full bg-white rounded-lg sm:rounded-xl border border-carbon-20 shadow-sm sm:shadow-md p-3 sm:p-6 space-y-4 sm:space-y-6 transition-shadow duration-300 hover:shadow-sm sm:hover:shadow-lg text-carbon-90">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-carbon-20">
        <div className="space-y-1.5 sm:space-y-2 flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-carbon-90 dark:text-white tracking-tight flex items-center gap-2">
            <span className="truncate">AI Advisory</span>
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-xs font-mono font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100 border border-amber-200 dark:border-amber-800/50">
              HA Engine
            </span>
            {advisory.cached && (
              <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-xs font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300">
                Cached
              </span>
            )}
            {advisory.provider_source && (
              <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-xs font-mono font-semibold bg-carbon-10 text-carbon-80 border border-carbon-20 truncate">
                {advisory.provider_source}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className={`px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-mono font-bold border whitespace-nowrap ${
            (advisory.urgency_tier === 'EMERGENCY' || advisory.urgency_level === 'EMERGENCY' || advisory.urgency_tier === 'WARNING' || advisory.urgency_level === 'WARNING')
              ? 'bg-rose-100 text-rose-700 border-rose-300'
              : 'bg-amber-100 text-amber-700 border-amber-300'
          }`}>
            {advisory.urgency_tier || advisory.urgency_level || 'WATCH'}
          </span>

          <PdfExportButton
            elementId="advisory-panel-container"
            title={`${districtName} AI Agricultural Advisory Directive`}
            documentType="Agricultural Hazard Directive"
            filename={`HazardNet_Advisory_${districtName}_{hazard}_{date}.pdf`}
            filenameTemplate="HazardNet_{docType}_{region}_{date}.pdf"
            regionName={districtName}
            districtName={districtName}
            hazardType={hazardType}
            filenameContext={{
              region: districtName,
              district: districtName,
              hazard: hazardType,
              hazardType: hazardType,
              docType: 'Agromet_Advisory',
              documentType: 'Agricultural Hazard Directive',
            }}
            variant="compact"
          />
        </div>
      </div>

      <div className="pt-2 sm:pt-4">
        <StructuredAdvisoryRenderer advisoryJson={advisory} />
      </div>
    </div>
  );
};

export default AdvisoryPanel;
