/**
 * 3D Globe — react-three-fiber Earth with lat/lng image markers.
 *
 * Adapted from the 21st.dev `3d-globe` component for this codebase. Three changes were
 * not cosmetic and are worth recording:
 *
 *  1. No `"use client"` directive. `components.json` sets `"rsc": false` and this is a
 *     Vite SPA, not Next.js — the directive is dead code here and would only suggest a
 *     server boundary that does not exist.
 *
 *  2. Textures are configured in an effect, not inside `useMemo`. The original mutated
 *     `texture.colorSpace` / `anisotropy` during render, which is a side effect in the
 *     render phase and re-runs under StrictMode's double invoke.
 *
 *  3. `prefers-reduced-motion` disables auto-rotation. This repo audits for it (see
 *     `motionAudit.test.js` and the `useReducedMotion` usage across the hero), so a
 *     component that spins forever regardless of the user's OS setting would fail it.
 *
 * ⚠ Assets are fetched from `cdn.21st.dev` at runtime. That is how the upstream
 *   component ships, and it is the reason this file is not yet mounted on a page:
 *   `e2e/full-app-qa.spec.ts` asserts `badResponses === []` for every route it walks, so
 *   a single failing or slow asset request fails the build. Mounting this on a
 *   route-covered page should wait until those URLs are confirmed from a real browser, or
 *   the two textures are vendored into `frontend/public/`.
 *
 * Bundle note: three + fiber + drei is on the order of a megabyte. Import this through
 * `globe-3d-lazy.tsx`, never directly from a page, so it stays out of the route chunk.
 */

import React, { useRef, useMemo, useState, useCallback, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface GlobeMarker {
  lat: number;
  lng: number;
  src: string;
  label?: string;
  size?: number;
}

export interface Globe3DConfig {
  /** Globe radius */
  radius?: number;
  /** Globe base color (used as fallback or tint) */
  globeColor?: string;
  /** URL to the Earth texture map */
  textureUrl?: string;
  /** URL to the bump/elevation map for terrain */
  bumpMapUrl?: string;
  /** Whether to show atmosphere glow */
  showAtmosphere?: boolean;
  /** Atmosphere color */
  atmosphereColor?: string;
  /** Atmosphere intensity */
  atmosphereIntensity?: number;
  /** Atmosphere blur/softness (higher = more diffuse, default 3) */
  atmosphereBlur?: number;
  /** Terrain bump scale (0 = flat, higher = more pronounced) */
  bumpScale?: number;
  /** Auto rotate speed (0 = disabled) */
  autoRotateSpeed?: number;
  /** Enable zoom */
  enableZoom?: boolean;
  /** Enable pan */
  enablePan?: boolean;
  /** Min zoom distance */
  minDistance?: number;
  /** Max zoom distance */
  maxDistance?: number;
  /** Initial rotation */
  initialRotation?: { x: number; y: number };
  /** Marker default size */
  markerSize?: number;
  /** Show wireframe overlay */
  showWireframe?: boolean;
  /** Wireframe color */
  wireframeColor?: string;
  /** Ambient light intensity */
  ambientIntensity?: number;
  /** Point light intensity */
  pointLightIntensity?: number;
  /** Background color (null for transparent) */
  backgroundColor?: string | null;
}

interface Globe3DProps {
  /** Array of markers to display on the globe */
  markers?: GlobeMarker[];
  /** Globe configuration */
  config?: Globe3DConfig;
  /** Additional CSS classes */
  className?: string;
  /** Callback when a marker is clicked */
  onMarkerClick?: (marker: GlobeMarker) => void;
  /** Callback when a marker is hovered */
  onMarkerHover?: (marker: GlobeMarker | null) => void;
}

// ============================================================================
// Constants — Earth texture URLs (NASA Blue Marble, served by the upstream CDN)
// ============================================================================

const DEFAULT_EARTH_TEXTURE =
  'https://cdn.21st.dev/assets/localized/228deba2e4b600146bdcb6cfa359b8ead6aacc2b1c13550a29cd82824cfa1c01.jpg';
const DEFAULT_BUMP_TEXTURE =
  'https://cdn.21st.dev/assets/localized/839b12da2e4dd346b256cebae72e10c479a102c8980a22084c41275e4b9a0e12.png';

// ============================================================================
// Utility Functions
// ============================================================================

/** Convert latitude/longitude to 3D cartesian coordinates. */
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// ============================================================================
// Marker Component (static — rotation handled by the parent group)
// ============================================================================

interface MarkerProps {
  marker: GlobeMarker;
  radius: number;
  onClick?: (marker: GlobeMarker) => void;
  onHover?: (marker: GlobeMarker | null) => void;
}

function Marker({ marker, radius, onClick, onHover }: MarkerProps) {
  const [hovered, setHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const imageGroupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  const surfacePosition = useMemo(
    () => latLngToVector3(marker.lat, marker.lng, radius * 1.001),
    [marker.lat, marker.lng, radius],
  );

  // Sits further out than the surface so the pin never clips into the globe.
  const topPosition = useMemo(
    () => latLngToVector3(marker.lat, marker.lng, radius * 1.18),
    [marker.lat, marker.lng, radius],
  );

  const lineHeight = topPosition.distanceTo(surfacePosition);

  /*
   * Hide markers on the far side of the globe. `setIsVisible` runs every frame, but
   * React bails out when the value is unchanged, so this costs a comparison rather than
   * a re-render for all but the frames where a marker crosses the limb.
   */
  useFrame(() => {
    if (!imageGroupRef.current) return;

    const worldPos = new THREE.Vector3();
    imageGroupRef.current.getWorldPosition(worldPos);

    const markerDirection = worldPos.clone().normalize();
    const cameraDirection = camera.position.clone().normalize();
    const dot = markerDirection.dot(cameraDirection);

    setIsVisible(dot > 0.1);
  });

  const handlePointerEnter = useCallback(() => {
    setHovered(true);
    onHover?.(marker);
  }, [marker, onHover]);

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback(() => {
    onClick?.(marker);
  }, [marker, onClick]);

  const { lineCenter, lineQuaternion } = useMemo(() => {
    const center = surfacePosition.clone().lerp(topPosition, 0.5);
    const direction = topPosition.clone().sub(surfacePosition).normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    return { lineCenter: center, lineQuaternion: quaternion };
  }, [surfacePosition, topPosition]);

  return (
    <group visible={isVisible}>
      {/* Pin shaft, oriented along the surface normal */}
      <mesh position={lineCenter} quaternion={lineQuaternion}>
        <cylinderGeometry args={[0.003, 0.003, lineHeight, 8]} />
        <meshBasicMaterial color={hovered ? '#ffffff' : '#d2d2d7'} transparent opacity={hovered ? 0.9 : 0.6} />
      </mesh>

      {/* Pin point at the surface */}
      <mesh position={surfacePosition} quaternion={lineQuaternion}>
        <coneGeometry args={[0.015, 0.04, 8]} />
        <meshBasicMaterial color={hovered ? '#b3400f' : '#c01f1f'} />
      </mesh>

      {/* Circular image at the top of the pin */}
      <group ref={imageGroupRef} position={topPosition}>
        <Html
          transform
          center
          sprite
          distanceFactor={10}
          style={{
            pointerEvents: isVisible ? 'auto' : 'none',
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 0.15s ease-out',
          }}
        >
          <div
            className={cn(
              'cursor-pointer overflow-hidden rounded-full bg-carbon-90 shadow-lg transition-transform duration-200',
              hovered && 'scale-125 shadow-xl ring-1 ring-white/50',
            )}
            style={{ width: '8px', height: '8px' }}
            onMouseEnter={handlePointerEnter}
            onMouseLeave={handlePointerLeave}
            onClick={handleClick}
          >
            <img
              src={marker.src}
              alt={marker.label || 'Marker'}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
        </Html>
      </group>
    </group>
  );
}

// ============================================================================
// Rotating Globe with Markers (all rotate together)
// ============================================================================

interface RotatingGlobeProps {
  config: Required<Globe3DConfig>;
  markers: GlobeMarker[];
  onMarkerClick?: (marker: GlobeMarker) => void;
  onMarkerHover?: (marker: GlobeMarker | null) => void;
}

function RotatingGlobe({ config, markers, onMarkerClick, onMarkerHover }: RotatingGlobeProps) {
  const [earthTexture, bumpTexture] = useTexture([config.textureUrl, config.bumpMapUrl]);

  /*
   * An effect, not `useMemo`. Setting `colorSpace` and `anisotropy` mutates the texture
   * objects; doing that during render is a side effect in the render phase, which
   * StrictMode runs twice and which a future React could discard.
   */
  useEffect(() => {
    if (earthTexture) {
      earthTexture.colorSpace = THREE.SRGBColorSpace;
      earthTexture.anisotropy = 16;
      earthTexture.needsUpdate = true;
    }
    if (bumpTexture) {
      bumpTexture.anisotropy = 8;
      bumpTexture.needsUpdate = true;
    }
  }, [earthTexture, bumpTexture]);

  const geometry = useMemo(() => new THREE.SphereGeometry(config.radius, 64, 64), [config.radius]);
  const wireframeGeometry = useMemo(() => new THREE.SphereGeometry(config.radius * 1.002, 32, 16), [config.radius]);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          map={earthTexture}
          bumpMap={bumpTexture}
          bumpScale={config.bumpScale * 0.05}
          roughness={0.7}
          metalness={0.0}
        />
      </mesh>

      {config.showWireframe && (
        <mesh geometry={wireframeGeometry}>
          <meshBasicMaterial color={config.wireframeColor} wireframe transparent opacity={0.08} />
        </mesh>
      )}

      {markers.map((marker, index) => (
        <Marker
          key={`marker-${index}-${marker.lat}-${marker.lng}`}
          marker={marker}
          radius={config.radius}
          onClick={onMarkerClick}
          onHover={onMarkerHover}
        />
      ))}
    </group>
  );
}

// ============================================================================
// Atmosphere Component (stays static — does not rotate)
// ============================================================================

interface AtmosphereProps {
  radius: number;
  color: string;
  intensity: number;
  blur: number;
}

function Atmosphere({ radius, color, intensity, blur }: AtmosphereProps) {
  // `blur` maps onto the fresnel exponent: a higher blur means a lower exponent, which
  // spreads the glow further across the surface instead of hugging the limb.
  const fresnelPower = Math.max(0.5, 5 - blur);

  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          atmosphereColor: { value: new THREE.Color(color) },
          intensity: { value: intensity },
          fresnelPower: { value: fresnelPower },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 atmosphereColor;
          uniform float intensity;
          uniform float fresnelPower;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            float fresnel = pow(1.0 - abs(dot(vNormal, normalize(-vPosition))), fresnelPower);
            gl_FragColor = vec4(atmosphereColor, fresnel * intensity);
          }
        `,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    [color, intensity, fresnelPower],
  );

  // Shader materials are GPU resources; releasing them on unmount avoids leaking a
  // program per mount in a route that comes and goes.
  useEffect(() => () => atmosphereMaterial.dispose(), [atmosphereMaterial]);

  return (
    <mesh scale={[1.12, 1.12, 1.12]}>
      <sphereGeometry args={[radius, 64, 32]} />
      <primitive object={atmosphereMaterial} attach="material" />
    </mesh>
  );
}

// ============================================================================
// Scene Component
// ============================================================================

interface SceneProps {
  markers: GlobeMarker[];
  config: Required<Globe3DConfig>;
  autoRotate: boolean;
  onMarkerClick?: (marker: GlobeMarker) => void;
  onMarkerHover?: (marker: GlobeMarker | null) => void;
}

function Scene({ markers, config, autoRotate, onMarkerClick, onMarkerHover }: SceneProps) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, config.radius * 3.5);
    camera.lookAt(0, 0, 0);
  }, [camera, config.radius]);

  return (
    <>
      <ambientLight intensity={config.ambientIntensity} />
      <directionalLight
        position={[config.radius * 5, config.radius * 2, config.radius * 5]}
        intensity={config.pointLightIntensity}
        color="#ffffff"
      />
      <directionalLight
        position={[-config.radius * 3, config.radius, -config.radius * 2]}
        intensity={config.pointLightIntensity * 0.3}
        color="#88ccff"
      />

      <RotatingGlobe config={config} markers={markers} onMarkerClick={onMarkerClick} onMarkerHover={onMarkerHover} />

      {config.showAtmosphere && (
        <Atmosphere
          radius={config.radius}
          color={config.atmosphereColor}
          intensity={config.atmosphereIntensity}
          blur={config.atmosphereBlur}
        />
      )}

      <OrbitControls
        makeDefault
        enablePan={config.enablePan}
        enableZoom={config.enableZoom}
        minDistance={config.minDistance}
        maxDistance={config.maxDistance}
        rotateSpeed={0.4}
        autoRotate={autoRotate}
        autoRotateSpeed={config.autoRotateSpeed}
        enableDamping
        dampingFactor={0.1}
      />
    </>
  );
}

// ============================================================================
// Loading Fallback
// ============================================================================

function LoadingFallback() {
  return (
    <Html center>
      <div className="flex shrink-0 flex-col items-center gap-3">
        <span className="inline-block shrink-0 text-sm text-carbon-50">Loading globe…</span>
      </div>
    </Html>
  );
}

// ============================================================================
// Main Globe3D Component
// ============================================================================

const defaultConfig: Required<Globe3DConfig> = {
  radius: 2,
  globeColor: '#1a1a2e',
  textureUrl: DEFAULT_EARTH_TEXTURE,
  bumpMapUrl: DEFAULT_BUMP_TEXTURE,
  showAtmosphere: false,
  atmosphereColor: '#4da6ff',
  atmosphereIntensity: 0.5,
  atmosphereBlur: 2,
  bumpScale: 1,
  autoRotateSpeed: 0.3,
  enableZoom: false,
  enablePan: false,
  minDistance: 5,
  maxDistance: 15,
  initialRotation: { x: 0, y: 0 },
  markerSize: 0.06,
  showWireframe: false,
  wireframeColor: '#4a9eff',
  ambientIntensity: 0.6,
  pointLightIntensity: 1.5,
  backgroundColor: null,
};

export function Globe3D({ markers = [], config = {}, className, onMarkerClick, onMarkerHover }: Globe3DProps) {
  const mergedConfig = useMemo(() => ({ ...defaultConfig, ...config }), [config]);

  /*
   * Rotation honours the OS setting. This repo treats `prefers-reduced-motion` as a hard
   * requirement rather than a nicety, and a globe that never stops is the clearest
   * possible violation of it.
   */
  const reduceMotion = useReducedMotion();
  const autoRotate = !reduceMotion && mergedConfig.autoRotateSpeed > 0;

  return (
    <div className={cn('relative h-[500px] w-full', className)} data-testid="globe-3d">
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{
          fov: 45,
          near: 0.1,
          far: 1000,
          position: [0, 0, mergedConfig.radius * 3.5],
        }}
        style={{ background: mergedConfig.backgroundColor || 'transparent' }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <Scene
            markers={markers}
            config={mergedConfig}
            autoRotate={autoRotate}
            onMarkerClick={onMarkerClick}
            onMarkerHover={onMarkerHover}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default Globe3D;
