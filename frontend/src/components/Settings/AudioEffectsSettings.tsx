import { useState } from 'react';
import {
  Sliders,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  useAudioEffectsStore,
  type ReverbPreset,
} from '../../stores/audioEffectsStore';

// Collapsible section component
function EffectSection({
  title,
  enabled,
  onToggle,
  defaultExpanded = false,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          )}
          <span className="font-medium text-white dark:text-white light:text-zinc-900">
            {title}
          </span>
        </div>
        <label
          className="relative inline-flex items-center cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-zinc-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
        </label>
      </button>
      {expanded && <div className="p-3 space-y-3 bg-zinc-800/10">{children}</div>}
    </div>
  );
}

// Slider component
function EffectSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-zinc-400 dark:text-zinc-400 light:text-zinc-600">
          {label}
        </span>
        <span className="text-sm font-medium text-white dark:text-white light:text-zinc-900">
          {formatValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:cursor-not-allowed"
      />
    </div>
  );
}

// Format helpers
const formatDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} dB`;
const formatMs = (v: number) => `${v.toFixed(0)} ms`;
const formatSec = (v: number) => `${(v * 1000).toFixed(0)} ms`;
const formatHz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v.toFixed(0)} Hz`);
const formatPercent = (v: number) => `${(v * 100).toFixed(0)}%`;
const formatRatio = (v: number) => `${v.toFixed(1)}:1`;
const formatQ = (v: number) => `Q ${v.toFixed(1)}`;

const REVERB_PRESETS: { value: ReverbPreset; label: string }[] = [
  { value: 'small-room', label: 'Small Room' },
  { value: 'medium-room', label: 'Medium Room' },
  { value: 'large-hall', label: 'Large Hall' },
  { value: 'plate', label: 'Plate' },
  { value: 'cathedral', label: 'Cathedral' },
];

export function AudioEffectsSettings() {
  const [savePresetName, setSavePresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  const {
    masterEnabled,
    setMasterEnabled,
    eq,
    setEQEnabled,
    setEQLowGain,
    setEQMidGain,
    setEQHighGain,
    compressor,
    setCompressorEnabled,
    setCompressorThreshold,
    setCompressorRatio,
    setCompressorAttack,
    setCompressorRelease,
    setCompressorKnee,
    setCompressorMakeupGain,
    reverb,
    setReverbEnabled,
    setReverbPreset,
    setReverbMix,
    setReverbPreDelay,
    delay,
    setDelayEnabled,
    setDelayTime,
    setDelayFeedback,
    setDelayMix,
    setDelayPingPong,
    filter,
    setFilterEnabled,
    setFilterHighpassFreq,
    setFilterLowpassFreq,
    setFilterHighpassQ,
    setFilterLowpassQ,
    presets,
    activePresetName,
    savePreset,
    loadPreset,
    deletePreset,
    resetToDefaults,
  } = useAudioEffectsStore();

  const builtInPresetNames = [
    'Warm Vinyl',
    'Live Concert',
    'Studio Polish',
    'Bass Boost',
    'Dreamy',
  ];

  const handleSavePreset = () => {
    if (savePresetName.trim()) {
      savePreset(savePresetName.trim());
      setSavePresetName('');
      setShowSavePreset(false);
    }
  };

  return (
    <div className="bg-zinc-800/50 dark:bg-zinc-800/50 light:bg-white rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Sliders className="w-5 h-5 text-purple-400" />
          <div>
            <h4 className="font-medium text-white dark:text-white light:text-zinc-900">
              Audio Effects
            </h4>
            <p className="text-sm text-zinc-400 dark:text-zinc-400 light:text-zinc-600">
              EQ, compression, reverb, delay, and filters
            </p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={masterEnabled}
            onChange={(e) => setMasterEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-zinc-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
        </label>
      </div>

      {masterEnabled && (
        <div className="space-y-4">
          {/* Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={activePresetName || ''}
              onChange={(e) => e.target.value && loadPreset(e.target.value)}
              className="flex-1 min-w-0 bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select Preset...</option>
              <optgroup label="Built-in">
                {presets
                  .filter((p) => builtInPresetNames.includes(p.name))
                  .map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
              {presets.some((p) => !builtInPresetNames.includes(p.name)) && (
                <optgroup label="Custom">
                  {presets
                    .filter((p) => !builtInPresetNames.includes(p.name))
                    .map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>

            <button
              onClick={() => setShowSavePreset(!showSavePreset)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
              title="Save as preset"
            >
              <Save className="w-4 h-4" />
            </button>

            {activePresetName && !builtInPresetNames.includes(activePresetName) && (
              <button
                onClick={() => deletePreset(activePresetName)}
                className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 rounded-lg transition-colors"
                title="Delete preset"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={resetToDefaults}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
              title="Reset to defaults"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Save preset input */}
          {showSavePreset && (
            <div className="flex gap-2">
              <input
                type="text"
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                placeholder="Preset name..."
                className="flex-1 bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              />
              <button
                onClick={handleSavePreset}
                disabled={!savePresetName.trim()}
                className="px-3 py-2 bg-purple-500 text-white rounded-lg text-sm hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
            </div>
          )}

          {/* Effects sections */}
          <div className="space-y-2">
            {/* EQ */}
            <EffectSection
              title="3-Band EQ"
              enabled={eq.enabled}
              onToggle={setEQEnabled}
              defaultExpanded
            >
              <EffectSlider
                label="Low (250 Hz)"
                value={eq.lowGain}
                min={-12}
                max={12}
                step={0.5}
                onChange={setEQLowGain}
                formatValue={formatDb}
                disabled={!eq.enabled}
              />
              <EffectSlider
                label="Mid (1 kHz)"
                value={eq.midGain}
                min={-12}
                max={12}
                step={0.5}
                onChange={setEQMidGain}
                formatValue={formatDb}
                disabled={!eq.enabled}
              />
              <EffectSlider
                label="High (4 kHz)"
                value={eq.highGain}
                min={-12}
                max={12}
                step={0.5}
                onChange={setEQHighGain}
                formatValue={formatDb}
                disabled={!eq.enabled}
              />
            </EffectSection>

            {/* Compressor */}
            <EffectSection
              title="Compressor"
              enabled={compressor.enabled}
              onToggle={setCompressorEnabled}
            >
              <EffectSlider
                label="Threshold"
                value={compressor.threshold}
                min={-60}
                max={0}
                step={1}
                onChange={setCompressorThreshold}
                formatValue={formatDb}
                disabled={!compressor.enabled}
              />
              <EffectSlider
                label="Ratio"
                value={compressor.ratio}
                min={1}
                max={20}
                step={0.5}
                onChange={setCompressorRatio}
                formatValue={formatRatio}
                disabled={!compressor.enabled}
              />
              <EffectSlider
                label="Attack"
                value={compressor.attack}
                min={0}
                max={0.1}
                step={0.001}
                onChange={setCompressorAttack}
                formatValue={formatSec}
                disabled={!compressor.enabled}
              />
              <EffectSlider
                label="Release"
                value={compressor.release}
                min={0.01}
                max={1}
                step={0.01}
                onChange={setCompressorRelease}
                formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
                disabled={!compressor.enabled}
              />
              <EffectSlider
                label="Knee"
                value={compressor.knee}
                min={0}
                max={40}
                step={1}
                onChange={setCompressorKnee}
                formatValue={formatDb}
                disabled={!compressor.enabled}
              />
              <EffectSlider
                label="Makeup Gain"
                value={compressor.makeupGain}
                min={0}
                max={12}
                step={0.5}
                onChange={setCompressorMakeupGain}
                formatValue={formatDb}
                disabled={!compressor.enabled}
              />
            </EffectSection>

            {/* Reverb */}
            <EffectSection
              title="Reverb"
              enabled={reverb.enabled}
              onToggle={setReverbEnabled}
            >
              <div className={!reverb.enabled ? 'opacity-50' : ''}>
                <label className="text-sm text-zinc-400 dark:text-zinc-400 light:text-zinc-600 mb-1 block">
                  Preset
                </label>
                <select
                  value={reverb.preset}
                  onChange={(e) => setReverbPreset(e.target.value as ReverbPreset)}
                  disabled={!reverb.enabled}
                  className="w-full bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed"
                >
                  {REVERB_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <EffectSlider
                label="Mix"
                value={reverb.mix}
                min={0}
                max={1}
                step={0.01}
                onChange={setReverbMix}
                formatValue={formatPercent}
                disabled={!reverb.enabled}
              />
              <EffectSlider
                label="Pre-Delay"
                value={reverb.preDelay}
                min={0}
                max={100}
                step={1}
                onChange={setReverbPreDelay}
                formatValue={formatMs}
                disabled={!reverb.enabled}
              />
            </EffectSection>

            {/* Delay */}
            <EffectSection
              title="Delay"
              enabled={delay.enabled}
              onToggle={setDelayEnabled}
            >
              <EffectSlider
                label="Time"
                value={delay.time}
                min={0.01}
                max={2}
                step={0.01}
                onChange={setDelayTime}
                formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
                disabled={!delay.enabled}
              />
              <EffectSlider
                label="Feedback"
                value={delay.feedback}
                min={0}
                max={0.9}
                step={0.01}
                onChange={setDelayFeedback}
                formatValue={formatPercent}
                disabled={!delay.enabled}
              />
              <EffectSlider
                label="Mix"
                value={delay.mix}
                min={0}
                max={1}
                step={0.01}
                onChange={setDelayMix}
                formatValue={formatPercent}
                disabled={!delay.enabled}
              />
              <div
                className={`flex items-center justify-between ${!delay.enabled ? 'opacity-50' : ''}`}
              >
                <span className="text-sm text-zinc-400 dark:text-zinc-400 light:text-zinc-600">
                  Ping Pong
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={delay.pingPong}
                    onChange={(e) => setDelayPingPong(e.target.checked)}
                    disabled={!delay.enabled}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500 peer-disabled:cursor-not-allowed"></div>
                </label>
              </div>
            </EffectSection>

            {/* Filter */}
            <EffectSection
              title="Filters"
              enabled={filter.enabled}
              onToggle={setFilterEnabled}
            >
              <EffectSlider
                label="High-Pass Freq"
                value={filter.highpassFreq}
                min={20}
                max={2000}
                step={10}
                onChange={setFilterHighpassFreq}
                formatValue={formatHz}
                disabled={!filter.enabled}
              />
              <EffectSlider
                label="High-Pass Q"
                value={filter.highpassQ}
                min={0.1}
                max={10}
                step={0.1}
                onChange={setFilterHighpassQ}
                formatValue={formatQ}
                disabled={!filter.enabled}
              />
              <EffectSlider
                label="Low-Pass Freq"
                value={filter.lowpassFreq}
                min={1000}
                max={20000}
                step={100}
                onChange={setFilterLowpassFreq}
                formatValue={formatHz}
                disabled={!filter.enabled}
              />
              <EffectSlider
                label="Low-Pass Q"
                value={filter.lowpassQ}
                min={0.1}
                max={10}
                step={0.1}
                onChange={setFilterLowpassQ}
                formatValue={formatQ}
                disabled={!filter.enabled}
              />
            </EffectSection>
          </div>
        </div>
      )}
    </div>
  );
}
