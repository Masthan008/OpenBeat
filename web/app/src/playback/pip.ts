import { usePlayer, getAudio } from '@/state/player';

type PlayerState = ReturnType<typeof usePlayer.getState>;

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  readonly window: Window | null;
  onenter: ((event: Event) => void) | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

let docPipWindow: Window | null = null;
let pipVideo: HTMLVideoElement | null = null;
let pipCanvas: HTMLCanvasElement | null = null;
let pipInterval: number | null = null;
let cachedArtworkUrl: string | null = null;
let cachedArtworkImg: HTMLImageElement | null = null;

function getCanvas(): HTMLCanvasElement {
  if (!pipCanvas) {
    pipCanvas = document.createElement('canvas');
    pipCanvas.width = 512;
    pipCanvas.height = 512;
  }
  return pipCanvas;
}

function drawPipFrame() {
  const canvas = getCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { nowPlaying, status } = usePlayer.getState();

  // Background
  ctx.fillStyle = '#121214';
  ctx.fillRect(0, 0, 512, 512);

  // Gradient accent
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, '#1c1c22');
  gradient.addColorStop(1, '#0c0c0e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const title = nowPlaying?.title || 'OpenBlast';
  const artist = nowPlaying?.artist || 'Ready to play';

  // Cache artwork image
  if (nowPlaying?.artworkUrl !== cachedArtworkUrl) {
    cachedArtworkUrl = nowPlaying?.artworkUrl ?? null;
    if (cachedArtworkUrl) {
      cachedArtworkImg = new Image();
      cachedArtworkImg.crossOrigin = 'anonymous';
      cachedArtworkImg.src = cachedArtworkUrl;
      cachedArtworkImg.onload = () => drawPipFrame();
    } else {
      cachedArtworkImg = null;
    }
  }

  // Draw Artwork if available
  if (cachedArtworkImg?.complete && cachedArtworkImg.naturalWidth > 0) {
    try {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(40, 40, 432, 340, 16);
      ctx.clip();
      ctx.drawImage(cachedArtworkImg, 40, 40, 432, 340);
      ctx.restore();
    } catch {
      // Fallback if crossOrigin tainted
    }
  } else {
    // Artwork placeholder
    ctx.fillStyle = '#27272a';
    ctx.beginPath();
    ctx.roundRect(40, 40, 432, 340, 16);
    ctx.fill();
    ctx.fillStyle = '#71717a';
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OpenBlast Music', 256, 210);
  }

  // Draw Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  const displayTitle = title.length > 28 ? title.slice(0, 27) + '…' : title;
  ctx.fillText(displayTitle, 256, 425);

  // Draw Artist
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const displayArtist = artist.length > 34 ? artist.slice(0, 33) + '…' : artist;
  ctx.fillText(displayArtist, 256, 460);

  // Draw Status dot
  ctx.fillStyle = status === 'playing' ? '#fa2d48' : '#71717a';
  ctx.beginPath();
  ctx.arc(256, 485, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Check if Picture-in-Picture is currently active (Document PiP or Video PiP) */
export function isPipActive(): boolean {
  if (typeof window === 'undefined') return false;
  if (docPipWindow && !docPipWindow.closed) return true;
  return typeof document !== 'undefined' && document.pictureInPictureElement !== null;
}

/** Format seconds to m:ss */
function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Open modern Document Picture-in-Picture window with interactive controls */
async function openDocumentPip(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.documentPictureInPicture) return false;

  try {
    const pipWin = await window.documentPictureInPicture.requestWindow({
      width: 340,
      height: 380,
    });
    docPipWindow = pipWin;

    const doc = pipWin.document;
    doc.title = 'OpenBlast Mini Player';

    // Inject styles
    const style = doc.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
      body {
        background: #111114;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        height: 100vh;
        padding: 18px 20px;
        overflow: hidden;
      }
      .artwork-box {
        width: 190px;
        height: 190px;
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.2);
        background: #1a1a20;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .artwork-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .meta {
        text-align: center;
        width: 100%;
        padding: 0 8px;
        margin-top: 10px;
      }
      .title {
        font-size: 16px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: -0.01em;
      }
      .artist {
        font-size: 13px;
        color: #a1a1aa;
        margin-top: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .scrubber {
        width: 100%;
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .progress-track {
        width: 100%;
        height: 4px;
        background: rgba(255,255,255,0.15);
        border-radius: 2px;
        position: relative;
        overflow: hidden;
      }
      .progress-fill {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 0%;
        background: #fa2d48;
        border-radius: 2px;
        transition: width 0.3s linear;
      }
      .times {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #71717a;
        font-variant-numeric: tabular-nums;
      }
      .controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;
        margin-top: 8px;
      }
      button.btn {
        background: none;
        border: none;
        color: #ffffff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: transform 0.15s ease, opacity 0.15s ease;
      }
      button.btn:hover {
        opacity: 0.85;
        transform: scale(1.08);
      }
      button.btn:active {
        transform: scale(0.95);
      }
      .play-btn {
        width: 48px;
        height: 48px;
        background: #fa2d48 !important;
        border-radius: 50%;
        color: #fff;
        box-shadow: 0 4px 14px rgba(250, 45, 72, 0.4);
      }
      .skip-btn {
        width: 34px;
        height: 34px;
        color: #d4d4d8;
      }
    `;
    doc.head.appendChild(style);

    // Initial HTML structure
    doc.body.innerHTML = `
      <div class="artwork-box">
        <img id="pip-art" src="" alt="Album Artwork" style="display:none;" />
        <span id="pip-art-ph" style="color:#71717a;font-size:12px;font-weight:600;">OpenBlast</span>
      </div>
      <div class="meta">
        <div id="pip-title" class="title">OpenBlast</div>
        <div id="pip-artist" class="artist">Ready to play</div>
      </div>
      <div class="scrubber">
        <div class="progress-track"><div id="pip-progress" class="progress-fill"></div></div>
        <div class="times">
          <span id="pip-current">0:00</span>
          <span id="pip-duration">0:00</span>
        </div>
      </div>
      <div class="controls">
        <button id="pip-prev" class="btn skip-btn" title="Previous" aria-label="Previous">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button id="pip-play" class="btn play-btn" title="Play/Pause" aria-label="Play or Pause">
          <svg id="pip-play-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button id="pip-next" class="btn skip-btn" title="Next" aria-label="Next">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>
    `;

    // Elements
    const artImg = doc.getElementById('pip-art') as HTMLImageElement;
    const artPh = doc.getElementById('pip-art-ph') as HTMLElement;
    const titleEl = doc.getElementById('pip-title') as HTMLElement;
    const artistEl = doc.getElementById('pip-artist') as HTMLElement;
    const progEl = doc.getElementById('pip-progress') as HTMLElement;
    const curEl = doc.getElementById('pip-current') as HTMLElement;
    const durEl = doc.getElementById('pip-duration') as HTMLElement;
    const playBtn = doc.getElementById('pip-play') as HTMLElement;
    const prevBtn = doc.getElementById('pip-prev') as HTMLElement;
    const nextBtn = doc.getElementById('pip-next') as HTMLElement;

    // Control event listeners
    prevBtn.onclick = () => void usePlayer.getState().previous();
    nextBtn.onclick = () => void usePlayer.getState().next();
    playBtn.onclick = () => void usePlayer.getState().togglePlay();

    const updateView = (state: PlayerState) => {
      const { nowPlaying, status } = state;
      const isPlaying = status === 'playing';
      const audio = getAudio();
      const currentTime = audio?.currentTime ?? 0;
      const duration = audio?.duration && Number.isFinite(audio.duration) ? audio.duration : (nowPlaying?.durationSec ?? 0);

      if (titleEl) titleEl.textContent = nowPlaying?.title || 'OpenBlast';
      if (artistEl) artistEl.textContent = nowPlaying?.artist || 'Ready to play';

      if (nowPlaying?.artworkUrl) {
        if (artImg.src !== nowPlaying.artworkUrl) artImg.src = nowPlaying.artworkUrl;
        artImg.style.display = 'block';
        if (artPh) artPh.style.display = 'none';
      } else {
        artImg.style.display = 'none';
        if (artPh) artPh.style.display = 'block';
      }

      if (curEl) curEl.textContent = formatTime(currentTime);
      if (durEl) durEl.textContent = formatTime(duration);

      const pct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
      if (progEl) progEl.style.width = `${pct}%`;

      if (playBtn) {
        playBtn.innerHTML = isPlaying
          ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
          : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      }
    };

    // Update with initial state
    updateView(usePlayer.getState());

    // Periodic time progress updater
    const timer = window.setInterval(() => updateView(usePlayer.getState()), 500);

    // Subscribe to state updates
    const unsubscribe = usePlayer.subscribe(updateView);

    pipWin.addEventListener(
      'pagehide',
      () => {
        clearInterval(timer);
        unsubscribe();
        docPipWindow = null;
      },
      { once: true },
    );

    return true;
  } catch (error) {
    console.warn('[OpenBlast] Document Picture-in-Picture not available, falling back to Video PiP:', error);
    docPipWindow = null;
    return false;
  }
}

/** Open standard HTMLVideoElement Picture-in-Picture fallback */
async function openVideoPip(): Promise<boolean> {
  const canvas = getCanvas();
  drawPipFrame();

  if (!pipVideo) {
    pipVideo = document.createElement('video');
    pipVideo.muted = true;
    pipVideo.playsInline = true;
    pipVideo.autoplay = true;
  }

  // Ensure pipVideo is attached to DOM (mandatory for Chrome requestPictureInPicture)
  if (!pipVideo.isConnected) {
    pipVideo.style.position = 'fixed';
    pipVideo.style.left = '-9999px';
    pipVideo.style.top = '-9999px';
    pipVideo.style.width = '1px';
    pipVideo.style.height = '1px';
    pipVideo.style.opacity = '0.001';
    pipVideo.style.pointerEvents = 'none';
    pipVideo.style.zIndex = '-9999';
    document.body.appendChild(pipVideo);
  }

  if (!pipVideo.srcObject) {
    const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(10);
    pipVideo.srcObject = stream;
  }

  await pipVideo.play();
  await pipVideo.requestPictureInPicture();

  if (pipInterval) clearInterval(pipInterval);
  pipInterval = window.setInterval(drawPipFrame, 1000);

  pipVideo.addEventListener(
    'leavepictureinpicture',
    () => {
      if (pipInterval) {
        clearInterval(pipInterval);
        pipInterval = null;
      }
    },
    { once: true },
  );

  return true;
}

/** Toggle Picture-in-Picture floating mini-player */
export async function togglePictureInPicture(): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  // 1. If Document PiP is open, close it
  if (docPipWindow && !docPipWindow.closed) {
    docPipWindow.close();
    docPipWindow = null;
    return false;
  }

  // 2. If Video PiP is open, exit it
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => {});
    if (pipInterval) {
      clearInterval(pipInterval);
      pipInterval = null;
    }
    return false;
  }

  try {
    // 3. Try Document Picture-in-Picture first (Chrome 116+, Edge 116+)
    if (typeof window !== 'undefined' && 'documentPictureInPicture' in window) {
      const opened = await openDocumentPip();
      if (opened) return true;
    }

    // 4. Fallback to standard Video PiP (Firefox, Safari, older Chrome)
    return await openVideoPip();
  } catch (error) {
    console.warn('[OpenBlast] Picture-in-Picture could not be opened:', error);
    return false;
  }
}
