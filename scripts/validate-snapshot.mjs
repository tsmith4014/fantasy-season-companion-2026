import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateSnapshot } from "../site/modules/snapshot.js";
import { DEMO_SNAPSHOT } from "../site/data/demo-snapshot.js";

const root = path.resolve(import.meta.dirname, "..");
const requested = process.argv[2];
let raw = DEMO_SNAPSHOT;
let byteLength;

if (requested) {
  const file = path.resolve(root, requested);
  const contents = await fs.readFile(file, "utf8");
  byteLength = Buffer.byteLength(contents);
  raw = file.endsWith(".js") ? (await import(pathToFileURL(file))).DEMO_SNAPSHOT : JSON.parse(contents);
}

const result = validateSnapshot(raw, { byteLength });
if (!result.ok) throw new Error(`Snapshot validation failed with ${result.errors.length} error(s).`);
console.log(`Validated schema v1: ${result.snapshot.teams.length} teams and ${result.snapshot.availablePlayers.length} available players.`);
