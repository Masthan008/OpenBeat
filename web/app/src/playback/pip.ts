import { usePlayer } from '@/state/player';

let pipVideo: HTMLVideoElement | null = null;
let pipCanvas: HTMLCanvasElement | null = null;
let pipInterval: number | null = null;

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

  // Draw Artwork if available
  if (nowPlaying?.artworkUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = nowPlaying.artworkUrl;
    if (img.complete && img.naturalWidth > 0) {
      try {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(40, 40, 432, 340, 16);
        ctx.clip();
        ctx.drawImage(img, 40, 40, 432, 340);
        ctx.restore();
      } catch {}
    }
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

  // Draw Status tag
  ctx.fillStyle = status === 'playing' ? '#fa2d48' : '#71717a';
  ctx.beginPath();
  ctx.arc(256, 485, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Check if Picture-in-Picture is currently active */
export function isPipActive(): boolean {
  return typeof document !== 'undefined' && document.pictureInPictureElement !== null;
}

/** Toggle Picture-in-Picture floating mini-player */
export async function togglePictureInPicture(): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => {});
    if (pipInterval) {
      clearInterval(pipInterval);
      pipInterval = null;
    }
    return false;
  }

  try {
    const canvas = getCanvas();
    drawPipFrame();

    if (!pipVideo) {
      pipVideo = document.createElement('video');
      pipVideo.muted = true;
      pipVideo.playsInline = true;
    }

    if (!pipVideo.srcObject) {
      const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(5);
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
  } catch (error) {
    console.warn('[OpenBlast] Picture-in-Picture could not be opened:', error);
    return false;
  }
}
