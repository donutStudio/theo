/**
 * Electron window + overlay configuration
 * - Fullscreen, transparent, frameless
 * - Click-through with hover-based interaction
 * - Focus management to prevent minimization
 *
 * ! Do not change unless necessary.
 * Known to be stable as of 12/21/2025.
 */

import { app, BrowserWindow, Menu, screen, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Set up IPC handler for getting taskbar height (calculate dynamically)
ipcMain.handle("get-taskbar-height", () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const taskbarHeight =
    primaryDisplay.size.height - primaryDisplay.workAreaSize.height;
  return taskbarHeight;
});

const createWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  // Create the browser window (hidden at first).
  const mainWindow = new BrowserWindow({
    width: width,
    height: height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    show: false, // important: don't show until renderer is ready
    minimizable: false, // Prevent minimization
    resizable: false, // Prevent resizing
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
    },
  });

  // Force always-on-top with highest priority and make visible on all workspaces
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true);

  // Set up click-through toggle handlers
  ipcMain.on("enable-mouse", () => {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.focus(); // Force focus to keep window on top
  });

  ipcMain.on("disable-mouse", () => {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  });

  // Start with click-through enabled (window is click-through by default)
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Remove the menu bar (File, Edit, View, etc.)
  Menu.setApplicationMenu(null);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Show window only after renderer is ready, then enter fullscreen.
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus(); // Force focus immediately

    // Small delay avoids compositor / GPU race issues on some Windows setups
    setTimeout(() => {
      mainWindow.setFullScreen(true);
      // Re-enforce always-on-top after fullscreen
      mainWindow.setAlwaysOnTop(true, "screen-saver");
    }, 50);
  });

  // DevTools will not open by default
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
