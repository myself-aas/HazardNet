with open("frontend/src/components/LiveMapView.tsx", "r") as f:
    content = f.read()

# Replace pointer-events-none with conditional
old_str = """        <div className="w-full h-full bg-transparent pointer-events-none">
          <div ref={mapContainerRef} className="w-full h-full z-10 bg-transparent ![background:transparent] pointer-events-none [&_.leaflet-interactive]:pointer-events-auto" />
        </div>"""

new_str = """        <div className={`w-full h-full bg-transparent ${currentSelected ? '' : 'pointer-events-none'}`}>
          <div ref={mapContainerRef} className={`w-full h-full z-10 bg-transparent ![background:transparent] ${currentSelected ? '' : 'pointer-events-none'} [&_.leaflet-interactive]:pointer-events-auto`} />
        </div>"""

content = content.replace(old_str, new_str)

with open("frontend/src/components/LiveMapView.tsx", "w") as f:
    f.write(content)
