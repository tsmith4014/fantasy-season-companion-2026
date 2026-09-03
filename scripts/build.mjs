import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "dist");
const publicFiles = [
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
];

if (path.dirname(target) !== root || path.basename(target) !== "dist") {
  throw new Error(`Refusing to build into unexpected path: ${target}`);
}

await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });
for (const relative of publicFiles) {
  const sourceFile = path.join(root, "site", relative);
  const sourceStat = await fs.lstat(sourceFile);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`Public build input must be a regular file: ${relative}`);
  const targetFile = path.join(target, relative);
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.copyFile(sourceFile, targetFile);
}
await fs.writeFile(path.join(target, ".nojekyll"), "", "utf8");

for (const file of publicFiles) {
  const stat = await fs.stat(path.join(target, file));
  if (!stat.isFile() || stat.size === 0) throw new Error(`Build output is missing or empty: ${file}`);
}

console.log(`Built ${publicFiles.length} reviewed public assets into dist.`);
