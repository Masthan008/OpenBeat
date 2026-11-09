import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Clock, X } from 'lucide-react';
import { PrefetchLink } from '@/components/PrefetchLink';
import { Artwork } from '@/components/music/Artwork';
import { CategoryTiles } from '@/components/music/CategoryTiles';
import { hrefFor } from '@/components/music/links';
import { playTrack } from '@/components/music/play';
import { SearchField } from '@/components/music/SearchField';
import { Shelves } from '@/components/music/ShelfView';
import { EmptyState, LoadError, NeedsExtension } from '@/components/music/States';
import { useYouTubeReady } from '@/data/music/queries';
import { useCategories, useSearch } from '@/data/music/queries';
import type { MusicItem, SearchResults, Shelf } from '@/data/music/types';
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';
import { ShelfSkeleton } from '@/skeletons/ShelfSkeleton';
import {
  SEARCH_CATEGORIES,
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  removeSearchHistoryItem,
  type SearchCategory,
} from './searchHistory';

const KIND_LABEL: Record<MusicItem['kind'], string> = {
  song: 'Song',
  video: 'Video',
  album: 'Album',
  playlist: 'Playlist',
  'spotify-playlist': 'Spotify Playlist',
  artist: 'Artist',
  episode: 'Episode',
  podcast: 'Podcast',
  unknown: '',
};

/** Grouped shelves filtered by category. */
function shelvesFor(results: SearchResults, category: SearchCategory): Shelf[] {
  const shelf = (title: string, items: MusicItem[], layout: Shelf['layout']): Shelf | null =>
    items.length ? { title, strapline: null, layout, items, seeAll: null } : null;

  if (category === 'songs') {
    return [shelf('Songs', results.songs, 'tracks')].filter((s): s is Shelf => !!s);
  }
  if (category === 'albums') {
    return [shelf('Albums & Movie Soundtracks', results.albums, 'square')].filter((s): s is Shelf => !!s);
  }
  if (category === 'artists') {
    return [shelf('Artists', results.artists, 'circle')].filter((s): s is Shelf => !!s);
  }
  if (category === 'playlists') {
    return [shelf('Playlists', results.playlists, 'square')].filter((s): s is Shelf => !!s);
  }

  return [
    shelf('Artists', results.artists, 'circle'),
    shelf('Albums & Soundtracks', results.albums, 'square'),
    shelf('Songs', results.songs, 'tracks'),
    shelf('Playlists', results.playlists, 'square'),
    shelf('Videos', results.videos, 'video'),
  ].filter((s): s is Shelf => !!s);
}

const sectionTitle = 'mx-(--body-gutter) mt-3 type-title-2-emphasized';
const topGrid =
  'mx-(--body-gutter) mt-3 mb-8 grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-[607px]:grid-cols-[minmax(0,1fr)] max-[607px]:gap-1';
const top =
  'grid min-h-[118px] grid-cols-[90px_minmax(0,1fr)] items-center gap-x-3.5 rounded-[8px] bg-quinary px-3 py-3.5 text-left hover:bg-quaternary transition-colors';
const topText = 'flex min-w-0 flex-col gap-0.5';

function TopResult({ item }: { item: MusicItem }) {
  const href = hrefFor(item);
  const body = (
    <>
      <div className="w-[90px]">
        <Artwork src={item.thumbnail} displayWidth={90} radius={item.kind === 'artist' ? '50%' : 'var(--radius-artwork-small)'} />
      </div>
      <div className={topText}>
        <span className="line-clamp-2 type-title-3">{item.title}</span>
        <span className="truncate type-callout text-secondary">
          {[KIND_LABEL[item.kind], item.kind === 'artist' ? null : item.artists.map((a) => a.name).join(', ')].filter(Boolean).join(' · ')}
        </span>
      </div>
    </>
  );
  return href ? (
    <PrefetchLink to={href} className={top}>
      {body}
    </PrefetchLink>
  ) : (
    <button className={top} onClick={() => playTrack(item)}>
      {body}
    </button>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true">
      <div className={sectionTitle}>
        <SkeletonLine lineHeight={22} fontSize={17} width={130} />
      </div>
      <div className={topGrid} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={top}>
            <SkeletonBlock width={90} height={90} radius="var(--radius-artwork-small)" />
            <div className={topText}>
              <SkeletonLine lineHeight={20} fontSize={15} width="70%" />
              <SkeletonLine lineHeight={15} fontSize={12} width="40%" />
            </div>
          </div>
        ))}
      </div>
      <ShelfSkeleton kind="circle" />
      <ShelfSkeleton kind="square" />
    </div>
  );
}

function Results({ query, category }: { query: string; category: SearchCategory }) {
  const search = useSearch(query);
  if (search.isError) return <LoadError error={search.error} onRetry={() => void search.refetch()} />;
  if (!search.data) return <ResultsSkeleton />;
  const results = search.data;
  const shelves = shelvesFor(results, category);

  let topItems = results.top;
  if (category === 'songs') topItems = topItems.filter((i) => i.kind === 'song');
  else if (category === 'albums') topItems = topItems.filter((i) => i.kind === 'album');
  else if (category === 'artists') topItems = topItems.filter((i) => i.kind === 'artist');
  else if (category === 'playlists') topItems = topItems.filter((i) => i.kind === 'playlist' || i.kind === 'spotify-playlist');

  if (!topItems.length && !shelves.length) {
    return <EmptyState title="No Results" detail={`Try searching for something other than “${query}”.`} />;
  }
  return (
    <>
      {topItems.length > 0 && (
        <section aria-label="Top Results">
          <h2 className={sectionTitle}>Top Results</h2>
          <div className={topGrid}>
            {topItems.map((item) => (
              <TopResult key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
      <Shelves shelves={shelves} />
    </>
  );
}

function RecentSearches({ onSelect }: { onSelect: (q: string) => void }) {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(getSearchHistory());
  }, []);

  if (!history.length) return null;

  return (
    <section className="mx-(--body-gutter) mt-4 mb-6" aria-label="Recent Searches">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="type-title-3 font-semibold text-primary">Recent Searches</h2>
        <button
          onClick={() => {
            clearSearchHistory();
            setHistory([]);
          }}
          className="text-xs font-medium text-tertiary hover:text-primary transition-colors cursor-pointer"
        >
          Clear all
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {history.map((term) => (
          <div
            key={term}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-quinary hover:bg-quaternary text-sm text-secondary hover:text-white transition-colors"
          >
            <button
              onClick={() => onSelect(term)}
              className="inline-flex items-center gap-1.5 text-left cursor-pointer"
            >
              <Clock size={13} className="text-tertiary" />
              <span>{term}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeSearchHistoryItem(term);
                setHistory(getSearchHistory());
              }}
              aria-label={`Remove ${term}`}
              className="text-tertiary hover:text-white transition-colors p-0.5 rounded-full hover:bg-white/10"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Landing({ onSelectSearch }: { onSelectSearch: (q: string) => void }) {
  const categories = useCategories();
  return (
    <>
      <RecentSearches onSelect={onSelectSearch} />
      {categories.isError ? (
        <LoadError error={categories.error} onRetry={() => void categories.refetch()} />
      ) : !categories.data ? (
        <div className="mx-(--body-gutter) mt-6 mb-8 grid grid-cols-4 gap-5 max-md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => (
            <SkeletonBlock key={i} aspectRatio="16 / 9" radius="var(--radius-artwork-large)" />
          ))}
        </div>
      ) : (
        <CategoryTiles groups={categories.data.map((g) => ({ ...g, title: g.title || 'Browse Categories' }))} />
      )}
    </>
  );
}

/** Search: sticky bar with category chips, recent searches, and grouped results. */
export default function SearchPage() {
  const { missing } = useYouTubeReady();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [category, setCategory] = useState<SearchCategory>('all');

  const handleSearch = (q: string) => {
    if (q) addSearchHistory(q);
    setParams(q ? { q } : {});
  };

  return (
    <>
      <div className="sticky top-0 z-[calc(var(--z-default)+5)] flex flex-col items-center px-(--body-gutter) pt-3 pb-2 before:absolute before:inset-0 before:-z-1 before:bg-header-material before:[backdrop-filter:saturate(180%)_blur(20px)]">
        <SearchField initial={query} onSearch={handleSearch} />
        {query && !missing && (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-2 [scrollbar-width:none]">
            {SEARCH_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`whitespace-nowrap px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  category === cat.id
                    ? 'bg-key-bg text-white shadow-sm'
                    : 'bg-quinary text-secondary hover:bg-quaternary hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {missing ? (
        <NeedsExtension what="and search YouTube Music" />
      ) : query ? (
        <Results query={query} category={category} />
      ) : (
        <Landing onSelectSearch={handleSearch} />
      )}
    </>
  );
}
