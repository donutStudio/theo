import { transcribeAudio } from "./sttService.js";
import { sttFallback } from "./sttFallback.js";

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let stream = null;

function log(message, data) {
  console.log(`[STT] ${message}`, data || '');
}

// Clean up resources
function cleanup() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  audioChunks = [];
  isRecording = false;
}

export function initPushToTalk() {
  log("Initializing push-to-talk...");

  // Clean up any existing resources
  cleanup();

  // Start recording
  window.electron.ipcRenderer.on("ctrl-win-key-down", async () => {
    if (isRecording) {
      log("Already recording, ignoring duplicate start");
      return;
    }

    log("Starting recording...");
    isRecording = true;

    try {
      // Clean up any existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Request microphone access
      stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });

      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          log(`Received audio chunk: ${e.data.size} bytes`);
          audioChunks.push(e.data);
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e.error || "Unknown error");
        sttFallback();
        cleanup();
      };

      mediaRecorder.onstop = () => {
        log("Recording stopped");
      };

      // Start recording with timeslice to get chunks
      mediaRecorder.start(100);
      log("Recording started");

    } catch (err) {
      console.error("Failed to start recording:", err);
      sttFallback();
      cleanup();
    }
  });

  // Stop recording
  window.electron.ipcRenderer.on("ctrl-win-key-up", async () => {
    if (!isRecording || !mediaRecorder) {
      log("Not recording or no media recorder, ignoring stop");
      return;
    }

    log("Stopping recording...");
    isRecording = false;

    try {
      // Request any remaining data
      mediaRecorder.requestData();
      
      // Stop the media recorder
      mediaRecorder.stop();
      
      // Process the recording when it's done
      mediaRecorder.onstop = async () => {
        try {
          log(`Processing ${audioChunks.length} audio chunks`);
          
          if (audioChunks.length === 0) {
            console.error("No audio data recorded");
            sttFallback();
            return;
          }
          
          const blob = new Blob(audioChunks, { type: "audio/webm;codecs=opus" });
          log(`Audio blob size: ${blob.size} bytes`);
          
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          log("Sending audio for transcription...");
          const text = await transcribeAudio(buffer);
          
          if (!text) {
            console.error("Empty transcription result");
            return;
          }
          
          console.log("Transcription successful:", text);
          // TODO: pass text to AI classifier
          
        } catch (err) {
          console.error("Error processing recording:", err);
          sttFallback();
        } finally {
          // Clean up
          cleanup();
        }
      };
      
    } catch (err) {
      console.error("Error stopping recording:", err);
      sttFallback();
      cleanup();
    }
  });
  
  // Clean up on window unload
  window.addEventListener('beforeunload', cleanup);
  
  log("Push-to-talk initialized");
}
