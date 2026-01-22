import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types for each effect
// ============================================================================

export interface EQState {
  enabled: boolean;
  lowGain: number;    // -12 to +12 dB
  midGain: number;    // -12 to +12 dB
  highGain: number;   // -12 to +12 dB
  lowFreq: number;    // Hz (fixed at 250)
  highFreq: number;   // Hz (fixed at 4000)
}

export interface CompressorState {
  enabled: boolean;
  threshold: number;  // -60 to 0 dB
  ratio: number;      // 1 to 20
  attack: number;     // 0 to 1 seconds
  release: number;    // 0 to 1 seconds
  knee: number;       // 0 to 40 dB
  makeupGain: number; // 0 to 12 dB
}

export type ReverbPreset = 'small-room' | 'medium-room' | 'large-hall' | 'plate' | 'cathedral';

export interface ReverbState {
  enabled: boolean;
  preset: ReverbPreset;
  mix: number;        // 0 to 1 (wet/dry)
  preDelay: number;   // 0 to 100 ms
}

export interface DelayState {
  enabled: boolean;
  time: number;       // 0 to 2 seconds
  feedback: number;   // 0 to 0.9
  mix: number;        // 0 to 1
  pingPong: boolean;
}

export interface FilterState {
  enabled: boolean;
  highpassFreq: number;  // 20 to 2000 Hz (0 = off)
  lowpassFreq: number;   // 1000 to 20000 Hz (20000 = off)
  highpassQ: number;     // 0.1 to 10
  lowpassQ: number;      // 0.1 to 10
}

export interface EffectsPreset {
  name: string;
  eq: Omit<EQState, 'lowFreq' | 'highFreq'>;
  compressor: CompressorState;
  reverb: ReverbState;
  delay: DelayState;
  filter: FilterState;
}

// ============================================================================
// Store interface
// ============================================================================

interface AudioEffectsState {
  // Master enable
  masterEnabled: boolean;

  // Individual effects
  eq: EQState;
  compressor: CompressorState;
  reverb: ReverbState;
  delay: DelayState;
  filter: FilterState;

  // Saved presets
  presets: EffectsPreset[];
  activePresetName: string | null;

  // Actions
  setMasterEnabled: (enabled: boolean) => void;

  // EQ actions
  setEQEnabled: (enabled: boolean) => void;
  setEQLowGain: (gain: number) => void;
  setEQMidGain: (gain: number) => void;
  setEQHighGain: (gain: number) => void;

  // Compressor actions
  setCompressorEnabled: (enabled: boolean) => void;
  setCompressorThreshold: (threshold: number) => void;
  setCompressorRatio: (ratio: number) => void;
  setCompressorAttack: (attack: number) => void;
  setCompressorRelease: (release: number) => void;
  setCompressorKnee: (knee: number) => void;
  setCompressorMakeupGain: (gain: number) => void;

  // Reverb actions
  setReverbEnabled: (enabled: boolean) => void;
  setReverbPreset: (preset: ReverbPreset) => void;
  setReverbMix: (mix: number) => void;
  setReverbPreDelay: (preDelay: number) => void;

  // Delay actions
  setDelayEnabled: (enabled: boolean) => void;
  setDelayTime: (time: number) => void;
  setDelayFeedback: (feedback: number) => void;
  setDelayMix: (mix: number) => void;
  setDelayPingPong: (pingPong: boolean) => void;

  // Filter actions
  setFilterEnabled: (enabled: boolean) => void;
  setFilterHighpassFreq: (freq: number) => void;
  setFilterLowpassFreq: (freq: number) => void;
  setFilterHighpassQ: (q: number) => void;
  setFilterLowpassQ: (q: number) => void;

  // Preset actions
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;
  resetToDefaults: () => void;
}

// ============================================================================
// Default values
// ============================================================================

const defaultEQ: EQState = {
  enabled: false,
  lowGain: 0,
  midGain: 0,
  highGain: 0,
  lowFreq: 250,
  highFreq: 4000,
};

const defaultCompressor: CompressorState = {
  enabled: false,
  threshold: -24,
  ratio: 4,
  attack: 0.003,
  release: 0.25,
  knee: 30,
  makeupGain: 0,
};

const defaultReverb: ReverbState = {
  enabled: false,
  preset: 'medium-room',
  mix: 0.3,
  preDelay: 10,
};

const defaultDelay: DelayState = {
  enabled: false,
  time: 0.3,
  feedback: 0.3,
  mix: 0.3,
  pingPong: false,
};

const defaultFilter: FilterState = {
  enabled: false,
  highpassFreq: 20,
  lowpassFreq: 20000,
  highpassQ: 0.7,
  lowpassQ: 0.7,
};

// Built-in presets
const builtInPresets: EffectsPreset[] = [
  {
    name: 'Warm Vinyl',
    eq: { enabled: true, lowGain: 2, midGain: -1, highGain: -3 },
    compressor: { ...defaultCompressor, enabled: false },
    reverb: { enabled: true, preset: 'small-room', mix: 0.15, preDelay: 5 },
    delay: { ...defaultDelay, enabled: false },
    filter: { enabled: true, highpassFreq: 30, lowpassFreq: 12000, highpassQ: 0.5, lowpassQ: 0.5 },
  },
  {
    name: 'Live Concert',
    eq: { enabled: true, lowGain: 1, midGain: 0, highGain: 2 },
    compressor: { ...defaultCompressor, enabled: true, threshold: -18, ratio: 3 },
    reverb: { enabled: true, preset: 'large-hall', mix: 0.35, preDelay: 20 },
    delay: { ...defaultDelay, enabled: false },
    filter: { ...defaultFilter, enabled: false },
  },
  {
    name: 'Studio Polish',
    eq: { enabled: true, lowGain: 0, midGain: 1, highGain: 1 },
    compressor: { enabled: true, threshold: -20, ratio: 4, attack: 0.005, release: 0.2, knee: 20, makeupGain: 2 },
    reverb: { enabled: true, preset: 'plate', mix: 0.2, preDelay: 0 },
    delay: { ...defaultDelay, enabled: false },
    filter: { ...defaultFilter, enabled: false },
  },
  {
    name: 'Bass Boost',
    eq: { enabled: true, lowGain: 6, midGain: 0, highGain: 0 },
    compressor: { enabled: true, threshold: -15, ratio: 6, attack: 0.01, release: 0.15, knee: 10, makeupGain: 0 },
    reverb: { ...defaultReverb, enabled: false },
    delay: { ...defaultDelay, enabled: false },
    filter: { ...defaultFilter, enabled: false },
  },
  {
    name: 'Dreamy',
    eq: { enabled: true, lowGain: -2, midGain: 0, highGain: 3 },
    compressor: { ...defaultCompressor, enabled: false },
    reverb: { enabled: true, preset: 'cathedral', mix: 0.5, preDelay: 30 },
    delay: { enabled: true, time: 0.4, feedback: 0.4, mix: 0.25, pingPong: true },
    filter: { enabled: true, highpassFreq: 80, lowpassFreq: 16000, highpassQ: 0.5, lowpassQ: 0.7 },
  },
];

// ============================================================================
// Store
// ============================================================================

export const useAudioEffectsStore = create<AudioEffectsState>()(
  persist(
    (set, get) => ({
      masterEnabled: false,
      eq: defaultEQ,
      compressor: defaultCompressor,
      reverb: defaultReverb,
      delay: defaultDelay,
      filter: defaultFilter,
      presets: builtInPresets,
      activePresetName: null,

      setMasterEnabled: (enabled) => set({ masterEnabled: enabled }),

      // EQ
      setEQEnabled: (enabled) =>
        set((state) => ({
          eq: { ...state.eq, enabled },
          activePresetName: null,
        })),
      setEQLowGain: (gain) =>
        set((state) => ({
          eq: { ...state.eq, lowGain: Math.max(-12, Math.min(12, gain)) },
          activePresetName: null,
        })),
      setEQMidGain: (gain) =>
        set((state) => ({
          eq: { ...state.eq, midGain: Math.max(-12, Math.min(12, gain)) },
          activePresetName: null,
        })),
      setEQHighGain: (gain) =>
        set((state) => ({
          eq: { ...state.eq, highGain: Math.max(-12, Math.min(12, gain)) },
          activePresetName: null,
        })),

      // Compressor
      setCompressorEnabled: (enabled) =>
        set((state) => ({
          compressor: { ...state.compressor, enabled },
          activePresetName: null,
        })),
      setCompressorThreshold: (threshold) =>
        set((state) => ({
          compressor: { ...state.compressor, threshold: Math.max(-60, Math.min(0, threshold)) },
          activePresetName: null,
        })),
      setCompressorRatio: (ratio) =>
        set((state) => ({
          compressor: { ...state.compressor, ratio: Math.max(1, Math.min(20, ratio)) },
          activePresetName: null,
        })),
      setCompressorAttack: (attack) =>
        set((state) => ({
          compressor: { ...state.compressor, attack: Math.max(0, Math.min(1, attack)) },
          activePresetName: null,
        })),
      setCompressorRelease: (release) =>
        set((state) => ({
          compressor: { ...state.compressor, release: Math.max(0, Math.min(1, release)) },
          activePresetName: null,
        })),
      setCompressorKnee: (knee) =>
        set((state) => ({
          compressor: { ...state.compressor, knee: Math.max(0, Math.min(40, knee)) },
          activePresetName: null,
        })),
      setCompressorMakeupGain: (gain) =>
        set((state) => ({
          compressor: { ...state.compressor, makeupGain: Math.max(0, Math.min(12, gain)) },
          activePresetName: null,
        })),

      // Reverb
      setReverbEnabled: (enabled) =>
        set((state) => ({
          reverb: { ...state.reverb, enabled },
          activePresetName: null,
        })),
      setReverbPreset: (preset) =>
        set((state) => ({
          reverb: { ...state.reverb, preset },
          activePresetName: null,
        })),
      setReverbMix: (mix) =>
        set((state) => ({
          reverb: { ...state.reverb, mix: Math.max(0, Math.min(1, mix)) },
          activePresetName: null,
        })),
      setReverbPreDelay: (preDelay) =>
        set((state) => ({
          reverb: { ...state.reverb, preDelay: Math.max(0, Math.min(100, preDelay)) },
          activePresetName: null,
        })),

      // Delay
      setDelayEnabled: (enabled) =>
        set((state) => ({
          delay: { ...state.delay, enabled },
          activePresetName: null,
        })),
      setDelayTime: (time) =>
        set((state) => ({
          delay: { ...state.delay, time: Math.max(0, Math.min(2, time)) },
          activePresetName: null,
        })),
      setDelayFeedback: (feedback) =>
        set((state) => ({
          delay: { ...state.delay, feedback: Math.max(0, Math.min(0.9, feedback)) },
          activePresetName: null,
        })),
      setDelayMix: (mix) =>
        set((state) => ({
          delay: { ...state.delay, mix: Math.max(0, Math.min(1, mix)) },
          activePresetName: null,
        })),
      setDelayPingPong: (pingPong) =>
        set((state) => ({
          delay: { ...state.delay, pingPong },
          activePresetName: null,
        })),

      // Filter
      setFilterEnabled: (enabled) =>
        set((state) => ({
          filter: { ...state.filter, enabled },
          activePresetName: null,
        })),
      setFilterHighpassFreq: (freq) =>
        set((state) => ({
          filter: { ...state.filter, highpassFreq: Math.max(20, Math.min(2000, freq)) },
          activePresetName: null,
        })),
      setFilterLowpassFreq: (freq) =>
        set((state) => ({
          filter: { ...state.filter, lowpassFreq: Math.max(1000, Math.min(20000, freq)) },
          activePresetName: null,
        })),
      setFilterHighpassQ: (q) =>
        set((state) => ({
          filter: { ...state.filter, highpassQ: Math.max(0.1, Math.min(10, q)) },
          activePresetName: null,
        })),
      setFilterLowpassQ: (q) =>
        set((state) => ({
          filter: { ...state.filter, lowpassQ: Math.max(0.1, Math.min(10, q)) },
          activePresetName: null,
        })),

      // Presets
      savePreset: (name) => {
        const state = get();
        const newPreset: EffectsPreset = {
          name,
          eq: {
            enabled: state.eq.enabled,
            lowGain: state.eq.lowGain,
            midGain: state.eq.midGain,
            highGain: state.eq.highGain,
          },
          compressor: { ...state.compressor },
          reverb: { ...state.reverb },
          delay: { ...state.delay },
          filter: { ...state.filter },
        };

        set((state) => ({
          presets: [
            ...state.presets.filter((p) => p.name !== name),
            newPreset,
          ],
          activePresetName: name,
        }));
      },

      loadPreset: (name) => {
        const preset = get().presets.find((p) => p.name === name);
        if (!preset) return;

        set({
          eq: { ...defaultEQ, ...preset.eq },
          compressor: preset.compressor,
          reverb: preset.reverb,
          delay: preset.delay,
          filter: preset.filter,
          activePresetName: name,
          masterEnabled: true, // Enable effects when loading a preset
        });
      },

      deletePreset: (name) => {
        // Don't allow deleting built-in presets
        if (builtInPresets.some((p) => p.name === name)) return;

        set((state) => ({
          presets: state.presets.filter((p) => p.name !== name),
          activePresetName: state.activePresetName === name ? null : state.activePresetName,
        }));
      },

      resetToDefaults: () =>
        set({
          masterEnabled: false,
          eq: defaultEQ,
          compressor: defaultCompressor,
          reverb: defaultReverb,
          delay: defaultDelay,
          filter: defaultFilter,
          activePresetName: null,
        }),
    }),
    {
      name: 'familiar-audio-effects',
    }
  )
);
