/**
 * Color Flow Visualizer.
 *
 * Flowing particles using colors extracted from album artwork.
 */
import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioAnalyser } from '../../../hooks/useAudioAnalyser';
import { extractPalette } from '../../../utils/colorExtraction';
import { registerVisualizer, type VisualizerProps } from '../types';

const DEFAULT_PALETTE = ['#4a00e0', '#8e2de2', '#00ffff', '#ff00ff', '#ffff00'];

function FlowingParticles({ palette }: { palette: string[] }) {
  const pointsRef = useRef<THREE.Points>(null);
  const audioData = useAudioAnalyser(true);
  const timeRef = useRef(0);

  const { positions, colors, velocities } = useMemo(() => {
    const count = 1000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Random starting positions
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 5;

      // Random velocities
      velocities[i * 3] = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;

      // Use palette colors
      const colorIndex = Math.floor(Math.random() * palette.length);
      const color = new THREE.Color(palette[colorIndex]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    return { positions, colors, velocities };
  }, [palette]);

  useFrame((_, delta) => {
    if (!pointsRef.current || !audioData) return;

    timeRef.current += delta;
    const { bass, mid, treble } = audioData;

    const posAttr = pointsRef.current.geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;

    for (let i = 0; i < posArray.length / 3; i++) {
      const idx = i * 3;

      // Apply velocities with audio influence
      posArray[idx] += velocities[idx] * (1 + bass * 2);
      posArray[idx + 1] += velocities[idx + 1] * (1 + mid * 2);
      posArray[idx + 2] += velocities[idx + 2] * (1 + treble);

      // Add sine wave motion
      posArray[idx] += Math.sin(timeRef.current + i * 0.1) * 0.01 * bass;
      posArray[idx + 1] += Math.cos(timeRef.current + i * 0.1) * 0.01 * mid;

      // Wrap around boundaries
      if (posArray[idx] > 5) posArray[idx] = -5;
      if (posArray[idx] < -5) posArray[idx] = 5;
      if (posArray[idx + 1] > 5) posArray[idx + 1] = -5;
      if (posArray[idx + 1] < -5) posArray[idx + 1] = 5;
      if (posArray[idx + 2] > 3) posArray[idx + 2] = -3;
      if (posArray[idx + 2] < -3) posArray[idx + 2] = 3;
    }

    posAttr.needsUpdate = true;

    // Rotate the whole system
    pointsRef.current.rotation.z += 0.001 + bass * 0.005;

    // Pulse size based on audio
    const material = pointsRef.current.material as THREE.PointsMaterial;
    material.size = 0.05 + bass * 0.1;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function FlowingRings({ palette }: { palette: string[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const audioData = useAudioAnalyser(true);

  useFrame(() => {
    if (!groupRef.current || !audioData) return;

    const { bass, mid, treble } = audioData;

    // Rotate rings based on audio
    groupRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      mesh.rotation.x += 0.005 + (i % 2 === 0 ? bass : treble) * 0.02;
      mesh.rotation.y += 0.003 + mid * 0.01;

      // Pulse scale
      const scale = 1 + bass * 0.2;
      mesh.scale.setScalar(scale);
    });
  });

  return (
    <group ref={groupRef}>
      {palette.map((color, i) => (
        <mesh key={i} rotation={[i * 0.3, i * 0.5, 0]}>
          <torusGeometry args={[1.5 + i * 0.3, 0.02, 16, 100]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

function ColorFlowScene({ palette }: { palette: string[] }) {
  const bgColor = useMemo(() => {
    // Use darkened version of first palette color for background
    const color = new THREE.Color(palette[0]);
    color.multiplyScalar(0.1);
    return '#' + color.getHexString();
  }, [palette]);

  return (
    <>
      <color attach="background" args={[bgColor]} />
      <FlowingParticles palette={palette} />
      <FlowingRings palette={palette} />
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
        camera={{ position: [0, 0, 6], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
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
    description: 'Flowing particles using album art colors',
    usesMetadata: true,
  },
  ColorFlow
);
