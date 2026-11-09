import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { CircleLockup, SquareLockup, VideoLockup } from '@/components/music/Lockups';
import { EmptyState, LoadError, LoadMoreError, NeedsExtension } from '@/components/music/States';
import { TrackList } from '@/components/music/TrackList';
import { isLibrarySection, LIBRARY_SECTIONS } from '@/data/music/library';
import { useLibrary, useSignedIn, useYouTubeReady } from '@/data/music/queries';
import { useYtAuth } from '@/extension/useYtAuth';
import { getOfflineTracks, type OfflineTrackRecord } from '@/playback/download';
import type { Track } from '@/data/music/types';
import { PlainSkeleton } from '@/skeletons/PageSkeletons';
import { seeAllGrid, seeAllTracks } from './pageStyles';

function DownloadedLibrary() {
  const [tracks, setTracks] = useState<OfflineTrackRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOfflineTracks().then((items) => {
      setTracks(items);
      setLoading(false);
    });
  }, []);

  if (loading) return <PlainSkeleton />;

  const musicTracks: Track[] = tracks.map((t, i) => ({
    videoId: t.videoId,
    title: t.title,
    artists: t.artists,
    album: t.album ? { name: t.album.name, id: t.album.id } : null,
    durationSec: t.durationSec,
    explicit: false,
    thumbnail: t.thumbnail,
    index: i + 1,
    plays: null,
  }));

  const context = { source: { title: 'Downloaded', type: 'playlist' as const, id: 'downloaded' } };

  return (
    <>
      <PageHeader title="Downloaded Music" />
      {tracks.length === 0 ? (
        <EmptyState
          title="No downloaded tracks"
          detail="Download songs using the ⋯ menu on any track to listen offline."
        />
      ) : (
        <>
          <div className="mx-(--body-gutter) mb-4 flex items-center justify-between text-xs text-secondary">
            <span>{tracks.length} song{tracks.length === 1 ? '' : 's'} saved offline</span>
          </div>
          <TrackList tracks={musicTracks} variant="playlist" source={context.source} />
        </>
      )}
    </>
  );
}

/** Asks for the next page when [target] scrolls into view. */
function useLoadMore(onVisible: (() => void) | null) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = target.current;
    if (!node || !onVisible) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onVisible(), {
      rootMargin: '600px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible]);
  return target;
}

/** A library section (prompt §5.3): Recently Played, Artists, Albums, Songs, Made for You, All Playlists. */
export default function LibraryPage() {
  const section = useParams().section ?? '';
  const { missing } = useYouTubeReady();
  const auth = useYtAuth();
  const signedIn = useSignedIn();
  const library = useLibrary(isLibrarySection(section) ? section : 'playlists');
  const loadMore = useLoadMore(
    library.hasNextPage && !library.isFetchingNextPage && !library.isFetchNextPageError
      ? () => void library.fetchNextPage()
      : null,
  );

  if (!isLibrarySection(section)) return <Navigate to="/home" replace />;
  if (section === 'downloaded') return <DownloadedLibrary />;
  const title = LIBRARY_SECTIONS[section].title;
  if (missing) return <NeedsExtension what="your library" />;
  if (auth.state === 'ready' && !signedIn) {
    return (
      <>
        <PageHeader title={title} />
        <EmptyState
          title="Sign in to see your library"
          detail="OpenBlast uses the YouTube Music account this browser is signed in to. Sign in on music.youtube.com, then come back."
        />
      </>
    );
  }
  if (library.isError && !library.data) return <LoadError error={library.error} onRetry={() => void library.refetch()} />;
  if (!library.data) return <PlainSkeleton />;

  const grid = library.data.pages.flatMap((page) => page.data.grid);
  const tracks = library.data.pages.flatMap((page) => page.data.tracks);
  return (
    <>
      <PageHeader title={title} />
      {!grid.length && !tracks.length && <EmptyState title="Nothing here yet" />}
      {grid.length > 0 && (
        <ul className={seeAllGrid} data-wide={grid.every((i) => i.wide) || undefined}>
          {grid.map((item, i) => (
            <li key={`${item.id}-${i}`}>
              {item.kind === 'artist' ? (
                <CircleLockup item={item} />
              ) : item.wide ? (
                <VideoLockup item={item} />
              ) : (
                <SquareLockup item={item} />
              )}
            </li>
          ))}
        </ul>
      )}
      {tracks.length > 0 && (
        <div className={seeAllTracks}>
          <TrackList
            tracks={tracks}
            variant="playlist"
            source={{ title, type: 'library', id: section }}
            onNearEnd={
              library.hasNextPage && !library.isFetchingNextPage && !library.isFetchNextPageError
                ? () => void library.fetchNextPage()
                : undefined
            }
          />
        </div>
      )}
      {grid.length > 0 && <div ref={loadMore} aria-hidden="true" />}
      {library.isFetchNextPageError && <LoadMoreError onRetry={() => void library.fetchNextPage()} />}
    </>
  );
}
