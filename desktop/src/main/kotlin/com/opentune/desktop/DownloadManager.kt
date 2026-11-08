package com.opentune.desktop

import com.opentune.data.Http
import com.opentune.data.model.Song
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.Request

/**
 * Manages background downloading and local disk caching of audio streams
 * into ~/Music/OpenBlast/ for offline listening.
 */
object DownloadManager {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _active = MutableStateFlow<Set<String>>(emptySet())
    val active: StateFlow<Set<String>> = _active.asStateFlow()

    private val _progress = MutableStateFlow<Map<String, Float>>(emptyMap())
    val progress: StateFlow<Map<String, Float>> = _progress.asStateFlow()

    val folder: File
        get() {
            val userHome = System.getProperty("user.home")
            val music = File(userHome, "Music")
            val target = File(if (music.isDirectory) music else File(userHome, ".opentune"), "OpenBlast")
            if (!target.exists()) target.mkdirs()
            return target
        }

    fun isDownloading(videoId: String): Boolean = videoId in _active.value

    fun download(song: Song) {
        if (isDownloading(song.videoId) || Library.isDownloaded(song.videoId)) return
        _active.value = _active.value + song.videoId
        scope.launch {
            val cleanTitle = "${song.artist} - ${song.title}".replace(Regex("[\\\\/:*?\"<>|]"), "_").trim().take(80)
            var partFile: File? = null
            try {
                val stream = Streams.resolve(song.videoId, kind = Streams.Kind.AAC)
                val ext = if (stream.mimeType.contains("webm")) "opus" else "m4a"
                val target = File(folder, "$cleanTitle [${song.videoId}].$ext")
                val part = File(folder, "$cleanTitle [${song.videoId}].part")
                partFile = part

                val request = Request.Builder().url(stream.url).build()
                Http.client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
                    val body = response.body
                    val total = body.contentLength()
                    var bytesWritten = 0L

                    part.outputStream().use { fos ->
                        body.byteStream().use { input ->
                            val buf = ByteArray(65536)
                            while (true) {
                                val read = input.read(buf)
                                if (read <= 0) break
                                fos.write(buf, 0, read)
                                bytesWritten += read
                                if (total > 0) {
                                    _progress.value = _progress.value + (song.videoId to (bytesWritten.toFloat() / total.toFloat()))
                                }
                            }
                        }
                    }
                }

                if (target.exists()) target.delete()
                if (!part.renameTo(target)) {
                    part.copyTo(target, overwrite = true)
                    part.delete()
                }
                Library.saveDownload(song, target)
            } catch (e: Exception) {
                System.err.println("DownloadManager: failed to download ${song.videoId}: $e")
                partFile?.delete()
            } finally {
                _active.value = _active.value - song.videoId
                _progress.value = _progress.value - song.videoId
            }
        }
    }

    fun delete(song: Song) {
        runCatching {
            Library.downloadFileFor(song.videoId)?.delete()
            Library.removeDownload(song.videoId)
        }
    }

    fun deleteAll() {
        runCatching {
            Library.downloaded.value.forEach { song ->
                Library.downloadFileFor(song.videoId)?.delete()
            }
            Library.clearDownloads()
        }
    }

    fun toggle(song: Song) {
        if (Library.isDownloaded(song.videoId)) {
            delete(song)
        } else {
            download(song)
        }
    }
}
