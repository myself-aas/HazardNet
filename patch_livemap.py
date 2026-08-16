import re

with open("frontend/src/components/LiveMapView.tsx", "r") as f:
    content = f.read()

# When currentSelected is null, we want districtsToRender to be empty so no markers are drawn
old_render = """    const districtsToRender = (isolateSelected && currentSelected)
      ? [currentSelected]
      : filteredDistricts;"""

new_render = """    const districtsToRender = (currentSelected)
      ? (isolateSelected ? [currentSelected] : filteredDistricts)
      : []; // Don't render any markers if no district is selected"""

content = content.replace(old_render, new_render)

# We also should hide the bottom HUD "Telemetry Status Footer Bar" if currentSelected is null
old_hud = "{/* Bottom Telemetry Status Footer Bar */}"
new_hud = "{currentSelected && (\n        <>\n{/* Bottom Telemetry Status Footer Bar */}"

content = content.replace(old_hud, new_hud)

old_hud_end = """        </div>

        {/* Floating Controls (Zoom, Reset, Layers, Fullscreen) */}"""
new_hud_end = """        </div>
        </>\n      )}

        {/* Floating Controls (Zoom, Reset, Layers, Fullscreen) */}"""

content = content.replace(old_hud_end, new_hud_end)

with open("frontend/src/components/LiveMapView.tsx", "w") as f:
    f.write(content)
