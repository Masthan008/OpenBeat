import { cleanVideoId } from '@/data/music/mappers';

/**
 * Background YouTube IFrame Audio Deck.
 * Uses the official Google YouTube IFrame Player API (window.YT.Player)
 * to provide 100% reliable zero-install music playback across all browsers
 * without requiring the OpenBlast companion extension or encountering CORS issues.
 */

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string | HTMLElement, options: unknown) => YTPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  loadVideoById(options: { videoId: string; startSeconds?: number } | string, startSeconds?: number): void;
  cueVideoById(options: { videoId: string; startSeconds?: number } | string, startSeconds?: number): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  setPlaybackRate?(rate: number): void;
  getPlaybackRate?(): number;
  destroy(): void;
}

let apiLoadedPromise: Promise<void> | null = null;
let playerInstance: YTPlayer | null = null;
let containerElement: HTMLDivElement | null = null;
let active = false;
let boundAudio: HTMLAudioElement | null = null;
let tickInterval: number | null = null;
let onEndedCallback: (() => void) | null = null;
let onErrorCallback: ((err: unknown) => void) | null = null;
let currentPlaybackRate = 1.0;

function getPlayerIframe(): HTMLIFrameElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('openblast-iframe-player');
  if (el instanceof HTMLIFrameElement) return el;
  const nested = el?.querySelector('iframe');
  if (nested) return nested;
  return document.querySelector<HTMLIFrameElement>('iframe[src*="youtube.com"]');
}

function sendIframeCommand(func: string, args: unknown[] = []): void {
  try {
    const iframe = getPlayerIframe();
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*',
      );
    }
  } catch {}
}

function loadIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();

  if (!apiLoadedPromise) {
    apiLoadedPromise = new Promise((resolve) => {
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        const firstScript = document.getElementsByTagName('script')[0];
        if (firstScript && firstScript.parentNode) {
          firstScript.parentNode.insertBefore(tag, firstScript);
        } else {
          document.head.appendChild(tag);
        }
      }

      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevReady) prevReady();
        resolve();
      };

      // Fallback check in case the script was already loaded
      const checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
  return apiLoadedPromise;
}

function ensureContainer(): HTMLDivElement {
  if (containerElement && document.body.contains(containerElement)) {
    return containerElement;
  }
  let el = document.getElementById('openblast-iframe-player') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'openblast-iframe-player';
    el.style.position = 'fixed';
    el.style.bottom = '0px';
    el.style.right = '0px';
    el.style.width = '200px';
    el.style.height = '200px';
    el.style.opacity = '0.005';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '-10';
    document.body.appendChild(el);
  }
  containerElement = el;
  return el;
}

function startTicker() {
  if (tickInterval) return;
  if (typeof window === 'undefined') return;
  tickInterval = window.setInterval(() => {
    if (!active || !playerInstance || !boundAudio) return;
    try {
      const current = playerInstance.getCurrentTime() || 0;
      const duration = playerInstance.getDuration() || 0;
      if (duration > 0 && Math.abs(boundAudio.duration - duration) > 1) {
        // Update synthetic duration property if possible
        Object.defineProperty(boundAudio, 'duration', { value: duration, configurable: true, writable: true });
        boundAudio.dispatchEvent(new Event('durationchange'));
      }
      Object.defineProperty(boundAudio, 'currentTime', { value: current, configurable: true, writable: true });
      boundAudio.dispatchEvent(new Event('timeupdate'));
    } catch {
      // Ignored during iframe transitions
    }
  }, 250);
}

function stopTicker() {
  if (tickInterval) {
    if (typeof window !== 'undefined') {
      window.clearInterval(tickInterval);
    } else {
      clearInterval(tickInterval);
    }
    tickInterval = null;
  }
}

export const iframeDeck = {
  isActive(): boolean {
    return active;
  },

  setActive(val: boolean): void {
    active = val;
    if (!val) {
      stopTicker();
      if (playerInstance) {
        try {
          playerInstance.pauseVideo();
        } catch {
          // Ignored
        }
      }
    } else {
      startTicker();
    }
  },

  bindAudioElement(audio: HTMLAudioElement | null): void {
    boundAudio = audio;
  },

  setOnEnded(cb: (() => void) | null): void {
    onEndedCallback = cb;
  },

  setOnError(cb: ((err: unknown) => void) | null): void {
    onErrorCallback = cb;
  },

  async load(
    rawVideoId: string,
    options: { startSec?: number; autoplay?: boolean } = {},
  ): Promise<{ duration: number }> {
    const videoId = cleanVideoId(rawVideoId) || rawVideoId;
    await loadIframeApi();
    const container = ensureContainer();
    const startSeconds = options.startSec ?? 0;
    const autoplay = options.autoplay !== false;

    if (!playerInstance) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('YouTube IFrame player timed out loading')), 12000);
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        playerInstance = new window.YT!.Player(container.id, {
          height: '200',
          width: '200',
          videoId,
          host: 'https://www.youtube.com',
          playerVars: {
            autoplay: autoplay ? 1 : 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
            rel: 0,
            origin,
            enablejsapi: 1,
            widget_referrer: origin,
            start: Math.floor(startSeconds),
          },
          events: {
            onReady: (event: any) => {
              clearTimeout(timeout);
              if (event?.target) {
                playerInstance = event.target;
              }
              try {
                if (playerInstance && typeof playerInstance.setPlaybackRate === 'function') {
                  playerInstance.setPlaybackRate(currentPlaybackRate);
                }
              } catch {}
              sendIframeCommand('setPlaybackRate', [currentPlaybackRate]);
              if (autoplay && event?.target && typeof event.target.playVideo === 'function') {
                try {
                  event.target.playVideo();
                } catch {}
              }
              resolve();
            },
            onStateChange: (event: { data: number }) => {
              const state = event.data;
              const YT = window.YT;
              if (!YT) return;
              if (state === YT.PlayerState.PLAYING) {
                try {
                  if (playerInstance && typeof playerInstance.setPlaybackRate === 'function') {
                    playerInstance.setPlaybackRate(currentPlaybackRate);
                  }
                } catch {}
                sendIframeCommand('setPlaybackRate', [currentPlaybackRate]);
                if (boundAudio) {
                  try {
                    Object.defineProperty(boundAudio, 'paused', { value: false, configurable: true, writable: true });
                  } catch {}
                  boundAudio.dispatchEvent(new Event('playing'));
                }
              } else if (state === YT.PlayerState.PAUSED) {
                if (boundAudio) {
                  try {
                    Object.defineProperty(boundAudio, 'paused', { value: true, configurable: true, writable: true });
                  } catch {}
                  boundAudio.dispatchEvent(new Event('pause'));
                }
              } else if (state === YT.PlayerState.BUFFERING) {
                try {
                  if (playerInstance && typeof playerInstance.setPlaybackRate === 'function') {
                    playerInstance.setPlaybackRate(currentPlaybackRate);
                  }
                } catch {}
                sendIframeCommand('setPlaybackRate', [currentPlaybackRate]);
                if (boundAudio) {
                  boundAudio.dispatchEvent(new Event('waiting'));
                }
              } else if (state === YT.PlayerState.ENDED) {
                if (boundAudio) {
                  try {
                    Object.defineProperty(boundAudio, 'ended', { value: true, configurable: true, writable: true });
                  } catch {}
                  boundAudio.dispatchEvent(new Event('ended'));
                }
                if (onEndedCallback) onEndedCallback();
              }
            },
            onError: (err: unknown) => {
              clearTimeout(timeout);
              if (onErrorCallback) onErrorCallback(err);
            },
          },
        });
      });
    } else {
      if (autoplay) {
        playerInstance.loadVideoById({ videoId, startSeconds });
      } else {
        playerInstance.cueVideoById({ videoId, startSeconds });
      }
      try {
        if (typeof playerInstance.setPlaybackRate === 'function') {
          playerInstance.setPlaybackRate(currentPlaybackRate);
        }
      } catch {}
      sendIframeCommand('setPlaybackRate', [currentPlaybackRate]);
    }

    active = true;
    startTicker();

    // Wait a brief moment for metadata
    let duration = playerInstance ? playerInstance.getDuration() || 0 : 0;
    if (duration <= 0 && playerInstance) {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (!playerInstance) break;
        duration = playerInstance.getDuration() || 0;
        if (duration > 0) break;
      }
    }

    if (boundAudio) {
      try {
        Object.defineProperty(boundAudio, 'duration', { value: duration, configurable: true, writable: true });
        Object.defineProperty(boundAudio, 'paused', { value: !autoplay, configurable: true, writable: true });
      } catch {}
      boundAudio.dispatchEvent(new Event('durationchange'));
    }

    return { duration };
  },

  play(): void {
    if (playerInstance) {
      try {
        playerInstance.playVideo();
      } catch {}
    }
    sendIframeCommand('playVideo');
    if (boundAudio) {
      try {
        Object.defineProperty(boundAudio, 'paused', { value: false, configurable: true, writable: true });
      } catch {}
      boundAudio.dispatchEvent(new Event('play'));
    }
  },

  pause(): void {
    if (playerInstance) {
      try {
        playerInstance.pauseVideo();
      } catch {}
    }
    sendIframeCommand('pauseVideo');
    if (boundAudio) {
      try {
        Object.defineProperty(boundAudio, 'paused', { value: true, configurable: true, writable: true });
      } catch {}
      boundAudio.dispatchEvent(new Event('pause'));
    }
  },

  seekTo(seconds: number): void {
    if (playerInstance) {
      try {
        playerInstance.seekTo(seconds, true);
      } catch {}
    }
    sendIframeCommand('seekTo', [seconds, true]);
    if (boundAudio) {
      try {
        Object.defineProperty(boundAudio, 'currentTime', { value: seconds, configurable: true, writable: true });
      } catch {}
      boundAudio.dispatchEvent(new Event('seeked'));
    }
  },

  setPlaybackRate(rate: number): void {
    currentPlaybackRate = rate;
    if (boundAudio) {
      try {
        boundAudio.playbackRate = rate;
      } catch {
        try {
          Object.defineProperty(boundAudio, 'playbackRate', { value: rate, configurable: true, writable: true });
        } catch {}
      }
      boundAudio.dispatchEvent(new Event('ratechange'));
    }
    if (playerInstance) {
      try {
        if (typeof playerInstance.setPlaybackRate === 'function') {
          playerInstance.setPlaybackRate(rate);
        }
      } catch {}
    }
    sendIframeCommand('setPlaybackRate', [rate]);
  },

  getPlaybackRate(): number {
    return currentPlaybackRate;
  },

  setVolume(volume0to1: number): void {
    const vol = Math.round(Math.min(1, Math.max(0, volume0to1)) * 100);
    if (playerInstance) {
      try {
        playerInstance.setVolume(vol);
      } catch {}
    }
    sendIframeCommand('setVolume', [vol]);
  },

  setMuted(muted: boolean): void {
    if (playerInstance) {
      try {
        if (muted) playerInstance.mute();
        else playerInstance.unMute();
      } catch {}
    }
    sendIframeCommand(muted ? 'mute' : 'unMute');
  },

  stop(): void {
    active = false;
    stopTicker();
    if (playerInstance) {
      try {
        playerInstance.stopVideo();
      } catch {}
    }
    sendIframeCommand('stopVideo');
  },

  getCurrentTime(): number {
    return playerInstance ? playerInstance.getCurrentTime() || 0 : 0;
  },

  getDuration(): number {
    return playerInstance ? playerInstance.getDuration() || 0 : 0;
  },

  isPaused(): boolean {
    if (!playerInstance) return true;
    try {
      return playerInstance.getPlayerState() !== (window.YT?.PlayerState.PLAYING ?? 1);
    } catch {
      return true;
    }
  },
};
