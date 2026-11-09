/** Only the OpenTune player path on GitHub Pages may use the session bridge. */
export const PRODUCTION_ORIGIN = 'https://openblast.vercel.app';
export const SITE_ORIGINS = [
  PRODUCTION_ORIGIN,
  'https://openbeat-site.vercel.app',
  'https://masthan008.github.io',
  'https://justshivv.github.io',
  ...(process.env.OPENTUNE_STORE_BUILD === '1' ? [] : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000']),
];
export function matchPatternsFor(origins: string[]): string[] {
  return origins.map(o => (o === PRODUCTION_ORIGIN || o === 'https://justshivv.github.io') ? `${o}/*` : `${new URL(o).protocol}//${new URL(o).hostname}/*`);
}
