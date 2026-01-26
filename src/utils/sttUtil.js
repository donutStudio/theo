import { transcribeAudio } from "./sttService.js";
import { sttFallback } from "./sttFallback.js";

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

export function initPushToTalk() {
  // Start recording
  window.electron.ipcRenderer.on("ctrl-win-key-down", async () => {
    if (isRecording) return; // prevent spam
    isRecording = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
      mediaRecorder.start();
    } catch (err) {
      console.error("Failed to start recording", err);
      sttFallback();
      isRecording = false;
    }
  });

  // Stop recording
  window.electron.ipcRenderer.on("ctrl-win-key-up", async () => {
    if (!isRecording || !mediaRecorder) return;
    isRecording = false;

    mediaRecorder.stop();
    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const text = await transcribeAudio(buffer);
        if (!text) return; // fallback already played if needed

        console.log("STT Result:", text);
        // TODO: pass text to AI classifier
      } catch (err) {
        console.error("STT failed:", err);
        sttFallback();
      }
    };
  });
}
