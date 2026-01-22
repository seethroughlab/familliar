import { BaseEffect } from './BaseEffect';
import type { ReverbState, ReverbPreset } from '../../../stores/audioEffectsStore';

/**
 * Reverb preset configurations
 */
interface ReverbConfig {
  name: string;
  decay: number;      // Decay time in seconds
  density: number;    // 0-1, affects IR complexity
  dampening: number;  // 0-1, high frequency damping
  size: number;       // Room size multiplier
}

const REVERB_CONFIGS: Record<ReverbPreset, ReverbConfig> = {
  'small-room': { name: 'Small Room', decay: 0.5, density: 0.3, dampening: 0.4, size: 0.3 },
  'medium-room': { name: 'Medium Room', decay: 1.0, density: 0.5, dampening: 0.3, size: 0.5 },
  'large-hall': { name: 'Large Hall', decay: 2.5, density: 0.7, dampening: 0.2, size: 0.8 },
  'plate': { name: 'Plate', decay: 1.5, density: 0.9, dampening: 0.5, size: 0.4 },
  'cathedral': { name: 'Cathedral', decay: 4.0, density: 0.8, dampening: 0.15, size: 1.0 },
};

/**
 * Convolution reverb effect with algorithmically generated impulse responses.
 */
export class ReverbEffect extends BaseEffect {
  private convolver: ConvolverNode;
  private preDelayNode: DelayNode;
  private currentPreset: ReverbPreset = 'medium-room';
  private irCache: Map<ReverbPreset, AudioBuffer> = new Map();

  constructor(audioContext: AudioContext) {
    super(audioContext);

    // Create nodes
    this.preDelayNode = audioContext.createDelay(0.1);
    this.preDelayNode.delayTime.value = 0.01;

    this.convolver = audioContext.createConvolver();

    // Chain: preDelay -> convolver
    this.preDelayNode.connect(this.convolver);

    // Connect wet path
    this.connectWetPath(this.preDelayNode, this.convolver);

    // Generate initial IR
    this.loadPreset('medium-room');
  }

  /**
   * Generate an impulse response algorithmically
   */
  private generateImpulseResponse(config: ReverbConfig): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(sampleRate * config.decay * 1.5);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = buffer.getChannelData(channel);

      // Generate decaying noise with early reflections
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const progress = i / length;

        // Basic exponential decay
        const decay = Math.exp(-3 * t / config.decay);

        // Early reflections (first 50ms)
        let earlyReflections = 0;
        if (t < 0.05) {
          const numReflections = 6;
          for (let r = 0; r < numReflections; r++) {
            const reflectionTime = (r + 1) * 0.008 * config.size;
            const reflectionSample = Math.floor(reflectionTime * sampleRate);
            if (i === reflectionSample) {
              earlyReflections = (1 - r / numReflections) * 0.5 * (Math.random() - 0.5);
            }
          }
        }

        // Late diffuse reverb (random noise with decay)
        const noise = (Math.random() * 2 - 1) * config.density;

        // High frequency dampening (simple lowpass approximation)
        const dampFactor = 1 - config.dampening * progress;

        // Combine
        channelData[i] = (earlyReflections + noise * decay) * dampFactor;
      }

      // Normalize
      let maxVal = 0;
      for (let i = 0; i < length; i++) {
        maxVal = Math.max(maxVal, Math.abs(channelData[i]));
      }
      if (maxVal > 0) {
        const normFactor = 0.5 / maxVal;
        for (let i = 0; i < length; i++) {
          channelData[i] *= normFactor;
        }
      }
    }

    return buffer;
  }

  /**
   * Load a reverb preset
   */
  async loadPreset(preset: ReverbPreset): Promise<void> {
    this.currentPreset = preset;
    const config = REVERB_CONFIGS[preset];

    // Check cache first
    let ir = this.irCache.get(preset);

    if (!ir) {
      // Generate new IR
      ir = this.generateImpulseResponse(config);
      this.irCache.set(preset, ir);
    }

    this.convolver.buffer = ir;
  }

  /**
   * Set pre-delay time in milliseconds (0 to 100)
   */
  setPreDelay(ms: number): void {
    const seconds = Math.max(0, Math.min(100, ms)) / 1000;
    this.setParamSmooth(this.preDelayNode.delayTime, seconds);
  }

  /**
   * Update all parameters from state
   */
  async updateFromState(state: ReverbState): Promise<void> {
    this.enabled = state.enabled;
    this.mix = state.mix;
    this.setPreDelay(state.preDelay);

    if (state.preset !== this.currentPreset) {
      await this.loadPreset(state.preset);
    }
  }

  /**
   * Get current preset name for display
   */
  getPresetName(): string {
    return REVERB_CONFIGS[this.currentPreset].name;
  }

  dispose(): void {
    super.dispose();
    this.preDelayNode.disconnect();
    this.convolver.disconnect();
    this.irCache.clear();
  }
}
