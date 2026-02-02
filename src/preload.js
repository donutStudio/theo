// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require("electron");

// Store environment variables
let env = {
  GROQ_API_KEY: null
};

// Listen for environment variables from main process
ipcRenderer.on('set-env', (event, newEnv) => {
  Object.assign(env, newEnv);
  console.log('Environment variables updated:', env);
});

// Expose to renderer
contextBridge.exposeInMainWorld("electron", {
  env,
  ipcRenderer: {
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, func) => {
      const validChannels = ["ctrl-win-key-down", "ctrl-win-key-up", "set-env"];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    removeListener: (channel, func) => {
      ipcRenderer.removeListener(channel, func);
    },
  },
});
