const AI_URL = "http://127.0.0.1:5000/ai";

export async function aiGO(text) {
  if (!text) return;
  const url = `${AI_URL}?user_input=${encodeURIComponent(text)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      console.error("[AI] Request failed:", response.status, body);
    }
  } catch (err) {
    console.error("[AI] Request error:", err);
  }
}

export function aiDone() {
  // Placeholder for future click-through / input restore. TODO: implement this
}
