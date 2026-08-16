with open("frontend/src/components/LiveMapView.tsx", "r") as f:
    content = f.read()

target = "        {/* Empty State */}"
replacement = """        </>
      )}

        {/* Empty State */}"""

content = content.replace(target, replacement)

with open("frontend/src/components/LiveMapView.tsx", "w") as f:
    f.write(content)
