import { useEffect, useState } from 'react';
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
    a.download = `Disaster_Report_${data.districtName}_${data.hazardType.replace(/\s+/g, '_')}_2026.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareAlert = () => {
    const alertText = `<MaterialIcon name="emergency" className="w-4 h-4 inline-block mr-1" /> AGRI-SHIELD DISASTER ALERT [${data.districtName} District]\nHazard: ${data.hazardType} (${data.hazardSubtype})\nSeverity: ${(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}%\nEstimated Impact Area: ${data.estimatedImpactAreaKm2} sq km (${data.impactAreaPercentage}%)\nAffected Population: ${data.affectedPopulation.toLocaleString()} residents\nAction Needed: ${data.emergencyResponse.advisoryBullets[0]}`;

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
