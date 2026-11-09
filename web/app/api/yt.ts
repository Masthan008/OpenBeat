export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
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
    // Strip /api/yt prefix
    const subpath = url.pathname.replace(/^\/api\/yt/, '') || '/';

    const isSaavn = subpath.startsWith('/saavn');
    const actualSubpath = isSaavn ? subpath.replace(/^\/saavn/, '') : subpath;

    let targetHost = 'https://music.youtube.com';
    if (isSaavn) {
      targetHost = 'https://www.jiosaavn.com';
    } else if (actualSubpath.startsWith('/s/player') || actualSubpath.startsWith('/sw.js_data')) {
      targetHost = 'https://www.youtube.com';
    }

    const targetUrl = new URL(actualSubpath + url.search, targetHost);

    const forwardHeaders = new Headers();
    if (isSaavn) {
      forwardHeaders.set('Origin', 'https://www.jiosaavn.com');
      forwardHeaders.set('Referer', 'https://www.jiosaavn.com/');
    } else {
      forwardHeaders.set('Origin', 'https://music.youtube.com');
      forwardHeaders.set('Referer', 'https://music.youtube.com/');
    }

    forwardHeaders.set(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    );
    forwardHeaders.set('Accept', req.headers.get('accept') || '*/*');
    forwardHeaders.set('Accept-Language', req.headers.get('accept-language') || 'en-US,en;q=0.9');

    const contentType = req.headers.get('content-type');
    if (contentType) {
      forwardHeaders.set('Content-Type', contentType);
    }

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
    // Delete content-encoding to avoid duplicate decompression issues
    responseHeaders.delete('content-encoding');

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
