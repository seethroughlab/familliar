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
  | 'cube'
  | 'pillar'
  | 'vendingMachine'
  | 'atm'
  | 'streetlight'
  | 'exitSign'
  | 'palmTree';

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
  scale: number,
  time: number,
  phase: number
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
  const drawFrond = (angle: number, length: number, swayOffset: number) => {
    // Gentle sway based on time, with each frond slightly offset
    const sway = Math.sin(time * 0.3 + phase + swayOffset) * 0.08;
    ctx.save();
    // Offset by -π/2 so angle 0 points UP instead of RIGHT
    ctx.rotate(angle + sway - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(length * 0.3, -length * 0.5, length, -length * 0.2);
    ctx.quadraticCurveTo(length * 0.5, -length * 0.3, 0, 0);
    ctx.fill();
    ctx.restore();
  };

  ctx.translate(0, -5);
  drawFrond(-0.8, 50, 0);
  drawFrond(-0.3, 55, 0.5);
  drawFrond(0.2, 52, 1.0);
  drawFrond(0.7, 48, 1.5);
  drawFrond(-1.2, 40, 2.0);
  drawFrond(1.1, 42, 2.5);

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

function drawVendingMachine(
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

  // Main body
  ctx.fillRect(-25, -70, 50, 90);

  // Product display window (glows)
  if (glowIntensity > 0) {
    const gradient = ctx.createRadialGradient(0, -30, 0, 0, -30, 50);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(0.6, glowColor.replace('1)', `${glowIntensity * 0.4})`));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(-35, -65, 70, 55);
  }

  // Window frame (darker inset)
  ctx.fillRect(-20, -60, 40, 45);

  // Product shelves (horizontal lines)
  ctx.fillRect(-18, -48, 36, 2);
  ctx.fillRect(-18, -35, 36, 2);
  ctx.fillRect(-18, -22, 36, 2);

  // Coin slot / buttons panel
  ctx.fillRect(-20, -8, 15, 20);
  // Dispensing slot
  ctx.fillRect(0, 0, 18, 15);

  ctx.restore();
}

function drawAtm(
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

  // Main body
  ctx.fillRect(-22, -50, 44, 70);

  // Screen area (glows)
  if (glowIntensity > 0) {
    const gradient = ctx.createRadialGradient(0, -30, 0, 0, -30, 35);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(0.5, glowColor.replace('1)', `${glowIntensity * 0.5})`));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(-30, -50, 60, 40);
  }

  // Screen frame
  ctx.fillRect(-16, -42, 32, 22);

  // Keypad area
  ctx.fillRect(-14, -15, 28, 20);
  // Keypad buttons (dots)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.beginPath();
      ctx.arc(-8 + col * 8, -10 + row * 6, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Card slot
  ctx.fillRect(-10, 8, 20, 4);

  ctx.restore();
}

function drawStreetlight(
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

  // Tall pole
  ctx.fillRect(-4, -100, 8, 120);

  // Curved arm at top
  ctx.beginPath();
  ctx.moveTo(0, -100);
  ctx.quadraticCurveTo(25, -100, 30, -85);
  ctx.quadraticCurveTo(35, -70, 30, -70);
  ctx.quadraticCurveTo(20, -70, 20, -85);
  ctx.quadraticCurveTo(20, -95, 0, -95);
  ctx.closePath();
  ctx.fill();

  // Lamp head
  ctx.beginPath();
  ctx.ellipse(30, -68, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glow from lamp (downward cone)
  if (glowIntensity > 0) {
    const gradient = ctx.createRadialGradient(30, -60, 0, 30, -40, 50);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(0.4, glowColor.replace('1)', `${glowIntensity * 0.5})`));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(20, -65);
    ctx.lineTo(10, -20);
    ctx.lineTo(50, -20);
    ctx.lineTo(40, -65);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawExitSign(
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

  // Hanging mount lines
  ctx.fillRect(-2, -80, 4, 15);

  // Sign body glow
  if (glowIntensity > 0) {
    const gradient = ctx.createRadialGradient(0, -55, 0, 0, -55, 45);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(0.5, glowColor.replace('1)', `${glowIntensity * 0.6})`));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(-40, -75, 80, 50);
  }

  // Sign body
  ctx.fillRect(-30, -65, 60, 25);

  // Arrow shape cutout (pointing right) - simulated with lighter rect
  ctx.globalAlpha = 0.3;
  ctx.fillRect(-20, -58, 25, 10);
  // Arrow head
  ctx.beginPath();
  ctx.moveTo(8, -63);
  ctx.lineTo(18, -53);
  ctx.lineTo(8, -43);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1.0;

  ctx.restore();
}

function drawPalmTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  time: number,
  phase: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Trunk (slightly curved)
  ctx.beginPath();
  ctx.moveTo(-8, 20);
  ctx.quadraticCurveTo(-12, -30, -5, -80);
  ctx.lineTo(5, -80);
  ctx.quadraticCurveTo(12, -30, 8, 20);
  ctx.closePath();
  ctx.fill();

  // Trunk texture (horizontal lines)
  for (let i = 0; i < 8; i++) {
    const ty = 10 - i * 12;
    ctx.fillRect(-10, ty, 20, 2);
  }

  // Fronds
  const drawFrond = (angle: number, length: number, droop: number, swayOffset: number) => {
    // Gentle sway based on time, with each frond slightly offset
    const sway = Math.sin(time * 0.25 + phase + swayOffset) * 0.06;
    ctx.save();
    ctx.translate(0, -80);
    // Offset by -π/2 so angle 0 points UP instead of RIGHT
    ctx.rotate(angle + sway - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Main frond curve
    ctx.quadraticCurveTo(length * 0.5, -length * 0.3 + droop, length, droop);
    // Return path (leaf width)
    ctx.quadraticCurveTo(length * 0.5, -length * 0.2 + droop, 0, 0);
    ctx.fill();

    // Add leaflets along the frond
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const fx = t * length * 0.9;
      const fy = -t * length * 0.2 + droop * t;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(0.3);
      ctx.fillRect(0, 0, 15, 3);
      ctx.rotate(-0.6);
      ctx.fillRect(0, 0, 15, 3);
      ctx.restore();
    }
    ctx.restore();
  };

  // Multiple fronds radiating out
  drawFrond(-1.2, 70, 20, 0);
  drawFrond(-0.7, 80, 15, 0.4);
  drawFrond(-0.2, 85, 10, 0.8);
  drawFrond(0.3, 82, 12, 1.2);
  drawFrond(0.8, 75, 18, 1.6);
  drawFrond(1.3, 65, 25, 2.0);
  // Back fronds (shorter)
  drawFrond(-1.6, 50, 30, 2.4);
  drawFrond(1.6, 55, 28, 2.8);

  ctx.restore();
}

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  silhouette: Silhouette,
  y: number,
  glowIntensity: number,
  glowColor: string,
  time: number
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
      drawPlant(ctx, silhouette.x, y, silhouette.scale, time, silhouette.bobPhase);
      break;
    case 'escalator':
      drawEscalator(ctx, silhouette.x, y, silhouette.scale);
      break;
    case 'sign':
      drawSign(ctx, silhouette.x, y, silhouette.scale);
      break;
    case 'cube':
      drawCube(ctx, silhouette.x, y, silhouette.scale);
      break;
    case 'pillar':
      drawPillar(ctx, silhouette.x, y, silhouette.scale);
      break;
    case 'vendingMachine':
      drawVendingMachine(ctx, silhouette.x, y, silhouette.scale, glow, glowColor);
      break;
    case 'atm':
      drawAtm(ctx, silhouette.x, y, silhouette.scale, glow, glowColor);
      break;
    case 'streetlight':
      drawStreetlight(ctx, silhouette.x, y, silhouette.scale, glow, glowColor);
      break;
    case 'exitSign':
      drawExitSign(ctx, silhouette.x, y, silhouette.scale, glow, glowColor);
      break;
    case 'palmTree':
      drawPalmTree(ctx, silhouette.x, y, silhouette.scale, time, silhouette.bobPhase);
      break;
  }
}

// ============================================================================
// Shadow Drawing
// ============================================================================

function drawShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  scale: number,
  depth: number,
  hue: number
) {
  const shadowWidth = 30 * scale;
  const shadowHeight = 8 * scale;
  const opacity = 0.25 - depth * 0.15; // Closer = darker shadow

  ctx.save();
  // Use a darker version of the ground color for shadow
  ctx.fillStyle = `hsla(${hue}, 30%, 8%, ${opacity})`;
  ctx.beginPath();
  ctx.ellipse(x, groundY + 5, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================================
// Layer Generation
// ============================================================================

// Ground level as percentage of canvas height (objects sit here)
const GROUND_LEVEL = 0.78;

const SHAPE_TYPES: ShapeType[] = [
  // Standard objects
  'chair',
  'lamp',
  'plant',
  'escalator',
  'sign',
  'pillar',
  // Glowing objects (2x weight - iconic Non-Places aesthetic)
  'vendingMachine',
  'vendingMachine',
  'atm',
  'atm',
  'streetlight',
  'streetlight',
  'exitSign',
  // Vegetation (3x weight - good silhouette)
  'palmTree',
  'palmTree',
  'palmTree',
  // Abstract shape (reduced frequency)
  'cube',
];

function createLayer(
  depth: number,
  canvasWidth: number,
  canvasHeight: number
): Layer {
  const numSilhouettes = 3 + Math.floor(Math.random() * 4);
  const silhouettes: Silhouette[] = [];

  // Spread silhouettes across double the canvas width (for seamless scrolling)
  // Ground Y varies with depth (farther = higher up, closer to horizon)
  const groundY = canvasHeight * (GROUND_LEVEL - depth * 0.25);

  for (let i = 0; i < numSilhouettes; i++) {
    const type = SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)];
    const hasGlow = [
      'lamp',
      'vendingMachine',
      'atm',
      'streetlight',
      'exitSign',
    ].includes(type);

    // Exit signs float higher (hanging from ceiling)
    const isFloating = type === 'exitSign';
    const baseY = isFloating
      ? groundY - 150 - Math.random() * 50
      : groundY;

    silhouettes.push({
      type,
      x: Math.random() * canvasWidth * 2,
      baseY,
      scale: 0.6 + Math.random() * 0.8,
      bobPhase: Math.random() * Math.PI * 2,
      bobAmount: 3 + Math.random() * 8,
      hasGlow,
      glowPhase: Math.random() * Math.PI * 2,
    });
  }

  return {
    depth,
    speed: 0.08 + depth * 0.12, // Slow, meditative drift
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

      // Create gradient background (sky)
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
      bgGradient.addColorStop(0, `hsl(${hue}, 40%, 18%)`);
      bgGradient.addColorStop(0.5, `hsl(${hue}, 35%, 20%)`);
      bgGradient.addColorStop(0.7, `hsl(${hue}, 38%, 16%)`);
      bgGradient.addColorStop(1, `hsl(${hue}, 45%, 12%)`);
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Draw ground plane
      const groundY = height * GROUND_LEVEL;
      const groundGradient = ctx.createLinearGradient(0, groundY - 50, 0, height);
      groundGradient.addColorStop(0, `hsla(${hue}, 35%, 15%, 0)`);
      groundGradient.addColorStop(0.3, `hsla(${hue}, 40%, 12%, 0.5)`);
      groundGradient.addColorStop(1, `hsla(${hue}, 45%, 8%, 0.8)`);
      ctx.fillStyle = groundGradient;
      ctx.fillRect(0, groundY - 50, width, height - groundY + 50);

      // Subtle horizon line
      ctx.strokeStyle = `hsla(${hue}, 30%, 25%, 0.3)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(width, groundY);
      ctx.stroke();

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

        // Calculate layer's ground Y (varies with depth for parallax)
        const layerGroundY = height * (GROUND_LEVEL - layer.depth * 0.25);

        // Update and draw each silhouette
        layer.silhouettes.forEach((silhouette) => {
          // Update X position (scroll)
          silhouette.x -= layer.speed;

          // Wrap around
          if (silhouette.x < -100) {
            silhouette.x += width * 2 + 200;
          }

          // Calculate bobbing Y (very slow, gentle)
          const bob =
            Math.sin(timeRef.current * 0.15 + silhouette.bobPhase) *
            silhouette.bobAmount;
          const y = silhouette.baseY + bob;

          // Draw shadow (only for grounded objects, not exit signs)
          if (silhouette.type !== 'exitSign') {
            drawShadow(
              ctx,
              silhouette.x,
              layerGroundY,
              silhouette.scale,
              layer.depth,
              hue
            );
          }

          // Draw the silhouette
          drawSilhouette(
            ctx,
            silhouette,
            y,
            silhouette.hasGlow
              ? glowIntensity *
                  (0.6 +
                    Math.sin(timeRef.current * 0.4 + silhouette.glowPhase) * 0.4)
              : 0,
            glowColor,
            timeRef.current
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
  // Note: audioData is intentionally excluded - we read it inside the animation loop
  // and don't want to recreate layers when it changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette]);

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

// ============================================================================
// Future Object Ideas
// ============================================================================
// - bench: public seating with armrests
// - luggageCart: airport/station trolley silhouette
// - bollard: traffic bollard with reflective stripe (subtle glow)
// - payphone: standing phone booth with lit panel
// - trashCan: public waste bin
// - shoppingCart: abandoned shopping cart
// - turnstile: transit gate
// - cctv: security camera on pole
