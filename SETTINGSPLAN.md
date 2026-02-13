# Settings Page Plan (Notch Popup)

## Summary
Add a Settings popup inside Theo's notch UI (same visual language as existing Help/Move modals) with:
- Microphone selection
- Speaker/output selection
- Launch-on-startup toggle

The first version is frontend/Electron focused and does not require Flask/backend changes.

## Goals
- Keep the same popup style and interaction model used by current notch dialogs.
- Let users choose and persist mic/speaker preferences.
- Let users enable/disable OS startup behavior for Theo.
- Keep existing AI workflow behavior unchanged.

## Non-Goals
- Multi-profile settings
- Cloud sync
- Per-app audio routing
- Hotkey customization
- Backend settings API

## Current-State Constraints
- Notch and popup UI live in `frontend/src/components/notch.jsx`.
- Electron startup behavior must be controlled in main process (`frontend/src/main.js`).
- Renderer needs preload bridge APIs (`frontend/src/preload.js`) for secure IPC.
- Device selection should degrade gracefully if OS/browser APIs are unavailable.

## Architecture and Ownership
- Renderer (`notch.jsx`): settings modal UI, device lists, local persistence, apply selected values.
- Preload (`preload.js`): expose startup getter/setter methods to renderer.
- Main (`main.js`): source of truth for startup toggle using Electron login item settings.
- Local persistence: `localStorage` for mic/speaker selection only.

## Interfaces / Public Additions

### Electron IPC (main <-> renderer)
Add handlers in `frontend/src/main.js`:
- `get-startup-enabled` -> `{ enabled: boolean }`
- `set-startup-enabled` (payload `{ enabled: boolean }`) -> `{ ok: boolean, enabled: boolean }`

### Preload bridge
Expose in `frontend/src/preload.js`:
- `window.electron.getStartupEnabled(): Promise<{ enabled: boolean }>`
- `window.electron.setStartupEnabled(enabled: boolean): Promise<{ ok: boolean, enabled: boolean }>`

### Local settings keys
- `theo.settings.micDeviceId`
- `theo.settings.speakerDeviceId`
- `theo.settings.lastUpdated`

## Implementation Plan

### Phase 1: Settings Modal in Notch
File:
- `frontend/src/components/notch.jsx`

Tasks:
1. Wire gear button to open a new settings dialog.
2. Match existing popup style (`brandbg`, rounded border, close button pattern, spacing).
3. Add controls:
   - Microphone `<select>`
   - Speaker `<select>`
   - Startup `<toggle>`
4. Add `Save` and `Cancel`.

Acceptance:
- Gear opens/closes modal correctly.
- Modal style and behavior are consistent with existing notch popups.

### Phase 2: Device Enumeration and Selection
Files:
- `frontend/src/components/notch.jsx`
- `frontend/src/utils/sttService.js` (or current STT capture path)

Tasks:
1. On modal open, call `navigator.mediaDevices.enumerateDevices()`.
2. Populate:
   - mic options from `kind === "audioinput"`
   - speaker options from `kind === "audiooutput"`
3. Persist selected device IDs to `localStorage`.
4. On app startup/load, restore saved IDs.
5. Ensure STT capture uses selected mic device ID.
6. Apply selected output device to playback elements using `setSinkId()` where supported.
7. If `setSinkId()` unsupported, continue normally and show a non-blocking UI note.

Acceptance:
- Mic/speaker selections persist across app restarts.
- STT uses selected mic.
- Speaker selection works on supported platforms; no crash on unsupported ones.

### Phase 3: Startup Toggle (Electron)
Files:
- `frontend/src/main.js`
- `frontend/src/preload.js`
- `frontend/src/components/notch.jsx`

Tasks:
1. Implement `get-startup-enabled` using `app.getLoginItemSettings()`.
2. Implement `set-startup-enabled` using `app.setLoginItemSettings({ openAtLogin: enabled })`.
3. Expose methods via preload.
4. Bind toggle in settings modal to these methods.
5. Initialize toggle state from main process (not localStorage).

Acceptance:
- Toggle reflects actual OS login-item state.
- Changing toggle updates startup registration immediately.

### Phase 4: Fallbacks and Robustness
Files:
- `frontend/src/components/notch.jsx`
- `frontend/src/utils/sttService.js`

Tasks:
1. If saved device ID no longer exists, fallback to default device.
2. Keep UI selection synced with effective device.
3. Handle permission/device enumeration failures without breaking notch.
4. Log operational errors to console with clear context.

Acceptance:
- Device disconnect/reorder does not break Theo.
- App remains usable when device APIs are restricted.

## Error Handling
- No devices found: show "Default device" option and allow save.
- Device permission blocked: keep previous/default settings and show non-blocking status.
- Startup IPC failure: keep toggle unchanged and show error toast/banner (or console warning in v1).

## Test Plan

### Functional
1. Open Settings via gear icon.
2. Change mic, save, trigger STT, verify selected mic usage.
3. Change speaker, trigger ping/TTS, verify output route (where supported).
4. Toggle startup on/off and confirm state persists after app restart.

### Edge Cases
1. Remove selected mic/speaker between launches -> fallback to default.
2. Platform without `setSinkId()` -> no crash, note shown.
3. Permission denied for media devices -> settings UI remains stable.

### Regression
1. Existing Help/Move/Human-input dialogs still work.
2. Ctrl+Win trigger flow unchanged.
3. AI routes/workflow behavior unchanged.

## Rollout Strategy
1. Ship modal + startup toggle first (lowest risk).
2. Ship device selection next.
3. Add fallback polish and UI messaging after core validation.

## Assumptions and Defaults
- Startup behavior should only be trusted in packaged builds; dev mode may be inconsistent.
- `localStorage` is sufficient for v1 settings persistence.
- Existing TTS/audio elements can be routed through selected speaker where API support exists.
- No backend API needed for settings in this phase.
