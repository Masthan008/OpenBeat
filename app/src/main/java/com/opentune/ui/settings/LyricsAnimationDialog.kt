package com.opentune.ui.settings

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.opentune.data.lyrics.LyricLine
import com.opentune.data.lyrics.LyricWord
import com.opentune.data.settings.AppSettings
import com.opentune.data.settings.LyricsAnimation
import com.opentune.ui.components.FloatingCard
import com.opentune.ui.components.LocalFloatingCard
import com.opentune.ui.components.rememberHaptics
import com.opentune.ui.player.LyricLineView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Composable
fun LyricsAnimationDialog(
    selected: LyricsAnimation,
    onSelect: (LyricsAnimation) -> Unit,
    onDismiss: () -> Unit,
) {
    val ui by AppSettings.ui.collectAsState()
    val still = ui.reduceAnimation
    val haptics = rememberHaptics()
    var picked by remember { mutableStateOf(selected) }

    FloatingCard(
        onDismiss = onDismiss,
        title = "Lyrics animation",
        contentPadding = PaddingValues(0.dp),
    ) {
        val card = LocalFloatingCard.current
        Column(Modifier.fillMaxWidth()) {
            // Options list
            Box(Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState())) {
                AnimationOptions(
                    options = LyricsAnimation.entries,
                    picked = picked,
                    still = still,
                ) { a ->
                    if (a != picked) {
                        haptics.tick()
                        picked = a
                        onSelect(a)
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            // Live Interactive Preview Box
            LyricsAnimationPreviewBox(animation = picked)

            Spacer(Modifier.height(12.dp))

            // Done button
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.primary)
                        .clickable { card?.close() ?: onDismiss() }
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                ) {
                    Text(
                        text = "Apply",
                        style = MaterialTheme.typography.labelLarge.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onPrimary,
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun AnimationOptions(
    options: List<LyricsAnimation>,
    picked: LyricsAnimation,
    still: Boolean,
    onPick: (LyricsAnimation) -> Unit,
) {
    val density = LocalDensity.current
    val tops = remember { mutableStateMapOf<Int, Float>() }
    val heights = remember { mutableStateMapOf<Int, Float>() }
    val lensTop = remember { Animatable(0f) }
    val lensHeight = remember { Animatable(0f) }
    var placed by remember { mutableStateOf(false) }
    val index = options.indexOf(picked)

    LaunchedEffect(index, tops[index], heights[index]) {
        val top = tops[index] ?: return@LaunchedEffect
        val height = heights[index] ?: return@LaunchedEffect
        if (!placed || still) {
            lensTop.snapTo(top)
            lensHeight.snapTo(height)
            placed = true
        } else {
            launch { lensTop.animateTo(top, spring(dampingRatio = 0.72f, stiffness = 420f)) }
            launch { lensHeight.animateTo(height, spring(dampingRatio = 0.9f, stiffness = 420f)) }
        }
    }

    Box(Modifier.fillMaxWidth()) {
        if (placed) {
            Box(
                Modifier
                    .offset { IntOffset(0, lensTop.value.roundToInt()) }
                    .fillMaxWidth()
                    .height(with(density) { lensHeight.value.toDp() })
                    .clip(RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f))
                    .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f), RoundedCornerShape(20.dp)),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            options.forEachIndexed { i, opt ->
                val interaction = remember { MutableInteractionSource() }
                val pressed by interaction.collectIsPressedAsState()
                val press by animateFloatAsState(if (pressed) 0.97f else 1f, spring(0.6f, 700f), label = "optPress")
                val isSelected = opt == picked
                val checkAlpha by animateFloatAsState(if (isSelected) 1f else 0f, label = "optCheck")

                Row(
                    Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned {
                            tops[i] = it.positionInParent().y
                            heights[i] = it.size.height.toFloat()
                        }
                        .graphicsLayer { scaleX = press; scaleY = press }
                        .clickable(interactionSource = interaction, indication = null) { onPick(opt) }
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = opt.label,
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            ),
                        )
                        Text(
                            text = opt.summary,
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                            ),
                        )
                    }
                    if (checkAlpha > 0.05f) {
                        Box(
                            Modifier
                                .size(24.dp)
                                .graphicsLayer { alpha = checkAlpha; scaleX = checkAlpha; scaleY = checkAlpha }
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Rounded.Check,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LyricsAnimationPreviewBox(animation: LyricsAnimation) {
    // 3 sample lines
    val sampleLines = remember {
        listOf(
            LyricLine(0L, 2500L, "Walking through the soundscape", emptyList(), false),
            LyricLine(
                2500L,
                5500L,
                "Feel the melody come alive",
                listOf(
                    LyricWord("Feel", 2500L, 2900L),
                    LyricWord("the", 2900L, 3300L),
                    LyricWord("melody", 3300L, 4100L),
                    LyricWord("come", 4100L, 4700L),
                    LyricWord("alive", 4700L, 5500L),
                ),
                true,
            ),
            LyricLine(5500L, 8500L, "Every beat in perfect rhythm", emptyList(), false),
        )
    }

    var activeLineIndex by remember { mutableIntStateOf(1) }

    // Periodically step through lines so all animation transitions (glow, bounce, cascade) are seen
    LaunchedEffect(Unit) {
        while (true) {
            delay(3200)
            activeLineIndex = (activeLineIndex + 1) % sampleLines.size
        }
    }

    // Virtual position animation sweeping smoothly across 0..8500ms
    val transition = rememberInfiniteTransition(label = "lyricTimer")
    val virtualTimeMs by transition.animateFloat(
        initialValue = 0f,
        targetValue = 8500f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 8500, easing = LinearEasing),
            repeatMode = androidx.compose.animation.core.RepeatMode.Restart,
        ),
        label = "lyricVirtualTime",
    )

    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f),
                    ),
                ),
            )
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f), RoundedCornerShape(20.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                Icons.Rounded.AutoAwesome,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(15.dp),
            )
            Text(
                text = "LIVE ANIMATION PREVIEW",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.1.sp,
                    color = MaterialTheme.colorScheme.primary,
                ),
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = animation.label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                ),
            )
        }

        Spacer(Modifier.height(8.dp))

        // Display sample lines with LyricLineView
        Column(
            Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            sampleLines.forEachIndexed { i, line ->
                val distance = i - activeLineIndex
                val isActive = i == activeLineIndex
                LyricLineView(
                    line = line,
                    distance = distance,
                    isActive = isActive,
                    animation = animation,
                    blurEnabled = true,
                    position = { virtualTimeMs.toLong() },
                    onClick = { activeLineIndex = i },
                )
            }
        }
    }
}
