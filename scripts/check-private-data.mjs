import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const allowedDist = new Set([
  ".nojekyll",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "icon.svg",
  "sw.js",
  "modules/model.js",
  "modules/session.js",
  "modules/snapshot.js",
  "modules/webmcp.js",
  "data/demo-snapshot.js",
]);

function runGit(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Git privacy check failed for ${args[0]}.`);
  return result.stdout;
}

async function walk(relative) {
  const absolute = path.join(root, relative);
  let entries;
  try {
    entries = await fs.readdir(absolute, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(relative, entry.name);
    const full = path.join(root, child);
    if (entry.isSymbolicLink()) throw new Error(`Symlink rejected: ${child}`);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function listFromNul(output) {
  return output.split("\0").filter(Boolean);
}

const tracked = listFromNul(runGit(["ls-files", "-z"]));
const trackedSet = new Set(tracked);
const forbiddenTracked = tracked.filter((file) => /^(?:\.private|imports|exports)\//.test(file) || /(?:\.local|\.private)\.json$/i.test(file));
if (forbiddenTracked.length) throw new Error(`Private paths are tracked: ${forbiddenTracked.length} file(s).`);

const candidatePaths = listFromNul(runGit(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]));
const candidateTexts = [];
for (const relative of candidatePaths) {
  const absolute = path.join(root, relative);
  try {
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${relative}`);
    if (stat.isFile()) candidateTexts.push({ label: `worktree:${relative}`, relative, contents: await fs.readFile(absolute, "utf8") });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (trackedSet.has(relative)) {
    candidateTexts.push({ label: `index:${relative}`, relative, contents: runGit(["show", `:${relative}`]) });
  }
}

const distFiles = (await walk("dist")).map((file) => path.relative(path.join(root, "dist"), file).split(path.sep).join("/"));
const unexpectedDist = distFiles.filter((file) => !allowedDist.has(file));
if (unexpectedDist.length) throw new Error(`Unexpected deployment artifacts: ${unexpectedDist.join(", ")}`);
if (distFiles.some((file) => file.endsWith(".map"))) throw new Error("Source maps may not be deployed.");
for (const relative of distFiles) {
  candidateTexts.push({
    label: `dist:${relative}`,
    relative: `dist/${relative}`,
    contents: await fs.readFile(path.join(root, "dist", relative), "utf8"),
  });
}

const history = runGit(["log", "--all", "--format=fuller", "--patch", "--no-ext-diff"]);
const refs = runGit(["for-each-ref", "--format=%(refname)"]);
const sensitiveTexts = [
  ...candidateTexts,
  { label: "git-history", relative: "git-history", contents: history },
  { label: "git-refs", relative: "git-refs", contents: refs },
];
const suspiciousPatterns = [
  /["']?espn_s2["']?\s*[:=]\s*["'][^"'\r\n]{12,}["']/i,
  /["']?SWID["']?\s*[:=]\s*["']\{?[0-9a-f-]{16,}\}?["']/i,
  /["']?(?:apiKey|api_key|x-api-key)["']?\s*[:=]\s*["'][^"'\r\n]{12,}["']/i,
  /authorization\s*:\s*(?:bearer\s+)?[a-z0-9._~-]{12,}/i,
  /bearer\s+[a-z0-9._~-]{12,}/i,
  /fantasy\.espn\.com\/football\/(?:team|league).*?(?:leagueId|teamId)=/i,
  /[?&](?:leagueId|teamId|seasonId)=\d+/i,
];
for (const item of sensitiveTexts) {
  if (suspiciousPatterns.some((pattern) => pattern.test(item.contents))) throw new Error(`Possible authenticated data in ${item.label}.`);
  if (!item.relative.endsWith(".json")) continue;
  try {
    const parsed = JSON.parse(item.contents);
    const looksLikePrivateSnapshot = parsed?.schemaVersion === 1
      && parsed?.source?.platform !== "demo"
      && parsed?.source?.isDemo !== true
      && Array.isArray(parsed?.teams)
      && Array.isArray(parsed?.availablePlayers);
    if (looksLikePrivateSnapshot) throw new Error(`Private snapshot shape found in ${item.label}.`);
  } catch (error) {
    if (error instanceof SyntaxError) continue;
    throw error;
  }
}

const snapshotDirectory = path.join(root, ".private", "league-snapshots");
let privateFiles = [];
try {
  privateFiles = (await fs.readdir(snapshotDirectory)).filter((file) => file.endsWith(".json"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const markers = new Set();
const markerKeys = new Set([
  "name",
  "team",
  "teamid",
  "myteamid",
  "playerid",
  "manager",
  "managername",
  "managerid",
  "owner",
  "ownername",
  "ownerid",
  "leagueid",
  "leaguename",
]);
function collectMarkers(value, key = "") {
  if (Array.isArray(value)) return value.forEach((item) => collectMarkers(item, key));
  if (value && typeof value === "object") return Object.entries(value).forEach(([childKey, child]) => collectMarkers(child, childKey));
  if (typeof value !== "string") return;
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!markerKeys.has(normalizedKey)) return;
  const marker = value.trim();
  const minimumLength = normalizedKey.endsWith("id") ? 8 : 6;
  if (marker.length >= minimumLength && !/^demo-/i.test(marker)) markers.add(marker);
}
for (const filename of privateFiles) {
  const absolute = path.join(snapshotDirectory, filename);
  const stat = await fs.lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("A local private snapshot must be a regular file.");
  if ((stat.mode & 0o077) !== 0) throw new Error("Local private snapshots must use owner-only permissions (0600).");
  try {
    collectMarkers(JSON.parse(await fs.readFile(absolute, "utf8")));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("A local private snapshot is not valid JSON.");
    throw error;
  }
}

const collisions = new Set();
for (const item of sensitiveTexts) {
  if ([...markers].some((marker) => item.contents.includes(marker))) collisions.add(item.label);
}
if (collisions.size) throw new Error(`Private marker collision in ${[...collisions].join(", ")}.`);

const sw = await fs.readFile(path.join(root, "site", "sw.js"), "utf8");
if (!sw.includes("PUBLIC_ASSETS") || /postMessage|runtimeCache/i.test(sw)) throw new Error("Service-worker cache policy is not a fixed public-asset allowlist.");

console.log(`Privacy check passed across ${candidatePaths.length} repository files and ${distFiles.length} deployment assets.`);
