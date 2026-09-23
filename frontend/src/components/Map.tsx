import MaterialIcon from "./MaterialIcon";
import { useState } from 'react';
import { LiveMapView } from './LiveMapView';
import { BangladeshSvgMap } from './BangladeshSvgMap';

interface District {
  id: string;
  name: string;
  division: string;
  lat: number;
  lng: number;
  risk: 'Low' | 'Moderate' | 'High';
  mainCrop: string;
}

interface MapProps {
  onSelectDistrict?: (district: District) => void;
  selectedDistrictId?: string;
  onOpenDisasterModal?: (districtId: string) => void;
  pinpointLat?: number;
  pinpointLng?: number;
  isFullScreen?: boolean;
  compactHeader?: boolean;
  customHeight?: string;
  className?: string;
}

const Map: React.FC<MapProps> = ({
  onSelectDistrict,
  selectedDistrictId,
  onOpenDisasterModal,
  pinpointLat,
  pinpointLng,
  isFullScreen = false,
  compactHeader = false,
  customHeight,
  className,
}) => {
  const [mapMode, setMapMode] = useState<'leaflet' | 'svg'>('leaflet');

  return (
    <div className={isFullScreen ? "w-full h-full flex flex-col space-y-0" : "space-y-3 h-full"}>
      {!isFullScreen && (
        <div className="bg-white border border-carbon-20 p-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-sm text-carbon-70">
          <div className="flex items-center gap-2 px-2 min-h-[44px] font-semibold text-carbon-90">
            <span>Map view</span>
          </div>

          <div className="flex items-center gap-2" role="group" aria-label="Map engine">
            <button
              type="button"
              onClick={() => setMapMode('leaflet')}
              aria-pressed={mapMode === 'leaflet'}
              className={`min-h-[44px] px-3 py-2 font-semibold text-sm flex items-center gap-2 touch-manipulation border ${
                mapMode === 'leaflet'
                  ? 'bg-nasa-blue text-white border-nasa-blue'
                  : 'bg-white text-carbon-70 border-carbon-20'
              }`}
            >
              <MaterialIcon name="satellite_alt" className="w-4 h-4" />
              <span>Leaflet map</span>
            </button>
            <button
              type="button"
              onClick={() => setMapMode('svg')}
              aria-pressed={mapMode === 'svg'}
              className={`min-h-[44px] px-3 py-2 font-semibold text-sm flex items-center gap-2 touch-manipulation border ${
                mapMode === 'svg'
                  ? 'bg-nasa-blue text-white border-nasa-blue'
                  : 'bg-white text-carbon-70 border-carbon-20'
              }`}
            >
              <MaterialIcon name="gis" className="w-4 h-4" />
              <span>District list map</span>
            </button>
          </div>
        </div>
      )}

      {mapMode === 'leaflet' ? (
        <LiveMapView
          selectedDistrictId={selectedDistrictId}
          onSelectDistrict={onSelectDistrict}
          onOpenDisasterModal={onOpenDisasterModal}
          pinpointLat={pinpointLat}
          pinpointLng={pinpointLng}
          isFullScreen={isFullScreen}
          compactHeader={compactHeader}
          customHeight={customHeight}
          className={className}
        />
      ) : (
        <BangladeshSvgMap
          selectedDistrictId={selectedDistrictId}
          onOpenDisasterModal={onOpenDisasterModal}
          onSelectDistrict={(dist) => {
            if (onSelectDistrict) {
              if (!dist) {
                onSelectDistrict(null as any);
                return;
              }
              onSelectDistrict({
                id: dist.id,
                name: dist.name,
                division: dist.division,
                lat: dist.lat,
                lng: dist.lng,
                risk: dist.risk,
                mainCrop: dist.mainCrop,
              });
            }
          }}
        />
      )}
    </div>
  );
};

export default Map;
