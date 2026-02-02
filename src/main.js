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

// Load .env file from project root
dotenv.config({ path: join(__dirname, "../../.env") });

import { app, BrowserWindow, Menu, screen, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { GlobalKeyboardListener } from "node-global-key-listener";

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

// Key state tracking
let ctrlKeyPressed = false;
let winKeyPressed = false;
let ctrlWinPressed = false;

// Cooldown
const CTRL_WIN_COOLDOWN_MS = 5000;
let lastCtrlWinAt = 0;

// Global keyboard listener
let gkl = null;

const handleCtrlWinPress = () => {
  // Cooldown check
  if (Date.now() - lastCtrlWinAt < CTRL_WIN_COOLDOWN_MS) return;

  // Trigger
  ctrlWinPressed = true;
  lastCtrlWinAt = Date.now();

  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send("ctrl-win-key-down");
  }
};

const handleCtrlWinRelease = () => {
  if (!ctrlWinPressed) return;

  ctrlWinPressed = false;

  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send("ctrl-win-key-up");
  }
};

const initializeGlobalKeyListener = () => {
  gkl = new GlobalKeyboardListener();

  gkl.addListener((e, down) => {
    // Ctrl state
    if (
      e.name === "LEFT CONTROL" ||
      e.name === "RIGHT CONTROL" ||
      e.name === "CONTROL"
    ) {
      const prev = ctrlKeyPressed;
      ctrlKeyPressed = down;

      if (!down && prev && ctrlWinPressed) handleCtrlWinRelease();
    }

    // Win state
    if (
      e.name === "LEFT META" ||
      e.name === "RIGHT META" ||
      e.name === "META" ||
      e.name === "LEFT WIN" ||
      e.name === "RIGHT WIN" ||
      e.name === "WIN"
    ) {
      const prev = winKeyPressed;
      winKeyPressed = down;

      if (!down && prev && ctrlWinPressed) handleCtrlWinRelease();
    }

    // Trigger only on BOTH pressed (keydown)
    if (down && ctrlKeyPressed && winKeyPressed && !ctrlWinPressed) {
      handleCtrlWinPress();
    }
  });

  console.log(
    "Global keyboard listener started - listening for Ctrl+Win globally",
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
      sandbox: true
    },
  });

  // Load environment variables
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  
  // Pass environment variables to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('set-env', {
      GROQ_API_KEY: process.env.GROQ_API_KEY
    });
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true);
  mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindowRef = mainWindow;

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
  initializeGlobalKeyListener();
  createWindow();

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
