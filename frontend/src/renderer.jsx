import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "./index.css";
import Notch from "./components/notch";
import startupSound from "./assets/verbalpreset/startup2.wav";
import { initPushToTalk } from "./utils/sttUtil";

const App = () => {
  const [taskbarHeight, setTaskbarHeight] = useState(0);

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

    // Get taskbar height
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
