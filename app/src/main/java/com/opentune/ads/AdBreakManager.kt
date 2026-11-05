package com.opentune.ads

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.util.Log
import androidx.media3.common.Player
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Manages Google AdMob non-skippable 30-second ad breaks for OpenBeat.
 *
 * Rules:
 * 1. 10 Completed Songs: Trigger a 30s ad break ONLY after 10 songs play completely to the end.
 *    Manual skips and paused tracks NEVER increment this counter.
 * 2. 15 Minutes Active Time: Trigger a 30s audio break after every 15 minutes (900 seconds)
 *    of continuous listening time. Paused time is not counted.
 * 3. Seamless Integration: Automatically pauses ExoPlayer during the break and resumes playback upon completion.
 */
object AdBreakManager {
    private const val TAG = "AdBreakManager"
    private const val PREFS_NAME = "openbeat_ad_prefs"
    private const val KEY_COMPLETED_SONGS = "completed_song_count"
    private const val SONGS_TARGET = 10
    private const val ACTIVE_SECONDS_TARGET = 15 * 60L // 900 seconds (15 minutes)

    /** Official Google AdMob sample test Ad Unit ID for Rewarded Interstitial. */
    val AD_UNIT_ID: String get() = com.opentune.BuildConfig.ADMOB_REWARDED_AD_UNIT_ID

    private var appContext: Context? = null
    private var prefs: SharedPreferences? = null

    @Volatile
    private var activePlayer: Player? = null

    @Volatile
    var currentActivity: Activity? = null
        private set

    @Volatile
    var isBreakActive: Boolean = false
        private set

    private var completedSongs: Int = 0
    private var activePlaybackSeconds: Long = 0L

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var tickerJob: Job? = null

    private var rewardedAd: RewardedInterstitialAd? = null
    private var isLoadingAd: Boolean = false

    /**
     * Initializes the manager, attaches activity lifecycle observers, and restores persisted counts.
     */
    fun install(application: Application) {
        appContext = application.applicationContext
        prefs = application.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        // Reset counters on fresh app session so previous session counts never trigger immediate ads on first song
        completedSongs = 0
        activePlaybackSeconds = 0L
        prefs?.edit()?.putInt(KEY_COMPLETED_SONGS, 0)?.apply()

        application.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityResumed(activity: Activity) {
                currentActivity = activity
            }
            override fun onActivityPaused(activity: Activity) {
                if (currentActivity === activity) currentActivity = null
            }
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {
                if (currentActivity === activity) currentActivity = null
            }
        })

        // Hook into AppHooks
        com.opentune.data.AppHooks.onSongCompletedNaturally = { context, player ->
            onSongCompletedNaturally(context, player)
        }
        com.opentune.data.AppHooks.onPlaybackStateChanged = { context, player, isPlaying ->
            onPlaybackStateChanged(context, player, isPlaying)
        }

        preload(application)
    }

    /** Preloads the next 30-second Rewarded Interstitial Ad in background. */
    fun preload(context: Context) {
        if (rewardedAd != null || isLoadingAd) return
        isLoadingAd = true
        runCatching {
            val request = AdRequest.Builder().build()
            RewardedInterstitialAd.load(
                context,
                AD_UNIT_ID,
                request,
                object : RewardedInterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedInterstitialAd) {
                        rewardedAd = ad
                        isLoadingAd = false
                        Log.d(TAG, "AdMob Rewarded Interstitial successfully preloaded.")
                    }

                    override fun onAdFailedToLoad(loadAdError: LoadAdError) {
                        rewardedAd = null
                        isLoadingAd = false
                        Log.w(TAG, "AdMob failed to preload: ${loadAdError.message}")
                    }
                }
            )
        }.onFailure {
            rewardedAd = null
            isLoadingAd = false
            Log.w(TAG, "AdMob preload error: ${it.message}")
        }
    }

    /** Called by PlaybackService on Player.MEDIA_ITEM_TRANSITION_REASON_AUTO only. */
    fun onSongCompletedNaturally(context: Context, player: Player?) {
        activePlayer = player ?: activePlayer
        if (isBreakActive) return

        completedSongs++
        prefs?.edit()?.putInt(KEY_COMPLETED_SONGS, completedSongs)?.apply()
        Log.d(TAG, "Completed full song: $completedSongs / $SONGS_TARGET")

        if (completedSongs >= SONGS_TARGET) {
            triggerBreak(context, "10_songs")
        }
    }

    /** Called when player transitions between active playing and paused states. */
    fun onPlaybackStateChanged(context: Context, player: Player?, isPlaying: Boolean) {
        activePlayer = player ?: activePlayer
        if (isPlaying) {
            startActiveTimer(context)
        } else {
            stopActiveTimer()
        }
    }

    fun onPlayerChanged(player: Player?) {
        activePlayer = player ?: activePlayer
    }

    private fun startActiveTimer(context: Context) {
        tickerJob?.cancel()
        tickerJob = scope.launch {
            while (isActive) {
                delay(1000L)
                if (activePlayer?.isPlaying == true && !isBreakActive) {
                    activePlaybackSeconds++
                    if (activePlaybackSeconds >= ACTIVE_SECONDS_TARGET) {
                        triggerBreak(context, "15_minutes")
                        break
                    }
                }
            }
        }
    }

    private fun stopActiveTimer() {
        tickerJob?.cancel()
        tickerJob = null
    }

    /** Triggers the unskippable 30-second ad break. */
    @Synchronized
    private fun triggerBreak(context: Context, reason: String) {
        if (isBreakActive) return
        isBreakActive = true
        Log.i(TAG, "Triggering ad break. Reason: $reason (Songs: $completedSongs, ActiveSecs: $activePlaybackSeconds)")

        scope.launch(Dispatchers.Main) {
            runCatching {
                try {
                    activePlayer?.pause()
                } catch (t: Throwable) {
                    Log.w(TAG, "Failed to pause player for ad break", t)
                }

                val activity = currentActivity
                if (activity != null && !activity.isFinishing && !activity.isDestroyed && rewardedAd != null) {
                    showRewardedAd(activity, reason)
                } else {
                    val targetContext = currentActivity ?: context
                    val intent = Intent(targetContext, AdBreakActivity::class.java).apply {
                        putExtra(AdBreakActivity.EXTRA_REASON, reason)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    }
                    targetContext.startActivity(intent)
                }
            }.onFailure {
                isBreakActive = false
                Log.w(TAG, "Failed to trigger break safely: ${it.message}")
            }
        }
    }

    /** Displays the preloaded Rewarded Interstitial ad directly. */
    private fun showRewardedAd(activity: Activity, reason: String) {
        val ad = rewardedAd
        if (ad == null) {
            onBreakFinished(reason)
            return
        }

        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                rewardedAd = null
                onBreakFinished(reason)
                preload(activity)
            }

            override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                Log.w(TAG, "Ad failed to show: ${adError.message}")
                rewardedAd = null
                onBreakFinished(reason)
                preload(activity)
            }

            override fun onAdShowedFullScreenContent() {
                Log.d(TAG, "AdMob Rewarded Interstitial showing.")
            }
        }

        ad.show(activity) { _ ->
            Log.d(TAG, "User completed 30-second ad reward.")
        }
    }

    /** Concludes the break, resets the triggered threshold, and resumes playback. */
    fun onBreakFinished(reason: String) {
        isBreakActive = false
        if (reason == "10_songs") {
            completedSongs = 0
            prefs?.edit()?.putInt(KEY_COMPLETED_SONGS, 0)?.apply()
        }
        if (reason == "15_minutes") {
            activePlaybackSeconds = 0L
        }

        Log.i(TAG, "Ad break completed. Resuming music playback.")
        scope.launch(Dispatchers.Main) {
            try {
                activePlayer?.play()
            } catch (t: Throwable) {
                Log.w(TAG, "Failed to resume player after ad break", t)
            }
        }

        appContext?.let { preload(it) }
    }

    /** Provides current statistics for debug / settings display. */
    fun stats(): Pair<Int, Long> = Pair(completedSongs, activePlaybackSeconds)
}
