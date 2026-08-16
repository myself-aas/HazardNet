with open("frontend/src/pages/Dashboard.tsx", "r") as f:
    content = f.read()

content = content.replace("const { userProfile } = useAuth();", "const { user, userProfile } = useAuth();")

unauth_render = """  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] text-center px-4 pointer-events-none">
        <div className="bg-[#000000]/60 backdrop-blur-xl p-8 rounded-3xl border border-[#454547] pointer-events-auto max-w-3xl shadow-2xl animate-fadeIn">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-emerald-400 font-mono text-sm font-bold uppercase tracking-widest">Global Telemetry Active</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white drop-shadow-2xl mb-6">
            HazardNet <span className="text-zinc-400">Earth</span>
          </h1>
          <p className="text-zinc-300 text-sm md:text-base leading-relaxed font-sans mb-8">
            Explore our real-time interactive 3D Earth model focusing on Southeast Asia and Bangladesh. 
            Drag to rotate, pinch to zoom, and experience the global telemetry view. 
            Sign in to access localized predictive analytics and granular disaster forecasts.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button 
              onClick={() => document.dispatchEvent(new CustomEvent('openAuthModal'))}
              className="px-6 py-3 bg-white text-black font-extrabold text-sm rounded-full hover:scale-105 transition-all shadow-xl"
            >
              Sign In to Access
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Synchronize URL search parameters AND user pinpoint coordinates with dashboard map"""

content = content.replace("  // Synchronize URL search parameters AND user pinpoint coordinates with dashboard map", unauth_render)

with open("frontend/src/pages/Dashboard.tsx", "w") as f:
    f.write(content)
