with open("frontend/src/components/LiveMapView.tsx", "r") as f:
    content = f.read()

zoom_code_old = """    if (!mapInstanceRef.current || !currentSelected) return;

    if (isolateSelected) {
      const boundaryCoords = getDistrictBoundaryCoordinates(currentSelected);"""

zoom_code_new = """    if (!mapInstanceRef.current) return;

    if (isolateSelected && currentSelected) {
      const boundaryCoords = getDistrictBoundaryCoordinates(currentSelected);"""

content = content.replace(zoom_code_old, zoom_code_new)

# if not currentSelected, fitBounds to BD
fallback_zoom_old = """      });
    }
  }, [selectedDistrictId, isolateSelected, searchQuery]);"""

fallback_zoom_new = """      });
    } else if (!currentSelected) {
      mapInstanceRef.current.fitBounds([
        [20.7, 88.0],
        [26.6, 92.6]
      ], { padding: [50, 50], maxZoom: 7, animate: true, duration: 1.5 });
    }
  }, [selectedDistrictId, isolateSelected, searchQuery]);"""

content = content.replace(fallback_zoom_old, fallback_zoom_new)

with open("frontend/src/components/LiveMapView.tsx", "w") as f:
    f.write(content)
