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
      {/* Map Engine Mode Toggle */}
      {!isFullScreen && (
        <div className="bg-white border border-slate-200 p-1.5 rounded-2xl flex items-center justify-between gap-2 text-xs shadow-xs text-slate-700">
          <div className="flex items-center gap-1.5 px-3 py-1 font-semibold text-slate-900">
            <span className="w-2.5 h-2.5 rounded-full bg-nasa-red animate-pulse"></span>
            <span>GIS Visualization Engine</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setMapMode('leaflet')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                mapMode === 'leaflet'
                  ? 'bg-nasa-red text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MaterialIcon name="satellite_alt" className="w-4 h-4 inline-block mr-1" />
              <span>Satellite Leaflet GIS</span>
            </button>
            <button
              onClick={() => setMapMode('svg')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                mapMode === 'svg'
                  ? 'bg-nasa-red text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MaterialIcon name="gis" className="w-4 h-4" />
              <span>Vector Spatial Heatmap</span>
            </button>
          </div>
        </div>
      )}

      {/* Render Selected Map Engine */}
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

