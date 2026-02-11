const AI_URL = "http://127.0.0.1:5000/ai";

async function setInputLock(lock) {
  if (!window.electron?.ipcRenderer?.invoke) return;
  try {
    await window.electron.ipcRenderer.invoke("set-input-lock", { lock });
  } catch (err) {
    console.error("[AI] Failed to update input lock:", err);
  }
}

export async function aiGO(text) {
  if (!text) return;
  const url = `${AI_URL}?user_input=${encodeURIComponent(text)}`;
  await setInputLock(true);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      console.error("[AI] Request failed:", response.status, body);
    }
  } catch (err) {
    console.error("[AI] Request error:", err);
  } finally {
    await aiDone();
  }
}

export async function aiDone() {
  await setInputLock(false);
}
