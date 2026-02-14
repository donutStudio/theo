/**
 * Electron window + overlay configuration
 * - Fullscreen, transparent, frameless
 * - Click-through with hover-based interaction
 * - Focus management to prevent minimization
 */

// This is whats behind Theo's seamless experience.

// Load environment variables
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env for apis
dotenv.config({ path: join(__dirname, "../../../.env") });

import { app, BrowserWindow, Menu, screen, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import started from "electron-squirrel-startup";
import { GlobalKeyboardListener } from "node-global-key-listener";

const require = createRequire(import.meta.url);

let mainWindowRef = null;
let inputLockCount = 0;
let clickThroughEnabled = false;

let backendProcess = null;

const getBackendDir = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend");
  }
  return path.join(__dirname, "../../backend");
};

const getPackagedBackendExe = () => {
  if (!app.isPackaged || process.platform !== "win32") return null;
  const exePath = path.join(process.resourcesPath, "backend-bin", "theo-backend.exe");
  return fs.existsSync(exePath) ? exePath : null;
};

const getBundledPythonPath = () => {
  if (!app.isPackaged) return null;
  const exe = process.platform === "win32" ? "python.exe" : "python3";
  const candidate =
    process.platform === "win32"
      ? path.join(process.resourcesPath, "python-runtime", "Scripts", exe)
      : path.join(process.resourcesPath, "python-runtime", "bin", exe);
  return fs.existsSync(candidate) ? candidate : null;
};

const resolvePythonCommand = () => {
  const bundledPython = getBundledPythonPath();
  if (bundledPython) {
    return [{ cmd: bundledPython, args: [] }];
  }

  if (process.platform === "win32") {
    return [
      { cmd: "py", args: ["-3"] },
      { cmd: "python", args: [] },
      { cmd: "python3", args: [] },
    ];
  }
  return [
    { cmd: "python3", args: [] },
    { cmd: "python", args: [] },
  ];
};

const startBackend = async () => {
  if (backendProcess && !backendProcess.killed) return;

  const backendDir = getBackendDir();
  const packagedBackendExe = getPackagedBackendExe();

  const attempts = [];
  if (packagedBackendExe) {
    attempts.push({ cmd: packagedBackendExe, args: [], mode: "packaged-exe" });
  }

  const backendEntry = path.join(backendDir, "app.py");
  if (fs.existsSync(backendEntry)) {
    for (const attempt of resolvePythonCommand()) {
      attempts.push({
        cmd: attempt.cmd,
        args: [...attempt.args, backendEntry],
        mode: "python-source",
      });
    }
  }

  if (!attempts.length) {
    console.error(`[Backend] Could not find backend executable or app.py (checked ${backendEntry})`);
    return;
  }

  for (const attempt of attempts) {
    try {
      const child = spawn(attempt.cmd, attempt.args, {
        cwd: backendDir,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
        windowsHide: true,
        stdio: "pipe",
      });

      let started = false;
      const startupTimer = setTimeout(() => {
        if (!started) {
          child.kill();
        }
      }, 3000);

      child.stdout?.on("data", (chunk) => {
        const msg = String(chunk || "").trim();
        if (msg) console.log(`[Backend] ${msg}`);
      });
      child.stderr?.on("data", (chunk) => {
        const msg = String(chunk || "").trim();
        if (msg) console.error(`[Backend] ${msg}`);
      });

      const exitCode = await new Promise((resolve) => {
        child.once("error", () => resolve(-999));
        child.once("exit", (code) => resolve(typeof code === "number" ? code : -1));
        setTimeout(() => {
          if (!child.killed) {
            started = true;
            resolve(999);
          }
        }, 600);
      });

      clearTimeout(startupTimer);
      if (exitCode === 999) {
        backendProcess = child;
        backendProcess.on("exit", (code) => {
          console.log(`[Backend] exited with code ${code}`);
          backendProcess = null;
        });
        console.log(`[Backend] Started (${attempt.mode}) with ${attempt.cmd} ${attempt.args.join(" ")}`);
        return;
      }
    } catch (err) {
      console.error(`[Backend] Failed to launch with ${attempt.cmd}:`, err?.message || err);
    }
  }

  console.error("[Backend] Could not start backend process. Ensure Python + backend deps are installed.");
};

const stopBackend = async () => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1000);
    await fetch("http://127.0.0.1:5000/shutdown", { method: "POST", signal: ctrl.signal });
    clearTimeout(t);
  } catch (_) {
    // ignore
  }

  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
};

const APP_CONFIG_PATH = path.join(app.getPath("userData"), "theo-config.json");

const readAppConfig = () => {
  try {
    if (!fs.existsSync(APP_CONFIG_PATH)) {
      return {
        GROQ_API_KEY: "",
        OPENAI_API_KEY: "",
        setupComplete: false,
      };
    }
    const raw = fs.readFileSync(APP_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      GROQ_API_KEY: parsed.GROQ_API_KEY || "",
      OPENAI_API_KEY: parsed.OPENAI_API_KEY || "",
      setupComplete: Boolean(parsed.setupComplete),
    };
  } catch (err) {
    console.warn("[Settings] Failed to read app config:", err?.message || err);
    return { GROQ_API_KEY: "", OPENAI_API_KEY: "", setupComplete: false };
  }
};

const writeAppConfig = (nextConfig) => {
  try {
    const current = readAppConfig();
    const merged = {
      ...current,
      ...nextConfig,
      setupComplete:
        typeof nextConfig?.setupComplete === "boolean"
          ? nextConfig.setupComplete
          : current.setupComplete,
    };
    fs.mkdirSync(path.dirname(APP_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(merged, null, 2), "utf8");
    return merged;
  } catch (err) {
    console.error("[Settings] Failed to write app config:", err?.message || err);
    return readAppConfig();
  }
};

const isInputLocked = () => inputLockCount > 0;


const applyPersistedApiConfigToEnv = () => {
  const persistedConfig = readAppConfig();
  if (persistedConfig.GROQ_API_KEY) process.env.GROQ_API_KEY = persistedConfig.GROQ_API_KEY;
  if (persistedConfig.OPENAI_API_KEY) process.env.OPENAI_API_KEY = persistedConfig.OPENAI_API_KEY;
};

if (started) {
  app.quit();
}

// Settings: startup (launch at login)
ipcMain.handle("get-startup-enabled", () => {
  const settings = app.getLoginItemSettings();
  return { enabled: Boolean(settings?.openAtLogin) };
});

ipcMain.handle("set-startup-enabled", (_event, { enabled }) => {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    const settings = app.getLoginItemSettings();
    return { ok: true, enabled: Boolean(settings?.openAtLogin) };
  } catch (err) {
    console.error("[Settings] set-startup-enabled failed:", err?.message || err);
    return { ok: false, enabled: app.getLoginItemSettings()?.openAtLogin ?? false };
  }
});

// IPC handler for taskbar height
ipcMain.handle("get-taskbar-height", () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return primaryDisplay.size.height - primaryDisplay.workAreaSize.height;
});

// Open URL in the system's default browser (not in Electron)
ipcMain.handle("open-external", (_event, url) => {
  if (url && typeof url === "string") shell.openExternal(url);
});

// Screen size for dialogs (scale popup to slightly smaller than screen)
ipcMain.handle("get-screen-size", () => {
  const { width, height } = screen.getPrimaryDisplay().size;
  return { width, height };
});

// Renderer-controlled input lock for startup/fallback audio and ai workflow.
ipcMain.handle("set-input-lock", (_event, payload) => {
  const lock = Boolean(payload?.lock);
  inputLockCount = lock ? inputLockCount + 1 : Math.max(0, inputLockCount - 1);
  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send("input-lock-changed", {
      locked: isInputLocked(),
      lockCount: inputLockCount,
    });
  }
  return { locked: isInputLocked(), lockCount: inputLockCount };
});

ipcMain.handle("get-input-lock-state", () => ({
  locked: isInputLocked(),
  lockCount: inputLockCount,
}));

// Initialize Groq client in main process (uses dotenv loaded earlier)
let groqClient = null;
let toFile = null;
const refreshGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    groqClient = null;
    console.warn("GROQ_API_KEY not set in main process");
    return;
  }
  try {
    const Groq = require("groq-sdk");
    toFile = require("groq-sdk").toFile;
    groqClient = new Groq({ apiKey });
    console.log("Groq client initialized in main process");
  } catch (err) {
    groqClient = null;
    console.error("Failed to initialize Groq in main process:", err);
  }
};

try {
  refreshGroqClient();
} catch (err) {
  console.error("Failed to initialize Groq in main process:", err);
}

ipcMain.handle("get-api-config", () => {
  const config = readAppConfig();
  return {
    GROQ_API_KEY: config.GROQ_API_KEY,
    OPENAI_API_KEY: config.OPENAI_API_KEY,
    setupComplete: config.setupComplete,
  };
});

ipcMain.handle("save-api-config", async (_event, payload) => {
  const next = writeAppConfig({
    GROQ_API_KEY: payload?.GROQ_API_KEY?.trim?.() || "",
    OPENAI_API_KEY: payload?.OPENAI_API_KEY?.trim?.() || "",
    setupComplete:
      typeof payload?.setupComplete === "boolean"
        ? payload.setupComplete
        : undefined,
  });

  process.env.GROQ_API_KEY = next.GROQ_API_KEY;
  process.env.OPENAI_API_KEY = next.OPENAI_API_KEY;
  refreshGroqClient();

  // Backend imports API clients using env; restart to pick up new keys immediately.
  await stopBackend();
  await startBackend();

  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send("set-env", {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    });
  }

  return { ok: true, ...next };
});

// Transcribe audio from renderer (Ctrl+Win recording) and print to terminal
ipcMain.handle("transcribe-audio", async (_event, arrayBuffer) => {
  if (!groqClient) {
    console.error(
      "[STT] Groq client not initialized. Set GROQ_API_KEY in .env",
    );
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
// Cooldown after release before next Ctrl+Win can trigger (matches notch.jsx)
const COOLDOWN_AFTER_RELEASE_MS = 2000;
let lastTriggerAt = 0;
let lastReleaseAt = 0;

// Output playing: TTS is playing. Allow Ctrl+Win to interrupt and ask new prompt.
// For AGENT mode, we only set this after script is done (when fetch returns).
let outputPlaying = false;

// Global keyboard listener
let gkl = null;

ipcMain.handle("set-output-playing", (_event, payload) => {
  outputPlaying = Boolean(payload?.playing);
  return { ok: true };
});

const handleCtrlWinPress = () => {
  const now = Date.now();
  if (clickThroughEnabled) return;
  if (isInputLocked()) return;
  if (now - lastTriggerAt < TRIGGER_LOCKOUT_MS) return;
  // Bypass cooldown when TTS is playing (user can interrupt to ask new prompt)
  const canInterrupt = outputPlaying;
  if (!canInterrupt && lastReleaseAt > 0 && now - lastReleaseAt < COOLDOWN_AFTER_RELEASE_MS)
    return;
  if (!bothKeysReleased) return;

  ctrlWinPressed = true;
  bothKeysReleased = false;
  lastTriggerAt = now;
  // Always stop TTS when Ctrl+Win pressed - no matter what
  fetch("http://127.0.0.1:5000/stop-tts", { method: "POST" }).catch(() => {});
  if (outputPlaying) outputPlaying = false;
  console.log("[STT] Ctrl+Win pressed - sending ctrl-win-key-down to renderer");

  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send("ctrl-win-key-down");
  } else {
    console.warn("[STT] No main window ref, cannot send to renderer");
  }
};

const handleCtrlWinRelease = () => {
  if (clickThroughEnabled) return;
  if (isInputLocked()) return;
  if (!ctrlWinPressed) return;

  ctrlWinPressed = false;
  lastReleaseAt = Date.now();

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

    // Ctrl alone (no Win): stop TTS response
    if (e.state === "DOWN" && isCtrlKey(e.name) && ctrlHeld && !winHeld) {
      fetch("http://127.0.0.1:5000/stop-tts", { method: "POST" }).catch(() => {});
      if (outputPlaying) outputPlaying = false;
    }

    if (
      e.state === "UP" &&
      ctrlWinPressed &&
      (isCtrlKey(e.name) || isWinKey(e.name))
    ) {
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
      webviewTag: true,
    },
  });

  // Load .env from project root (theo/.env)
  require("dotenv").config({ path: path.join(__dirname, "../../../.env") });
  applyPersistedApiConfigToEnv();
  refreshGroqClient();

  // Pass environment variables to renderer
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("set-env", {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    });
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true);

  mainWindowRef = mainWindow;

  // IPC: quit - shutdown Flask backend then quit Electron
  ipcMain.on("quit-app", () => {
    const shutdownFlask = async () => {
      await stopBackend();
      app.quit();
    };
    shutdownFlask();
  });

  // Click-through: overlay ignores mouse except over notch (notch stays clickable)
  let notchBounds = null; // { x, y, width, height } in window coordinates
  let clickThroughInterval = null;
  const NOTCH_POLL_MS = 80;

  ipcMain.handle("set-click-through", (_event, { enabled, agentMode }) => {
    clickThroughEnabled = Boolean(enabled);
    if (clickThroughInterval) {
      clearInterval(clickThroughInterval);
      clickThroughInterval = null;
    }
    if (!clickThroughEnabled) {
      mainWindow.setIgnoreMouseEvents(false);
      return { ok: true, enabled: false };
    }
    // turn off lock down for ai runs
    if (agentMode) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      return { ok: true, enabled: true };
    }
    const check = () => {
      if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
      const cursor = screen.getCursorScreenPoint();
      const winBounds = mainWindow.getBounds();
      const wx = cursor.x - winBounds.x;
      const wy = cursor.y - winBounds.y;
      const inside =
        notchBounds &&
        wx >= notchBounds.x &&
        wx <= notchBounds.x + notchBounds.width &&
        wy >= notchBounds.y &&
        wy <= notchBounds.y + notchBounds.height;
      mainWindow.setIgnoreMouseEvents(!inside, { forward: true });
    };
    check();
    clickThroughInterval = setInterval(check, NOTCH_POLL_MS);
    return { ok: true, enabled: true };
  });

  ipcMain.handle("set-notch-bounds", (_event, bounds) => {
    if (
      bounds &&
      typeof bounds.x === "number" &&
      typeof bounds.y === "number"
    ) {
      notchBounds = {
        x: bounds.x,
        y: bounds.y,
        width: Math.max(0, Number(bounds.width) || 0),
        height: Math.max(0, Number(bounds.height) || 0),
      };
    } else {
      notchBounds = null;
    }
    return { ok: true };
  });

  mainWindow.on("closed", () => {
    mainWindowRef = null;
  });

  Menu.setApplicationMenu(null);

  const devServerUrl =
    typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== "undefined"
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const viteRendererName =
    typeof MAIN_WINDOW_VITE_NAME !== "undefined"
      ? MAIN_WINDOW_VITE_NAME
      : "main_window";
  const forgeRendererPath = path.join(
    __dirname,
    `../renderer/${viteRendererName}/index.html`,
  );
  const distRendererPath = path.join(__dirname, "../dist/index.html");

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (fs.existsSync(forgeRendererPath)) {
    mainWindow.loadFile(forgeRendererPath);
  } else {
    mainWindow.loadFile(distRendererPath);
  }

  mainWindow.webContents.on("did-fail-load", (_event, code, desc, validatedURL) => {
    console.error(`[UI] Failed to load (${code}) ${desc}: ${validatedURL}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[UI] Renderer process gone:", details?.reason || details);
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();

    setTimeout(() => {
      mainWindow.setFullScreen(true);
      mainWindow.setAlwaysOnTop(true, "screen-saver");
    }, 50);
  });
};

app.whenReady().then(async () => {
  applyPersistedApiConfigToEnv();
  refreshGroqClient();
  await startBackend();
  createWindow();

  // start key listener in background so a slow/hanging spawn doesn't block the window
  initializeGlobalKeyListener().catch((err) => {
    console.error("[STT] Global key listener failed:", err.message || err);
    console.warn("[STT] Ctrl+Win shortcut will not work. App will still run.");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", async () => {
  if (gkl) gkl.kill();
  await stopBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
