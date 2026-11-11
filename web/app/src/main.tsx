import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router';
import { queryClient } from '@/lib/queryClient';
import { routes } from '@/routes';
import '@/styles/global.css';

// Normalize any legacy or direct together/invite URLs so createHashRouter never hits 404
if (typeof window !== 'undefined') {
  try {
    const p = window.location.pathname;
    const h = window.location.hash || '';
    const s = window.location.search || '';

    const codeInHash = h.match(/^#(?:code=)?([A-Za-z0-9-]{12,14})$/i);
    if (codeInHash && codeInHash[1]) {
      const c1 = codeInHash[1].replace(/-/g, '').toUpperCase();
      window.location.hash = `#/together/${c1}`;
    } else {
      const qMatch = s.match(/[?&]code=([A-Za-z0-9-]{12,14})/i);
      if (qMatch && qMatch[1]) {
        const c2 = qMatch[1].replace(/-/g, '').toUpperCase();
        window.location.hash = `#/together/${c2}`;
      } else {
        const pathMatch = p.match(/^\/(?:together|invite)\/([A-Za-z0-9-]{12,14})/i);
        if (pathMatch && pathMatch[1]) {
          const c3 = pathMatch[1].replace(/-/g, '').toUpperCase();
          window.location.hash = `#/together/${c3}`;
        } else if ((p.includes('/together') || p.includes('/invite')) && h.includes('code=')) {
          const c4Match = h.match(/code=([A-Za-z0-9-]+)/i);
          if (c4Match && c4Match[1]) {
            const c4 = c4Match[1].replace(/-/g, '').toUpperCase();
            window.location.hash = `#/together/${c4}`;
          }
        } else if (p === '/together' || p === '/together/' || p === '/invite' || p === '/invite/') {
          if (!h || h === '#' || h === '#/') {
            window.location.hash = '#/together';
          }
        }
      }
    }
  } catch {}
}

const router = createHashRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
