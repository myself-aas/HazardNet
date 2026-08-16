with open("frontend/src/components/LiveMapView.tsx", "r") as f:
    content = f.read()

effect = """
  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setOpacity(currentSelected ? 0.4 : 0.0);
    }
  }, [currentSelected]);
"""

# inject before return (
target = "return ("
idx = content.rfind(target)
if idx != -1:
    content = content[:idx] + effect + content[idx:]

with open("frontend/src/components/LiveMapView.tsx", "w") as f:
    f.write(content)
