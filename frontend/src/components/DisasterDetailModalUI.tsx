import type { GranularDisasterData } from '../data/disasterDetails';
import { AccessibleDialog } from './ui/AccessibleDialog';
import { ForecastSummary } from './ForecastSummary';
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

export const DisasterDetailModalUI: React.FC<DisasterDetailModalUIProps> = ({ data, isOpen, onClose }) => isOpen ? <AccessibleDialog title="District forecast" onClose={onClose}><ForecastSummary district={data.districtName} /></AccessibleDialog> : null;
