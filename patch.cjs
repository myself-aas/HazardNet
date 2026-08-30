const fs = require('fs');
let content = fs.readFileSync('frontend/src/pages/Dashboard.tsx', 'utf8');

content = content.replace(
  /<div className="flex flex-wrap items-center gap-3 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-200">([\s\S]*?)<\/button>\n        <\/div>\n      <\/motion.div>/m,
  `<div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-200">
          <OfflineBadge />
          <button
            onClick={() => setActiveView('settings')}
            className={\`px-3 sm:px-4 py-2 sm:py-3 rounded-full border text-xs font-extrabold transition-all duration-200 flex items-center gap-2 min-h-[44px] sm:min-h-[48px] cursor-pointer shadow-xs \${
              activeView === 'settings'
                ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200 hover:scale-[1.02]'
            }\`}
            title="Manage Offline Tile Cache & Storage Settings"
          >
            <MaterialIcon name="settings" className="w-4 h-4 inline-block sm:mr-1" /><span className="hidden sm:inline">Settings</span>
          </button>
          
          <PdfExportButton
            elementId="dashboard-content"
            filename={\`HazardNet_Dashboard_\${new Date().toISOString().slice(0, 10)}.pdf\`}
            title="Export PDF"
            documentType="Dashboard Report"
            className="h-[44px] sm:h-[48px] items-stretch rounded-full overflow-hidden"
          />

          <button
            onClick={downloadReport}
            className="px-3 sm:px-5 py-2 sm:py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-full shadow-xs transition-all duration-200 flex items-center gap-2 active:scale-98 hover:scale-[1.02] min-h-[44px] sm:min-h-[48px] cursor-pointer"
            title="Download CSV Report"
          >
            <MaterialIcon name="download" className="w-4 h-4 inline-block sm:hidden" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          
          <button
            onClick={() => { if (selectedDistrict) runPrediction(selectedDistrict); }}
            disabled={loading}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 font-black text-xs sm:text-sm rounded-full shadow-md transition-all duration-200 flex items-center gap-2 sm:gap-2.5 disabled:opacity-50 active:scale-98 hover:scale-[1.02] min-h-[44px] sm:min-h-[48px] cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-slate-900" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span className="hidden sm:inline">Processing...</span>
                <span className="sm:hidden">Run</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Re-Analyze Spectrum</span>
                <span className="sm:hidden">Analyze</span>
              </>
            )}
          </button>
        </div>
      </motion.div>`
);

fs.writeFileSync('frontend/src/pages/Dashboard.tsx', content);
