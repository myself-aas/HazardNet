import { useEffect, useState, createElement } from 'react';
import toast from 'react-hot-toast';
import { ALL_64_DISTRICTS, type DistrictData } from '../data/bangladeshDistricts';
const KEY = 'shonchay_saved_districts';
export function readSavedDistricts(): DistrictData[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(values)) return [];
    return ALL_64_DISTRICTS.filter(d => values.some(v => v === d.id || v?.id === d.id));
  } catch { return []; }
}
/** Device-local, shared across routes/tabs; never implies account synchronization. */
export function useSavedDistricts() {
  const [savedDistricts, setSaved] = useState(readSavedDistricts);
  useEffect(() => {
    const sync = () => setSaved(readSavedDistricts());
    window.addEventListener('storage', sync); window.addEventListener('hazardnet-saved', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('hazardnet-saved', sync); };
  }, []);
  const toggleSaveDistrict = (district: DistrictData) => {
    const previous = readSavedDistricts();
    const removing = previous.some(d => d.id === district.id);
    const next = removing ? previous.filter(d => d.id !== district.id) : [...previous, district];
    try {
      localStorage.setItem(KEY, JSON.stringify(next.map(d => d.id)));
      window.dispatchEvent(new Event('hazardnet-saved'));
      if (removing) toast(t => createElement('span', null, `${district.name} removed. `, createElement('button', { className: 'hn-button', onClick: () => { if (!readSavedDistricts().some(d => d.id === district.id)) toggleSaveDistrict(district); toast.dismiss(t.id); } }, 'Undo')));
      else toast.success('Saved on this device only.');
    } catch { toast.error('Cannot save on this device. Storage may be blocked or full.'); }
  };
  return { savedDistricts, toggleSaveDistrict };
}
