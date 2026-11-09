import { describe, expect, it } from 'vitest';
import { iframeDeck } from './iframeDeck';

describe('iframeDeck', () => {
  it('initializes with inactive state', () => {
    expect(iframeDeck.isActive()).toBe(false);
    expect(iframeDeck.getCurrentTime()).toBe(0);
    expect(iframeDeck.getDuration()).toBe(0);
    expect(iframeDeck.isPaused()).toBe(true);
  });

  it('toggles active state and bound audio', () => {
    const mockAudio = {
      currentTime: 0,
      duration: 0,
      paused: true,
      dispatchEvent: () => true,
    } as unknown as HTMLAudioElement;

    iframeDeck.bindAudioElement(mockAudio);
    iframeDeck.setActive(true);
    expect(iframeDeck.isActive()).toBe(true);
    iframeDeck.setActive(false);
    expect(iframeDeck.isActive()).toBe(false);
  });
});
