import { create } from 'zustand';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [5, 4.5, 3.5, 2, 1, 0, 0, 0, 0, 0],
  'Bass & Treble': [4, 3, 1, 0, -1, 0, 1, 3, 4, 4.5],
  'Vocal Clarity': [-2, -1, 0, 1.5, 3, 3, 2, 1, 0, -1],
  Rock: [4, 3, 2, 0, -1, 1, 2, 3, 4, 4],
  Electronic: [4.5, 4, 2, 0, -1, 1, 2, 3, 4, 3],
  Acoustic: [3, 2, 1, 1, 2, 2, 2, 3, 3, 2],
  Classical: [4, 3, 2, 2, -1, -1, 0, 2, 3, 3],
  'Treble Boost': [0, 0, 0, 0, 0, 1, 2, 3, 4, 5],
};

export interface EqualizerState {
  enabled: boolean;
  preset: string;
  preampDb: number;
  bands: number[];
  speed: number;
  pitchPreserved: boolean;

  setEnabled: (enabled: boolean) => void;
  setPreset: (name: string) => void;
  setBandGain: (index: number, db: number) => void;
  setPreamp: (db: number) => void;
  setSpeed: (speed: number) => void;
  setPitchPreserved: (preserved: boolean) => void;
  reset: () => void;
}

const STORAGE_KEY = 'openblast:equalizer';

function loadEqSettings(): {
  enabled: boolean;
  preset: string;
  preampDb: number;
  bands: number[];
  speed: number;
  pitchPreserved: boolean;
} {
  const defaults = {
    enabled: true,
    preset: 'Flat',
    preampDb: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    speed: 1.0,
    pitchPreserved: true,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaults.enabled,
      preset: typeof parsed.preset === 'string' ? parsed.preset : defaults.preset,
      preampDb: typeof parsed.preampDb === 'number' ? parsed.preampDb : defaults.preampDb,
      bands: Array.isArray(parsed.bands) && parsed.bands.length === 10 ? parsed.bands : defaults.bands,
      speed: typeof parsed.speed === 'number' ? parsed.speed : defaults.speed,
      pitchPreserved: typeof parsed.pitchPreserved === 'boolean' ? parsed.pitchPreserved : defaults.pitchPreserved,
    };
  } catch {
    return defaults;
  }
}

function persistEq(state: {
  enabled: boolean;
  preset: string;
  preampDb: number;
  bands: number[];
  speed: number;
  pitchPreserved: boolean;
}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

interface AudioDspChain {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  preamp: GainNode;
  filters: BiquadFilterNode[];
}

let audioContext: AudioContext | null = null;
const connectedChains = new Map<HTMLAudioElement, AudioDspChain>();

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  audioContext ??= new AudioCtx();
  return audioContext;
}

function syncDspChain(chain: AudioDspChain, state: { enabled: boolean; preampDb: number; bands: number[]; speed: number; pitchPreserved: boolean }) {
  const { preamp, filters, audio } = chain;
  const preampGain = state.enabled ? Math.pow(10, state.preampDb / 20) : 1;
  preamp.gain.setTargetAtTime(preampGain, chain.source.context.currentTime, 0.05);

  filters.forEach((filter, i) => {
    const gain = state.enabled ? (state.bands[i] ?? 0) : 0;
    filter.gain.setTargetAtTime(gain, chain.source.context.currentTime, 0.05);
  });

  if (Math.abs(audio.playbackRate - state.speed) > 0.01) {
    audio.playbackRate = state.speed;
  }
  if (audio.preservesPitch !== state.pitchPreserved) {
    audio.preservesPitch = state.pitchPreserved;
  }
}

function syncAllChains() {
  const state = useEqualizerStore.getState();
  for (const chain of connectedChains.values()) {
    syncDspChain(chain, state);
  }
}

export function initAudioDsp(audio: HTMLAudioElement): void {
  if (connectedChains.has(audio)) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const source = ctx.createMediaElementSource(audio);
    const preamp = ctx.createGain();

    const filters = EQ_FREQUENCIES.map((freq) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.4;
      filter.gain.value = 0;
      return filter;
    });

    // Chain: source -> preamp -> filter0 -> ... -> filter9 -> destination
    source.connect(preamp);
    let prevNode: AudioNode = preamp;
    for (const filter of filters) {
      prevNode.connect(filter);
      prevNode = filter;
    }
    prevNode.connect(ctx.destination);

    const chain: AudioDspChain = { audio, source, preamp, filters };
    connectedChains.set(audio, chain);

    syncDspChain(chain, useEqualizerStore.getState());

    const resumeContext = () => {
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
    };
    audio.addEventListener('play', resumeContext, { passive: true });
  } catch (err) {
    // MediaElementSource could fail if already bound or restricted
    console.warn('[OpenBlast DSP] Could not attach Web Audio DSP:', err);
  }
}

export const useEqualizerStore = create<EqualizerState>()((set, get) => {
  const initial = loadEqSettings();

  return {
    ...initial,

    setEnabled(enabled) {
      set({ enabled });
      persistEq(get());
      syncAllChains();
    },

    setPreset(name) {
      const presetBands = EQ_PRESETS[name];
      if (presetBands) {
        set({ preset: name, bands: [...presetBands] });
      } else {
        set({ preset: name });
      }
      persistEq(get());
      syncAllChains();
    },

    setBandGain(index, db) {
      const bands = [...get().bands];
      bands[index] = Math.max(-12, Math.min(12, db));
      set({ bands, preset: 'Custom' });
      persistEq(get());
      syncAllChains();
    },

    setPreamp(preampDb) {
      set({ preampDb: Math.max(-12, Math.min(12, preampDb)) });
      persistEq(get());
      syncAllChains();
    },

    setSpeed(speed) {
      set({ speed: Math.max(0.5, Math.min(2.0, speed)) });
      persistEq(get());
      syncAllChains();
    },

    setPitchPreserved(pitchPreserved) {
      set({ pitchPreserved });
      persistEq(get());
      syncAllChains();
    },

    reset() {
      const resetState = {
        enabled: true,
        preset: 'Flat',
        preampDb: 0,
        bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        speed: 1.0,
        pitchPreserved: true,
      };
      set(resetState);
      persistEq(get());
      syncAllChains();
    },
  };
});
