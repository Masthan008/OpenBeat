package com.opentune.ads

import android.os.Bundle
import android.os.CountDownTimer
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Headphones
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback

class AdBreakActivity : ComponentActivity() {

    companion object {
        const val EXTRA_REASON = "extra_reason"
    }

    private var breakReason: String = "10_songs"
    private var isAdShowing: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        breakReason = intent.getStringExtra(EXTRA_REASON) ?: "10_songs"

        loadAndShowAd()

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF0C0E14)
                ) {
                    // Non-skippable: intercept Back press
                    BackHandler(enabled = true) {
                        // Prevent skipping
                    }

                    AdBreakScreen(
                        reason = breakReason,
                        onTimeoutFallback = {
                            if (!isAdShowing) {
                                finishBreak()
                            }
                        }
                    )
                }
            }
        }
    }

    private fun loadAndShowAd() {
        val request = AdRequest.Builder().build()
        RewardedInterstitialAd.load(
            this,
            AdBreakManager.AD_UNIT_ID,
            request,
            object : RewardedInterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedInterstitialAd) {
                    if (isFinishing || isDestroyed) return
                    isAdShowing = true
                    ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                        override fun onAdDismissedFullScreenContent() {
                            finishBreak()
                        }

                        override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                            finishBreak()
                        }
                    }
                    ad.show(this@AdBreakActivity) { _ ->
                        // Reward earned
                    }
                }

                override fun onAdFailedToLoad(loadAdError: LoadAdError) {
                    // If ad fails to load (e.g. offline), fallback timer in UI will close break
                }
            }
        )
    }

    private fun finishBreak() {
        AdBreakManager.onBreakFinished(breakReason)
        finish()
    }
}

@Composable
private fun AdBreakScreen(
    reason: String,
    onTimeoutFallback: () -> Unit
) {
    var secondsRemaining by remember { mutableIntStateOf(30) }
    var progress by remember { mutableFloatStateOf(1f) }

    LaunchedEffect(Unit) {
        val totalMs = 30_000L
        val intervalMs = 1000L
        object : CountDownTimer(totalMs, intervalMs) {
            override fun onTick(millisUntilFinished: Long) {
                secondsRemaining = (millisUntilFinished / 1000L).toInt().coerceAtLeast(0)
                progress = millisUntilFinished.toFloat() / totalMs.toFloat()
            }

            override fun onFinish() {
                secondsRemaining = 0
                progress = 0f
                onTimeoutFallback()
            }
        }.start()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp, vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(76.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(Color(0xFF1E222D)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Rounded.Headphones,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(42.dp)
            )
        }

        Spacer(modifier = Modifier.height(28.dp))

        Text(
            text = "Short Audio Break",
            color = Color.White,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(10.dp))

        Text(
            text = if (reason == "15_minutes") {
                "Taking a short 30-second break after 15 minutes of continuous music to support cloud servers."
            } else {
                "Short 30-second break supporting OpenBeat high-speed streaming infrastructure and backend maintenance."
            },
            color = Color(0xFFAEB4C2),
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp
        )

        Spacer(modifier = Modifier.height(36.dp))

        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth(0.7f)
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp)),
            color = Color(0xFF6366F1),
            trackColor = Color(0xFF232733)
        )

        Spacer(modifier = Modifier.height(18.dp))

        Text(
            text = "${secondsRemaining}s break",
            color = Color(0xFF7E8494),
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium
        )
    }
}
