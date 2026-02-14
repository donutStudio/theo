#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
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

// Best-effort: if Theo is running on Windows, stop it so packaging doesn't hit file locks.
if (process.platform === "win32") {
  run("taskkill", ["/IM", "Theo.exe", "/F"], { stdio: "ignore", allowFailure: true });
}

run("npm", ["run", "build:electron"]);
run("npx", [
  "electron-builder",
  "--win",
  "nsis",
  `--config.directories.output=${outputDir}`,
]);

console.log(`\n[Theo] Installer generated under: ${outputDir}`);
