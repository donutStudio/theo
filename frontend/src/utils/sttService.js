import Groq from "groq-sdk";
import { sttFallback } from "./sttFallback.js";

// the api key is passed from the main process to the renderer, thats why its null right now
let groq = null;

function log(message, data) {
  console.log(`[STT Service] ${message}`, data || "");
}

export function initializeGroq(apiKey) {
  if (!apiKey) {
    console.error("No API key provided to initialize Groq");
    return false;
  }

  try {
    groq = new Groq({ apiKey });
    return true;
  } catch (err) {
    console.error("Failed to initialize Groq:", err);
    return false;
  }
}

export async function transcribeAudio(audioData) {
  log("Starting transcription...");

  if (!groq) {
    console.error("Groq client not initialized. Call initializeGroq() first.");
    sttFallback();
    return null;
  }

  try {
    log("Sending audio data to Groq API...", {
      dataType: typeof audioData,
      dataSize: audioData?.length || 0,
    });

    const transcription = await groq.audio.transcriptions.create({
      file: audioData,
      model: "whisper-large-v3",
      temperature: 0,
      response_format: "text",
    });

    log("Received response from API", { transcription });

    if (!transcription || !transcription.trim()) {
      console.error("[STT Service] Empty transcription received from API");
      sttFallback();
      return null;
    }

    log("Transcription successful", { text: transcription });
    return transcription;
  } catch (err) {
    console.error("[STT Service] API request failed:", {
      message: err.message,
      status: err.status,
      response: err.response?.data,
    });
    sttFallback();
    return null;
  }
}
