import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Globe, ExternalLink, RefreshCw, AlertCircle, Building, Shield, Radio, Search } from 'lucide-react';

interface GroundingIntelligencePanelProps {
  districtId: string;
  districtName: string;
}

interface Facility {
  title: string;
  uri: string;
  snippet?: string;
  type?: string;
}

interface SearchSource {
  title: string;
  uri: string;
  domain?: string;
}

export const GroundingIntelligencePanel: React.FC<GroundingIntelligencePanelProps> = ({
  districtId,
  districtName
}) => {
  const [activeTab, setActiveTab] = useState<'maps' | 'search'>('maps');
  
  // Maps grounding state
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [mapsAnswer, setMapsAnswer] = useState<string>('');
  const [mapsProvider, setMapsProvider] = useState<string>('');
  const [mapsLoading, setMapsLoading] = useState<boolean>(false);
  const [mapsError, setMapsError] = useState<string | null>(null);

  // Search grounding state
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [searchAnswer, setSearchAnswer] = useState<string>('');
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [searchProvider, setSearchProvider] = useState<string>('');
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Custom question in panel
  const [customQuery, setCustomQuery] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);

  // Fetch Maps Facilities
  const fetchFacilities = async () => {
    setMapsLoading(true);
    setMapsError(null);
    try {
      const res = await fetch(`/api/grounding/district-facilities/${encodeURIComponent(districtId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFacilities(data.facilities || []);
      setMapsAnswer(data.answer || '');
      setMapsProvider(data.provider || 'gemini-3.5-flash + Google Maps');
    } catch (err: any) {
      setMapsError(err.message || 'Failed to load local facilities');
    } finally {
      setMapsLoading(false);
    }
  };

  // Fetch Search Bulletins
  const fetchSearchUpdates = async () => {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/grounding/district-updates/${encodeURIComponent(districtId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSources(data.sources || []);
      setSearchAnswer(data.answer || '');
      setSearchQueries(data.searchQueries || []);
      setSearchProvider(data.provider || 'gemini-3.5-flash + Google Search');
    } catch (err: any) {
      setSearchError(err.message || 'Failed to load live search updates');
    } finally {
      setSearchLoading(false);
    }
  };

  // Load facilities initially on district change
  useEffect(() => {
    fetchFacilities();
    fetchSearchUpdates();
  }, [districtId]);

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuery.trim()) return;

    setQueryLoading(true);
    try {
      if (activeTab === 'maps') {
        setMapsLoading(true);
        const res = await fetch('/api/grounding/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: customQuery,
            district: districtName
          })
        });
        const data = await res.json();
        if (data.facilities) setFacilities(data.facilities);
        if (data.answer) setMapsAnswer(data.answer);
        if (data.provider) setMapsProvider(data.provider);
      } else {
        setSearchLoading(true);
        const res = await fetch('/api/grounding/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: customQuery,
            district: districtName
          })
        });
        const data = await res.json();
        if (data.sources) setSources(data.sources);
        if (data.answer) setSearchAnswer(data.answer);
        if (data.provider) setSearchProvider(data.provider);
      }
      setCustomQuery('');
    } catch (err: any) {
      console.error('Custom grounding query failed:', err);
    } finally {
      setQueryLoading(false);
      setMapsLoading(false);
      setSearchLoading(false);
    }
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-carbon-20 shadow-sm overflow-hidden my-6">
      {/* Header */}
      <div className="p-4 sm:p-6 bg-carbon-05 border-b border-carbon-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-carbon-90">
              Grounding Intelligence Engine
            </h3>
            <span className="text-[10px] bg-nasa-blue text-white font-mono uppercase px-2 py-0.5 rounded tracking-wide font-semibold">
              gemini-3.5-flash
            </span>
          </div>
          <p className="text-xs text-carbon-60 mt-1">
            Real-world ground truth for <strong>{districtName}</strong> powered by Google Maps & Google Search grounding tools.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-carbon-10 p-1 rounded-xl gap-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('maps')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'maps'
                ? 'bg-white text-blue-800 shadow-xs'
                : 'text-carbon-60 hover:text-carbon-90'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            <span>Google Maps Grounding</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'search'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-carbon-60 hover:text-carbon-90'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-600" />
            <span>Google Search Grounding</span>
          </button>
        </div>
      </div>

      {/* Query Bar */}
      <div className="p-3 sm:p-4 bg-white border-b border-carbon-20">
        <form onSubmit={handleCustomSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-carbon-40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder={
                activeTab === 'maps'
                  ? `Search emergency shelters, clinics, or DAE offices in ${districtName}...`
                  : `Search live weather warnings or river levels in ${districtName}...`
              }
              className="w-full bg-carbon-05 border border-carbon-20 rounded-xl py-2 pl-9 pr-3 text-xs sm:text-sm text-carbon-90 placeholder-carbon-40 focus:outline-none focus:border-nasa-blue"
            />
          </div>
          <button
            type="submit"
            disabled={!customQuery.trim() || queryLoading}
            className="px-4 py-2 bg-nasa-blue hover:bg-nasa-blue-shade disabled:opacity-40 text-white text-xs font-semibold rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
          >
            {queryLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <span>Query</span>
            )}
          </button>
        </form>

        {/* Quick Grounded Prompts */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <span className="text-[11px] text-carbon-50 self-center mr-1">Quick prompts:</span>
          {activeTab === 'maps' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setCustomQuery(`Find nearest Upazila Agriculture Office (DAE) in ${districtName}`);
                }}
                className="text-[11px] bg-blue-50 text-blue-800 border border-blue-200/80 px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors"
              >
                📍 Upazila Agriculture Office
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomQuery(`Locate flood and cyclone shelters in ${districtName}`);
                }}
                className="text-[11px] bg-blue-50 text-blue-800 border border-blue-200/80 px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors"
              >
                📍 Flood & Cyclone Shelters
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomQuery(`Veterinary hospital & livestock clinic in ${districtName}`);
                }}
                className="text-[11px] bg-blue-50 text-blue-800 border border-blue-200/80 px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors"
              >
                📍 Veterinary Clinic
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setCustomQuery(`Latest BMD rainfall and cyclone warning for ${districtName}`);
                }}
                className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 rounded-md hover:bg-emerald-100 transition-colors"
              >
                🌐 BMD Weather Warning
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomQuery(`Current FFWC river danger levels in ${districtName}`);
                }}
                className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 rounded-md hover:bg-emerald-100 transition-colors"
              >
                🌐 River Danger Levels (FFWC)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomQuery(`Agricultural directives and crop damage relief for ${districtName}`);
                }}
                className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 rounded-md hover:bg-emerald-100 transition-colors"
              >
                🌐 DAE Crop Relief News
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'maps' ? (
            <motion.div
              key="maps-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              {/* Header Info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-carbon-90">
                      Grounded Emergency & Agronomic Facilities
                    </h4>
                    <p className="text-[11px] text-carbon-50">
                      Institutional points of contact grounded via Google Maps spatial data
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchFacilities}
                  disabled={mapsLoading}
                  className="text-xs text-carbon-60 hover:text-nasa-blue flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${mapsLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {mapsLoading ? (
                <div className="py-8 text-center space-y-3">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-carbon-60">
                    Querying Google Maps grounding tool for {districtName}...
                  </p>
                </div>
              ) : mapsError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{mapsError}</span>
                </div>
              ) : (
                <>
                  {/* Facilities Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {facilities.map((fac, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-carbon-05 border border-carbon-20 hover:border-blue-300 rounded-xl transition-all group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="font-semibold text-xs sm:text-sm text-carbon-90 group-hover:text-blue-900 transition-colors">
                              {fac.title}
                            </span>
                            <span className="text-[10px] font-mono uppercase bg-white border border-carbon-20 px-1.5 py-0.5 rounded text-carbon-60 shrink-0">
                              {fac.type || 'Facility'}
                            </span>
                          </div>
                          {fac.snippet && (
                            <p className="text-xs text-carbon-60 line-clamp-2 mb-3">
                              {fac.snippet}
                            </p>
                          )}
                        </div>

                        <a
                          href={fac.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          <MapPin className="w-3 h-3" />
                          <span>View on Google Maps</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      </div>
                    ))}
                  </div>

                  {/* Grounded Summary Text */}
                  {mapsAnswer && (
                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-xs text-carbon-80 leading-relaxed">
                      <div className="font-bold text-blue-950 mb-1 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-blue-700" />
                        <span>Spatial Guidance Summary:</span>
                      </div>
                      <p className="whitespace-pre-line">{mapsAnswer.slice(0, 450)}...</p>
                      <div className="mt-2 text-[10px] text-carbon-50">
                        Provenance: {mapsProvider}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="search-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              {/* Header Info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-carbon-90">
                      Real-Time Meteorological & Hazard Bulletins
                    </h4>
                    <p className="text-[11px] text-carbon-50">
                      Verified real-time information grounded via Google Search engine
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchSearchUpdates}
                  disabled={searchLoading}
                  className="text-xs text-carbon-60 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${searchLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {searchLoading ? (
                <div className="py-8 text-center space-y-3">
                  <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-carbon-60">
                    Retrieving live search bulletins for {districtName}...
                  </p>
                </div>
              ) : searchError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              ) : (
                <>
                  {/* Search Bulletins Summary */}
                  {searchAnswer && (
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs text-carbon-80 leading-relaxed">
                      <div className="font-bold text-emerald-950 mb-1.5 flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Live Grounded Intelligence:</span>
                      </div>
                      <p className="whitespace-pre-line">{searchAnswer}</p>
                      <div className="mt-2 text-[10px] text-carbon-50">
                        Provenance: {searchProvider}
                      </div>
                    </div>
                  )}

                  {/* Sources Citations */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-carbon-80 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Verified Google Search Citations ({sources.length}):</span>
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sources.map((src, idx) => (
                        <a
                          key={idx}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 bg-carbon-05 border border-carbon-20 hover:border-emerald-400 rounded-xl transition-all block group"
                        >
                          <div className="flex items-center justify-between text-[11px] text-emerald-800 font-semibold mb-1">
                            <span className="truncate">{src.domain || 'Official Portal'}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 ml-1 opacity-70 group-hover:opacity-100" />
                          </div>
                          <p className="text-xs text-carbon-80 font-medium line-clamp-1 group-hover:text-emerald-950">
                            {src.title}
                          </p>
                        </a>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default GroundingIntelligencePanel;
