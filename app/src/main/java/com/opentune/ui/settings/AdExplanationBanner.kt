package com.opentune.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.CloudQueue
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Transparency notice explaining why occasional non-skippable ad breaks
 * are shown to support backend streaming servers and cloud infrastructure.
 */
@Composable
fun AdExplanationBanner(modifier: Modifier = Modifier) {
    val containerColor = MaterialTheme.colorScheme.surfaceVariant
    val contentColor = MaterialTheme.colorScheme.onSurfaceVariant
    val primaryColor = MaterialTheme.colorScheme.primary

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(containerColor)
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.CloudQueue,
            contentDescription = null,
            modifier = Modifier.size(28.dp),
            tint = primaryColor,
        )
        Box(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = "Supporting OpenBeat Infrastructure",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = contentColor,
            )
            Text(
                text = "OpenBeat is free to enjoy. Short breaks help cover cloud streaming bandwidth and backend maintenance costs so playback remains fast and unlimited for all listeners.",
                style = MaterialTheme.typography.bodySmall,
                color = contentColor.copy(alpha = 0.85f),
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/** Retained for backwards compatibility if referenced elsewhere. */
@Composable
internal fun CommunityBanner(modifier: Modifier = Modifier) {
    AdExplanationBanner(modifier)
}
