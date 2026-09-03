import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const site = path.join(root, "site");

async function filesBelow(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in site/: ${path.relative(root, absolute)}`);
    if (entry.isDirectory()) files.push(...await filesBelow(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const files = await filesBelow(site);
const javascript = files.filter((file) => file.endsWith(".js"));
for (const file of javascript) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`JavaScript syntax check failed: ${path.relative(root, file)}\n${result.stderr}`);
}

const prohibitedDom = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function\b)/;
const prohibitedStorage = /\b(localStorage|sessionStorage|indexedDB)\b/;
for (const file of javascript) {
  const source = await fs.readFile(file, "utf8");
  if (prohibitedDom.test(source)) throw new Error(`Unsafe DOM API found in ${path.relative(root, file)}.`);
  if (prohibitedStorage.test(source)) throw new Error(`Origin-wide browser persistence found in ${path.relative(root, file)}.`);
  if (!file.endsWith(`${path.sep}sw.js`) && /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/.test(source)) {
    throw new Error(`Unexpected network API found in ${path.relative(root, file)}.`);
  }
}

const html = await fs.readFile(path.join(site, "index.html"), "utf8");
const charsetIndex = html.indexOf("<meta charset=\"utf-8\">");
const cspIndex = html.indexOf("Content-Security-Policy");
if (charsetIndex < 0 || cspIndex < charsetIndex || cspIndex - charsetIndex > 400) throw new Error("CSP must immediately follow the charset metadata.");
if (!html.includes("connect-src 'none'") || !html.includes("script-src-attr 'none'") || !html.includes("style-src-attr 'none'")) throw new Error("CSP is missing the no-network or inline-code boundary.");
if (/\s(on[a-z]+|style)\s*=/i.test(html) || /javascript:/i.test(html)) throw new Error("Inline handlers, styles, and javascript: URLs are not allowed.");
if (/(?:src|href)=["']\//i.test(html)) throw new Error("Root-absolute asset paths are not allowed on the project site.");

console.log(`Linted ${javascript.length} JavaScript files and the static app shell.`);
