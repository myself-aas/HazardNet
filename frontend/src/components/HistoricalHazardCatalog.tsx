import React, { useState, useMemo, useCallback } from 'react';
import { isValidGlide } from '../lib/glide';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';

export interface HistoricalHazardRecord {
  id: string;
  glide: string;
  date: string;
  year: number;
  district: string;
  latitude: number;
  longitude: number;
  hazard_type: string;
  gee_start?: string;
  gee_end?: string;
  severity_index_name: string;
  severity_score: number;
  validated_affected: number;
  summary: string;
}

export interface HistoricalHazardCatalogProps {
  records?: HistoricalHazardRecord[];
  onSelectEvent?: (record: HistoricalHazardRecord) => void;
  onOpenGlide?: (glideId: string) => void;
  className?: string;
}

export const HAZARD_CLASSES = [
  'All',
  'Flash Flood',
  'Monsoon Flood',
  'Flood',
  'Tropical Cyclone',
  'Drought',
  'Cold Wave',
  'Heat Wave',
  'Severe Local Storm',
  'Severe Storm',
  'Fire',
];

export const HistoricalHazardCatalog: React.FC<HistoricalHazardCatalogProps> = ({
  records = [],
  onSelectEvent,
  onOpenGlide,
  className = '',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHazard, setSelectedHazard] = useState('All');
  const [selectedDistrict, setSelectedDistrict] = useState('All');
  const [minYear, setMinYear] = useState<number>(2000);
  const [maxYear, setMaxYear] = useState<number>(2026);
  const [minSeverity, setMinSeverity] = useState<number>(0);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Filtered dataset
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedHazard !== 'All' && r.hazard_type !== selectedHazard) {
        return false;
      }
      if (selectedDistrict !== 'All' && r.district.toLowerCase() !== selectedDistrict.toLowerCase()) {
        return false;
      }
      if (r.year < minYear || r.year > maxYear) {
        return false;
      }
      if (r.severity_score < minSeverity) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          r.district.toLowerCase().includes(q) ||
          r.hazard_type.toLowerCase().includes(q) ||
          (r.glide && r.glide.toLowerCase().includes(q)) ||
          r.date.includes(q)
        );
      }
      return true;
    });
  }, [records, selectedHazard, selectedDistrict, minYear, maxYear, minSeverity, searchTerm]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRecords = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, safeCurrentPage, pageSize]);

  // Client-side CSV export
  const exportAsCsv = useCallback(() => {
    const headers = [
      'Event_ID',
      'GLIDE',
      'Date',
      'Year',
      'District',
      'Hazard_Type',
      'Severity_Score',
      'Severity_Index',
      'Affected_Population',
      'Latitude',
      'Longitude',
    ];
    const rows = filteredRecords.map((r) => [
      r.id,
      r.glide || '',
      r.date,
      r.year,
      `"${r.district.replace(/"/g, '""')}"`,
      `"${r.hazard_type.replace(/"/g, '""')}"`,
      r.severity_score,
      r.severity_index_name,
      r.validated_affected,
      r.latitude,
      r.longitude,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `HazardNet_Historical_Catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredRecords]);

  // Client-side JSON export
  const exportAsJson = useCallback(() => {
    const jsonStr = JSON.stringify(filteredRecords, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `HazardNet_Historical_Catalog_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredRecords]);

  const allDistrictsList = useMemo(() => {
    const list = ALL_64_DISTRICTS.map((d) => d.name).sort();
    return ['All', ...list];
  }, []);

  return (
    <div
      className={`bg-carbon-90 border border-carbon-80 rounded-2xl p-4 md:p-6 shadow-2xl flex flex-col text-carbon-10 ${className}`}
      data-testid="historical-hazard-catalog"
    >
      {/* Header and Summary */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 pb-4 border-b border-carbon-80">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white tracking-tight">
              Historical Hazard Records Catalog
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/60 text-rose-300 border border-rose-800/60">
              {filteredRecords.length.toLocaleString()} of {records.length.toLocaleString()} Events
            </span>
          </div>
          <p className="text-xs text-carbon-40 mt-1">
            Empirical multi-hazard event registry spanning 2000–2026 with verified multilateral GLIDE cross-references.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportAsCsv}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-carbon-80 hover:bg-carbon-70 text-carbon-20 border border-carbon-70 transition-colors flex items-center gap-1.5"
            aria-label="Export filtered records as CSV"
          >
            <span>📥 Export CSV</span>
          </button>
          <button
            type="button"
            onClick={exportAsJson}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-carbon-80 hover:bg-carbon-70 text-carbon-20 border border-carbon-70 transition-colors flex items-center gap-1.5"
            aria-label="Export filtered records as JSON"
          >
            <span>📦 Export JSON</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* Search Input */}
        <div>
          <label className="block text-[11px] font-medium text-carbon-40 mb-1">Search Keywords</label>
          <input
            type="text"
            placeholder="Search district, hazard, GLIDE..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-carbon-black/80 border border-carbon-70/80 rounded-lg px-3 py-1.5 text-xs text-carbon-20 placeholder-carbon-50 focus:outline-hidden focus:border-rose-500"
          />
        </div>

        {/* Hazard Class Selector */}
        <div>
          <label className="block text-[11px] font-medium text-carbon-40 mb-1">Hazard Class</label>
          <select
            value={selectedHazard}
            onChange={(e) => {
              setSelectedHazard(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-carbon-black/80 border border-carbon-70/80 rounded-lg px-3 py-1.5 text-xs text-carbon-20 focus:outline-hidden focus:border-rose-500"
          >
            {HAZARD_CLASSES.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        {/* District Selector */}
        <div>
          <label className="block text-[11px] font-medium text-carbon-40 mb-1">District</label>
          <select
            value={selectedDistrict}
            onChange={(e) => {
              setSelectedDistrict(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-carbon-black/80 border border-carbon-70/80 rounded-lg px-3 py-1.5 text-xs text-carbon-20 focus:outline-hidden focus:border-rose-500"
          >
            {allDistrictsList.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Year Range Controls */}
        <div>
          <div className="flex justify-between text-[11px] font-medium text-carbon-40 mb-1">
            <span>Year Range:</span>
            <span className="font-mono text-carbon-20">{minYear} – {maxYear}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={2000}
              max={2026}
              value={minYear}
              onChange={(e) => {
                const val = Number(e.target.value);
                setMinYear(Math.min(val, maxYear));
                setCurrentPage(1);
              }}
              className="w-full h-1.5 bg-carbon-70 rounded-lg appearance-none cursor-pointer accent-rose-500"
              aria-label="Minimum year"
            />
            <input
              type="range"
              min={2000}
              max={2026}
              value={maxYear}
              onChange={(e) => {
                const val = Number(e.target.value);
                setMaxYear(Math.max(val, minYear));
                setCurrentPage(1);
              }}
              className="w-full h-1.5 bg-carbon-70 rounded-lg appearance-none cursor-pointer accent-rose-500"
              aria-label="Maximum year"
            />
          </div>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="overflow-x-auto border border-carbon-80 rounded-xl bg-carbon-black/40">
        <table className="w-full text-left text-xs text-carbon-30" role="table">
          <thead className="bg-carbon-black/90 text-carbon-40 text-[11px] uppercase tracking-wider font-semibold border-b border-carbon-80">
            <tr>
              <th scope="col" className="px-3 py-2.5">Date</th>
              <th scope="col" className="px-3 py-2.5">District</th>
              <th scope="col" className="px-3 py-2.5">Hazard Type</th>
              <th scope="col" className="px-3 py-2.5">Severity</th>
              <th scope="col" className="px-3 py-2.5">GLIDE Number</th>
              <th scope="col" className="px-3 py-2.5 text-right">Affected</th>
              <th scope="col" className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-80/80">
            {paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-carbon-50">
                  No historical records match the filter criteria.
                </td>
              </tr>
            ) : (
              paginatedRecords.map((r) => {
                const hasValidGlide = isValidGlide(r.glide);
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-carbon-80/50 transition-colors"
                  >
                    <td className="px-3 py-2.5 font-mono text-carbon-30">
                      {r.date}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-white">
                      {r.district}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-carbon-80 text-carbon-20 border border-carbon-70">
                        {r.hazard_type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      <span className="text-rose-400 font-bold">{r.severity_score}</span>
                      <span className="text-[10px] text-carbon-50 ml-1">({r.severity_index_name})</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      {hasValidGlide ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenGlide) {
                              onOpenGlide(r.glide);
                            } else {
                              window.open(
                                `https://reliefweb.int/disaster/${encodeURIComponent(r.glide)}`,
                                '_blank',
                                'noopener,noreferrer'
                              );
                            }
                          }}
                          className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-950/70 text-blue-300 border border-blue-800/70 hover:bg-blue-900 transition-colors inline-flex items-center gap-1"
                          title="Open Multilateral GLIDE links"
                        >
                          <span>{r.glide}</span>
                          <span className="text-[10px]">↗</span>
                        </button>
                      ) : (
                        <span className="text-carbon-60 text-[11px]">{r.glide || 'Domestic Rec.'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-carbon-30">
                      {Number(r.validated_affected || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {onSelectEvent && (
                        <button
                          type="button"
                          onClick={() => onSelectEvent(r)}
                          className="px-2.5 py-1 rounded text-[11px] font-medium bg-carbon-80 hover:bg-carbon-70 text-carbon-20 transition-colors"
                        >
                          View Report
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-carbon-80 text-xs text-carbon-40">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-carbon-black border border-carbon-80 rounded px-2 py-1 text-carbon-20 focus:outline-hidden"
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span className="text-carbon-50">
            Page {safeCurrentPage} of {totalPages}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-2.5 py-1 rounded bg-carbon-80 hover:bg-carbon-70 text-carbon-20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-2 font-mono text-carbon-30">
            {safeCurrentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-2.5 py-1 rounded bg-carbon-80 hover:bg-carbon-70 text-carbon-20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoricalHazardCatalog;
