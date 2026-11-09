import { describe, expect, it } from 'vitest';
import { EQ_FREQUENCIES, EQ_PRESETS, useEqualizerStore } from './dsp';

describe('Equalizer & Audio DSP Store', () => {
  it('defines 10 ISO standard frequencies', () => {
    expect(EQ_FREQUENCIES).toHaveLength(10);
    expect(EQ_FREQUENCIES[0]).toBe(32);
    expect(EQ_FREQUENCIES[9]).toBe(16000);
  });

  it('provides standard audio presets', () => {
    expect(EQ_PRESETS.Flat).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(EQ_PRESETS['Bass Boost']).toBeDefined();
    expect(EQ_PRESETS['Vocal Clarity']).toBeDefined();
    expect(EQ_PRESETS.Rock).toBeDefined();
  });

  it('clamps band gains between -12dB and +12dB', () => {
    const store = useEqualizerStore.getState();
    store.setBandGain(0, 20);
    expect(useEqualizerStore.getState().bands[0]).toBe(12);

    store.setBandGain(0, -25);
    expect(useEqualizerStore.getState().bands[0]).toBe(-12);

    store.setBandGain(0, 5);
    expect(useEqualizerStore.getState().bands[0]).toBe(5);
    expect(useEqualizerStore.getState().preset).toBe('Custom');
  });

  it('clamps preamp gain between -12dB and +12dB', () => {
    const store = useEqualizerStore.getState();
    store.setPreamp(15);
    expect(useEqualizerStore.getState().preampDb).toBe(12);

    store.setPreamp(-30);
    expect(useEqualizerStore.getState().preampDb).toBe(-12);

    store.setPreamp(2.5);
    expect(useEqualizerStore.getState().preampDb).toBe(2.5);
  });

  it('switches presets accurately', () => {
    const store = useEqualizerStore.getState();
    store.setPreset('Bass Boost');
    expect(useEqualizerStore.getState().preset).toBe('Bass Boost');
    expect(useEqualizerStore.getState().bands).toEqual(EQ_PRESETS['Bass Boost']);
  });

  it('resets to Flat defaults', () => {
    const store = useEqualizerStore.getState();
    store.setPreamp(6);
    store.setSpeed(1.5);
    store.reset();
    const current = useEqualizerStore.getState();
    expect(current.preset).toBe('Flat');
    expect(current.preampDb).toBe(0);
    expect(current.speed).toBe(1.0);
    expect(current.bands).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
