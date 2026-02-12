const SETTINGS_CHANGED_EVENT = "theo-settings-changed";

export const DEFAULT_SETTINGS = {
  audio: {
    microphoneDeviceId: "system-default",
    speakerDeviceId: "system-default",
  },
  display: {
    targetDisplayId: "system-primary",
  },
  general: {
    launchOnStartup: false,
    clickThroughByDefault: false,
  },
};

export const mergeSettings = (partial = {}) => ({
  ...DEFAULT_SETTINGS,
  ...partial,
  audio: { ...DEFAULT_SETTINGS.audio, ...(partial.audio || {}) },
  display: { ...DEFAULT_SETTINGS.display, ...(partial.display || {}) },
  general: { ...DEFAULT_SETTINGS.general, ...(partial.general || {}) },
});

let cachedSettings = mergeSettings();

const emitSettingsChanged = () => {
  window.dispatchEvent(
    new CustomEvent(SETTINGS_CHANGED_EVENT, {
      detail: cachedSettings,
    }),
  );
};

export async function loadSettings() {
  if (!window.electron?.ipcRenderer?.invoke) return cachedSettings;
  try {
    const settings = await window.electron.ipcRenderer.invoke("settings:get");
    cachedSettings = mergeSettings(settings || {});
    emitSettingsChanged();
    return cachedSettings;
  } catch (err) {
    console.error("[Settings] Failed to load settings:", err);
    return cachedSettings;
  }
}

export function getCachedSettings() {
  return cachedSettings;
}

export async function updateSetting(path, value) {
  if (!window.electron?.ipcRenderer?.invoke) return cachedSettings;
  try {
    const updated = await window.electron.ipcRenderer.invoke("settings:update", {
      path,
      value,
    });
    cachedSettings = mergeSettings(updated || {});
    emitSettingsChanged();
    return cachedSettings;
  } catch (err) {
    console.error(`[Settings] Failed to update setting "${path}":`, err);
    return cachedSettings;
  }
}

export function subscribeToSettingsChange(handler) {
  const wrapped = (event) => handler(event.detail);
  window.addEventListener(SETTINGS_CHANGED_EVENT, wrapped);
  return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, wrapped);
}
