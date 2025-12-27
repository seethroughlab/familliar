/**
 * Lyric Storm Visualizer.
 *
 * Words from lyrics fly across the screen, pulse with the beat,
 * and form dynamic patterns synced to the music.
 */
import { useRef, useEffect, useMemo } from 'react';
import { useAudioAnalyser } from '../../../hooks/useAudioAnalyser';
import { registerVisualizer, type VisualizerProps } from '../types';

interface FloatingWord {
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  hue: number;
  rotation: number;
  rotationSpeed: number;
  life: number;
  maxLife: number;
  isCurrentLine: boolean;
}

export function LyricStorm({ lyrics, currentTime, track }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wordsRef = useRef<FloatingWord[]>([]);
  const lastLineIndexRef = useRef(-1);
  const audioData = useAudioAnalyser(true);

  // Extract all unique words from lyrics
  const allWords = useMemo(() => {
    if (!lyrics || lyrics.length === 0) {
      // Use track title and artist words as fallback
      const fallbackText = `${track?.title || ''} ${track?.artist || ''}`;
      return fallbackText.split(/\s+/).filter(w => w.length > 0);
    }
    const words: string[] = [];
    lyrics.forEach(line => {
      line.text.split(/\s+/).forEach(word => {
        const clean = word.replace(/[^\w']/g, '');
        if (clean.length > 1) words.push(clean);
      });
    });
    return [...new Set(words)];
  }, [lyrics, track]);

  // Find current line
  const currentLineData = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return { index: -1, words: [] };

    let idx = -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (lyrics[i].time <= currentTime) {
        idx = i;
        break;
      }
    }

    const lineWords = idx >= 0
      ? lyrics[idx].text.split(/\s+/).map(w => w.replace(/[^\w']/g, '')).filter(w => w.length > 0)
      : [];

    return { index: idx, words: lineWords };
  }, [lyrics, currentTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const resize = () => {
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Spawn words from current line when it changes
    if (currentLineData.index !== lastLineIndexRef.current && currentLineData.words.length > 0) {
      lastLineIndexRef.current = currentLineData.index;

      // Spawn current line words from center
      currentLineData.words.forEach((word, i) => {
        const angle = (i / currentLineData.words.length) * Math.PI * 2;
        const speed = 2 + Math.random() * 3;
        wordsRef.current.push({
          text: word,
          x: width / 2,
          y: height / 2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 24 + Math.random() * 32,
          opacity: 1,
          hue: 280 + Math.random() * 60,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.1,
          life: 0,
          maxLife: 180 + Math.random() * 60, // 3-4 seconds at 60fps
          isCurrentLine: true,
        });
      });
    }

    const animate = () => {
      const bass = audioData?.bass || 0;
      const mid = audioData?.mid || 0;
      const treble = audioData?.treble || 0;
      const intensity = (audioData?.averageFrequency || 0) / 255;

      // Clear with fade
      ctx.fillStyle = `rgba(5, 0, 15, 0.15)`;
      ctx.fillRect(0, 0, width, height);

      // Randomly spawn ambient words on beat
      if (bass > 0.7 && Math.random() < 0.3 && allWords.length > 0) {
        const word = allWords[Math.floor(Math.random() * allWords.length)];
        const edge = Math.floor(Math.random() * 4);
        let x, y, vx, vy;

        switch (edge) {
          case 0: // top
            x = Math.random() * width;
            y = -50;
            vx = (Math.random() - 0.5) * 2;
            vy = 1 + Math.random() * 2;
            break;
          case 1: // right
            x = width + 50;
            y = Math.random() * height;
            vx = -(1 + Math.random() * 2);
            vy = (Math.random() - 0.5) * 2;
            break;
          case 2: // bottom
            x = Math.random() * width;
            y = height + 50;
            vx = (Math.random() - 0.5) * 2;
            vy = -(1 + Math.random() * 2);
            break;
          default: // left
            x = -50;
            y = Math.random() * height;
            vx = 1 + Math.random() * 2;
            vy = (Math.random() - 0.5) * 2;
        }

        wordsRef.current.push({
          text: word,
          x, y, vx, vy,
          size: 16 + Math.random() * 20,
          opacity: 0.6,
          hue: 200 + Math.random() * 100,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.05,
          life: 0,
          maxLife: 300,
          isCurrentLine: false,
        });
      }

      // Update and draw words
      wordsRef.current = wordsRef.current.filter(word => {
        word.life++;

        // Physics
        word.x += word.vx * (1 + bass * 2);
        word.y += word.vy * (1 + bass * 2);
        word.rotation += word.rotationSpeed * (1 + mid);

        // Fade out
        const lifeRatio = word.life / word.maxLife;
        word.opacity = word.isCurrentLine
          ? Math.max(0, 1 - lifeRatio)
          : Math.max(0, 0.6 - lifeRatio * 0.6);

        // Remove dead or off-screen words
        if (word.life > word.maxLife) return false;
        if (word.x < -200 || word.x > width + 200 || word.y < -200 || word.y > height + 200) return false;

        // Draw
        ctx.save();
        ctx.translate(word.x, word.y);
        ctx.rotate(word.rotation);

        const pulseSize = word.size * (1 + bass * 0.3);
        const glowAmount = word.isCurrentLine ? 20 + intensity * 30 : 5 + intensity * 10;

        ctx.font = `bold ${pulseSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow effect
        ctx.shadowColor = `hsla(${word.hue}, 100%, 60%, ${word.opacity})`;
        ctx.shadowBlur = glowAmount;

        // Text color
        const lightness = 50 + treble * 30;
        ctx.fillStyle = `hsla(${word.hue}, 80%, ${lightness}%, ${word.opacity})`;
        ctx.fillText(word.text, 0, 0);

        ctx.restore();

        return true;
      });

      // Draw current line prominently in center
      if (currentLineData.words.length > 0 && lyrics && lyrics[currentLineData.index]) {
        const currentText = lyrics[currentLineData.index].text;
        const centerY = height / 2;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const mainSize = 48 + bass * 20;
        ctx.font = `bold ${mainSize}px system-ui, -apple-system, sans-serif`;

        // Strong glow
        ctx.shadowColor = `hsla(280, 100%, 60%, 0.8)`;
        ctx.shadowBlur = 30 + intensity * 50;
        ctx.fillStyle = `hsla(280, 80%, ${70 + intensity * 20}%, 0.9)`;

        ctx.fillText(currentText, width / 2, centerY);
        ctx.restore();
      }

      // Frequency visualization at bottom
      if (audioData?.frequencyData) {
        const barCount = 64;
        const barWidth = width / barCount;

        for (let i = 0; i < barCount; i++) {
          const value = audioData.frequencyData[i * 2] / 255;
          const barHeight = value * 80;
          const hue = 260 + (i / barCount) * 60;

          ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.4)`;
          ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [audioData, allWords, currentLineData, lyrics]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full bg-[#050010]"
      style={{ display: 'block' }}
    />
  );
}

// Register the visualizer
registerVisualizer(
  {
    id: 'lyric-storm',
    name: 'Lyric Storm',
    description: 'Words from lyrics fly and pulse with the beat',
    usesMetadata: true,
  },
  LyricStorm
);
