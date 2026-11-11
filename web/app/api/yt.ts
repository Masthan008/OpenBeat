/**
 * Universal Serverless Proxy for YouTube Music, YouTube, and JioSaavn APIs.
 * Supports both Vercel Node runtime (req, res) and Edge runtime (Request -> Response).
 */
import { Readable } from 'node:stream';

async function resolveAudioStream(videoId: string): Promise<string | null> {
  try {
    const ytPlayerRes = await fetch('https://music.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.apps.youtube.music/6.42.52 (Linux; U; Android 14; en_US) gzip',
        'X-YouTube-Client-Name': '21',
        'X-YouTube-Client-Version': '6.42.52',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'ANDROID_MUSIC',
            clientVersion: '6.42.52',
            androidSdkVersion: 34,
            hl: 'en',
            gl: 'US',
          },
        },
      }),
    });
    if (ytPlayerRes.ok) {
      const ytData = (await ytPlayerRes.json()) as any;
      const formats = (ytData?.streamingData?.adaptiveFormats || []).filter(
        (f: any) => f.mimeType && f.mimeType.startsWith('audio/') && f.url,
      );
      formats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      if (formats[0]?.url) {
        return formats[0].url;
      }
    }
  } catch (e) {
    console.error('Failed to resolve YouTube audio stream:', e);
  }
  return null;
}

async function handleEdge(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const headerPath = req.headers.get('x-proxy-path');
    const queryPath = url.searchParams.get('__subpath');
    const rawSubpath =
      headerPath ||
      (queryPath ? (queryPath.startsWith('/') ? queryPath : `/${queryPath}`) : '') ||
      url.pathname.replace(/^\/api\/yt/, '') ||
      '/';

    const isSaavn = rawSubpath.startsWith('/saavn');
    const isDownload = rawSubpath.startsWith('/download');
    const isStream = rawSubpath.startsWith('/stream');
    const actualSubpath = isSaavn ? rawSubpath.replace(/^\/saavn/, '') : rawSubpath;

    if (isStream) {
      let targetStreamUrl = url.searchParams.get('url');
      const videoId = url.searchParams.get('id') || url.searchParams.get('videoId');

      if (!targetStreamUrl && videoId) {
        targetStreamUrl = await resolveAudioStream(videoId);
      }

      if (!targetStreamUrl) {
        return new Response(JSON.stringify({ error: 'Could not resolve audio stream' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const streamHeaders = new Headers();
      streamHeaders.set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      );
      if (targetStreamUrl.includes('googlevideo.com') || targetStreamUrl.includes('youtube.com')) {
        streamHeaders.set('Origin', 'https://www.youtube.com');
        streamHeaders.set('Referer', 'https://www.youtube.com/');
      } else if (targetStreamUrl.includes('jiosaavn.com')) {
        streamHeaders.set('Origin', 'https://www.jiosaavn.com');
        streamHeaders.set('Referer', 'https://www.jiosaavn.com/');
      }

      const range = req.headers.get('range');
      if (range) {
        streamHeaders.set('Range', range);
      }

      const upstream = await fetch(targetStreamUrl, {
        method: 'GET',
        headers: streamHeaders,
      });

      if (!upstream.ok && upstream.status !== 206) {
        return new Response(`Upstream error: ${upstream.status} ${upstream.statusText}`, { status: upstream.status });
      }

      const respHeaders = new Headers();
      respHeaders.set('Content-Disposition', 'inline');
      respHeaders.set('Content-Type', upstream.headers.get('content-type') || 'audio/mp4');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) respHeaders.set('Content-Length', contentLength);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) respHeaders.set('Content-Range', contentRange);
      respHeaders.set('Accept-Ranges', 'bytes');
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      respHeaders.set('Access-Control-Allow-Headers', '*');
      respHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      respHeaders.set('Cache-Control', 'public, max-age=3600');

      return new Response(upstream.body, {
        status: upstream.status,
        headers: respHeaders,
      });
    }

    if (isDownload) {
      let targetStreamUrl = url.searchParams.get('url');
      const videoId = url.searchParams.get('id');
      const songTitle = url.searchParams.get('title') || 'Song';
      const songArtist = url.searchParams.get('artist') || 'Unknown Artist';
      const defaultFilename = `${songArtist} - ${songTitle}`.replace(/[\\/:*?"<>|]/g, '_');
      const filename = url.searchParams.get('filename') || `${defaultFilename}.m4a`;

      if (!targetStreamUrl && videoId) {
        targetStreamUrl = await resolveAudioStream(videoId);
      }

      if (!targetStreamUrl) {
        return new Response(JSON.stringify({ error: 'Could not resolve audio stream for download' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const streamHeaders = new Headers();
      streamHeaders.set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      );
      if (targetStreamUrl.includes('googlevideo.com') || targetStreamUrl.includes('youtube.com')) {
        streamHeaders.set('Origin', 'https://www.youtube.com');
        streamHeaders.set('Referer', 'https://www.youtube.com/');
      } else if (targetStreamUrl.includes('jiosaavn.com')) {
        streamHeaders.set('Origin', 'https://www.jiosaavn.com');
        streamHeaders.set('Referer', 'https://www.jiosaavn.com/');
      }

      const upstream = await fetch(targetStreamUrl, {
        method: 'GET',
        headers: streamHeaders,
      });

      if (!upstream.ok) {
        return new Response(`Upstream error: ${upstream.status} ${upstream.statusText}`, { status: upstream.status });
      }

      const respHeaders = new Headers();
      respHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      respHeaders.set('Content-Type', upstream.headers.get('content-type') || 'audio/mp4');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) respHeaders.set('Content-Length', contentLength);
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Cache-Control', 'public, max-age=86400');

      return new Response(upstream.body, {
        status: 200,
        headers: respHeaders,
      });
    }

    const proxyTarget = req.headers.get('x-proxy-target');
    let targetHost: string;
    if (isSaavn) {
      targetHost = 'https://www.jiosaavn.com';
    } else if (proxyTarget && (proxyTarget.includes('youtube.com') || proxyTarget.includes('jiosaavn.com'))) {
      targetHost = proxyTarget;
    } else if (actualSubpath.startsWith('/youtubei/')) {
      targetHost = 'https://music.youtube.com';
    } else {
      targetHost = 'https://www.youtube.com';
    }

    const cloneParams = new URLSearchParams(url.searchParams);
    cloneParams.delete('__subpath');
    cloneParams.delete('path');
    const queryString = cloneParams.toString();
    const search = queryString ? `?${queryString}` : '';
    const targetUrl = new URL(actualSubpath + search, targetHost);
    const forwardHeaders = new Headers();

    if (targetHost.includes('jiosaavn.com')) {
      forwardHeaders.set('Origin', 'https://www.jiosaavn.com');
      forwardHeaders.set('Referer', 'https://www.jiosaavn.com/');
    } else if (targetHost.includes('music.youtube.com')) {
      forwardHeaders.set('Origin', 'https://music.youtube.com');
      forwardHeaders.set('Referer', 'https://music.youtube.com/');
    } else {
      forwardHeaders.set('Origin', 'https://www.youtube.com');
      forwardHeaders.set('Referer', 'https://www.youtube.com/');
    }

    forwardHeaders.set(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    );
    forwardHeaders.set('Accept', req.headers.get('accept') || '*/*');
    forwardHeaders.set('Accept-Language', req.headers.get('accept-language') || 'en-US,en;q=0.9');

    const contentType = req.headers.get('content-type');
    if (contentType) forwardHeaders.set('Content-Type', contentType);

    for (const [key, value] of req.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower.startsWith('x-youtube-') || lower.startsWith('x-goog-')) {
        forwardHeaders.set(key, value);
      }
    }

    const body =
      req.method !== 'GET' && req.method !== 'HEAD'
        ? await req.arrayBuffer()
        : undefined;

    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body,
      redirect: 'follow',
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Proxy request failed', details: message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

async function handleNode(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const headerPath = req.headers['x-proxy-path'] as string | undefined;
    const queryPath = parsedUrl.searchParams.get('__subpath');
    const rawSubpath =
      headerPath ||
      (queryPath ? (queryPath.startsWith('/') ? queryPath : `/${queryPath}`) : '') ||
      parsedUrl.pathname.replace(/^\/api\/yt/, '') ||
      '/';

    const isSaavn = rawSubpath.startsWith('/saavn');
    const isDownload = rawSubpath.startsWith('/download');
    const isStream = rawSubpath.startsWith('/stream');
    const actualSubpath = isSaavn ? rawSubpath.replace(/^\/saavn/, '') : rawSubpath;

    if (isStream) {
      let targetStreamUrl = parsedUrl.searchParams.get('url');
      const videoId = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('videoId');

      if (!targetStreamUrl && videoId) {
        targetStreamUrl = await resolveAudioStream(videoId);
      }

      if (!targetStreamUrl) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(JSON.stringify({ error: 'Could not resolve audio stream' }));
      }

      const streamHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      };
      if (targetStreamUrl.includes('googlevideo.com') || targetStreamUrl.includes('youtube.com')) {
        streamHeaders['Origin'] = 'https://www.youtube.com';
        streamHeaders['Referer'] = 'https://www.youtube.com/';
      } else if (targetStreamUrl.includes('jiosaavn.com')) {
        streamHeaders['Origin'] = 'https://www.jiosaavn.com';
        streamHeaders['Referer'] = 'https://www.jiosaavn.com/';
      }

      if (req.headers['range']) {
        streamHeaders['Range'] = req.headers['range'] as string;
      }

      const upstream = await fetch(targetStreamUrl, {
        method: 'GET',
        headers: streamHeaders,
      });

      if (!upstream.ok && upstream.status !== 206) {
        res.statusCode = upstream.status;
        return res.end(`Upstream audio error: ${upstream.status} ${upstream.statusText}`);
      }

      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mp4');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (typeof (Readable as any)?.fromWeb === 'function' && upstream.body) {
        return (Readable as any).fromWeb(upstream.body).pipe(res);
      }

      const data = await upstream.arrayBuffer();
      const buffer = Buffer.from(data);
      return res.end(buffer);
    }

    if (isDownload) {
      let targetStreamUrl = parsedUrl.searchParams.get('url');
      const videoId = parsedUrl.searchParams.get('id');
      const songTitle = parsedUrl.searchParams.get('title') || 'Song';
      const songArtist = parsedUrl.searchParams.get('artist') || 'Unknown Artist';
      const defaultFilename = `${songArtist} - ${songTitle}`.replace(/[\\/:*?"<>|]/g, '_');
      const filename = parsedUrl.searchParams.get('filename') || `${defaultFilename}.m4a`;

      if (!targetStreamUrl && videoId) {
        targetStreamUrl = await resolveAudioStream(videoId);
      }

      if (!targetStreamUrl) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(JSON.stringify({ error: 'Could not resolve audio stream for download' }));
      }

      const streamHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      };
      if (targetStreamUrl.includes('googlevideo.com') || targetStreamUrl.includes('youtube.com')) {
        streamHeaders['Origin'] = 'https://www.youtube.com';
        streamHeaders['Referer'] = 'https://www.youtube.com/';
      } else if (targetStreamUrl.includes('jiosaavn.com')) {
        streamHeaders['Origin'] = 'https://www.jiosaavn.com';
        streamHeaders['Referer'] = 'https://www.jiosaavn.com/';
      }

      const upstream = await fetch(targetStreamUrl, {
        method: 'GET',
        headers: streamHeaders,
      });

      if (!upstream.ok) {
        res.statusCode = upstream.status;
        return res.end(`Upstream error: ${upstream.status} ${upstream.statusText}`);
      }

      res.statusCode = 200;
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mp4');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      if (typeof (Readable as any)?.fromWeb === 'function' && upstream.body) {
        return (Readable as any).fromWeb(upstream.body).pipe(res);
      }

      const data = await upstream.arrayBuffer();
      const buffer = Buffer.from(data);
      return res.end(buffer);
    }

    const proxyTarget = req.headers['x-proxy-target'] as string | undefined;
    let targetHost: string;
    if (isSaavn) {
      targetHost = 'https://www.jiosaavn.com';
    } else if (proxyTarget && (proxyTarget.includes('youtube.com') || proxyTarget.includes('jiosaavn.com'))) {
      targetHost = proxyTarget;
    } else if (actualSubpath.startsWith('/youtubei/')) {
      targetHost = 'https://music.youtube.com';
    } else {
      targetHost = 'https://www.youtube.com';
    }

    const cloneParams = new URLSearchParams(parsedUrl.searchParams);
    cloneParams.delete('__subpath');
    cloneParams.delete('path');
    const queryString = cloneParams.toString();
    const search = queryString ? `?${queryString}` : '';
    const targetUrl = new URL(actualSubpath + search, targetHost);

    const forwardHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      Accept: (req.headers['accept'] as string) || '*/*',
      'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9',
    };

    if (targetHost.includes('jiosaavn.com')) {
      forwardHeaders['Origin'] = 'https://www.jiosaavn.com';
      forwardHeaders['Referer'] = 'https://www.jiosaavn.com/';
    } else if (targetHost.includes('music.youtube.com')) {
      forwardHeaders['Origin'] = 'https://music.youtube.com';
      forwardHeaders['Referer'] = 'https://music.youtube.com/';
    } else {
      forwardHeaders['Origin'] = 'https://www.youtube.com';
      forwardHeaders['Referer'] = 'https://www.youtube.com/';
    }

    if (req.headers['content-type']) {
      forwardHeaders['Content-Type'] = req.headers['content-type'] as string;
    }

    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if ((lower.startsWith('x-youtube-') || lower.startsWith('x-goog-')) && typeof value === 'string') {
        forwardHeaders[key] = value;
      }
    }

    let bodyBuffer: Buffer | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      bodyBuffer = Buffer.concat(chunks);
    }

    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body: bodyBuffer as any,
    });

    const data = await upstreamResponse.arrayBuffer();
    const buffer = Buffer.from(data);

    res.statusCode = upstreamResponse.status;
    upstreamResponse.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (lower !== 'content-encoding' && lower !== 'content-length' && lower !== 'transfer-encoding') {
        res.setHeader(key, val);
      }
    });
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.end(buffer);
  } catch (err: unknown) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Proxy request failed', details: String(err) }));
  }
}

export default async function handler(req: any, res?: any) {
  if (req instanceof Request || (req && typeof req.json === 'function' && !res)) {
    return handleEdge(req as Request);
  }
  return handleNode(req, res);
}
