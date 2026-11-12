# Spotify Playlists & Folders Architecture Blueprint
**Target Release:** OpenBlast Massive Library Update (v2.1.0+)

---

## 1. Executive Summary
This document provides a comprehensive analysis and architectural roadmap of Spotify's signature playlist and library management capabilities, specifically focusing on **Playlist Folders, Custom Covers, Multi-Criteria Sorting, Duplicate Handling, Bottom Enhancer Recommendations, and Collaborative Blends**.

These features will form the core of OpenBlast's upcoming massive library release, bridging local offline music management with modern cloud streaming UX.

---

## 2. Core Feature Analysis & Specifications

### 2.1 Playlist Folders (Hierarchical Organization)
In Spotify, power users organize hundreds of playlists into nested folders (e.g., *Gym Workouts*, *Focus & Coding*, *Decades*, *Party Vibes*).

#### Requirements:
- **Nested Tree Structure**: Support root-level folders and nested sub-folders.
- **Folder Entities**:
  - `id: String` (UUID)
  - `name: String`
  - `parentFolderId: String?` (null for root)
  - `color: Long?` (tint or accent)
  - `icon: String?` (icon identifier or emoji)
  - `sortOrder: Int`
- **Folder Actions**:
  - **Create Folder**: Dialog asking for folder name and optional icon/color.
  - **Move Playlist**: Context menu action "Move to folder..." with a tree selector.
  - **Play Folder**: Shuffles all tracks across all playlists inside that folder (and its subfolders).
  - **Folder Cover**: Automatically composites a 2x2 collage of the first 4 playlists within the folder.

#### Room Database Schema:
```kotlin
@Entity(tableName = "playlist_folders")
data class PlaylistFolderEntity(
    @PrimaryKey val id: String,
    val name: String,
    val parentFolderId: String? = null,
    val color: Long? = null,
    val icon: String? = null,
    val sortOrder: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
)

// In PlaylistEntity:
// Add foreign key or nullable column:
// val folderId: String? = null
```

---

### 2.2 Custom Playlist Covers & Descriptions
Allow users to personalize their playlists just like Spotify.

#### Requirements:
- **Custom Image Picker**: Select an image from device gallery or camera.
- **Crop & Scale**: Standard 1:1 square crop stored locally in `app_data/covers/playlists/`.
- **Generated Collage Fallback**: If no custom image is chosen, dynamically render a 2x2 grid from the artwork of the first 4 distinct songs.
- **Rich Description**: Optional multiline text description (up to 300 characters) shown under the playlist title.

```kotlin
data class PlaylistDetails(
    val id: String,
    val title: String,
    val description: String? = null,
    val customCoverUri: String? = null,
    val folderId: String? = null,
    val isCollaborative: Boolean = false,
)
```

---

### 2.3 Advanced Playlist Sorting & Filtering

#### Sort Criteria:
1. **Custom Order**: User-defined manual drag-and-drop order (persisted via `position: Int`).
2. **Title**: Alphabetical (A-Z / Z-A).
3. **Artist**: Alphabetical by primary artist name.
4. **Album**: Grouped alphabetically by album title.
5. **Date Added**: Newest added first (default) or Oldest added first.
6. **Duration**: Shortest first or Longest first.

#### In-Playlist Filter / Search:
- A search bar docked beneath the playlist header that filters tracks instantly in memory as the user types without network calls.

---

### 2.4 Smart Duplicate Detection
When a user adds a song to a playlist that already contains it, Spotify warns the user rather than creating silent duplicates.

#### UX Flow:
1. When user taps "Add to playlist":
2. OpenBlast queries the playlist's track list for `videoId` match.
3. If duplicate is found:
   - Display a non-blocking dialog:
     - **Title**: *"Already in playlist"*
     - **Message**: *"'${song.title}' is already in '${playlist.title}'. Add anyway?"*
     - **Actions**:
       - `[Add anyway]` -> appends duplicate track.
       - `[Don't add]` -> cancels insertion and shows toast.

---

### 2.5 Playlist Enhancer & Bottom Recommendations
At the bottom of every playlist, Spotify features a dynamic "Recommended songs" section tailored to the genre, mood, and artists of that playlist.

#### Requirements:
- At the bottom of the playlist track list, display a **"Recommended for this playlist"** card.
- Based on the last 5 tracks in the playlist:
  - Query Spotify/YouTube Music radio or related tracks.
  - Present 5 candidate tracks with one-tap `[+]` button.
  - Tapping `[+]` appends the track to the playlist and animates a checkmark.
  - Provide a **"Refresh"** button to load a new batch of 5 suggestions.

---

### 2.6 Collaborative Playlists & Blends
Integrating with OpenBlast's Nostr Listen Together engine:

#### Requirements:
- **Collaborative Mode**: Flag a playlist as collaborative.
- **Attribution Badges**: Display small avatar icons next to tracks indicating who added each song (e.g. *Added by Masthan*).
- **Blend Playlists**: Automatically generate a 50/50 blend playlist between two friends by intersecting their top played and liked songs.

---

## 3. Implementation Plan & Milestones

| Milestone | Target | Focus Areas |
|---|---|---|
| **Phase 1** | v2.1.0 | Room Database migration for `PlaylistFolderEntity` and `folderId` column. Folders UI in Library screen. |
| **Phase 2** | v2.1.1 | Custom cover image picker, local storage cropping, and 2x2 collage generator. |
| **Phase 3** | v2.1.2 | Multi-criteria sorting (custom, title, artist, date added), fast playlist search bar. |
| **Phase 4** | v2.1.3 | Duplicate check dialog & Bottom Enhancer recommendations integration. |
| **Phase 5** | v2.2.0 | Collaborative playlists & Together Blends sync. |

---

*Authored for OpenBlast Android Core Team.*
