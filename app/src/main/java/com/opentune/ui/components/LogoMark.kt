package com.opentune.ui.components

import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.PathParser

/**
 * The OpenTune mark as path data in the launcher icon's 108 by 108 space,
 * the same shape as res/drawable/ic_launcher_foreground.xml, for drawing it
 * at any size (the opening animation zooms into it).
 */
internal const val MARK_VIEWPORT = 108f

internal const val MARK_PATH_DATA: String = "M 28,58 C 28,39 39,26 54,26 C 69,26 80,39 80,58 L 75,58 C 75,42 65,31 54,31 C 43,31 33,42 33,58 Z M 24.75,52.25 A 3.25,3.25 0 0 1 31.25,52.25 L 31.25,63.75 A 3.25,3.25 0 0 1 24.75,63.75 Z M 76.75,52.25 A 3.25,3.25 0 0 1 83.25,52.25 L 83.25,63.75 A 3.25,3.25 0 0 1 76.75,63.75 Z M 37.90,49.10 A 2.10,2.10 0 0 1 42.10,49.10 L 42.10,58.90 A 2.10,2.10 0 0 1 37.90,58.90 Z M 44.75,43.25 A 2.25,2.25 0 0 1 49.25,43.25 L 49.25,64.75 A 2.25,2.25 0 0 1 44.75,64.75 Z M 51.50,37.50 A 2.50,2.50 0 0 1 56.50,37.50 L 56.50,70.50 A 2.50,2.50 0 0 1 51.50,70.50 Z M 58.75,43.25 A 2.25,2.25 0 0 1 63.25,43.25 L 63.25,64.75 A 2.25,2.25 0 0 1 58.75,64.75 Z M 65.90,49.10 A 2.10,2.10 0 0 1 70.10,49.10 L 70.10,58.90 A 2.10,2.10 0 0 1 65.90,58.90 Z"

/** The mark as a [Path] in [MARK_VIEWPORT] units. */
internal fun markPath(): Path = PathParser().parsePathString(MARK_PATH_DATA).toPath()
