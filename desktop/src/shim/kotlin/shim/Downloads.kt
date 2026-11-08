package com.opentune.data.download

import com.opentune.desktop.DownloadManager
import java.io.File

object Downloads {
    fun lyricsFileFor(videoId: String): File? {
        val lrc = File(DownloadManager.folder, "$videoId.lrc")
        return if (lrc.isFile) lrc else null
    }
}
