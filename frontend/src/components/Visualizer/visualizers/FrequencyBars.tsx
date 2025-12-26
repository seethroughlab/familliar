/**
 * Frequency Bars Visualizer - Classic spectrum analyzer.
 */
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioAnalyser } from '../../../hooks/useAudioAnalyser';
import { registerVisualizer, type VisualizerProps } from '../types';

function FrequencyBarsScene() {
  const groupRef = useRef<THREE.Group>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const audioData = useAudioAnalyser(true);

  const barCount = 64;
  const barWidth = 0.1;
  const spacing = 0.02;
  const totalWidth = barCount * (barWidth + spacing);

  // Create geometry and materials once
  const geometry = useMemo(() => new THREE.BoxGeometry(barWidth, 1, barWidth), []);
  const materials = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => {
      const hue = (i / barCount) * 0.3 + 0.5; // Blue to purple gradient
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue, 0.8, 0.5),
        emissive: new THREE.Color().setHSL(hue, 0.8, 0.3),
        emissiveIntensity: 0.5,
      });
    });
  }, []);

  useFrame(() => {
    if (!audioData || !meshesRef.current.length) return;

    const { frequencyData } = audioData;
    const step = Math.floor(frequencyData.length / barCount);

    meshesRef.current.forEach((mesh, i) => {
      const dataIndex = i * step;
      const value = frequencyData[dataIndex] / 255;
      const targetHeight = 0.1 + value * 4;

      // Smooth animation
      mesh.scale.y = THREE.MathUtils.lerp(mesh.scale.y, targetHeight, 0.3);
      mesh.position.y = mesh.scale.y / 2;

      // Update emissive based on intensity
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.3 + value * 0.7;
    });
  });

  return (
    <>
      <color attach="background" args={['#0a0015']} />
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, 5]} intensity={0.5} color="#4a00e0" />

      <group ref={groupRef} position={[-totalWidth / 2, -1, 0]}>
        {Array.from({ length: barCount }, (_, i) => (
          <mesh
            key={i}
            ref={(el) => { if (el) meshesRef.current[i] = el; }}
            geometry={geometry}
            material={materials[i]}
            position={[i * (barWidth + spacing), 0.5, 0]}
          />
        ))}
      </group>
    </>
  );
}

export function FrequencyBars(_props: VisualizerProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 1, 5], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
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
    description: 'Classic spectrum analyzer with 64 bars',
    usesMetadata: false,
  },
  FrequencyBars
);
