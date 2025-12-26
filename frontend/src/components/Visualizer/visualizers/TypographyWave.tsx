/**
 * Typography Wave Visualizer.
 *
 * Artist and title text with wave distortion and audio-reactive scaling.
 */
import { useRef, useEffect } from 'react';
import { useAudioAnalyser } from '../../../hooks/useAudioAnalyser';
import { registerVisualizer, type VisualizerProps } from '../types';

export function TypographyWave({ track }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioData = useAudioAnalyser(true);
  const animationRef = useRef<number | undefined>(undefined);
  const timeRef = useRef(0);

  const title = track?.title || 'Unknown Title';
  const artist = track?.artist || 'Unknown Artist';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;

      // Clear canvas
      ctx.fillStyle = '#0a0015';
      ctx.fillRect(0, 0, width, height);

      // Get audio data
      const bass = audioData?.bass || 0;
      const mid = audioData?.mid || 0;
      const treble = audioData?.treble || 0;
      const frequencyData = audioData?.frequencyData;

      timeRef.current += 0.016; // ~60fps

      // Draw title with wave effect
      const titleSize = 48 + bass * 20;
      ctx.font = `bold ${titleSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Draw each character with wave offset
      const titleChars = title.split('');
      const titleWidth = ctx.measureText(title).width;
      let xOffset = (width - titleWidth) / 2;

      titleChars.forEach((char, i) => {
        const charWidth = ctx.measureText(char).width;
        const waveOffset = Math.sin(timeRef.current * 2 + i * 0.3) * (10 + bass * 20);
        const freqIndex = frequencyData
          ? Math.floor((i / titleChars.length) * frequencyData.length)
          : 0;
        const freqValue = frequencyData ? frequencyData[freqIndex] / 255 : 0;

        // Color based on frequency
        const hue = 260 + freqValue * 60; // Purple to cyan
        const lightness = 50 + freqValue * 30;
        ctx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;

        // Add glow
        ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
        ctx.shadowBlur = 10 + bass * 20;

        ctx.fillText(char, xOffset + charWidth / 2, height * 0.4 + waveOffset);
        xOffset += charWidth;
      });

      // Draw artist with subtler effect
      const artistSize = 28 + mid * 10;
      ctx.font = `${artistSize}px system-ui, -apple-system, sans-serif`;
      ctx.shadowBlur = 5 + mid * 10;

      const artistChars = artist.split('');
      const artistWidth = ctx.measureText(artist).width;
      xOffset = (width - artistWidth) / 2;

      artistChars.forEach((char, i) => {
        const charWidth = ctx.measureText(char).width;
        const waveOffset = Math.sin(timeRef.current * 1.5 + i * 0.2 + Math.PI) * (5 + mid * 10);

        const hue = 180 + i * 5; // Cyan range
        ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
        ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;

        ctx.fillText(char, xOffset + charWidth / 2, height * 0.6 + waveOffset);
        xOffset += charWidth;
      });

      // Reset shadow for next frame
      ctx.shadowBlur = 0;

      // Draw frequency bars at bottom
      if (frequencyData) {
        const barCount = 32;
        const barWidth = width / barCount;
        const step = Math.floor(frequencyData.length / barCount);

        for (let i = 0; i < barCount; i++) {
          const value = frequencyData[i * step] / 255;
          const barHeight = value * 60;
          const hue = 260 + (i / barCount) * 60;

          ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.5)`;
          ctx.fillRect(
            i * barWidth,
            height - barHeight,
            barWidth - 2,
            barHeight
          );
        }
      }

      // Draw ambient particles
      const particleCount = 20;
      for (let i = 0; i < particleCount; i++) {
        const x = ((timeRef.current * 20 + i * 100) % width);
        const y = height * 0.3 + Math.sin(timeRef.current + i) * 100;
        const size = 2 + treble * 5;
        const alpha = 0.3 + treble * 0.5;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [title, artist, audioData]);

  return (
    <div className="w-full h-full bg-[#0a0015]">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  );
}

// Register the visualizer
registerVisualizer(
  {
    id: 'typography-wave',
    name: 'Typography Wave',
    description: 'Artist and title with wave effects',
    usesMetadata: true,
  },
  TypographyWave
);
