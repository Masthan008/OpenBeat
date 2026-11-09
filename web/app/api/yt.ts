/**
 * Universal Serverless Proxy for YouTube Music, YouTube, and JioSaavn APIs.
 * Supports both Vercel Node runtime (req, res) and Edge runtime (Request -> Response).
 */

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
    const rawSubpath = headerPath || (queryPath ? (queryPath.startsWith('/') ? queryPath : `/${queryPath}`) : '') || url.pathname.replace(/^\/api\/yt/, '') || '/';

    const isSaavn = rawSubpath.startsWith('/saavn');
    const actualSubpath = isSaavn ? rawSubpath.replace(/^\/saavn/, '') : rawSubpath;

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

    const search = url.search ? (queryPath ? '' : url.search) : '';
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
    const rawSubpath = headerPath || (queryPath ? (queryPath.startsWith('/') ? queryPath : `/${queryPath}`) : '') || parsedUrl.pathname.replace(/^\/api\/yt/, '') || '/';

    const isSaavn = rawSubpath.startsWith('/saavn');
    const actualSubpath = isSaavn ? rawSubpath.replace(/^\/saavn/, '') : rawSubpath;

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

    const search = parsedUrl.search ? (queryPath ? '' : parsedUrl.search) : '';
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

    res.statusCode = upstreamResponse.status;
    upstreamResponse.headers.forEach((val, key) => {
      if (key !== 'content-encoding') {
        res.setHeader(key, val);
      }
    });
    res.setHeader('Access-Control-Allow-Origin', '*');

    const data = await upstreamResponse.arrayBuffer();
    return res.end(Buffer.from(data));
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
