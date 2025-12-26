/**
 * Album Art Kaleidoscope Visualizer.
 *
 * Creates a kaleidoscope effect using album artwork segments.
 */
import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioAnalyser } from '../../../hooks/useAudioAnalyser';
import { registerVisualizer, type VisualizerProps } from '../types';

// Number of segments in the kaleidoscope
const SEGMENTS = 12;

function KaleidoscopeSegment({
  texture,
  index,
  audioData,
}: {
  texture: THREE.Texture;
  index: number;
  audioData: ReturnType<typeof useAudioAnalyser>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const angle = (index / SEGMENTS) * Math.PI * 2;
  const isFlipped = index % 2 === 1;

  useFrame(() => {
    if (!meshRef.current || !audioData) return;

    const { bass, mid } = audioData;

    // Pulse scale with bass
    const scale = 1 + bass * 0.2;
    meshRef.current.scale.setScalar(scale);

    // Subtle rotation with mid frequencies
    meshRef.current.rotation.z = angle + mid * 0.1;
  });

  // Create a pie-slice shaped geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const sliceAngle = (Math.PI * 2) / SEGMENTS;
    const radius = 3;

    // Triangle fan from center
    const vertices: number[] = [0, 0, 0]; // Center
    const uvs: number[] = [0.5, 0.5]; // Center UV

    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = -sliceAngle / 2 + t * sliceAngle;
      vertices.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);

      // Map UV to sample from center outward
      const u = 0.5 + Math.cos(a) * 0.5;
      const v = 0.5 + Math.sin(a) * 0.5;
      uvs.push(isFlipped ? 1 - u : u, v);
    }

    // Create triangles
    const indices: number[] = [];
    for (let i = 1; i <= steps; i++) {
      indices.push(0, i, i + 1);
    }

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    return geo;
  }, [isFlipped]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      rotation={[0, 0, angle]}
    >
      <meshBasicMaterial
        map={texture}
        side={THREE.DoubleSide}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function KaleidoscopeScene({ artworkUrl }: { artworkUrl: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const audioData = useAudioAnalyser(true);
  const texture = useLoader(THREE.TextureLoader, artworkUrl);

  useFrame(() => {
    if (!groupRef.current || !audioData) return;

    const { bass, treble } = audioData;

    // Rotate the whole kaleidoscope
    groupRef.current.rotation.z += 0.002 + bass * 0.01;

    // Subtle zoom effect
    const scale = 1 + treble * 0.1;
    groupRef.current.scale.setScalar(scale);
  });

  return (
    <>
      <color attach="background" args={['#000000']} />

      <group ref={groupRef}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <KaleidoscopeSegment
            key={i}
            texture={texture}
            index={i}
            audioData={audioData}
          />
        ))}
      </group>
    </>
  );
}

function FallbackScene() {
  const meshRef = useRef<THREE.Mesh>(null);
  const audioData = useAudioAnalyser(true);

  useFrame(() => {
    if (!meshRef.current || !audioData) return;
    meshRef.current.rotation.z += 0.01 + audioData.bass * 0.02;
  });

  return (
    <>
      <color attach="background" args={['#0a0015']} />
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[2, 2]} />
        <meshBasicMaterial color="#4a00e0" wireframe />
      </mesh>
    </>
  );
}

export function AlbumKaleidoscope({ artworkUrl }: VisualizerProps) {
  const [hasArtwork, setHasArtwork] = useState(false);

  useEffect(() => {
    if (artworkUrl) {
      // Verify the image loads
      const img = new Image();
      img.onload = () => setHasArtwork(true);
      img.onerror = () => setHasArtwork(false);
      img.src = artworkUrl;
    } else {
      setHasArtwork(false);
    }
  }, [artworkUrl]);

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
      >
        {hasArtwork && artworkUrl ? (
          <KaleidoscopeScene artworkUrl={artworkUrl} />
        ) : (
          <FallbackScene />
        )}
      </Canvas>
    </div>
  );
}

// Register the visualizer
registerVisualizer(
  {
    id: 'album-kaleidoscope',
    name: 'Album Kaleidoscope',
    description: 'Kaleidoscope effect using album artwork',
    usesMetadata: true,
  },
  AlbumKaleidoscope
);
