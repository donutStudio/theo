import { createRoot } from "react-dom/client";
import { useEffect, useState, useRef } from "react";
import "./index.css";
import "./ai-overlay.css";
import Notch from "./components/notch";
import startupSound from "./assets/verbalpreset/startup2.wav";
import ping1 from "./assets/ping1.mp3";
import loadingSound from "./assets/loading.mp3";
import { initPushToTalk } from "./utils/sttUtil";
import {
  getSavedSpeakerDeviceId,
  getSavedStartupSoundFull,
  applySpeakerToElement,
} from "./utils/settingsUtil";

async function setInputLock(lock) {
  if (!window.electron?.ipcRenderer?.invoke) return;
  try {
    await window.electron.ipcRenderer.invoke("set-input-lock", { lock });
  } catch (err) {
    console.error("[APP] Failed to update input lock:", err);
  }
}

function waitForAudioEnd(audio) {
  return new Promise((resolve) => {
    const done = () => {
      audio.removeEventListener("ended", done);
      audio.removeEventListener("error", done);
      resolve();
    };
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
  });
}


function FirstLaunchSetupModal({ onComplete }) {
  const [groqApiKey, setGroqApiKey] = useState("");
  const [openAIApiKey, setOpenAIApiKey] = useState("");
  const [launchOnStartup, setLaunchOnStartup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadDefaults = async () => {
      const [apiConfig, startup] = await Promise.all([
        window.electron?.getApiConfig?.() ?? Promise.resolve({}),
        window.electron?.getStartupEnabled?.() ?? Promise.resolve({ enabled: false }),
      ]);
      if (cancelled) return;
      setGroqApiKey(apiConfig?.GROQ_API_KEY || "");
      setOpenAIApiKey(apiConfig?.OPENAI_API_KEY || "");
      setLaunchOnStartup(Boolean(startup?.enabled));
    };
    loadDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishSetup = async () => {
    if (!groqApiKey.trim() || !openAIApiKey.trim()) {
      setError("Please provide both API keys before continuing.");
      return;
    }

    setError("");
    setSaving(true);
    try {
      if (window.electron?.saveApiConfig) {
        await window.electron.saveApiConfig({
          GROQ_API_KEY: groqApiKey,
          OPENAI_API_KEY: openAIApiKey,
          setupComplete: true,
        });
      }
      if (window.electron?.setStartupEnabled) {
        await window.electron.setStartupEnabled(launchOnStartup);
      }
      onComplete();
    } catch (err) {
      setError(`Setup failed: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-xl brandbg border-2 border-black rounded-4xl p-8">
        <h2 className="text-3xl bric font-semibold">Welcome to Theo</h2>
        <p className="inter text-sm text-gray-600 mt-2">
          First-time setup: paste your API keys and choose whether Theo launches on startup.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <label className="font-medium bric text-sm">GROQ_API_KEY</label>
            <input
              type="password"
              className="input input-bordered settings-select w-full mt-1 border-gray-400 rounded-xl"
              value={groqApiKey}
              placeholder="Paste your Groq API key"
              onChange={(e) => setGroqApiKey(e.target.value)}
            />
          </div>

          <div>
            <label className="font-medium bric text-sm">OPENAI_API_KEY</label>
            <input
              type="password"
              className="input input-bordered settings-select w-full mt-1 border-gray-400 rounded-xl"
              value={openAIApiKey}
              placeholder="Paste your OpenAI API key"
              onChange={(e) => setOpenAIApiKey(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="font-medium bric text-sm">Launch Theo at startup</label>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={launchOnStartup}
              onChange={(e) => setLaunchOnStartup(e.target.checked)}
            />
          </div>

          {error ? <p className="text-sm text-red-600 inter">{error}</p> : null}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="btn bric tracking-wide brandbgdark text-white border-0 rounded-full"
            onClick={finishSetup}
            disabled={saving}
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

const App = () => {
  const [taskbarHeight, setTaskbarHeight] = useState(0);
  const [setupRequired, setSetupRequired] = useState(false);

  // Initialize app - retry if electron isn't ready yet (preload can lag)
  useEffect(() => {
    function setupPushToTalk() {
      if (!window.electron?.ipcRenderer) {
        console.warn("[STT] ipcRenderer not ready, retrying in 500ms...");
        setTimeout(setupPushToTalk, 500);
        return;
      }
      try {
        initPushToTalk();
        console.log("[STT] Push-to-talk initialized - hold Ctrl+Win to record");
      } catch (err) {
        console.error("Failed to initialize push-to-talk:", err);
      }
    }
    setupPushToTalk();

    const getTaskbarHeight = async () => {
      if (window.electron?.ipcRenderer) {
        try {
          const height =
            await window.electron.ipcRenderer.invoke("get-taskbar-height");
          setTaskbarHeight(height);
        } catch (error) {
          console.error("Failed to get taskbar height:", error);
        }
      }
    };

    const checkSetupState = async () => {
      try {
        const apiConfig = await (window.electron?.getApiConfig?.() ?? Promise.resolve({}));
        setSetupRequired(!apiConfig?.setupComplete);
      } catch (error) {
        console.error("Failed to check setup state:", error);
        setSetupRequired(true);
      }
    };

    getTaskbarHeight();
    checkSetupState();
  }, []);

  const [aiActive, setAiActive] = useState(false);
  const loadingLoopRef = useRef(null);
  const loadingActiveRef = useRef(false);

  useEffect(() => {
    const onAiGo = () => setAiActive(true);
    const onAiDone = () => setAiActive(false);
    window.addEventListener("ai-go", onAiGo);
    window.addEventListener("ai-done", onAiDone);
    return () => {
      window.removeEventListener("ai-go", onAiGo);
      window.removeEventListener("ai-done", onAiDone);
    };
  }, []);

  // Loading sound: loop when AI processing starts, stop when TTS starts or ai-done
  useEffect(() => {
    const LOOP_DELAY_MS = 500;

    const stopLoadingSound = () => {
      loadingActiveRef.current = false;
      if (loadingLoopRef.current) {
        clearTimeout(loadingLoopRef.current);
        loadingLoopRef.current = null;
      }
    };

    const runLoadingLoop = () => {
      try {
        if (!loadingActiveRef.current) return;
        const audio = new Audio(loadingSound);
        const deviceId = getSavedSpeakerDeviceId();
        if (deviceId) applySpeakerToElement(audio, deviceId).catch(() => {});
        audio.play().catch((err) => console.error("[Loading] Play error:", err));
        const onEnded = () => {
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onEnded);
          if (!loadingActiveRef.current) return;
          loadingLoopRef.current = setTimeout(runLoadingLoop, LOOP_DELAY_MS);
        };
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onEnded);
      } catch (err) {
        console.error("[Loading] Loop error:", err);
      }
    };

    const onAiLoadingStart = () => {
      try {
        loadingActiveRef.current = true;
        runLoadingLoop();
      } catch (err) {
        console.error("[Loading] Start error:", err);
      }
    };

    const onAiDone = () => {
      stopLoadingSound();
    };

    const onOutputPlayingChanged = ({ detail }) => {
      if (detail?.playing) stopLoadingSound();
    };

    window.addEventListener("ai-loading-start", onAiLoadingStart);
    window.addEventListener("ai-done", onAiDone);
    window.addEventListener("output-playing-changed", onOutputPlayingChanged);

    return () => {
      stopLoadingSound();
      window.removeEventListener("ai-loading-start", onAiLoadingStart);
      window.removeEventListener("ai-done", onAiDone);
      window.removeEventListener("output-playing-changed", onOutputPlayingChanged);
    };
  }, []);

  useEffect(() => {
    const playStartup = async () => {
      const soundSrc = getSavedStartupSoundFull() ? startupSound : ping1;
      const audio = new Audio(soundSrc);
      const deviceId = getSavedSpeakerDeviceId();
      if (deviceId) await applySpeakerToElement(audio, deviceId);
      audio.currentTime = 0;
      await setInputLock(true);
      try {
        await audio.play();
        await waitForAudioEnd(audio);
      } catch (err) {
        console.error("Startup sound error:", err);
      } finally {
        await setInputLock(false);
      }
    };

    playStartup().catch((err) => {
      console.error("Failed to play startup sound:", err);
    });
  }, []);

  return (
    <div className="pointer-events-auto">
      <div
        className={`ai-active-overlay ${aiActive ? "visible" : ""}`}
        aria-hidden="true"
      />
      <Notch taskbarHeight={taskbarHeight} />
      {setupRequired ? <FirstLaunchSetupModal onComplete={() => setSetupRequired(false)} /> : null}
    </div>
  );
};

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);
