import {
  EQEffect,
  CompressorEffect,
  ReverbEffect,
  DelayEffect,
  FilterEffect,
} from './effects';
import {
  useAudioEffectsStore,
  type EQState,
  type CompressorState,
  type ReverbState,
  type DelayState,
  type FilterState,
} from '../../stores/audioEffectsStore';

/**
 * EffectsChain manages the complete audio effects signal chain.
 *
 * Signal flow (when enabled):
 *   Input -> EQ -> Compressor -> Filter -> Delay -> Reverb -> Output
 *
 * Each effect can be individually bypassed via its enabled flag.
 * The master bypass routes input directly to output.
 */
export class EffectsChain {
  private audioContext: AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private bypassNode: GainNode;
  private effectsNode: GainNode;

  // Effects
  public eq: EQEffect;
  public compressor: CompressorEffect;
  public filter: FilterEffect;
  public delay: DelayEffect;
  public reverb: ReverbEffect;

  private _masterEnabled: boolean = false;
  private unsubscribe: (() => void) | null = null;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;

    // Create routing nodes
    this.inputNode = audioContext.createGain();
    this.outputNode = audioContext.createGain();
    this.bypassNode = audioContext.createGain();
    this.effectsNode = audioContext.createGain();

    // Initial state: bypass active
    this.bypassNode.gain.value = 1;
    this.effectsNode.gain.value = 0;

    // Create effects in signal chain order
    this.eq = new EQEffect(audioContext);
    this.compressor = new CompressorEffect(audioContext);
    this.filter = new FilterEffect(audioContext);
    this.delay = new DelayEffect(audioContext);
    this.reverb = new ReverbEffect(audioContext);

    // Connect bypass path: input -> bypassNode -> output
    this.inputNode.connect(this.bypassNode);
    this.bypassNode.connect(this.outputNode);

    // Connect effects chain: input -> EQ -> Compressor -> Filter -> Delay -> Reverb -> effectsNode -> output
    this.inputNode.connect(this.eq.input);
    this.eq.output.connect(this.compressor.input);
    this.compressor.output.connect(this.filter.input);
    this.filter.output.connect(this.delay.input);
    this.delay.output.connect(this.reverb.input);
    this.reverb.output.connect(this.effectsNode);
    this.effectsNode.connect(this.outputNode);

    // Initialize from store
    this.initFromStore();
  }

  /**
   * Get the input node to connect to this effects chain
   */
  get input(): AudioNode {
    return this.inputNode;
  }

  /**
   * Get the output node to connect from this effects chain
   */
  get output(): AudioNode {
    return this.outputNode;
  }

  /**
   * Enable or disable the entire effects chain
   */
  set masterEnabled(value: boolean) {
    this._masterEnabled = value;
    this.updateMasterBypass();
  }

  get masterEnabled(): boolean {
    return this._masterEnabled;
  }

  /**
   * Update master bypass gains with smooth transitions
   */
  private updateMasterBypass(): void {
    const now = this.audioContext.currentTime;
    const smoothTime = 0.02;

    if (this._masterEnabled) {
      this.bypassNode.gain.setTargetAtTime(0, now, smoothTime);
      this.effectsNode.gain.setTargetAtTime(1, now, smoothTime);
    } else {
      this.bypassNode.gain.setTargetAtTime(1, now, smoothTime);
      this.effectsNode.gain.setTargetAtTime(0, now, smoothTime);
    }
  }

  /**
   * Initialize effects from store state
   */
  private initFromStore(): void {
    const state = useAudioEffectsStore.getState();

    this.masterEnabled = state.masterEnabled;
    this.eq.updateFromState(state.eq);
    this.compressor.updateFromState(state.compressor);
    this.filter.updateFromState(state.filter);
    this.delay.updateFromState(state.delay);
    this.reverb.updateFromState(state.reverb);

    // Subscribe to store changes
    this.unsubscribe = useAudioEffectsStore.subscribe((newState, prevState) => {
      // Master enable
      if (newState.masterEnabled !== prevState.masterEnabled) {
        this.masterEnabled = newState.masterEnabled;
      }

      // EQ
      if (newState.eq !== prevState.eq) {
        this.eq.updateFromState(newState.eq);
      }

      // Compressor
      if (newState.compressor !== prevState.compressor) {
        this.compressor.updateFromState(newState.compressor);
      }

      // Filter
      if (newState.filter !== prevState.filter) {
        this.filter.updateFromState(newState.filter);
      }

      // Delay
      if (newState.delay !== prevState.delay) {
        this.delay.updateFromState(newState.delay);
      }

      // Reverb
      if (newState.reverb !== prevState.reverb) {
        this.reverb.updateFromState(newState.reverb);
      }
    });
  }

  /**
   * Update EQ state
   */
  updateEQ(state: EQState): void {
    this.eq.updateFromState(state);
  }

  /**
   * Update compressor state
   */
  updateCompressor(state: CompressorState): void {
    this.compressor.updateFromState(state);
  }

  /**
   * Update filter state
   */
  updateFilter(state: FilterState): void {
    this.filter.updateFromState(state);
  }

  /**
   * Update delay state
   */
  updateDelay(state: DelayState): void {
    this.delay.updateFromState(state);
  }

  /**
   * Update reverb state
   */
  async updateReverb(state: ReverbState): Promise<void> {
    await this.reverb.updateFromState(state);
  }

  /**
   * Get compressor gain reduction for metering
   */
  getCompressorReduction(): number {
    return this.compressor.getReduction();
  }

  /**
   * Cleanup all resources
   */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.eq.dispose();
    this.compressor.dispose();
    this.filter.dispose();
    this.delay.dispose();
    this.reverb.dispose();

    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.bypassNode.disconnect();
    this.effectsNode.disconnect();
  }
}

// Singleton instance for global access
let globalEffectsChain: EffectsChain | null = null;

/**
 * Initialize the global effects chain
 */
export function initEffectsChain(audioContext: AudioContext): EffectsChain {
  if (globalEffectsChain) {
    globalEffectsChain.dispose();
  }
  globalEffectsChain = new EffectsChain(audioContext);
  return globalEffectsChain;
}

/**
 * Get the global effects chain instance
 */
export function getEffectsChain(): EffectsChain | null {
  return globalEffectsChain;
}
