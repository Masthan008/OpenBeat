import type { Track, AlbumRef } from '@/data/music/types';
import { fetchJson, findLossless } from '@/addons/client';
import { findJioSaavn } from '@/addons/jiosaavn';
import { getMusicClient } from '@/playback/youtube/innertube';
import { resolvePlayer } from '@/playback/youtube/resolver';

export interface OfflineTrackRecord {
  videoId: string;
  title: string;
  artists: { name: string; id: string | null }[];
  album: AlbumRef | null;
  durationSec: number | null;
  thumbnail: string | null;
  audioBlob?: Blob;
  mimeType?: string;
  savedAt: number;
  sizeBytes: number;
}

const DB_NAME = 'openblast_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Store a track in offline IndexedDB */
export async function saveTrackOffline(track: Track, audioBlob?: Blob): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: OfflineTrackRecord = {
      videoId: track.videoId,
      title: track.title,
      artists: track.artists,
      album: track.album,
      durationSec: track.durationSec,
      thumbnail: track.thumbnail,
      audioBlob,
      mimeType: audioBlob?.type || 'audio/mp4',
      savedAt: Date.now(),
      sizeBytes: audioBlob?.size || 0,
    };

    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Retrieve all offline tracks */
export async function getOfflineTracks(): Promise<OfflineTrackRecord[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Check if a track is stored offline */
export async function isTrackOffline(videoId: string): Promise<boolean> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getKey(videoId);
      req.onsuccess = () => resolve(req.result !== undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return false;
  }
}

/** Remove a track from offline storage */
export async function deleteOfflineTrack(videoId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(videoId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Clear all offline cached tracks */
export async function clearAllOfflineStorage(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Calculate total storage size and count */
export async function getOfflineStorageStats(): Promise<{ count: number; totalBytes: number }> {
  const tracks = await getOfflineTracks();
  const totalBytes = tracks.reduce((sum, t) => sum + (t.sizeBytes || 0), 0);
  return { count: tracks.length, totalBytes };
}

/**
 * Downloads a track: resolves best available audio stream, downloads blob,
 * triggers browser file download, and caches into IndexedDB for offline listening.
 */
export async function downloadTrack(track: Track): Promise<{ success: boolean; message?: string }> {
  try {
    const artistName = track.artists.map((a) => a.name).join(', ') || 'Unknown Artist';
    const filename = `${artistName} - ${track.title}`.replace(/[\\/:*?"<>|]/g, '_');

    let streamUrl: string | null = null;
    let extension = 'm4a';

    // 1. Check JioSaavn 320kbps
    try {
      const saavn = await findJioSaavn(
        {
          title: track.title,
          artist: artistName,
          album: track.album?.name ?? null,
          duration: track.durationSec ?? 0,
        },
        fetchJson,
      );
      if (saavn?.stream?.url) {
        streamUrl = saavn.stream.url;
        extension = 'mp4';
      }
    } catch {}

    // 2. Check Lossless add-on
    if (!streamUrl) {
      try {
        const lossless = await findLossless({
          title: track.title,
          artist: artistName,
          duration: track.durationSec ?? 0,
        });
        if (lossless.ranked.length > 0 && lossless.ranked[0]?.url) {
          streamUrl = lossless.ranked[0].url;
          extension = 'flac';
        }
      } catch {}
    }

    // 3. Fallback to YouTube direct audio
    if (!streamUrl && track.videoId) {
      try {
        const yt = await getMusicClient();
        const resolved = await resolvePlayer(yt, track.videoId);
        const format = resolved.info.streaming_data?.adaptive_formats.find(
          (f) => f.has_audio && !f.has_video && (f.url || f.signature_cipher || f.cipher),
        );
        if (format) {
          const deciphered = format.url
            ? format.url
            : await resolved.yt.session.player?.decipher(format.signature_cipher || format.cipher);
          if (deciphered) {
            streamUrl = deciphered;
            extension = format.mime_type?.includes('webm') ? 'webm' : 'm4a';
          }
        }
      } catch {}
    }

    let blob: Blob | undefined;
    if (streamUrl) {
      try {
        const response = await fetch(streamUrl);
        if (response.ok) {
          blob = await response.blob();
        }
      } catch {
        // Direct stream fetch blocked by CORS; proceed to serverless proxy
      }
    }

    // 4. If direct blob download was blocked by CORS or stream was unresolvable locally, route through same-origin proxy
    if (!blob) {
      try {
        const proxyDownloadUrl = streamUrl
          ? `/api/yt/download?url=${encodeURIComponent(streamUrl)}&filename=${encodeURIComponent(`${filename}.${extension}`)}`
          : `/api/yt/download?id=${encodeURIComponent(track.videoId)}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(artistName)}&filename=${encodeURIComponent(`${filename}.${extension}`)}`;

        const proxyResponse = await fetch(proxyDownloadUrl);
        if (proxyResponse.ok) {
          blob = await proxyResponse.blob();
        }
      } catch (proxyErr) {
        console.warn('Proxy download fetch failed:', proxyErr);
      }
    }

    // Trigger browser file download
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } else {
      // Fallback: direct browser trigger via serverless download attachment URL
      const fallbackDownloadUrl = streamUrl
        ? `/api/yt/download?url=${encodeURIComponent(streamUrl)}&filename=${encodeURIComponent(`${filename}.${extension}`)}`
        : `/api/yt/download?id=${encodeURIComponent(track.videoId)}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(artistName)}&filename=${encodeURIComponent(`${filename}.${extension}`)}`;
      const a = document.createElement('a');
      a.href = fallbackDownloadUrl;
      a.download = `${filename}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Save to offline storage database
    await saveTrackOffline(track, blob);

    return { success: true };
  } catch (error) {
    console.error('Download failed:', error);
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
}
