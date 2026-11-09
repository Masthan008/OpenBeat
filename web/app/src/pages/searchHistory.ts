export type SearchCategory = 'all' | 'songs' | 'albums' | 'artists' | 'playlists';

export const SEARCH_CATEGORIES: { id: SearchCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'songs', label: 'Songs' },
  { id: 'albums', label: 'Albums / Movies' },
  { id: 'artists', label: 'Artists' },
  { id: 'playlists', label: 'Playlists' },
];

const SEARCH_HISTORY_KEY = 'openblast:search-history';

export function getSearchHistory(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SEARCH_HISTORY_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addSearchHistory(q: string) {
  const trimmed = q.trim();
  if (!trimmed || typeof localStorage === 'undefined') return;
  try {
    const history = getSearchHistory().filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
    history.unshift(trimmed);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  } catch {}
}

export function clearSearchHistory() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch {}
}

export function removeSearchHistoryItem(item: string) {
  try {
    if (typeof localStorage === 'undefined') return;
    const history = getSearchHistory().filter((i) => i !== item);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}
