import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAudioAnalyser } from '../../hooks/useAudioAnalyser';

// Frequency bars visualization
function FrequencyBars() {
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
    <group ref={groupRef} position={[-totalWidth / 2, 0, 0]}>
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
  );
}

// Circular waveform visualization
function CircularWaveform() {
  const meshRef = useRef<THREE.Mesh>(null);
  const audioData = useAudioAnalyser(true);

  const geometry = useMemo(() => {
    const segments = 128;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(segments * 3);
    const indices: number[] = [];

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * 2;
      positions[i * 3 + 1] = Math.sin(angle) * 2;
      positions[i * 3 + 2] = 0;

      if (i < segments - 1) {
        indices.push(i, i + 1);
      } else {
        indices.push(i, 0);
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
  }, []);

  useFrame(() => {
    if (!audioData || !meshRef.current) return;

    const positions = meshRef.current.geometry.attributes.position;
    const { frequencyData, bass } = audioData;
    const segments = positions.count;

    for (let i = 0; i < segments; i++) {
      const dataIndex = Math.floor((i / segments) * frequencyData.length);
      const value = frequencyData[dataIndex] / 255;
      const angle = (i / segments) * Math.PI * 2;
      const radius = 1.5 + value * 1.5 + bass * 0.5;

      positions.setXY(i, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    positions.needsUpdate = true;

    // Rotate based on bass
    meshRef.current.rotation.z += 0.002 + bass * 0.01;
  });

  return (
    <lineSegments ref={meshRef} geometry={geometry}>
      <lineBasicMaterial color="#00ffff" linewidth={2} />
    </lineSegments>
  );
}

// Central orb that reacts to audio
function ReactiveOrb() {
  const meshRef = useRef<THREE.Mesh>(null);
  const audioData = useAudioAnalyser(true);

  useFrame(() => {
    if (!audioData || !meshRef.current) return;

    const { bass, mid, treble, averageFrequency } = audioData;
    const intensity = averageFrequency / 255;

    // Scale based on bass
    const targetScale = 1 + bass * 0.5;
    meshRef.current.scale.setScalar(
      THREE.MathUtils.lerp(meshRef.current.scale.x, targetScale, 0.1)
    );

    // Rotate based on mid frequencies
    meshRef.current.rotation.x += 0.01 + mid * 0.02;
    meshRef.current.rotation.y += 0.015 + treble * 0.02;

    // Update material
    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = 0.3 + intensity * 0.7;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[0.8, 2]} />
      <meshStandardMaterial
        color="#4a00e0"
        emissive="#8e2de2"
        emissiveIntensity={0.5}
        wireframe
      />
    </mesh>
  );
}

// Particle field
function ParticleField() {
  const pointsRef = useRef<THREE.Points>(null);
  const audioData = useAudioAnalyser(true);

  const { positions, colors } = useMemo(() => {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Distribute in a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 3 + Math.random() * 2;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Random colors in blue-purple range
      const hue = 0.6 + Math.random() * 0.2;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    return { positions, colors };
  }, []);

  useFrame(() => {
    if (!audioData || !pointsRef.current) return;

    const { bass, treble } = audioData;

    // Rotate the entire field
    pointsRef.current.rotation.y += 0.001 + bass * 0.005;
    pointsRef.current.rotation.x += 0.0005 + treble * 0.002;

    // Pulse size based on bass
    const material = pointsRef.current.material as THREE.PointsMaterial;
    material.size = 0.03 + bass * 0.05;
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
        size={0.05}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

// Background gradient plane
function BackgroundGradient() {
  const audioData = useAudioAnalyser(true);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!audioData || !meshRef.current) return;

    const { bass } = audioData;
    const material = meshRef.current.material as THREE.MeshBasicMaterial;

    // Subtle color shift based on bass
    const hue = 0.7 + bass * 0.1;
    material.color.setHSL(hue, 0.3, 0.05 + bass * 0.02);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -10]}>
      <planeGeometry args={[50, 50]} />
      <meshBasicMaterial color="#0a0015" />
    </mesh>
  );
}

interface AudioVisualizerProps {
  mode?: 'bars' | 'orb' | 'combined';
  className?: string;
}

export function AudioVisualizer({ mode = 'combined', className = '' }: AudioVisualizerProps) {
  return (
    <div className={`w-full h-full ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#0a0015']} />
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, 5]} intensity={0.5} color="#4a00e0" />

        {mode === 'bars' && <FrequencyBars />}
        {mode === 'orb' && (
          <>
            <ReactiveOrb />
            <CircularWaveform />
          </>
        )}
        {mode === 'combined' && (
          <>
            <ReactiveOrb />
            <CircularWaveform />
            <ParticleField />
          </>
        )}

        <BackgroundGradient />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.5}
          maxPolarAngle={Math.PI / 1.5}
          minPolarAngle={Math.PI / 3}
        />
      </Canvas>
    </div>
  );
}
