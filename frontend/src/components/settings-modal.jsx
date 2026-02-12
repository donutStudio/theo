import React, { useEffect, useMemo, useState } from "react";
import mascot from "../assets/mascot.png";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  subscribeToSettingsChange,
  updateSetting,
} from "../utils/settings";

const systemDefaultOption = {
  id: "system-default",
  label: "System Default (Auto Detect)",
};

const displayDefaultOption = {
  id: "system-primary",
  label: "Primary Display (System Default)",
};

function SettingCard({ title, description, children }) {
  return (
    <div className="brandbg border border-gray-400 rounded-2xl p-4 flex flex-col gap-2 text-left">
      <h4 className="bric text-xl">{title}</h4>
      <p className="inter text-sm text-gray-500">{description}</p>
      {children}
    </div>
  );
}

function Category({ title, subtitle, children }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="bric text-2xl">{title}</h3>
        <p className="inter text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-3">{children}</div>
    </section>
  );
}

export default function SettingsModal() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [devices, setDevices] = useState({ microphones: [], speakers: [] });
  const [displays, setDisplays] = useState([]);

  const loadSystemOptions = async () => {
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          stream.getTracks().forEach((track) => track.stop());
        } catch (err) {
          console.warn("[Settings] Microphone permission not granted yet:", err);
        }
      }

      const allDevices = (await navigator.mediaDevices?.enumerateDevices?.()) || [];
      const microphones = allDevices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      const speakers = allDevices
        .filter((device) => device.kind === "audiooutput")
        .map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Speaker ${index + 1}`,
        }));

      setDevices({ microphones, speakers });

      if (window.electron?.ipcRenderer?.invoke) {
        const displayOptions = await window.electron.ipcRenderer.invoke(
          "settings:list-displays",
        );
        setDisplays(displayOptions || []);
      }
    } catch (err) {
      console.error("[Settings] Failed to load system options:", err);
    }
  };

  useEffect(() => {
    loadSettings().then(setSettings);
    loadSystemOptions();
    const unsubscribe = subscribeToSettingsChange(setSettings);
    const handleDeviceChange = () => loadSystemOptions();
    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => {
      unsubscribe();
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, []);

  const speakerOptions = useMemo(
    () => [systemDefaultOption, ...devices.speakers],
    [devices.speakers],
  );

  const microphoneOptions = useMemo(
    () => [systemDefaultOption, ...devices.microphones],
    [devices.microphones],
  );

  const displayOptions = useMemo(
    () => [
      displayDefaultOption,
      ...displays.map((display) => ({
        id: display.id,
        label: `${display.label} (${display.resolution})${display.isPrimary ? " • Primary" : ""}`,
      })),
    ],
    [displays],
  );

  const onSelectChange = (path) => async (event) => {
    const next = await updateSetting(path, event.target.value);
    setSettings(next);
  };

  const onToggleChange = (path) => async (event) => {
    const next = await updateSetting(path, event.target.checked);
    setSettings(next);
  };

  return (
    <dialog id="settingsmodal" className="modal">
      <div className="modal-box brandbg text-center border-2 rounded-4xl p-8 border-black relative overflow-visible max-w-3xl">
        <img
          src={mascot}
          alt=""
          draggable="false"
          className="absolute -top-16 left-1/2 -translate-x-1/2 w-30 h-30 object-contain"
        />

        <form method="dialog" className="absolute top-4 right-4">
          <button className="btn btn-ghost btn-sm p-0 w-8 h-8 min-h-0 border-0 hover:bg-transparent">
            <i className="bi bi-x-circle-fill text-2xl"></i>
          </button>
        </form>

        <h3 className="font-semibold text-3xl bric mt-5">Theo Settings</h3>
        <p className="text-gray-500 inter text-sm font-light mt-1.5">
          Customize devices and behavior. Settings are auto-saved.
        </p>

        <div className="mt-6 flex flex-col gap-6 max-h-[60vh] overflow-y-auto pr-1 text-left">
          <Category
            title="Audio"
            subtitle="Choose how Theo listens and where Theo plays audio feedback."
          >
            <SettingCard
              title="Microphone"
              description="Select the microphone Theo should use for speech-to-text."
            >
              <select
                className="select select-bordered w-full brandbg"
                value={settings.audio.microphoneDeviceId}
                onChange={onSelectChange("audio.microphoneDeviceId")}
              >
                {microphoneOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </SettingCard>

            <SettingCard
              title="Speaker"
              description="Set which speaker Theo should use for startup and feedback sounds."
            >
              <select
                className="select select-bordered w-full brandbg"
                value={settings.audio.speakerDeviceId}
                onChange={onSelectChange("audio.speakerDeviceId")}
              >
                {speakerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </SettingCard>
          </Category>

          <Category
            title="Display"
            subtitle="Choose which display Theo should treat as the primary placement target."
          >
            <SettingCard
              title="Target Display"
              description="Useful for multi-monitor Windows setups."
            >
              <select
                className="select select-bordered w-full brandbg"
                value={settings.display.targetDisplayId}
                onChange={onSelectChange("display.targetDisplayId")}
              >
                {displayOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </SettingCard>
          </Category>

          <Category
            title="General"
            subtitle="Quality-of-life and startup behavior settings."
          >
            <SettingCard
              title="Launch Theo at login"
              description="Automatically open Theo when you sign into Windows."
            >
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.general.launchOnStartup}
                  onChange={onToggleChange("general.launchOnStartup")}
                />
                <span className="inter">Enable auto-launch</span>
              </label>
            </SettingCard>

            <SettingCard
              title="Enable click-through mode at startup"
              description="If enabled, Theo starts in pass-through mode and will ignore mouse input outside the notch."
            >
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.general.clickThroughByDefault}
                  onChange={onToggleChange("general.clickThroughByDefault")}
                />
                <span className="inter">Start in click-through mode</span>
              </label>
            </SettingCard>
          </Category>
        </div>
      </div>
    </dialog>
  );
}
