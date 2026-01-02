/**
 * Color Flow Visualizer - Enhanced with GPU particles, reflections, and post-processing.
 *
 * Features:
 * - 10,000 GPU-instanced particles with curl noise flow
 * - Reflective ground plane
 * - Glowing ring structures that pulse with audio
 * - Heavy bloom and chromatic aberration
 * - Colors extracted from album artwork
 */
import { useRef, useMemo, useEffect, useState, memo } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { MeshReflectorMaterial, shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useAudioAnalyser, getAudioData } from '../../../hooks/useAudioAnalyser';
import { extractPalette } from '../../../utils/colorExtraction';
import { registerVisualizer, type VisualizerProps } from '../types';
import { AudioReactiveEffects } from '../effects/AudioReactiveEffects';

const DEFAULT_PALETTE = ['#a855f7', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899'];

// Custom shader for glowing rings
const RingMaterial = shaderMaterial(
  {
    uTime: 0,
    uBass: 0,
    uColor: new THREE.Color('#ffffff'),
  },
  // Vertex shader
  `
    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
      vUv = uv;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment shader
  `
    uniform float uTime;
    uniform float uBass;
    uniform vec3 uColor;

    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
      // Create pulsing glow effect
      float pulse = sin(uTime * 3.0 + vUv.x * 10.0) * 0.5 + 0.5;
      float glow = (0.5 + uBass * 0.5) * (pulse * 0.3 + 0.7);

      // Edge glow
      float edgeFade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);

      vec3 finalColor = uColor * glow * (1.0 + uBass);
      float alpha = edgeFade * (0.6 + uBass * 0.4);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `
);

extend({ RingMaterial });

declare global {
  namespace JSX {
    interface IntrinsicElements {
      ringMaterial: THREE.ShaderMaterial & {
        uTime?: number;
        uBass?: number;
        uColor?: THREE.Color;
      };
    }
  }
}

// GPU Flow Particles using instanced mesh
function FlowParticles({ palette }: { palette: string[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useAudioAnalyser(true);
  const timeRef = useRef(0);
  const count = 8000;

  const { positions, velocities, phases, colorIndices } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const colorIndices = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribute in a cylinder
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 4 + 0.5;
      const height = (Math.random() - 0.5) * 6;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      velocities[i * 3] = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 1] = Math.random() * 0.02 + 0.01;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;

      phases[i] = Math.random() * Math.PI * 2;
      colorIndices[i] = Math.floor(Math.random() * palette.length);
    }

    return { positions, velocities, phases, colorIndices };
  }, [count, palette.length]);

  const paletteColors = useMemo(
    () => palette.map((c) => new THREE.Color(c)),
    [palette]
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Simplex-like noise function
  const noise = (x: number, y: number, z: number, t: number) => {
    return (
      Math.sin(x * 1.5 + t) * Math.cos(y * 1.2 + t * 0.7) +
      Math.sin(z * 1.8 + t * 0.5) * 0.5
    );
  };

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    timeRef.current += delta;
    const time = timeRef.current;

    const audioData = getAudioData();
    const bass = audioData?.bass ?? 0;
    const mid = audioData?.mid ?? 0;
    const treble = audioData?.treble ?? 0;
    const intensity = (audioData?.averageFrequency ?? 0) / 255;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let x = positions[i3];
      let y = positions[i3 + 1];
      let z = positions[i3 + 2];

      const phase = phases[i];

      // Curl noise-like flow
      const flowX = noise(y * 0.3, z * 0.3, x * 0.3, time * 0.3);
      const flowY = noise(z * 0.3, x * 0.3, y * 0.3, time * 0.3 + 100);
      const flowZ = noise(x * 0.3, y * 0.3, z * 0.3, time * 0.3 + 200);

      const speed = 0.02 * (1 + bass * 2 + intensity);

      x += flowX * speed + velocities[i3] * (1 + mid);
      y += flowY * speed * 0.5 + velocities[i3 + 1] * (1 + treble);
      z += flowZ * speed + velocities[i3 + 2] * (1 + mid);

      // Spiral motion
      const angle = Math.atan2(z, x);
      const radius = Math.sqrt(x * x + z * z);
      const spiralSpeed = 0.005 + bass * 0.02;
      const newAngle = angle + spiralSpeed;

      x = Math.cos(newAngle) * radius;
      z = Math.sin(newAngle) * radius;

      // Vertical bounds with wrap-around
      if (y > 3) {
        y = -3;
        x = (Math.random() - 0.5) * 8;
        z = (Math.random() - 0.5) * 8;
      }
      if (y < -3) y = 3;

      // Radial bounds
      const dist = Math.sqrt(x * x + z * z);
      if (dist > 5) {
        const scale = 5 / dist;
        x *= scale * 0.8;
        z *= scale * 0.8;
      }

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      // Update instance
      const size = 0.02 * (1 + intensity * 0.5 + Math.sin(time + phase) * 0.2);
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Update color with audio reactivity
      const colorIdx = Math.floor(colorIndices[i]) % paletteColors.length;
      const baseColor = paletteColors[colorIdx];
      const dynamicColor = baseColor.clone();

      // Brighten based on audio
      dynamicColor.offsetHSL(0, 0, intensity * 0.3);
      meshRef.current.setColorAt(i, dynamicColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        transparent
        opacity={0.9}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

// Glowing torus rings
function GlowingRings({ palette }: { palette: string[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialsRef = useRef<THREE.ShaderMaterial[]>([]);
  useAudioAnalyser(true);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    timeRef.current += delta;

    const audioData = getAudioData();
    const bass = audioData?.bass ?? 0;
    const mid = audioData?.mid ?? 0;
    const treble = audioData?.treble ?? 0;

    groupRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const speed = i % 2 === 0 ? 1 : -1;

      mesh.rotation.x += 0.003 * speed + (i % 2 === 0 ? bass : treble) * 0.02;
      mesh.rotation.y += 0.002 * speed + mid * 0.01;
      mesh.rotation.z += 0.001 * speed;

      // Pulse scale
      const pulsePhase = i * 0.5;
      const pulse = Math.sin(timeRef.current * 2 + pulsePhase) * 0.1;
      const scale = 1 + bass * 0.3 + pulse;
      mesh.scale.setScalar(scale);

      // Update shader uniforms
      if (materialsRef.current[i]) {
        materialsRef.current[i].uniforms.uTime.value = timeRef.current;
        materialsRef.current[i].uniforms.uBass.value = bass;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {palette.slice(0, 4).map((color, i) => (
        <mesh
          key={i}
          rotation={[
            Math.PI / 2 + i * 0.2,
            i * Math.PI / 3,
            i * 0.1,
          ]}
        >
          <torusGeometry args={[1.2 + i * 0.4, 0.03 + i * 0.01, 16, 100]} />
          <ringMaterial
            ref={(el: THREE.ShaderMaterial | null) => {
              if (el) materialsRef.current[i] = el;
            }}
            transparent
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            uColor={new THREE.Color(color)}
          />
        </mesh>
      ))}
    </group>
  );
}

// Central energy core
function EnergyCore({ palette }: { palette: string[] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useAudioAnalyser(true);

  useFrame(() => {
    if (!meshRef.current) return;

    const audioData = getAudioData();
    const bass = audioData?.bass ?? 0;
    const intensity = (audioData?.averageFrequency ?? 0) / 255;

    // Pulsing scale
    const scale = 0.3 + bass * 0.3 + intensity * 0.2;
    meshRef.current.scale.setScalar(scale);

    // Rotation
    meshRef.current.rotation.y += 0.01 + bass * 0.02;
    meshRef.current.rotation.x += 0.005;

    // Update material
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.5 + bass * 0.5;
  });

  const coreColor = useMemo(() => {
    const c1 = new THREE.Color(palette[0]);
    const c2 = new THREE.Color(palette[1] || palette[0]);
    return c1.lerp(c2, 0.5);
  }, [palette]);

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 2]} />
      <meshBasicMaterial
        color={coreColor}
        transparent
        opacity={0.7}
        wireframe
        toneMapped={false}
      />
    </mesh>
  );
}

// Reflective ground - wrapped in memo to prevent HMR serialization issues
const ReflectiveGround = memo(function ReflectiveGround({ palette }: { palette: string[] }) {
  const groundColor = useMemo(() => {
    const color = new THREE.Color(palette[0]);
    color.multiplyScalar(0.1);
    return color;
  }, [palette]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]}>
      <planeGeometry args={[20, 20]} />
      <MeshReflectorMaterial
        blur={[400, 100]}
        resolution={1024}
        mixBlur={1}
        mixStrength={0.5}
        depthScale={1}
        minDepthThreshold={0.85}
        color={groundColor}
        metalness={0.6}
        roughness={0.4}
        mirror={0.5}
      />
    </mesh>
  );
});

// Scene with fog and lighting
function ColorFlowScene({ palette }: { palette: string[] }) {
  useAudioAnalyser(true);

  const bgColor = useMemo(() => {
    const color = new THREE.Color(palette[0]);
    color.multiplyScalar(0.05);
    return color;
  }, [palette]);

  const fogColor = useMemo(() => {
    const color = new THREE.Color(palette[0]);
    color.multiplyScalar(0.1);
    return color;
  }, [palette]);

  return (
    <>
      <color attach="background" args={[bgColor]} />
      <fog attach="fog" args={[fogColor, 5, 15]} />

      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={1} color={palette[0]} />
      <pointLight position={[-5, 3, -5]} intensity={0.8} color={palette[1] || palette[0]} />
      <pointLight position={[0, -2, 0]} intensity={0.5} color={palette[2] || palette[0]} />

      <EnergyCore palette={palette} />
      <GlowingRings palette={palette} />
      <FlowParticles palette={palette} />
      <ReflectiveGround palette={palette} />

      {/* Post-processing */}
      <AudioReactiveEffects
        enableBloom
        enableVignette
        bloomIntensity={1.5}
        bloomThreshold={0.4}
        vignetteIntensity={0.4}
      />
    </>
  );
}

export function ColorFlow({ artworkUrl }: VisualizerProps) {
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);

  useEffect(() => {
    if (artworkUrl) {
      extractPalette(artworkUrl, 5).then(setPalette);
    } else {
      setPalette(DEFAULT_PALETTE);
    }
  }, [artworkUrl]);

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 2, 8], fov: 50 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <ColorFlowScene palette={palette} />
      </Canvas>
    </div>
  );
}

// Register the visualizer
registerVisualizer(
  {
    id: 'color-flow',
    name: 'Color Flow',
    description: 'Enhanced flowing particles with reflections',
    usesMetadata: true,
  },
  ColorFlow
);
