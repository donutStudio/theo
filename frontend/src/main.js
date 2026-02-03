/**
 * Electron window + overlay configuration
 * - Fullscreen, transparent, frameless
 * - Click-through with hover-based interaction
 * - Focus management to prevent minimization
 */

// Load environment variables FIRST (before any other imports that might use them)
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (theo/.env, outside frontend and backend)
dotenv.config({ path: join(__dirname, "../../../.env") });

import { app, BrowserWindow, Menu, screen, ipcMain } from "electron";
import path from "node:path";
import { createRequire } from "node:module";
import started from "electron-squirrel-startup";
import { GlobalKeyboardListener } from "node-global-key-listener";

const require = createRequire(import.meta.url);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// IPC handler for taskbar height
ipcMain.handle("get-taskbar-height", () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return primaryDisplay.size.height - primaryDisplay.workAreaSize.height;
});

// Global reference to main window
let mainWindowRef = null;

// Initialize Groq client in main process (uses dotenv loaded earlier)
let groqClient = null;
let toFile = null;
try {
  // require is used here to avoid import ordering issues in this file
  const Groq = require("groq-sdk");
  toFile = require("groq-sdk").toFile;
  if (process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("Groq client initialized in main process");
  } else {
    console.warn("GROQ_API_KEY not set in main process");
  }
} catch (err) {
  console.error("Failed to initialize Groq in main process:", err);
}

// Transcribe audio from renderer (Ctrl+Win recording) and print to terminal
ipcMain.handle("transcribe-audio", async (_event, arrayBuffer) => {
  if (!groqClient) {
    console.error("[STT] Groq client not initialized. Set GROQ_API_KEY in .env");
    return null;
  }
  if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
    console.error("[STT] Invalid audio data received");
    return null;
  }
  try {
    if (!toFile) {
      console.error("[STT] toFile not available from groq-sdk");
      return null;
    }
    const buffer = Buffer.from(arrayBuffer);
    const file = await toFile(buffer, "audio.webm");
    const transcription = await groqClient.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      temperature: 0,
      response_format: "text",
    });
    const text =
      typeof transcription === "string" ? transcription : transcription?.text;
    if (text && text.trim()) {
      console.log("[STT] Transcription:", text.trim());
    }
    return text?.trim() || null;
  } catch (err) {
    console.error("[STT] Transcription failed:", err.message || err);
    return null;
  }
});

// Key state tracking
let ctrlKeyPressed = false;
let winKeyPressed = false;
let ctrlWinPressed = false;
// Must release BOTH keys before next trigger (stops mid-sentence re-trigger)
let bothKeysReleased = true;

// Short lockout after trigger to avoid key-repeat / double key-down
const TRIGGER_LOCKOUT_MS = 500;
let lastTriggerAt = 0;

// Global keyboard listener
let gkl = null;

const handleCtrlWinPress = () => {
  const now = Date.now();
  if (now - lastTriggerAt < TRIGGER_LOCKOUT_MS) return;
  if (!bothKeysReleased) return;

  ctrlWinPressed = true;
  bothKeysReleased = false;
  lastTriggerAt = now;
  console.log("[STT] Ctrl+Win pressed - sending ctrl-win-key-down to renderer");

  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send("ctrl-win-key-down");
  } else {
    console.warn("[STT] No main window ref, cannot send to renderer");
  }
};

const handleCtrlWinRelease = () => {
  if (!ctrlWinPressed) return;

  ctrlWinPressed = false;

  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send("ctrl-win-key-up");
  }
};

// Key names: Windows uses "LEFT CTRL"/"RIGHT CTRL" and "LEFT META"/"RIGHT META" (standardName)
const CTRL_NAMES = [
  "LEFT CONTROL",
  "RIGHT CONTROL",
  "CONTROL",
  "LEFT CTRL",
  "RIGHT CTRL",
  "LCONTROL",
  "RCONTROL",
];
const WIN_NAMES = [
  "LEFT META",
  "RIGHT META",
  "META",
  "LEFT WIN",
  "RIGHT WIN",
  "WIN",
  "LWIN",
  "RWIN",
];

const isCtrlKey = (name) => name && CTRL_NAMES.includes(name);
const isWinKey = (name) => name && WIN_NAMES.includes(name);

const initializeGlobalKeyListener = async () => {
  // Resolve WinKeyServer.exe from the package (Vite bundle breaks __dirname inside the lib)
  let keyListenerConfig = {};
  if (process.platform === "win32") {
    try {
      const pkgPath = require.resolve("node-global-key-listener/package.json");
      const winKeyServerPath = path.join(
        path.dirname(pkgPath),
        "bin",
        "WinKeyServer.exe",
      );
      keyListenerConfig = { windows: { serverPath: winKeyServerPath } };
    } catch (e) {
      console.warn("[STT] Could not resolve WinKeyServer path:", e.message);
    }
  }

  gkl = new GlobalKeyboardListener(keyListenerConfig);

  await gkl.addListener((e, down) => {
    const ctrlHeld = CTRL_NAMES.some((k) => down[k]);
    const winHeld = WIN_NAMES.some((k) => down[k]);

    if (e.state === "UP" && ctrlWinPressed && (isCtrlKey(e.name) || isWinKey(e.name))) {
      handleCtrlWinRelease();
    }

    ctrlKeyPressed = ctrlHeld;
    winKeyPressed = winHeld;

    // Allow next trigger only after BOTH keys have been released (stops mid-sentence re-trigger)
    if (!ctrlHeld && !winHeld) {
      bothKeysReleased = true;
    }

    // Trigger only: keydown, both held, we're allowed (both were released before), and not already active
    if (
      e.state === "DOWN" &&
      ctrlKeyPressed &&
      winKeyPressed &&
      bothKeysReleased &&
      !ctrlWinPressed
    ) {
      handleCtrlWinPress();
    }
  });

  console.log(
    "[STT] Global keyboard listener started - hold Ctrl+Win to record, release to transcribe",
  );
};

const createWindow = () => {
  const { width, height } = screen.getPrimaryDisplay().size;

  const mainWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    show: false,
    minimizable: false,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Load .env from project root (theo/.env)
  require("dotenv").config({ path: path.join(__dirname, "../../../.env") });

  // Pass environment variables to renderer
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("set-env", {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
    });
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true);
  mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindowRef = mainWindow;

  // IPC: quit
  ipcMain.on("quit-app", () => app.quit());

  mainWindow.on("closed", () => {
    mainWindowRef = null;
  });

  Menu.setApplicationMenu(null);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();

    setTimeout(() => {
      mainWindow.setFullScreen(true);
      mainWindow.setAlwaysOnTop(true, "screen-saver");
    }, 50);
  });
};

app.whenReady().then(() => {
  createWindow();

  // Start key listener in background so a slow/hanging spawn doesn't block the window
  initializeGlobalKeyListener().catch((err) => {
    console.error("[STT] Global key listener failed:", err.message || err);
    console.warn("[STT] Ctrl+Win shortcut will not work. App will still run.");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  if (gkl) gkl.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
