with open("frontend/src/components/EarthBackground.tsx", "r") as f:
    content = f.read()

# Fix camera position
camera_pos_old = "camera.position.z = window.innerWidth < 768 ? 40 : 25;"
camera_pos_new = "camera.position.set(0, window.innerWidth < 768 ? 15 : 8, window.innerWidth < 768 ? 35 : 22);"
content = content.replace(camera_pos_old, camera_pos_new)
content = content.replace("camera.position.z = window.innerWidth < 768 ? 40 : 25;", camera_pos_new) # for the resize handler

# Replace animation loop
anim_old = """      // Gentle auto-rotation
      earth.rotation.y += 0.0005;
      clouds.rotation.y += 0.0006;"""

anim_new = """      // Gentle auto-rotation oscillation focusing on Bangladesh
      const time = Date.now() * 0.0001;
      earth.rotation.y = -Math.PI / 2 + 1.2 + Math.sin(time) * 0.3;
      clouds.rotation.y = -Math.PI / 2 + 1.2 + Math.sin(time * 1.1) * 0.35;"""

content = content.replace(anim_old, anim_new)

with open("frontend/src/components/EarthBackground.tsx", "w") as f:
    f.write(content)
