package com.opentune.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.widget.RemoteViews
import androidx.annotation.OptIn
import androidx.core.content.edit
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaButtonReceiver
import coil3.imageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import com.opentune.MainActivity
import com.opentune.R
import com.opentune.data.library.LibraryStore
import com.opentune.data.model.Song
import com.opentune.data.model.artworkAt
import com.opentune.data.subsonic.Subsonic
import com.opentune.playback.PlaybackService
import com.opentune.playback.PlayerConnection
import com.opentune.playback.toSong
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

/**
 * The home-screen widget: cover, title and artist, previous / play-pause /
 * next, and the heart.
 *
 * The playback buttons are media-button events sent through Media3's
 * [MediaButtonReceiver], which starts the player service if it isn't
 * running (resuming the saved queue), the same path a Bluetooth headset's
 * buttons take. The heart goes straight to the library. The last song shown
 * is kept, cover included, so the widget isn't blank after a restart.
 */
@OptIn(UnstableApi::class)
open class NowPlayingWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val state = load(context)
        render(context, state)
        if (state.thumbnailUrl != null && (!coverFile(context).exists() ||
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("cover-thumbnail", null) != state.thumbnailUrl)) {
            coverFor = state.thumbnailUrl
            loadCover(context, state)
        }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        render(context, load(context))
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_PLAY_PAUSE -> {
                val player = PlaybackService.activeSession?.player
                if (player != null) {
                    if (player.isPlaying) player.pause() else player.play()
                } else {
                    val conn = PlayerConnection(context.applicationContext)
                    scope.launch {
                        try {
                            withTimeout(3000L) { conn.connected.first { it } }
                            conn.togglePlayPause()
                        } catch (t: Throwable) {
                            sendMediaButtonFallback(context, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
                        }
                    }
                }
            }
            ACTION_NEXT -> {
                val player = PlaybackService.activeSession?.player
                if (player != null) {
                    player.seekToNext()
                } else {
                    val conn = PlayerConnection(context.applicationContext)
                    scope.launch {
                        try {
                            withTimeout(3000L) { conn.connected.first { it } }
                            conn.skipNext()
                        } catch (t: Throwable) {
                            sendMediaButtonFallback(context, KeyEvent.KEYCODE_MEDIA_NEXT)
                        }
                    }
                }
            }
            ACTION_PREVIOUS -> {
                val player = PlaybackService.activeSession?.player
                if (player != null) {
                    player.seekToPrevious()
                } else {
                    val conn = PlayerConnection(context.applicationContext)
                    scope.launch {
                        try {
                            withTimeout(3000L) { conn.connected.first { it } }
                            conn.skipPrevious()
                        } catch (t: Throwable) {
                            sendMediaButtonFallback(context, KeyEvent.KEYCODE_MEDIA_PREVIOUS)
                        }
                    }
                }
            }
            ACTION_LIKE -> {
                val state = load(context)
                val id = state.videoId ?: return
                val song = Song(id, state.title, state.artist, state.thumbnailUrl)
                LibraryStore.setLiked(song, !LibraryStore.isLiked(id))
                render(context, state.copy(liked = LibraryStore.isLiked(id)))
            }
        }
    }

    private data class State(
        val videoId: String? = null,
        val title: String = "",
        val artist: String = "",
        val thumbnailUrl: String? = null,
        val playing: Boolean = false,
        val liked: Boolean = false,
    )

    companion object {
        const val ACTION_PLAY_PAUSE = "com.opentune.widget.PLAY_PAUSE"
        const val ACTION_NEXT = "com.opentune.widget.NEXT"
        const val ACTION_PREVIOUS = "com.opentune.widget.PREVIOUS"
        const val ACTION_LIKE = "com.opentune.widget.LIKE"
        private var lyricsJob: Job? = null
        private var cachedLyricLine: String? = null
        private var lyricsForId: String? = null
        private const val PREFS = "widget"
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        private var last: State? = null
        private var coverFor: String? = null
        private var coverJob: Job? = null

        /** Brings every placed widget up to date with [player]; cheap when nothing changed. */
        fun refresh(context: Context, player: Player?) {
            runCatching {
                val item = player?.currentMediaItem
                val song = item?.toSong()
                val state = State(
                    videoId = song?.videoId,
                    title = song?.title.orEmpty(),
                    artist = song?.artist.orEmpty(),
                    thumbnailUrl = song?.thumbnailUrl,
                    playing = player?.isPlaying == true,
                    liked = song?.videoId?.let(LibraryStore::isLiked) == true,
                )
                if (state == last) return@runCatching
                last = state
                save(context, state)
                render(context, state)
                if (state.thumbnailUrl != coverFor) {
                    coverFor = state.thumbnailUrl
                    loadCover(context.applicationContext, state)
                }
                fetchLyrics(context.applicationContext, state, player?.currentPosition ?: 0L)
            }
        }

        /** The player has gone: keep the song shown, with Play rather than Pause. */
        fun stopped(context: Context) {
            val state = (last ?: load(context)).copy(playing = false)
            last = state
            render(context, state)
        }

        private fun loadCover(context: Context, state: State) {
            coverJob?.cancel()
            val file = coverFile(context)
            val url = Subsonic.resolveCover(state.thumbnailUrl.artworkAt(COVER_PX))
            if (url == null) {
                file.delete()
                render(context, state)
                return
            }
            coverJob = scope.launch {
                val request = ImageRequest.Builder(context).data(url).size(COVER_PX).allowHardware(false).build()
                val bitmap = (context.imageLoader.execute(request) as? SuccessResult)?.image?.toBitmap() ?: return@launch
                val temporary = File.createTempFile("widget-cover-", ".jpg", context.cacheDir)
                try {
                    val written = withContext(Dispatchers.IO) {
                        runCatching { temporary.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) } }.getOrDefault(false)
                    }
                    if (!written || coverFor != state.thumbnailUrl || !temporary.renameTo(file)) return@launch
                    // Match the saved file to its song only after a successful atomic write.
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
                        putString("cover-thumbnail", state.thumbnailUrl)
                    }
                    render(context, last ?: state)
                } finally {
                    temporary.delete()
                }
            }
        }

        private fun render(context: Context, state: State) {
            runCatching {
                val manager = AppWidgetManager.getInstance(context)
            val cover = coverFile(context).takeIf {
                state.videoId != null && it.exists() && state.thumbnailUrl != null &&
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("cover-thumbnail", null) == state.thumbnailUrl
            }?.let { BitmapFactory.decodeFile(it.path) }
            val designs = listOf(
                NowPlayingWidget::class.java to R.layout.widget_now_playing,
                AlbumArtWidget::class.java to R.layout.widget_album_art,
                StudioWidget::class.java to R.layout.widget_studio,
                MiniPlayerWidget::class.java to R.layout.widget_mini_player,
                TurntableWidget::class.java to R.layout.widget_turntable,
                LyricsGlanceWidget::class.java to R.layout.widget_lyrics_glance,
            )
            for ((provider, layout) in designs) {
                val ids = manager.getAppWidgetIds(ComponentName(context, provider))
                if (ids.isEmpty()) continue
                for (id in ids) {
                    val views = RemoteViews(context.packageName, layout)
                    val width = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 300)
                    val compact = provider == NowPlayingWidget::class.java
                    val empty = state.videoId == null
                    if (provider == LyricsGlanceWidget::class.java) {
                        views.setTextViewText(R.id.widget_artist, if (empty) "NOW PLAYING · LYRICS" else "${state.title} · ${state.artist}")
                        val lyric = cachedLyricLine ?: if (empty) context.getString(R.string.widget_nothing_playing) else state.title
                        views.setTextViewText(R.id.widget_title, lyric)
                    } else {
                        views.setTextViewText(R.id.widget_title, if (empty) context.getString(R.string.widget_nothing_playing) else state.title)
                        views.setTextViewText(R.id.widget_artist, if (empty) context.getString(R.string.widget_open) else state.artist)
                    }
                    if (cover != null) views.setImageViewBitmap(R.id.widget_cover, cover) else views.setImageViewResource(R.id.widget_cover, R.drawable.ic_widget_cover)
                    views.setImageViewResource(R.id.widget_play, if (state.playing) R.drawable.ic_widget_pause else R.drawable.ic_widget_play)
                    views.setContentDescription(R.id.widget_play, context.getString(if (state.playing) R.string.widget_pause else R.string.widget_play))
                    views.setImageViewResource(R.id.widget_like, if (state.liked) R.drawable.ic_widget_heart_filled else R.drawable.ic_widget_heart)
                    views.setContentDescription(R.id.widget_like, context.getString(if (state.liked) R.string.widget_unlike else R.string.widget_like))
                    // Keep real space for the song's title on narrow launcher cells.
                    views.setViewVisibility(R.id.widget_like, if (empty || (compact && width < 420)) View.GONE else View.VISIBLE)
                    views.setViewVisibility(R.id.widget_previous, if (compact && width < 360) View.GONE else View.VISIBLE)

                    views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
                        context, id, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                    ))
                    views.setOnClickPendingIntent(R.id.widget_previous, widgetAction(context, provider, ACTION_PREVIOUS, id * 10 + 1))
                    views.setOnClickPendingIntent(R.id.widget_play, widgetAction(context, provider, ACTION_PLAY_PAUSE, id * 10 + 2))
                    views.setOnClickPendingIntent(R.id.widget_next, widgetAction(context, provider, ACTION_NEXT, id * 10 + 3))
                    views.setOnClickPendingIntent(R.id.widget_like, widgetAction(context, provider, ACTION_LIKE, id * 10 + 4))
                    manager.updateAppWidget(id, views)
                }
            }
            }
        }

        private fun widgetAction(context: Context, provider: Class<*>, action: String, requestCode: Int): PendingIntent {
            val intent = Intent(context, provider).setAction(action)
            return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        }

        private fun sendMediaButtonFallback(context: Context, keyCode: Int) {
            val down = Intent(Intent.ACTION_MEDIA_BUTTON)
                .setComponent(ComponentName(context, MediaButtonReceiver::class.java))
                .putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
            val up = Intent(Intent.ACTION_MEDIA_BUTTON)
                .setComponent(ComponentName(context, MediaButtonReceiver::class.java))
                .putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_UP, keyCode))
            context.sendBroadcast(down)
            context.sendBroadcast(up)
        }

        private fun fetchLyrics(context: Context, state: State, positionMs: Long = 0L) {
            val id = state.videoId ?: run {
                cachedLyricLine = null
                lyricsForId = null
                return
            }
            if (lyricsForId == id && cachedLyricLine != null) return
            lyricsForId = id
            lyricsJob?.cancel()
            lyricsJob = scope.launch(Dispatchers.IO) {
                val dur = PlaybackService.activeSession?.player?.duration?.coerceAtLeast(0L) ?: 0L
                val lyrics = runCatching {
                    com.opentune.data.lyrics.LyricsRepository.lyricsFor(id, state.title, state.artist, dur)
                }.getOrNull()

                val line = when (lyrics) {
                    is com.opentune.data.lyrics.Lyrics.Synced -> {
                        val pos = PlaybackService.activeSession?.player?.currentPosition ?: positionMs
                        lyrics.lines.findLast { it.startMs <= pos }?.text
                            ?: lyrics.lines.firstOrNull()?.text
                            ?: state.title
                    }
                    is com.opentune.data.lyrics.Lyrics.Plain -> {
                        lyrics.text.lineSequence().firstOrNull { it.isNotBlank() } ?: state.title
                    }
                    else -> state.title
                }
                cachedLyricLine = line
                withContext(Dispatchers.Main) {
                    render(context, last ?: state)
                }
            }
        }

        private fun coverFile(context: Context) = File(context.cacheDir, "widget-cover.jpg")

        private fun save(context: Context, s: State) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
            putString("id", s.videoId)
            putString("title", s.title)
            putString("artist", s.artist)
            putString("thumb", s.thumbnailUrl)
            putBoolean("liked", s.liked)
        }

        private fun load(context: Context): State {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val id = p.getString("id", null)
            return State(id, p.getString("title", "").orEmpty(), p.getString("artist", "").orEmpty(), p.getString("thumb", null),
                playing = last?.playing == true, liked = id?.let(LibraryStore::isLiked) == true)
        }

        private const val COVER_PX = 384
    }
}

/** Artwork-first and spacious transport variants, sharing playback and durable state. */
class AlbumArtWidget : NowPlayingWidget()
class StudioWidget : NowPlayingWidget()
class MiniPlayerWidget : NowPlayingWidget()
class TurntableWidget : NowPlayingWidget()
class LyricsGlanceWidget : NowPlayingWidget()
