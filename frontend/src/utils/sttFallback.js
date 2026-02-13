import inerror from "../assets/verbalpreset/inerror.wav";
import {
  getSavedSpeakerDeviceId,
  applySpeakerToElement,
} from "./settingsUtil.js";

async function setInputLock(lock) {
  if (!window.electron?.ipcRenderer?.invoke) return;
  try {
    await window.electron.ipcRenderer.invoke("set-input-lock", { lock });
  } catch (err) {
    console.error("[STT] Failed to update input lock:", err);
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

export async function sttFallback() {
  const inerroraudio = new Audio(inerror);
  const deviceId = getSavedSpeakerDeviceId();
  if (deviceId) {
    applySpeakerToElement(inerroraudio, deviceId).catch(() => {});
  }
  await setInputLock(true);
  try {
    await inerroraudio.play();
    await waitForAudioEnd(inerroraudio);
  } catch (err) {
    console.error("[STT] Fallback audio error:", err);
  } finally {
    await setInputLock(false);
  }
}
