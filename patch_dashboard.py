import re

with open("frontend/src/pages/Dashboard.tsx", "r") as f:
    content = f.read()

# Fix selectedDistrictId for Map and RegionSelector
content = content.replace("selectedDistrictId={selectedDistrict.id}", "selectedDistrictId={selectedDistrict?.id}")

# Wrap HUD and below with condition
parts = content.split("{/* Selected District HUD Banner */}")
if len(parts) == 2:
    part1 = parts[0]
    part2 = parts[1]
    
    chart_end_idx = part2.find("/>\n        </>")
    if chart_end_idx != -1:
        chart_end_idx += 3
        
        hud_and_charts = part2[:chart_end_idx]
        remainder = part2[chart_end_idx:]
        
        new_part2 = "{selectedDistrict ? (\n            <>\n              {/* Selected District HUD Banner */}\n" + hud_and_charts + "\n            </>\n          ) : (\n            <div className=\"bg-[#2F2F31] border border-[#454547] rounded-[28px] p-6 sm:p-8 flex flex-col items-center justify-center min-h-[300px] shadow-2xl text-center space-y-4 mt-8\">\n               <h2 className=\"text-2xl sm:text-3xl font-black text-white\">National Overview Mode</h2>\n               <p className=\"text-zinc-400 text-sm max-w-md mx-auto\">Select a district from the interactive map or use the search dropdown above to view granular AI telemetry, crop risk predictions, and historical data.</p>\n            </div>\n          )}\n" + remainder
        
        content = part1 + new_part2

content = content.replace("{isDrawerOpen && (", "{isDrawerOpen && selectedDistrict && (")

with open("frontend/src/pages/Dashboard.tsx", "w") as f:
    f.write(content)
