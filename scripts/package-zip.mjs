// Post-build packaging script for the Chrome Web Store ZIP.
// Layout produced inside dist/ (= extension root):
//   manifest.json, popup.html, options.html, *.js, chunks/, assets/, icons/, _locales/

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
const dist = join(root, "dist");
const release = join(root, "release");
const zipPath = join(release, "calm-screen.zip");

function fail(msg) {
  console.error(`[package-zip] ${msg}`);
  process.exit(1);
}

if (!existsSync(dist)) {
  fail("dist/ does not exist — run `vite build` first.");
}

// 1) Flatten dist/src/*.html into dist/ root so manifest.json's
//    default_popup: "popup.html" and options_page: "options.html" resolve.
const builtHtmlDir = join(dist, "src");
if (existsSync(builtHtmlDir)) {
  for (const name of readdirSync(builtHtmlDir)) {
    if (!name.endsWith(".html")) continue;
    const from = join(builtHtmlDir, name);
    const to = join(dist, name);
    if (existsSync(to)) rmSync(to);
    renameSync(from, to);
  }
  const leftover = readdirSync(builtHtmlDir);
  if (leftover.length === 0) rmSync(builtHtmlDir, { recursive: true });
}

// 2) Copy static extension assets into dist/.
const staticEntries = [
  { from: join(root, "manifest.json"), to: join(dist, "manifest.json") },
  { from: join(root, "icons"), to: join(dist, "icons") },
  { from: join(root, "_locales"), to: join(dist, "_locales") },
];
for (const { from, to } of staticEntries) {
  if (!existsSync(from)) fail(`missing ${from}`);
  cpSync(from, to, { recursive: true });
}

// 3) Sanity check — fail loudly before writing a broken ZIP.
const required = [
  "manifest.json",
  "popup.html",
  "options.html",
  "popup.js",
  "options.js",
  "background.js",
  "content.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "_locales/ja/messages.json",
  "_locales/en/messages.json",
];
for (const rel of required) {
  const p = join(dist, rel);
  if (!existsSync(p) || !statSync(p).isFile()) fail(`missing dist/${rel}`);
}

// 4) Produce release/calm-screen.zip from dist/ contents.
mkdirSync(release, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);
execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: dist, stdio: "inherit" });

const bytes = statSync(zipPath).size;
console.log(`[package-zip] wrote ${zipPath} (${bytes} bytes)`);
