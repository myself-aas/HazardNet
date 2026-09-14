import { Link } from 'react-router-dom';
import { AccessibleDialog } from './ui/AccessibleDialog';
import { ForecastSummary } from './ForecastSummary';
import { districtFor, districtPath } from '../lib/hazardUx';
import { useHazardContext } from '../hooks/useHazardContext';
export function DisasterDetailModal({ districtId, isOpen, onClose }: { districtId: string | null; isOpen: boolean; onClose: () => void }) {
  const { horizon } = useHazardContext(); const district = districtFor(districtId || '');
  if (!isOpen) return null;
  return <AccessibleDialog title="District forecast" onClose={onClose}>{district ? <><ForecastSummary district={district.name} /><Link onClick={onClose} to={districtPath(district.id, horizon)}>Open full forecast</Link></> : <p>District not found.</p>}</AccessibleDialog>;
}
export default DisasterDetailModal;
