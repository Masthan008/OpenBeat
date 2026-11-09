// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  SEARCH_CATEGORIES,
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  removeSearchHistoryItem,
} from './searchHistory';

describe('Search categories and history', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('includes All, Songs, Albums / Movies, Artists, Playlists categories', () => {
    const ids = SEARCH_CATEGORIES.map((c: { id: string }) => c.id);
    expect(ids).toContain('all');
    expect(ids).toContain('songs');
    expect(ids).toContain('albums');
    expect(ids).toContain('artists');
    expect(ids).toContain('playlists');
  });

  it('records and deduplicates search history items', () => {
    addSearchHistory('Anirudh');
    addSearchHistory('A. R. Rahman');
    addSearchHistory('anirudh'); // dedupe case-insensitively

    const history = getSearchHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toBe('anirudh');
    expect(history[1]).toBe('A. R. Rahman');
  });

  it('removes individual history item and clears all', () => {
    addSearchHistory('Song A');
    addSearchHistory('Song B');
    removeSearchHistoryItem('Song A');
    expect(getSearchHistory()).toEqual(['Song B']);

    clearSearchHistory();
    expect(getSearchHistory()).toEqual([]);
  });
});
