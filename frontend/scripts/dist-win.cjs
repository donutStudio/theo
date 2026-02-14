#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
const backendDir = path.resolve(root, "..", "backend");

const now = new Date();
const stamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
  "-",
  String(now.getHours()).padStart(2, "0"),
  String(now.getMinutes()).padStart(2, "0"),
  String(now.getSeconds()).padStart(2, "0"),
].join("");
const outputDir = `out-builder/${stamp}`;

const run = (cmd, args, opts = {}) => {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    ...opts,
  });
  if (result.status !== 0 && !opts.allowFailure) {
    process.exit(result.status || 1);
  }
  return result;
};

const ensureBundledPythonRuntime = () => {
  const runtimeDir = path.join(root, "python-runtime");
  const pythonExe = path.join(runtimeDir, "Scripts", "python.exe");

  if (!fs.existsSync(runtimeDir)) {
    run("py", ["-3", "-m", "venv", "python-runtime"]);
  }

  if (!fs.existsSync(pythonExe)) {
    console.error("[Theo] Could not find bundled runtime python.exe after creating venv.");
    process.exit(1);
  }

  run(pythonExe, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(pythonExe, ["-m", "pip", "install", "-r", path.join(backendDir, "requirements.txt")]);
};

if (process.platform === "win32") {
  run("taskkill", ["/IM", "Theo.exe", "/F"], { stdio: "ignore", allowFailure: true });
  ensureBundledPythonRuntime();
}

run("npm", ["run", "build:electron"]);
run("npx", [
  "electron-builder",
  "--win",
  "nsis",
  `--config.directories.output=${outputDir}`,
]);

console.log(`\n[Theo] Installer generated under: ${outputDir}`);
