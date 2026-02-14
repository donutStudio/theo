/**
 * Settings persistence and device helpers.
 * localStorage keys: theo.settings.micDeviceId, theo.settings.speakerDeviceId, theo.settings.lastUpdated
 */

const MIC_KEY = "theo.settings.micDeviceId";
const SPEAKER_KEY = "theo.settings.speakerDeviceId";
const LAST_UPDATED_KEY = "theo.settings.lastUpdated";
const NOTCH_POSITION_KEY = "theo.settings.notchPosition";
const STARTUP_SOUND_FULL_KEY = "theo.settings.startupSoundFull";

const VALID_POSITIONS = ["bottom-left", "top-left", "bottom-right", "top-right"];

export function getSavedMicDeviceId() {
  try {
    return localStorage.getItem(MIC_KEY) || "";
  } catch {
    return "";
  }
}

export function getSavedSpeakerDeviceId() {
  try {
    return localStorage.getItem(SPEAKER_KEY) || "";
  } catch {
    return "";
  }
}

export function saveMicDeviceId(deviceId) {
  try {
    localStorage.setItem(MIC_KEY, deviceId || "");
    localStorage.setItem(LAST_UPDATED_KEY, String(Date.now()));
  } catch (err) {
    console.error("[Settings] Failed to save mic device:", err);
  }
}

export function saveSpeakerDeviceId(deviceId) {
  try {
    localStorage.setItem(SPEAKER_KEY, deviceId || "");
    localStorage.setItem(LAST_UPDATED_KEY, String(Date.now()));
  } catch (err) {
    console.error("[Settings] Failed to save speaker device:", err);
  }
}

export function getSavedNotchPosition() {
  try {
    const saved = localStorage.getItem(NOTCH_POSITION_KEY) || "";
    return VALID_POSITIONS.includes(saved) ? saved : "bottom-left";
  } catch {
    return "bottom-left";
  }
}

export function saveNotchPosition(position) {
  try {
    if (VALID_POSITIONS.includes(position)) {
      localStorage.setItem(NOTCH_POSITION_KEY, position);
    }
  } catch (err) {
    console.error("[Settings] Failed to save notch position:", err);
  }
}

export function getSavedStartupSoundFull() {
  try {
    const saved = localStorage.getItem(STARTUP_SOUND_FULL_KEY);
    if (saved === null) return true;
    return saved === "true";
  } catch {
    return true;
  }
}

export function saveStartupSoundFull(full) {
  try {
    localStorage.setItem(STARTUP_SOUND_FULL_KEY, full ? "true" : "false");
  } catch (err) {
    console.error("[Settings] Failed to save startup sound setting:", err);
  }
}

/**
 * Enumerate audio devices. Returns { mics: [], speakers: [] }.
 * Falls back to empty arrays if API unavailable or permission denied.
 */
export async function enumerateDevices() {
  if (!navigator?.mediaDevices?.enumerateDevices) {
    return { mics: [], speakers: [] };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");
    const speakers = devices.filter((d) => d.kind === "audiooutput");
    return { mics, speakers };
  } catch (err) {
    console.error("[Settings] Device enumeration failed:", err);
    return { mics: [], speakers: [] };
  }
}

/**
 * Apply selected speaker to an HTMLMediaElement via setSinkId if supported.
 * Returns true if applied, false if unsupported or failed.
 */
export async function applySpeakerToElement(element, deviceId) {
  if (!element || typeof element.setSinkId !== "function") return false;
  if (!deviceId) return false;
  try {
    await element.setSinkId(deviceId);
    return true;
  } catch (err) {
    console.warn("[Settings] setSinkId failed:", err?.message || err);
    return false;
  }
}
