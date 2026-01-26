import Groq from "groq-sdk";
import { sttFallback } from "./sttFallback.js"; // import your fallback

// Initialize Groq client with API key from environment variable
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function transcribeAudio(audioData) {
  // Validate API key is set
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY not found in environment variables");
    sttFallback();
    return null;
  }

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: audioData,
      model: "whisper-large-v3",
      temperature: 0,
      response_format: "text",
    });

    // If the transcription is empty or null, trigger fallback
    if (!transcription || !transcription.trim()) {
      sttFallback();
      return null;
    }

    return transcription;
  } catch (err) {
    console.error("STT failed:", err);
    sttFallback(); // play fallback audio
    return null;
  }
}
