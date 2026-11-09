import { Sliders, RotateCcw } from 'lucide-react';
import {
  EQ_FREQUENCIES,
  EQ_PRESETS,
  useEqualizerStore,
} from '@/playback/dsp';

export function EqualizerView({ compact = false }: { compact?: boolean }) {
  const {
    enabled,
    preset,
    preampDb,
    bands,
    speed,
    setEnabled,
    setPreset,
    setBandGain,
    setPreamp,
    setSpeed,
    reset,
  } = useEqualizerStore();

  const formatFreq = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`);

  return (
    <div className={`flex flex-col gap-5 ${compact ? 'p-2' : ''}`}>
      {/* Header Controls: Toggle, Presets, Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-quaternary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-key-bg"></div>
            <span className="ml-3 text-sm font-semibold text-primary">
              {enabled ? 'Equalizer On' : 'Equalizer Off'}
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            disabled={!enabled}
            className="rounded-lg bg-quinary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-quaternary transition-colors cursor-pointer disabled:opacity-50"
          >
            {Object.keys(EQ_PRESETS).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {preset === 'Custom' && <option value="Custom">Custom</option>}
          </select>

          <button
            onClick={reset}
            title="Reset Equalizer"
            className="p-1.5 rounded-lg bg-quinary hover:bg-quaternary text-secondary hover:text-primary transition-colors cursor-pointer"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* Preamp Slider */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-xs font-medium text-secondary w-16">Preamp</span>
        <input
          type="range"
          min="-12"
          max="12"
          step="0.5"
          value={preampDb}
          disabled={!enabled}
          onChange={(e) => setPreamp(parseFloat(e.target.value))}
          className="flex-1 h-1.5 bg-quaternary rounded-lg appearance-none cursor-pointer accent-key disabled:opacity-50"
        />
        <span className="text-xs font-mono text-secondary w-12 text-right">
          {preampDb > 0 ? `+${preampDb.toFixed(1)}` : preampDb.toFixed(1)} dB
        </span>
      </div>

      {/* 10-Band Sliders */}
      <div
        className={`grid grid-cols-10 gap-1 sm:gap-2 items-end pt-4 pb-2 px-1 ${
          !enabled ? 'opacity-40 pointer-events-none' : ''
        }`}
      >
        {EQ_FREQUENCIES.map((freq, i) => {
          const gain = bands[i] ?? 0;
          return (
            <div key={freq} className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-mono text-secondary">
                {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
              </span>
              <div className="h-32 flex items-center justify-center">
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={gain}
                  onChange={(e) => setBandGain(i, parseFloat(e.target.value))}
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  className="h-28 w-2 bg-quaternary rounded-lg appearance-none cursor-pointer accent-key"
                />
              </div>
              <span className="text-[10px] font-semibold text-secondary">
                {formatFreq(freq)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Playback Speed Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
        <span className="text-xs font-medium text-secondary">Playback Speed</span>
        <div className="flex items-center gap-1.5">
          {[0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                Math.abs(speed - s) < 0.01
                  ? 'bg-key-bg text-white'
                  : 'bg-quinary text-secondary hover:bg-quaternary hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
