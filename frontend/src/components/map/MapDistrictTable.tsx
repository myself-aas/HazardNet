import React from 'react';

export interface MapDistrictTableRow {
  id: string;
  name: string;
  division: string;
  hazardType: string;
  severity: number;
  risk: string;
}

export interface MapDistrictTableProps {
  districts: MapDistrictTableRow[];
  selectedDistrictId?: string;
  onSelectDistrict: (district: MapDistrictTableRow) => void;
}

/**
 * Captioned table equivalent of the live map (Phase 4 map/table parity).
 * Same selection as the map; 44px rows; risk as a word, not colour-only.
 */
export const MapDistrictTable: React.FC<MapDistrictTableProps> = ({
  districts,
  selectedDistrictId,
  onSelectDistrict,
}) => {
  return (
    <div
      data-testid="map-district-table"
      className="flex-1 min-h-[360px] overflow-auto bg-white border-t border-carbon-20"
    >
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Districts matching the current map filters. Select a row to open the stored forecast for that district. This table is the text equivalent of the map.
        </caption>
        <thead className="bg-carbon-05 text-carbon-60 text-xs font-semibold border-b border-carbon-20 sticky top-0">
          <tr>
            <th scope="col" className="p-3">
              District
            </th>
            <th scope="col" className="p-3">
              Division
            </th>
            <th scope="col" className="p-3">
              Hazard
            </th>
            <th scope="col" className="p-3">
              Severity
            </th>
            <th scope="col" className="p-3">
              Risk
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-carbon-10">
          {districts.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-6 text-base text-carbon-70">
                No districts match the current filters.
              </td>
            </tr>
          ) : (
            districts.map((district) => {
              const selected = district.id === selectedDistrictId;
              const severityPct = Math.round(district.severity * 100);
              return (
                <tr key={district.id} className={selected ? 'bg-carbon-05' : undefined}>
                  <th scope="row" className="p-0 font-semibold text-carbon-90">
                    <button
                      type="button"
                      onClick={() => onSelectDistrict(district)}
                      aria-current={selected ? 'true' : undefined}
                      className="min-h-[44px] w-full px-3 text-left text-base font-semibold touch-manipulation"
                    >
                      {district.name}
                    </button>
                  </th>
                  <td className="p-3 text-carbon-70">{district.division}</td>
                  <td className="p-3 text-carbon-80">{district.hazardType}</td>
                  <td className="p-3 font-mono tabular-nums text-carbon-80">{severityPct}%</td>
                  <td className="p-3 text-carbon-80">{district.risk}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default MapDistrictTable;
