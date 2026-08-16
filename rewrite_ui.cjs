const fs = require('fs');
const content = fs.readFileSync('/tmp/disaster-modal.txt', 'utf8');

const lines = content.split('\n');

// renderBody is line 91 to 376
const renderBody = lines.slice(91, 377).join('\n')
  .replace(/setActiveTab\(/g, 'onSetActiveTab(')
  .replace(/handleDownloadReport/g, 'onDownloadReport')
  .replace(/handleShareAlert/g, 'onShareAlert');

// main return is line 377 to 598
const returnBody = lines.slice(377, 599).join('\n')
  .replace(/handleTouchStart/g, 'onTouchStart')
  .replace(/handleTouchEnd/g, 'onTouchEnd')
  .replace(/toggleSheetExpand/g, 'onToggleSheetExpand')
  .replace(/setSheetMode\(/g, 'onSetSheetMode(')
  .replace(/handleDownloadReport/g, 'onDownloadReport')
  .replace(/handleShareAlert/g, 'onShareAlert');

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

uiContent += renderBody + '\n  ' + returnBody + '\n';
fs.writeFileSync('frontend/src/components/DisasterDetailModalUI.tsx', uiContent);
