package com.opentune.ui.player

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.media3.common.Player
import com.opentune.R
import com.opentune.playback.PlaybackService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * A floating, draggable system overlay bubble displaying synchronized lyrics
 * or current track info over other apps with quick play/pause controls.
 */
class FloatingLyricsService : Service() {

    private var windowManager: WindowManager? = null
    private var floatView: View? = null
    private var params: WindowManager.LayoutParams? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            updatePlayPauseButton(isPlaying)
        }

        override fun onMediaItemTransition(mediaItem: androidx.media3.common.MediaItem?, reason: Int) {
            updateTrackInfo()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate() {
        super.onCreate()
        active = true

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val inflater = LayoutInflater.from(this)
        floatView = inflater.inflate(R.layout.floating_lyrics_bubble, null)

        val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 100
            y = 200
        }

        setupDragAndControls()
        windowManager?.addView(floatView, params)

        PlaybackService.activePlayer?.addListener(playerListener)
        updateTrackInfo()
        updatePlayPauseButton(PlaybackService.activePlayer?.isPlaying == true)

        // Periodic updater for title/playback state
        scope.launch {
            while (isActive) {
                delay(1000)
                updateTrackInfo()
                updatePlayPauseButton(PlaybackService.activePlayer?.isPlaying == true)
            }
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupDragAndControls() {
        val root = floatView ?: return
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f

        root.setOnTouchListener { _, event ->
            val p = params ?: return@setOnTouchListener false
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = p.x
                    initialY = p.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    p.x = initialX + (event.rawX - initialTouchX).toInt()
                    p.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager?.updateViewLayout(floatView, p)
                    true
                }
                else -> false
            }
        }

        root.findViewById<ImageButton>(R.id.floating_play_pause)?.setOnClickListener {
            val player = PlaybackService.activePlayer ?: return@setOnClickListener
            if (player.isPlaying) player.pause() else player.play()
            updatePlayPauseButton(player.isPlaying)
        }

        root.findViewById<ImageButton>(R.id.floating_close)?.setOnClickListener {
            stopSelf()
        }
    }

    private fun updatePlayPauseButton(isPlaying: Boolean) {
        val btn = floatView?.findViewById<ImageButton>(R.id.floating_play_pause) ?: return
        btn.setImageResource(if (isPlaying) R.drawable.ic_widget_pause else R.drawable.ic_widget_play)
    }

    private fun updateTrackInfo() {
        val textView = floatView?.findViewById<TextView>(R.id.floating_lyrics_text) ?: return
        val player = PlaybackService.activePlayer
        val item = player?.currentMediaItem
        val title = item?.mediaMetadata?.title?.toString()
        val artist = item?.mediaMetadata?.artist?.toString()

        textView.text = when {
            title != null && artist != null -> "♪ $title · $artist"
            title != null -> "♪ $title"
            else -> "♪ OpenBlast Lyrics"
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        active = false
        PlaybackService.activePlayer?.removeListener(playerListener)
        scope.cancel()
        floatView?.let { windowManager?.removeView(it) }
        floatView = null
    }

    companion object {
        @Volatile
        var active: Boolean = false
            private set

        fun canDrawOverlays(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }

        fun overlayPermissionIntent(context: Context): Intent {
            return Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            )
        }

        fun start(context: Context) {
            context.startService(Intent(context, FloatingLyricsService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, FloatingLyricsService::class.java))
        }

        fun toggle(context: Context) {
            if (active) stop(context) else start(context)
        }
    }
}
