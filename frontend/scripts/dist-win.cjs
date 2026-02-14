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

const buildVenvDir = path.join(root, ".backend-build-venv");
const pyInstallerBuildDir = path.join(root, ".pyinstaller-build");
const backendBinDir = path.join(root, "backend-bin");

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

const ensureBackendExecutable = () => {
  if (process.platform !== "win32") {
    console.log("[Theo] Skipping backend executable build (non-Windows platform).");
    return;
  }

  run("taskkill", ["/IM", "Theo.exe", "/F"], { stdio: "ignore", allowFailure: true });

  if (!fs.existsSync(buildVenvDir)) {
    run("py", ["-3", "-m", "venv", ".backend-build-venv"]);
  }

  const venvPython = path.join(buildVenvDir, "Scripts", "python.exe");
  if (!fs.existsSync(venvPython)) {
    console.error("[Theo] Could not find backend build python at", venvPython);
    process.exit(1);
  }

  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(venvPython, ["-m", "pip", "install", "-r", path.join(backendDir, "requirements.txt")]);
  run(venvPython, ["-m", "pip", "install", "pyinstaller"]);

  fs.mkdirSync(backendBinDir, { recursive: true });
  fs.rmSync(pyInstallerBuildDir, { recursive: true, force: true });

  run(venvPython, [
    "-m",
    "PyInstaller",
    path.join(backendDir, "app.py"),
    "--onefile",
    "--name",
    "theo-backend",
    "--distpath",
    backendBinDir,
    "--workpath",
    path.join(pyInstallerBuildDir, "work"),
    "--specpath",
    path.join(pyInstallerBuildDir, "spec"),
    "--noconfirm",
    "--clean",
    "--add-data",
    `${path.join(backendDir, "services", "aiService", "MAINSYSTEMPROMPT.md")};services/aiService`,
    "--add-data",
    `${path.join(backendDir, "utils", "llmclassifer", "CLASSIFERSYSTEMPROMPT.md")};utils/llmclassifer`,
    "--add-data",
    `${path.join(backendDir, "utils", "audioFeedback", "outerror.wav")};utils/audioFeedback`,
    "--add-data",
    `${path.join(backendDir, "utils", "audioFeedback", "warning.wav")};utils/audioFeedback`,
  ]);

  const backendExe = path.join(backendBinDir, "theo-backend.exe");
  if (!fs.existsSync(backendExe)) {
    console.error("[Theo] Backend executable was not produced at", backendExe);
    process.exit(1);
  }

  console.log("[Theo] Backend executable ready:", backendExe);
};

ensureBackendExecutable();
run("npm", ["run", "build:electron"]);
run("npx", [
  "electron-builder",
  "--win",
  "nsis",
  `--config.directories.output=${outputDir}`,
]);

console.log(`\n[Theo] Installer generated under: ${outputDir}`);
