const fs = require('fs');
const content = fs.readFileSync('frontend/src/components/DisasterDetailModal.tsx', 'utf8');

// Find the imports
const reactImport = "import React, { useEffect, useState } from 'react';";
const motionImport = "import { motion, AnimatePresence } from 'framer-motion';";

// Create the UI file content
let uiContent = `import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GranularDisasterData } from '../data/disasterDetails';

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
`;

// Extract renderReportBody and return statement from original
const renderBodyMatch = content.match(/const renderReportBody = \(\) => \([\s\S]*?(?=return \()/);
const returnMatch = content.match(/return \([\s\S]*?\);\n};/);

if (!renderBodyMatch || !returnMatch) {
  console.log("Could not match the structural blocks");
  process.exit(1);
}

// In the UI component, we need to replace setActiveTab with onSetActiveTab, etc.
let renderBody = renderBodyMatch[0];
renderBody = renderBody.replace(/setActiveTab\(/g, 'onSetActiveTab(');
renderBody = renderBody.replace(/handleDownloadReport/g, 'onDownloadReport');
renderBody = renderBody.replace(/handleShareAlert/g, 'onShareAlert');

let returnBody = returnMatch[0];
returnBody = returnBody.replace(/handleTouchStart/g, 'onTouchStart');
returnBody = returnBody.replace(/handleTouchEnd/g, 'onTouchEnd');
returnBody = returnBody.replace(/toggleSheetExpand/g, 'onToggleSheetExpand');
returnBody = returnBody.replace(/setSheetMode\(/g, 'onSetSheetMode(');
returnBody = returnBody.replace(/handleDownloadReport/g, 'onDownloadReport');
returnBody = returnBody.replace(/handleShareAlert/g, 'onShareAlert');

uiContent += renderBody + '\n  ' + returnBody + '\n\n';

fs.writeFileSync('frontend/src/components/DisasterDetailModalUI.tsx', uiContent);

// Now rewrite the container
let containerContent = `import React, { useEffect, useState } from 'react';
import { getGranularDisasterData, GranularDisasterData } from '../data/disasterDetails';
import { DisasterDetailModalUI } from './DisasterDetailModalUI';

interface DisasterDetailModalProps {
  districtId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DisasterDetailModal: React.FC<DisasterDetailModalProps> = ({
  districtId,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'upazilas' | 'aiModel' | 'emergency' | 'history'>('upazilas');
  const [copiedAlert, setCopiedAlert] = useState(false);
  const [sheetMode, setSheetMode] = useState<'peek' | 'half' | 'full'>('half');
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch gesture handlers for mobile bottom sheet dragging
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY;
    setTouchStartY(null);

    if (deltaY < -35) {
      if (sheetMode === 'peek') setSheetMode('half');
      else if (sheetMode === 'half') setSheetMode('full');
    } else if (deltaY > 35) {
      if (sheetMode === 'full') setSheetMode('half');
      else if (sheetMode === 'half') setSheetMode('peek');
      else if (sheetMode === 'peek') onClose();
    }
  };

  const toggleSheetExpand = () => {
    if (sheetMode === 'peek') setSheetMode('half');
    else if (sheetMode === 'half') setSheetMode('full');
    else setSheetMode('peek');
  };

  const data: GranularDisasterData = districtId ? getGranularDisasterData(districtId) : getGranularDisasterData('sylhet');

  // Export Situation Report as JSON file download
  const handleDownloadReport = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = \`Disaster_Report_\${data.districtName}_\${data.hazardType.replace(/\\s+/g, '_')}_2026.json\`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareAlert = () => {
    const alertText = \`🚨 AGRI-SHIELD DISASTER ALERT [\${data.districtName} District]\\nHazard: \${data.hazardType} (\${data.hazardSubtype})\\nSeverity: \${(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}%\\nEstimated Impact Area: \${data.estimatedImpactAreaKm2} sq km (\${data.impactAreaPercentage}%)\\nAffected Population: \${data.affectedPopulation.toLocaleString()} residents\\nAction Needed: \${data.emergencyResponse.advisoryBullets[0]}\`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(alertText);
      setCopiedAlert(true);
      setTimeout(() => setCopiedAlert(false), 2500);
    }
  };

  const getRiskBadgeColor = (risk: string) => {
    if (risk === 'High') return 'bg-rose-100 text-rose-800 border-rose-200';
    if (risk === 'Moderate') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  };

  return (
    <DisasterDetailModalUI
      data={data}
      isOpen={isOpen}
      activeTab={activeTab}
      copiedAlert={copiedAlert}
      sheetMode={sheetMode}
      onClose={onClose}
      onSetActiveTab={setActiveTab}
      onDownloadReport={handleDownloadReport}
      onShareAlert={handleShareAlert}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onToggleSheetExpand={toggleSheetExpand}
      onSetSheetMode={setSheetMode}
      getRiskBadgeColor={getRiskBadgeColor}
    />
  );
};

export default DisasterDetailModal;
`;

fs.writeFileSync('frontend/src/components/DisasterDetailModal.tsx', containerContent);

console.log("Splitting complete.");
