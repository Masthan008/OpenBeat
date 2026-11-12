package com.opentune.data.library

import android.content.Context
import android.os.Environment
import com.opentune.data.DebugLog as Log
import java.io.File
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Manages automated and persistent backups of playlists and liked songs in public
 * shared storage (Documents/OpenBlast/backups/), which survives app uninstallation
 * on Android.
 *
 * When a user uninstalls and reinstalls OpenBlast, the app checks this persistent
 * backup directory on startup and automatically restores all their playlists and
 * liked songs.
 */
object PlaylistBackupManager {
    private const val TAG = "PlaylistBackupManager"
    private const val BACKUP_DIR_NAME = "OpenBlast/backups"
    private const val BACKUP_FILE_NAME = "openblast_playlists_backup.json"
    private const val BACKUP_PREV_FILE_NAME = "openblast_playlists_backup_prev.json"

    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    @Serializable
    data class BackupMetadata(
        val version: Int = 1,
        val app: String = "OpenBlast",
        val timestamp: Long = System.currentTimeMillis(),
        val playlistCount: Int = 0,
        val songCount: Int = 0,
        val likedCount: Int = 0,
    )

    @Serializable
    data class PersistentBackup(
        val version: Int = 1,
        val app: String = "OpenBlast",
        val timestamp: Long = System.currentTimeMillis(),
        val playlists: List<LocalPlaylist> = emptyList(),
        val liked: List<SongRef> = emptyList(),
        val savedLists: List<SavedList> = emptyList(),
    )

    private fun getBackupDirectories(): List<File> {
        val dirs = mutableListOf<File>()
        runCatching {
            val docs = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
            dirs.add(File(docs, BACKUP_DIR_NAME))
        }
        runCatching {
            val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            dirs.add(File(downloads, BACKUP_DIR_NAME))
        }
        return dirs
    }

    /**
     * Finds the primary backup directory, creating it if necessary.
     */
    fun primaryBackupDir(): File? {
        for (dir in getBackupDirectories()) {
            try {
                if (!dir.exists()) {
                    dir.mkdirs()
                }
                if (dir.exists() && dir.canWrite()) {
                    return dir
                }
            } catch (e: Exception) {
                Log.w(TAG, "Cannot write to directory: ${dir.absolutePath}", e)
            }
        }
        return null
    }

    /**
     * Locates the most recent valid backup file on public shared storage.
     */
    fun findLatestBackup(): Pair<File, PersistentBackup>? {
        for (dir in getBackupDirectories()) {
            if (!dir.exists()) continue
            val primary = File(dir, BACKUP_FILE_NAME)
            if (primary.exists() && primary.length() > 0) {
                runCatching {
                    val parsed = json.decodeFromString(PersistentBackup.serializer(), primary.readText())
                    if (parsed.playlists.isNotEmpty() || parsed.liked.isNotEmpty()) {
                        return primary to parsed
                    }
                }.onFailure { Log.w(TAG, "Failed reading backup from ${primary.absolutePath}", it) }
            }
            val prev = File(dir, BACKUP_PREV_FILE_NAME)
            if (prev.exists() && prev.length() > 0) {
                runCatching {
                    val parsed = json.decodeFromString(PersistentBackup.serializer(), prev.readText())
                    if (parsed.playlists.isNotEmpty() || parsed.liked.isNotEmpty()) {
                        return prev to parsed
                    }
                }.onFailure { Log.w(TAG, "Failed reading backup from ${prev.absolutePath}", it) }
            }
        }
        return null
    }

    /**
     * Automatically writes a persistent backup to public storage.
     */
    fun autoBackup(playlists: List<LocalPlaylist>, liked: List<SongRef>, savedLists: List<SavedList>): Boolean {
        if (playlists.isEmpty() && liked.isEmpty() && savedLists.isEmpty()) {
            return false
        }
        val targetDir = primaryBackupDir() ?: return false
        return try {
            val file = File(targetDir, BACKUP_FILE_NAME)
            val prevFile = File(targetDir, BACKUP_PREV_FILE_NAME)
            if (file.exists() && file.length() > 0) {
                file.copyTo(prevFile, overwrite = true)
            }
            val backup = PersistentBackup(
                version = 1,
                app = "OpenBlast",
                timestamp = System.currentTimeMillis(),
                playlists = playlists,
                liked = liked,
                savedLists = savedLists,
            )
            val text = json.encodeToString(PersistentBackup.serializer(), backup)
            val tmp = File(targetDir, "$BACKUP_FILE_NAME.tmp")
            tmp.writeText(text)
            tmp.renameTo(file)
            Log.i(TAG, "Auto-backup successful: ${playlists.size} playlists, ${liked.size} likes to ${file.absolutePath}")
            true
        } catch (e: Exception) {
            Log.w(TAG, "Auto-backup failed", e)
            false
        }
    }

    /**
     * Checks if backup exists and returns summary info.
     */
    fun getBackupSummary(): BackupMetadata? {
        val found = findLatestBackup() ?: return null
        val b = found.second
        val totalSongs = b.playlists.sumOf { it.songs.size }
        return BackupMetadata(
            version = b.version,
            app = b.app,
            timestamp = b.timestamp,
            playlistCount = b.playlists.size,
            songCount = totalSongs,
            likedCount = b.liked.size,
        )
    }
}
