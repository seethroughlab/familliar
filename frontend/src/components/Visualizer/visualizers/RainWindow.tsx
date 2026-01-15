/**
 * Rain Window Visualizer.
 *
 * Simulates looking through a rain-covered window at soft, blurry lights.
 * Perfect for slow, ambient, or melancholic music.
 */
import { useRef, useEffect } from 'react';
import { useAudioAnalyser } from '../../../hooks/useAudioAnalyser';
import { useArtworkPalette } from '../hooks/useArtworkPalette';
import { registerVisualizer, type VisualizerProps } from '../types';

// ============================================================================
// Droplet Physics
// ============================================================================

interface Droplet {
  x: number;
  y: number;
  radius: number;
  velocityY: number;
  velocityX: number;
  trail: Array<{ x: number; y: number; age: number }>;
  opacity: number;
}

function createDroplet(canvasWidth: number): Droplet {
  const radius = 2 + Math.random() * 4;
  return {
    x: Math.random() * canvasWidth,
    y: -radius * 2,
    radius,
    velocityY: 0.3 + Math.random() * 0.7, // Slow fall
    velocityX: (Math.random() - 0.5) * 0.3, // Slight horizontal drift
    trail: [],
    opacity: 0.4 + Math.random() * 0.4,
  };
}

function updateDroplet(droplet: Droplet, canvasHeight: number): boolean {
  // Apply gravity (very gentle)
  droplet.velocityY += 0.02;
  droplet.velocityY = Math.min(droplet.velocityY, 3); // Terminal velocity

  // Apply slight friction on glass
  droplet.velocityX *= 0.99;

  // Store trail point
  droplet.trail.push({
    x: droplet.x,
    y: droplet.y,
    age: 0,
  });

  // Age trail points and remove old ones
  droplet.trail = droplet.trail
    .map((p) => ({ ...p, age: p.age + 1 }))
    .filter((p) => p.age < 30); // Trail persists for ~30 frames

  // Update position
  droplet.x += droplet.velocityX;
  droplet.y += droplet.velocityY;

  // Return false if droplet is off screen
  return droplet.y < canvasHeight + droplet.radius * 2;
}

function drawDroplet(
  ctx: CanvasRenderingContext2D,
  droplet: Droplet,
  glassColor: string
) {
  // Draw trail
  if (droplet.trail.length > 1) {
    ctx.beginPath();
    ctx.moveTo(droplet.trail[0].x, droplet.trail[0].y);

    for (let i = 1; i < droplet.trail.length; i++) {
      const point = droplet.trail[i];
      const alpha = (1 - point.age / 30) * droplet.opacity * 0.3;
      ctx.lineTo(point.x, point.y);
    }

    ctx.strokeStyle = `rgba(200, 220, 255, ${droplet.opacity * 0.2})`;
    ctx.lineWidth = droplet.radius * 0.8;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Draw droplet body with refraction effect
  const gradient = ctx.createRadialGradient(
    droplet.x - droplet.radius * 0.3,
    droplet.y - droplet.radius * 0.3,
    0,
    droplet.x,
    droplet.y,
    droplet.radius
  );

  gradient.addColorStop(0, `rgba(255, 255, 255, ${droplet.opacity * 0.8})`);
  gradient.addColorStop(0.5, `rgba(200, 220, 255, ${droplet.opacity * 0.4})`);
  gradient.addColorStop(1, `rgba(150, 180, 220, ${droplet.opacity * 0.1})`);

  ctx.beginPath();
  ctx.arc(droplet.x, droplet.y, droplet.radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(
    droplet.x - droplet.radius * 0.3,
    droplet.y - droplet.radius * 0.3,
    droplet.radius * 0.3,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = `rgba(255, 255, 255, ${droplet.opacity * 0.6})`;
  ctx.fill();
}

// ============================================================================
// Bokeh Background
// ============================================================================

interface BokehCircle {
  x: number;
  y: number;
  radius: number;
  color: string;
  velocityX: number;
  velocityY: number;
  phase: number;
  brightness: number;
}

function createBokeh(
  canvasWidth: number,
  canvasHeight: number,
  colors: string[]
): BokehCircle {
  return {
    x: Math.random() * canvasWidth,
    y: Math.random() * canvasHeight,
    radius: 30 + Math.random() * 80,
    color: colors[Math.floor(Math.random() * colors.length)],
    velocityX: (Math.random() - 0.5) * 0.2,
    velocityY: (Math.random() - 0.5) * 0.2,
    phase: Math.random() * Math.PI * 2,
    brightness: 0.3 + Math.random() * 0.4,
  };
}

function updateBokeh(
  bokeh: BokehCircle,
  canvasWidth: number,
  canvasHeight: number,
  time: number
) {
  // Very slow drift
  bokeh.x += bokeh.velocityX;
  bokeh.y += bokeh.velocityY;

  // Gentle pulsing
  bokeh.brightness = 0.3 + Math.sin(time * 0.5 + bokeh.phase) * 0.15;

  // Wrap around edges
  if (bokeh.x < -bokeh.radius) bokeh.x = canvasWidth + bokeh.radius;
  if (bokeh.x > canvasWidth + bokeh.radius) bokeh.x = -bokeh.radius;
  if (bokeh.y < -bokeh.radius) bokeh.y = canvasHeight + bokeh.radius;
  if (bokeh.y > canvasHeight + bokeh.radius) bokeh.y = -bokeh.radius;
}

function drawBokeh(
  ctx: CanvasRenderingContext2D,
  bokeh: BokehCircle,
  bassBoost: number
) {
  const brightness = bokeh.brightness + bassBoost * 0.2;

  // Create soft gradient for bokeh effect
  const gradient = ctx.createRadialGradient(
    bokeh.x,
    bokeh.y,
    0,
    bokeh.x,
    bokeh.y,
    bokeh.radius
  );

  // Parse hex color and create rgba
  const hex = bokeh.color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${brightness * 0.6})`);
  gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${brightness * 0.3})`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.beginPath();
  ctx.arc(bokeh.x, bokeh.y, bokeh.radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

// ============================================================================
// Main Component
// ============================================================================

export function RainWindow({ artworkUrl }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioData = useAudioAnalyser(true);
  const palette = useArtworkPalette(artworkUrl);

  const animationRef = useRef<number | undefined>(undefined);
  const dropletsRef = useRef<Droplet[]>([]);
  const bokehRef = useRef<BokehCircle[]>([]);
  const timeRef = useRef(0);
  const smoothedBassRef = useRef(0);
  const lastSpawnRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      // Reinitialize bokeh on resize
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      bokehRef.current = Array.from({ length: 12 }, () =>
        createBokeh(width, height, palette)
      );
    };

    resize();
    window.addEventListener('resize', resize);

    // Initialize bokeh circles
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    bokehRef.current = Array.from({ length: 12 }, () =>
      createBokeh(width, height, palette)
    );

    const animate = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;

      // Get audio data with heavy smoothing
      const bass = audioData?.bass || 0;
      smoothedBassRef.current += (bass - smoothedBassRef.current) * 0.03;
      const smoothedBass = smoothedBassRef.current;

      timeRef.current += 0.016;

      // Dark blue-gray background (like night through window)
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
      bgGradient.addColorStop(0, '#0a1020');
      bgGradient.addColorStop(0.5, '#0d1525');
      bgGradient.addColorStop(1, '#081018');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Draw bokeh (background lights)
      bokehRef.current.forEach((bokeh) => {
        updateBokeh(bokeh, width, height, timeRef.current);
        drawBokeh(ctx, bokeh, smoothedBass);
      });

      // Apply blur effect to background (simulates out-of-focus)
      // We achieve this by drawing with low opacity multiple times
      ctx.fillStyle = 'rgba(10, 16, 32, 0.1)';
      ctx.fillRect(0, 0, width, height);

      // Spawn new droplets (rate slightly affected by bass)
      const spawnRate = 0.02 + smoothedBass * 0.02; // 1-2 per second base
      if (Math.random() < spawnRate) {
        dropletsRef.current.push(createDroplet(width));
      }

      // Update and draw droplets
      dropletsRef.current = dropletsRef.current.filter((droplet) => {
        const alive = updateDroplet(droplet, height);
        if (alive) {
          drawDroplet(ctx, droplet, '#1a2030');
        }
        return alive;
      });

      // Limit droplet count for performance
      if (dropletsRef.current.length > 100) {
        dropletsRef.current = dropletsRef.current.slice(-100);
      }

      // Subtle glass condensation effect at edges
      const edgeGradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.3,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.8
      );
      edgeGradient.addColorStop(0, 'rgba(20, 30, 50, 0)');
      edgeGradient.addColorStop(1, 'rgba(20, 30, 50, 0.3)');
      ctx.fillStyle = edgeGradient;
      ctx.fillRect(0, 0, width, height);

      // Occasional "flash" effect from passing lights (bass-triggered)
      if (smoothedBass > 0.6 && Math.random() < 0.02) {
        ctx.fillStyle = `rgba(255, 250, 240, ${(smoothedBass - 0.5) * 0.1})`;
        ctx.fillRect(0, 0, width, height);
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
  }, [audioData, palette]);

  return (
    <div className="w-full h-full bg-[#0a1020]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

// Register the visualizer
registerVisualizer(
  {
    id: 'rain-window',
    name: 'Rain Window',
    description: 'Peaceful rain on glass with soft bokeh lights',
    usesMetadata: true,
  },
  RainWindow
);
