/**
 * Frequency Bars Visualizer - Enhanced spectrum analyzer.
 *
 * Features:
 * - 128 frequency bars with gradient colors
 * - Reflective floor effect
 * - Atmospheric fog
 * - Smooth animations
 */
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioAnalyser, getAudioData } from '../../../hooks/useAudioAnalyser';
import { registerVisualizer, type VisualizerProps } from '../types';
import { AudioReactiveEffects } from '../effects/AudioReactiveEffects';

function FrequencyBarsScene() {
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const timeRef = useRef(0);

  useAudioAnalyser(true);

  const barCount = 128;
  const barWidth = 0.06;
  const spacing = 0.015;
  const totalWidth = barCount * (barWidth + spacing);

  // Create geometry once
  const geometry = useMemo(() => new THREE.BoxGeometry(barWidth, 1, barWidth), []);

  // Create materials with gradient colors
  const materials = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => {
      const t = i / barCount;
      // Gradient from cyan through purple to pink
      const hue = 0.5 + t * 0.4;
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue, 0.8, 0.5),
        emissive: new THREE.Color().setHSL(hue, 0.9, 0.25),
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.4,
      });
    });
  }, []);

  useFrame((_, delta) => {
    timeRef.current += delta;

    if (!meshesRef.current.length) return;

    const audioData = getAudioData();
    const frequencyData = audioData?.frequencyData;
    const bass = audioData?.bass ?? 0;
    const step = frequencyData ? Math.floor(frequencyData.length / barCount) : 1;

    meshesRef.current.forEach((mesh, i) => {
      if (!mesh) return;

      let value: number;
      if (frequencyData) {
        const dataIndex = Math.min(i * step, frequencyData.length - 1);
        value = frequencyData[dataIndex] / 255;
      } else {
        // Fallback wave animation
        value = (Math.sin(timeRef.current * 3 + i * 0.15) + 1) / 2;
      }

      const targetHeight = 0.1 + value * 4;
      mesh.scale.y = THREE.MathUtils.lerp(mesh.scale.y, targetHeight, 0.25);
      mesh.position.y = mesh.scale.y / 2 - 1;

      // Update emissive intensity based on value
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.3 + value * 0.7 + bass * 0.3;
    });
  });

  return (
    <>
      <color attach="background" args={['#050510']} />
      <fog attach="fog" args={['#050510', 5, 15]} />

      <ambientLight intensity={0.2} />
      <pointLight position={[5, 5, 5]} intensity={1} color="#a855f7" />
      <pointLight position={[-5, 3, -5]} intensity={0.8} color="#06b6d4" />
      <spotLight
        position={[0, 8, 0]}
        angle={0.5}
        penumbra={0.5}
        intensity={1}
        color="#ffffff"
      />

      {/* Reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial
          color="#0a0015"
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>

      {/* Frequency bars */}
      <group>
        {Array.from({ length: barCount }, (_, i) => (
          <mesh
            key={i}
            ref={(el) => { if (el) meshesRef.current[i] = el; }}
            geometry={geometry}
            material={materials[i]}
            position={[i * (barWidth + spacing) - totalWidth / 2, 0, 0]}
          />
        ))}
      </group>

      {/* Post-processing effects */}
      <AudioReactiveEffects
        enableBloom
        enableVignette
        bloomIntensity={0.8}
        bloomThreshold={0.85}
        vignetteIntensity={0.3}
      />
    </>
  );
}

export function FrequencyBars(_props: VisualizerProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 2, 6], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <FrequencyBarsScene />
      </Canvas>
    </div>
  );
}

// Register the visualizer
registerVisualizer(
  {
    id: 'frequency-bars',
    name: 'Frequency Bars',
    description: 'Enhanced spectrum analyzer with 128 bars',
    usesMetadata: false,
  },
  FrequencyBars
);
