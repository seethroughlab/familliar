/**
 * Non-Places Visualizer.
 *
 * Inspired by the game "Islands: Non-Places" - surreal parallax layers
 * of silhouetted mundane objects drifting through fog.
 * Perfect for ambient, electronic, or dreamlike music.
 */
import { useRef, useEffect } from 'react';
import { useAudioAnalyser } from '../../../hooks/useAudioAnalyser';
import { useArtworkPalette } from '../hooks/useArtworkPalette';
import { registerVisualizer, type VisualizerProps } from '../types';

// ============================================================================
// Types
// ============================================================================

type ShapeType =
  | 'chair'
  | 'lamp'
  | 'plant'
  | 'escalator'
  | 'sign'
  | 'ring'
  | 'cube'
  | 'pillar';

interface Silhouette {
  type: ShapeType;
  x: number;
  baseY: number;
  scale: number;
  bobPhase: number;
  bobAmount: number;
  hasGlow: boolean;
  glowPhase: number;
}

interface Layer {
  depth: number; // 0 = closest, 1 = farthest
  speed: number;
  silhouettes: Silhouette[];
  yOffset: number;
}

// ============================================================================
// Shape Drawing Functions
// ============================================================================

function drawChair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Seat
  ctx.fillRect(-20, -5, 40, 8);
  // Back
  ctx.fillRect(-18, -35, 6, 30);
  ctx.fillRect(12, -35, 6, 30);
  ctx.fillRect(-18, -38, 36, 6);
  // Legs
  ctx.fillRect(-18, 3, 5, 20);
  ctx.fillRect(13, 3, 5, 20);

  ctx.restore();
}

function drawLamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  glowIntensity: number,
  glowColor: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Draw glow first (behind shade)
  if (glowIntensity > 0) {
    const gradient = ctx.createRadialGradient(0, -45, 0, 0, -45, 40);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(0.5, glowColor.replace('1)', `${glowIntensity * 0.3})`));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, -45, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shade (trapezoid)
  ctx.beginPath();
  ctx.moveTo(-20, -60);
  ctx.lineTo(20, -60);
  ctx.lineTo(15, -30);
  ctx.lineTo(-15, -30);
  ctx.closePath();
  ctx.fill();

  // Pole
  ctx.fillRect(-3, -30, 6, 50);

  // Base
  ctx.beginPath();
  ctx.ellipse(0, 20, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Pot
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(-20, 25);
  ctx.lineTo(20, 25);
  ctx.lineTo(15, 0);
  ctx.closePath();
  ctx.fill();

  // Leaves (palm-like fronds)
  const drawFrond = (angle: number, length: number) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(length * 0.3, -length * 0.5, length, -length * 0.2);
    ctx.quadraticCurveTo(length * 0.5, -length * 0.3, 0, 0);
    ctx.fill();
    ctx.restore();
  };

  ctx.translate(0, -5);
  drawFrond(-0.8, 50);
  drawFrond(-0.3, 55);
  drawFrond(0.2, 52);
  drawFrond(0.7, 48);
  drawFrond(-1.2, 40);
  drawFrond(1.1, 42);

  ctx.restore();
}

function drawEscalator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Main body (diagonal)
  ctx.beginPath();
  ctx.moveTo(-40, 30);
  ctx.lineTo(-30, 30);
  ctx.lineTo(40, -40);
  ctx.lineTo(40, -50);
  ctx.lineTo(-40, 20);
  ctx.closePath();
  ctx.fill();

  // Steps (lines)
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const sx = -35 + t * 70;
    const sy = 25 - t * 70;
    ctx.fillRect(sx, sy, 12, 3);
  }

  // Handrails
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-42, 15);
  ctx.lineTo(38, -55);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-28, 35);
  ctx.lineTo(52, -35);
  ctx.stroke();

  ctx.restore();
}

function drawSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Pole
  ctx.fillRect(-3, -20, 6, 60);

  // Diamond sign
  ctx.save();
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-20, -20, 40, 40);
  ctx.restore();

  // Small rectangle on top
  ctx.fillRect(-8, -55, 16, 12);

  ctx.restore();
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  glowIntensity: number,
  glowColor: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Outer glow
  if (glowIntensity > 0) {
    const gradient = ctx.createRadialGradient(0, 0, 25, 0, 0, 60);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(0.5, glowColor.replace('1)', `${glowIntensity * 0.4})`));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 60, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ring
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawCube(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Simple isometric cube
  ctx.beginPath();
  // Front face
  ctx.moveTo(0, 20);
  ctx.lineTo(-25, 5);
  ctx.lineTo(-25, -25);
  ctx.lineTo(0, -10);
  ctx.closePath();
  ctx.fill();

  // Right face (slightly lighter would be nice but we're monochrome)
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.lineTo(25, 5);
  ctx.lineTo(25, -25);
  ctx.lineTo(0, -10);
  ctx.closePath();
  ctx.fill();

  // Top face
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(-25, -25);
  ctx.lineTo(0, -40);
  ctx.lineTo(25, -25);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPillar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Column
  ctx.fillRect(-12, -80, 24, 100);

  // Base
  ctx.fillRect(-18, 15, 36, 10);
  ctx.fillRect(-15, 10, 30, 8);

  // Capital
  ctx.fillRect(-18, -85, 36, 8);
  ctx.fillRect(-15, -90, 30, 8);

  ctx.restore();
}

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  silhouette: Silhouette,
  y: number,
  glowIntensity: number,
  glowColor: string
) {
  const glow = silhouette.hasGlow ? glowIntensity : 0;

  switch (silhouette.type) {
    case 'chair':
      drawChair(ctx, silhouette.x, y, silhouette.scale);
      break;
    case 'lamp':
      drawLamp(ctx, silhouette.x, y, silhouette.scale, glow, glowColor);
      break;
    case 'plant':
      drawPlant(ctx, silhouette.x, y, silhouette.scale);
      break;
    case 'escalator':
      drawEscalator(ctx, silhouette.x, y, silhouette.scale);
      break;
    case 'sign':
      drawSign(ctx, silhouette.x, y, silhouette.scale);
      break;
    case 'ring':
      drawRing(ctx, silhouette.x, y, silhouette.scale, glow, glowColor);
      break;
    case 'cube':
      drawCube(ctx, silhouette.x, y, silhouette.scale);
      break;
    case 'pillar':
      drawPillar(ctx, silhouette.x, y, silhouette.scale);
      break;
  }
}

// ============================================================================
// Layer Generation
// ============================================================================

const SHAPE_TYPES: ShapeType[] = [
  'chair',
  'lamp',
  'plant',
  'escalator',
  'sign',
  'ring',
  'cube',
  'pillar',
];

function createLayer(
  depth: number,
  canvasWidth: number,
  canvasHeight: number
): Layer {
  const numSilhouettes = 3 + Math.floor(Math.random() * 4);
  const silhouettes: Silhouette[] = [];

  // Spread silhouettes across double the canvas width (for seamless scrolling)
  for (let i = 0; i < numSilhouettes; i++) {
    const type = SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)];
    const hasGlow = type === 'lamp' || type === 'ring' || Math.random() < 0.1;

    silhouettes.push({
      type,
      x: Math.random() * canvasWidth * 2,
      baseY: canvasHeight * (0.5 + depth * 0.3) + (Math.random() - 0.5) * 100,
      scale: 0.6 + Math.random() * 0.8,
      bobPhase: Math.random() * Math.PI * 2,
      bobAmount: 3 + Math.random() * 8,
      hasGlow,
      glowPhase: Math.random() * Math.PI * 2,
    });
  }

  return {
    depth,
    speed: 0.15 + depth * 0.25, // Closer = faster (reversed parallax: we're moving through)
    silhouettes,
    yOffset: 0,
  };
}

// ============================================================================
// Color Utilities
// ============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 64, g: 180, b: 180 };
}

function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

// ============================================================================
// Main Component
// ============================================================================

export function NonPlaces({ artworkUrl }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioData = useAudioAnalyser(true);
  const palette = useArtworkPalette(artworkUrl);

  const animationRef = useRef<number | undefined>(undefined);
  const layersRef = useRef<Layer[]>([]);
  const timeRef = useRef(0);
  const smoothedBassRef = useRef(0);
  const hueRef = useRef(180); // Start with cyan

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      // Reinitialize layers on resize
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      layersRef.current = [
        createLayer(0.9, width, height), // Far back
        createLayer(0.7, width, height),
        createLayer(0.5, width, height),
        createLayer(0.3, width, height),
        createLayer(0.1, width, height), // Close front
      ];
    };

    resize();
    window.addEventListener('resize', resize);

    // Initialize layers
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    layersRef.current = [
      createLayer(0.9, width, height),
      createLayer(0.7, width, height),
      createLayer(0.5, width, height),
      createLayer(0.3, width, height),
      createLayer(0.1, width, height),
    ];

    // Extract hue from palette
    if (palette.length > 0) {
      const rgb = hexToRgb(palette[0]);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      hueRef.current = hsl.h;
    }

    const animate = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;

      // Smooth audio data
      const bass = audioData?.bass || 0;
      smoothedBassRef.current += (bass - smoothedBassRef.current) * 0.05;
      const smoothedBass = smoothedBassRef.current;

      timeRef.current += 0.016;

      // Slowly drift hue based on time (very subtle)
      const baseHue = hueRef.current;
      const hue = (baseHue + Math.sin(timeRef.current * 0.02) * 15 + 360) % 360;

      // Create gradient background
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
      bgGradient.addColorStop(0, `hsl(${hue}, 40%, 18%)`);
      bgGradient.addColorStop(0.5, `hsl(${hue}, 35%, 22%)`);
      bgGradient.addColorStop(1, `hsl(${hue}, 45%, 15%)`);
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Draw layers back to front
      layersRef.current.forEach((layer) => {
        // Calculate fog opacity based on depth
        const fogOpacity = layer.depth * 0.6;
        const silhouetteOpacity = 1 - layer.depth * 0.7;

        // Set silhouette color (darker version of theme)
        const silhouetteHue = hue;
        ctx.fillStyle = `hsla(${silhouetteHue}, 30%, ${12 + layer.depth * 8}%, ${silhouetteOpacity})`;
        ctx.strokeStyle = ctx.fillStyle;

        // Glow color (brighter accent)
        const glowIntensity = 0.4 + smoothedBass * 0.6;
        const glowColor = `hsla(${hue}, 70%, 60%, 1)`;

        // Update and draw each silhouette
        layer.silhouettes.forEach((silhouette) => {
          // Update X position (scroll)
          silhouette.x -= layer.speed;

          // Wrap around
          if (silhouette.x < -100) {
            silhouette.x += width * 2 + 200;
          }

          // Calculate bobbing Y
          const bob =
            Math.sin(timeRef.current * 0.5 + silhouette.bobPhase) *
            silhouette.bobAmount;
          const y = silhouette.baseY + bob;

          // Draw the silhouette
          drawSilhouette(
            ctx,
            silhouette,
            y,
            silhouette.hasGlow
              ? glowIntensity *
                  (0.5 +
                    Math.sin(timeRef.current * 2 + silhouette.glowPhase) * 0.5)
              : 0,
            glowColor
          );
        });

        // Apply fog layer
        ctx.fillStyle = `hsla(${hue}, 35%, 20%, ${fogOpacity * 0.3})`;
        ctx.fillRect(0, 0, width, height);
      });

      // Add subtle overall glow in center when bass hits
      if (smoothedBass > 0.3) {
        const glowGradient = ctx.createRadialGradient(
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          Math.max(width, height) * 0.6
        );
        glowGradient.addColorStop(
          0,
          `hsla(${hue}, 60%, 50%, ${(smoothedBass - 0.3) * 0.15})`
        );
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.fillRect(0, 0, width, height);
      }

      // Vignette effect
      const vignetteGradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        height * 0.3,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.8
      );
      vignetteGradient.addColorStop(0, 'transparent');
      vignetteGradient.addColorStop(1, `hsla(${hue}, 40%, 8%, 0.5)`);
      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, width, height);

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
    <div className="w-full h-full bg-[#1a2830]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

// Register the visualizer
registerVisualizer(
  {
    id: 'non-places',
    name: 'Non-Places',
    description: 'Surreal parallax silhouettes drifting through fog',
    usesMetadata: true,
  },
  NonPlaces
);
