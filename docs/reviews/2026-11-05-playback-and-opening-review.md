# Playback crash and opening animation review

**Status:** Review only. No application code or tests have been changed or run. Implementation is waiting for review.

## Scope

Review the reported Android behavior:

1. The app closes or returns to the launcher when a user tries to play a song.
2. The app opening animation does not run.

The current checkout is clean at `31006cd` (`fix: seamless opening animation, resolve song click playback issues, eliminate frame drops, and harden widgets`). That commit moved `OpeningReveal` to the activity root and changed its timing. It does not modify the playback connection/service implementation.

## Findings

### 1. Song playback causes an app exit

**Impact:** Critical user-facing failure if reproducible.

**Evidence in source:** Song clicks route through `PlayerViewModel.play` / `playAll`, then `PlayerConnection` sends media items to the Media3 controller and calls `prepare()` and `play()`. `PlaybackService` uses a custom renderer/audio sink path and has `onPlayerError` recovery for media failures. The latest commit does not alter these playback paths.

**Diagnosis status:** The cause is not established from source inspection. A Media3 playback error is handled as a playback failure and normally should not terminate the Activity. An actual return to the launcher could instead be a process crash, an Activity finish/recreation, or a system-level termination. No fatal exception, device log, affected device/Android version, or exact reproduction steps were included, so attributing this to a specific decoder, source, or audio sink would be guesswork.

**Proposed solution:** First capture the fatal log around one controlled tap (`adb logcat -c`, reproduce once, then collect `AndroidRuntime`, `FATAL EXCEPTION`, `MediaCodec`, `AudioTrack`, and app process output). Record whether it happens for downloaded/local tracks as well as streamed tracks and whether it affects all click entry points or one screen. Map the first fatal stack frame to the actual path before changing code. Then make the smallest targeted fix, retaining playback error reporting/recovery and adding a regression test around the failing boundary. If logcat contains no process death, inspect Activity/task navigation and service/controller connection instead of changing decoder code.

### 2. Opening animation does not run

**Impact:** Medium; startup presentation is missing.

**Evidence in source:** `MainActivity` creates the reveal only when `Opening.played` is false and the opening-animation and reduced-motion settings allow it. `OpeningReveal` runs a Compose `LaunchedEffect(Unit)` animation and calls `onDone` at completion. The welcome screen also sets the shared `Opening.played` flag on composition. The latest commit moved the overlay to `MainActivity`, with `AppRoot` no longer owning it, and shortened the reveal. An existing screenshot test exercises animation frames in isolation, but not the full activity startup, welcome transition, settings gate, or system splash handoff.

**Diagnosis status:** The welcome screen's shared flag is a lifecycle coupling worth testing, but it does not by itself prove why the reveal is absent: the activity decides `opening` before composing the welcome screen, and setting `played` later does not cancel the reveal. The activity's `sessionOpeningDone` value is still written but is no longer used to decide whether to show the animation. The isolated screenshot test cannot verify the end-to-end gate.

**Proposed solution:** Verify the gate values and composition lifecycle on cold launch, warm launch, fresh install/welcome, returning install, and with reduced motion or the animation setting disabled. Add an activity-level test for the expected cases. Then make one owner authoritative for the per-launch animation state and remove the stale/competing flag path if tests confirm it causes suppression. Keep reduced-motion and explicit user settings respected. Verify the system splash-to-Compose handoff on an Android device, since the screenshot test does not include the real launch transition.

## Implementation sequence after review

1. Reproduce both reports independently and capture device/OS/build information.
2. For playback, use the fatal log to identify and fix the actual crash path; add a focused regression check.
3. For opening, test the full startup gate and lifecycle, then make the smallest state-ownership correction if confirmed.
4. Re-run the focused checks and verify cold starts and song playback on a device.

## Acceptance criteria

- Tapping a song plays it or shows an actionable playback error; it does not terminate the app.
- The opening reveal plays once on eligible launches and is skipped when the setting or reduced-motion preference requires it.
- Welcome and normal Home launches behave consistently, and the system splash hands off without a blank frame or abrupt jump.
- The fix is supported by the captured failure evidence and focused regression coverage.

## Review boundary

No feature implementation has started. Please review this diagnosis and sequence; work will wait here until you approve or revise the proposed solution.
