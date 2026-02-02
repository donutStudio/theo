import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "./index.css";
import Notch from "./components/notch";
import startupSound from "./assets/verbalpreset/startup.wav";
import { initPushToTalk } from "./utils/sttUtil";
import { initializeGroq } from "./utils/sttService";

const App = () => {
  const [taskbarHeight, setTaskbarHeight] = useState(0);

  // Initialize app
  useEffect(() => {
    // Initialize Groq client with API key from environment variables
    if (window.electron?.env?.GROQ_API_KEY) {
      const isInitialized = initializeGroq(window.electron.env.GROQ_API_KEY);
      console.log("Groq client initialized:", isInitialized);
    } else {
      console.error("GROQ_API_KEY not found in environment variables");
    }

    // Initialize push-to-talk functionality
    if (window.electron?.ipcRenderer) {
      try {
        initPushToTalk();
        console.log("Push-to-talk initialized");
      } catch (err) {
        console.error("Failed to initialize push-to-talk:", err);
      }
    }

    // Get taskbar height
    const getTaskbarHeight = async () => {
      if (window.electron?.ipcRenderer) {
        try {
          const height = await window.electron.ipcRenderer.invoke("get-taskbar-height");
          setTaskbarHeight(height);
        } catch (error) {
          console.error("Failed to get taskbar height:", error);
        }
      }
    };

    getTaskbarHeight();
  }, []);

  // Play startup sound once when app mounts
  useEffect(() => {
    try {
      const audio = new Audio(startupSound);
      audio.currentTime = 0;
      audio.play().catch((err) => console.error("Startup sound error:", err));
    } catch (err) {
      console.error("Failed to play startup sound:", err);
    }
  }, []);

  return (
    <div className="pointer-events-auto">
      <Notch taskbarHeight={taskbarHeight} />
    </div>
  );
};

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);