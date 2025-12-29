import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "./index.css";
import Notch from "./components/notch";

const App = () => {
  const [taskbarHeight, setTaskbarHeight] = useState(0);

  // Get taskbar height
  useEffect(() => {
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

  const handleMouseEnter = () => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send("enable-mouse");
    }
  };

  const handleMouseLeave = () => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send("disable-mouse");
    }
  };

  return (
    <div
      className="pointer-events-auto"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Notch taskbarHeight={taskbarHeight} />
    </div>
  );
};

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);
