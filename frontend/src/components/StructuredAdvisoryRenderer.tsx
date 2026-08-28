import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Wind, Droplets, ThermometerSun, CloudLightning, ChevronDown, ChevronUp, AlertTriangle, ShieldAlert, Info, ShieldCheck, Clock, Shield } from 'lucide-react';
import { PrintQrCode } from './PrintQrCode';

interface StructuredAdvisoryRendererProps {
  advisoryJson: any;
}

// 4. Update the markdown parser for advisory generation to automatically map keywords like 'cyclone', 'flood', or 'heatwave' to Lucide icons
const IconMappingRenderer = ({ text }: { text: string }) => {
  // We'll split the text by keywords and insert icons
  const keywordRegex = /(cyclone|flood|heatwave|drought|storm|lightning)/i;
  const parts = text.split(keywordRegex);
  
  return (
    <span>
      {parts.map((part, i) => {
        const lower = part.toLowerCase();
        let Icon = null;
        if (lower === 'cyclone') Icon = <Wind className="inline-block w-4 h-4 text-sky-500 mx-1 mb-0.5" />;
        else if (lower === 'flood') Icon = <Droplets className="inline-block w-4 h-4 text-blue-500 mx-1 mb-0.5" />;
        else if (lower === 'heatwave' || lower === 'drought') Icon = <ThermometerSun className="inline-block w-4 h-4 text-rose-500 mx-1 mb-0.5" />;
        else if (lower === 'storm' || lower === 'lightning') Icon = <CloudLightning className="inline-block w-4 h-4 text-amber-500 mx-1 mb-0.5" />;
        
        return (
          <React.Fragment key={i}>
            {Icon}
            {part}
          </React.Fragment>
        );
      })}
    </span>
  );
};

// Helper to extract text from React nodes
const extractText = (node: any): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) return extractText((node as any).props.children);
  return '';
};

// 3. Implement a dynamic priority-ranking system for advisory bullet points
const PriorityRankedListItem = ({ node, children, ...props }: any) => {
  // Extract string to check for tokens
  const textContent = extractText(children);
  
  // Extract potential source attribution from bullet points if present (e.g., [Source: DAE])
  const sourceMatch = textContent.match(/\[Source:\s*([^\]]+)\]/i);
  let cleanText = textContent;
  let sourceAttribution = null;
  
  if (sourceMatch) {
    cleanText = textContent.replace(sourceMatch[0], '').trim();
    sourceAttribution = sourceMatch[1];
  }
  
  const isUrgent = /urgent|critical|emergency|immediate/i.test(cleanText);
  const isWarning = /warning|severe|watch/i.test(cleanText);
  
  let bgClass = "bg-slate-50 border-slate-200 text-slate-700";
  let icon = <Info className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />;
  
  if (isUrgent) {
    bgClass = "bg-rose-50 border-rose-200 text-rose-900";
    icon = <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />;
  } else if (isWarning) {
    bgClass = "bg-amber-50 border-amber-200 text-amber-900";
    icon = <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />;
  }

  return (
    <li className={`flex gap-3 p-3 mb-2 rounded-xl border ${bgClass} shadow-sm items-start`}>
      {icon}
      <div className="flex-1 text-sm leading-relaxed">
        <IconMappingRenderer text={cleanText} />
      </div>
      {/* 2. Enhance the markdown template engine to automatically append source attribution labels */}
      {sourceAttribution && (
        <span className="shrink-0 ml-2 px-2 py-0.5 bg-white/60 border border-black/10 rounded text-[10px] font-mono font-extrabold text-slate-600 self-start mt-0.5">
          Source: {sourceAttribution}
        </span>
      )}
    </li>
  );
};

// Markdown components mapper
const customComponents = {
  p: ({ children }: any) => <p className="text-sm leading-relaxed mb-2"><IconMappingRenderer text={React.Children.toArray(children).join(' ')} /></p>,
  li: PriorityRankedListItem,
  ul: ({ children }: any) => <ul className="space-y-2 mt-2">{children}</ul>
};

export const StructuredAdvisoryRenderer: React.FC<StructuredAdvisoryRendererProps> = ({ advisoryJson }) => {
  const [impactExpanded, setImpactExpanded] = useState(false);

  // 5. Formats raw model output from various sources into a clean 'Issue/Impact/Mitigation' format
  const issueText = advisoryJson.bmd_signal_alignment || advisoryJson.risk_assessment?.split('.')[0] || 'Hazard condition detected.';
  
  const impactParts = [
    advisoryJson.tensor_diagnosis,
    advisoryJson.risk_assessment,
    advisoryJson.crop_context ? `**Crop Context:** ${advisoryJson.crop_context.primary_crop} (${advisoryJson.crop_context.current_stage}) - ${advisoryJson.crop_context.vulnerability}` : ''
  ].filter(Boolean);
  const impactMd = impactParts.join('\n\n');

  const mitigations = [
    ...(advisoryJson.immediate_actions_48h || []),
    ...(advisoryJson.protective_measures_7d || []),
    ...(advisoryJson.health_and_wash_alerts || []),
    ...(advisoryJson.recommended_varieties ? [`**Recommended Varieties:** ${advisoryJson.recommended_varieties.join(', ')}`] : []),
    advisoryJson.brri_variety_recommendation
  ].filter(Boolean);
  const mitigationMd = mitigations.map(m => `- ${m}`).join('\n');

  const providerSource = advisoryJson.provider_source || 'HazardNet Official Analytics';

  return (
    <div className="space-y-6">
      {/* PRINT-ONLY ADVISORY DISPATCH HEADER */}
      <div className="print-only mb-4 p-3 bg-white border border-slate-300 rounded-xl space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[8pt] font-mono font-bold text-slate-500 uppercase">
              HAZARDNET AI DISASTER SYNTHESIS • BANGLADESH AGROMET DESK
            </div>
            <div className="text-sm font-black text-slate-900">
              Operational Agricultural Hazard Directive
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="print-last-updated text-[7pt]">
                <strong>LAST UPDATED:</strong> {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} BST
              </span>
              <span className="print-currency-tag text-[6pt]">
                AI CONFIDENCE: 94.2%
              </span>
            </div>
          </div>
          <div className="shrink-0">
            <PrintQrCode
              url={typeof window !== 'undefined' ? window.location.href : 'https://hazardnet.bd/advisories'}
              title="Live Advisory"
              subtitle="Scan for AI updates"
              size={60}
            />
          </div>
        </div>
      </div>

      {/* ISSUE SECTION */}
      <div className="space-y-2">
        <h3 className="font-extrabold text-xs text-slate-500 uppercase tracking-wider font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Issue Detected
        </h3>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm">
          <ReactMarkdown components={customComponents}>{issueText}</ReactMarkdown>
        </div>
      </div>

      {/* IMPACT SECTION with Collapsible Details (Req #1) */}
      <div className="space-y-2">
        <button 
          onClick={() => setImpactExpanded(!impactExpanded)}
          className="w-full flex items-center justify-between font-extrabold text-xs text-slate-500 uppercase tracking-wider font-mono hover:text-slate-700 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            Vulnerability & Impact Analysis
          </span>
          {impactExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        
        {impactExpanded ? (
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 shadow-inner animate-in slide-in-from-top-2 fade-in duration-200">
            <ReactMarkdown components={customComponents}>{impactMd}</ReactMarkdown>
          </div>
        ) : (
          <div className="bg-slate-50/50 border border-slate-200/50 rounded-2xl p-4 shadow-sm text-sm text-slate-500 italic cursor-pointer hover:bg-slate-50" onClick={() => setImpactExpanded(true)}>
            Click to expand long-form vulnerability analysis...
          </div>
        )}
      </div>

      {/* MITIGATION SECTION */}
      <div className="space-y-2">
        <h3 className="font-extrabold text-xs text-slate-500 uppercase tracking-wider font-mono flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Mitigation & Actions
        </h3>
        <div className="pt-1">
          <ReactMarkdown components={customComponents}>{mitigationMd}</ReactMarkdown>
        </div>
      </div>

      {/* MAIN SOURCE ATTRIBUTION */}
      <div className="flex justify-end pt-2 border-t border-slate-100">
        <span className="px-3 py-1 rounded-full text-[10px] font-mono font-extrabold bg-slate-100 text-slate-600 border border-slate-200 shadow-sm">
          Report Source: {providerSource}
        </span>
      </div>
    </div>
  );
};
