import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_SNAPSHOT } from "../site/data/demo-snapshot.js";
import { MAX_SNAPSHOT_BYTES, normalizeSnapshot, validateSnapshot } from "../site/modules/snapshot.js";

function fixture() {
  return structuredClone(DEMO_SNAPSHOT);
}

test("fictional schema-v1 snapshot validates and normalizes positions", () => {
  const raw = fixture();
  raw.availablePlayers[0].position = "dst";
  raw.teams[1].players[0].position = "QB, S";
  const result = validateSnapshot(raw);
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.availablePlayers[0].position, "D/ST");
  assert.equal(result.snapshot.teams[1].players[0].position, "QB");
});

test("schema-v0 is historical only and cannot power claims", () => {
  const result = validateSnapshot({ schemaVersion: 0 });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /fresh schema-v1 capture/i);
});

test("oversized snapshots fail before content validation", () => {
  const result = validateSnapshot(fixture(), { byteLength: MAX_SNAPSHOT_BYTES + 1 });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /exceeds/i);
});

test("duplicate and cross-listed player IDs are rejected", () => {
  const raw = fixture();
  raw.availablePlayers[1].playerId = raw.availablePlayers[0].playerId;
  raw.availablePlayers[2].playerId = raw.teams[0].players[0].playerId;
  const result = validateSnapshot(raw);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /Duplicate available playerId/.test(error)));
  assert.ok(result.errors.some((error) => /both rostered and available/.test(error)));
});

test("authentication fields are rejected recursively", () => {
  const raw = fixture();
  raw.source.details = { sessionId: "do-not-store" };
  const result = validateSnapshot(raw);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /Forbidden authentication field/.test(error)));
});

test("ESPN and API credential key variants are rejected", () => {
  for (const key of ["espn_s2", "SWID", "apiKey", "x-api-key", "clientSecret", "credentials"]) {
    const raw = fixture();
    raw.source.details = { [key]: "credential-value-must-not-be-imported" };
    const result = validateSnapshot(raw);
    assert.equal(result.ok, false, key);
    assert.ok(result.errors.some((error) => /Forbidden authentication field/.test(error)), key);
  }
});

test("required capture surfaces must appear once with complete status", () => {
  const missing = fixture();
  missing.source.surfaces = missing.source.surfaces.filter((surface) => surface.kind !== "available");
  const missingResult = validateSnapshot(missing);
  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.errors.some((error) => /required available surface/i.test(error)));

  const failed = fixture();
  failed.source.surfaces.find((surface) => surface.kind === "waiverOrder").status = "failed";
  const failedResult = validateSnapshot(failed);
  assert.equal(failedResult.ok, false);
  assert.ok(failedResult.errors.some((error) => /waiverOrder surface must have complete status/i.test(error)));

  const duplicate = fixture();
  duplicate.source.surfaces.push({ ...duplicate.source.surfaces[0] });
  const duplicateResult = validateSnapshot(duplicate);
  assert.equal(duplicateResult.ok, false);
  assert.ok(duplicateResult.errors.some((error) => /Exactly one required roster surface/i.test(error)));
});

test("security and coverage booleans do not accept truthy strings", () => {
  for (const mutate of [
    (raw) => { raw.source.isDemo = "false"; },
    (raw) => { raw.source.coverage.availablePlayers.complete = "false"; },
    (raw) => { raw.source.coverage.teams.complete = "true"; },
    (raw) => { raw.teams[0].isMine = "true"; },
    (raw) => { raw.teams[0].players[0].locked = "false"; },
    (raw) => { raw.teams[0].players[0].droppable = "true"; },
  ]) {
    const raw = fixture();
    mutate(raw);
    const result = validateSnapshot(raw);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /must be a boolean/i.test(error)));
  }
});

test("only the fictional demo platform can set isDemo", () => {
  const privateMarkedDemo = fixture();
  privateMarkedDemo.source.platform = "espn";
  privateMarkedDemo.source.isDemo = true;
  const privateResult = validateSnapshot(privateMarkedDemo);
  assert.equal(privateResult.ok, false);
  assert.ok(privateResult.errors.some((error) => /isDemo/i.test(error)));

  const demoMarkedPrivate = fixture();
  demoMarkedPrivate.source.isDemo = false;
  const demoResult = validateSnapshot(demoMarkedPrivate);
  assert.equal(demoResult.ok, false);
  assert.ok(demoResult.errors.some((error) => /isDemo/i.test(error)));
});

test("markup-like imported names remain plain normalized strings", () => {
  const raw = fixture();
  const canary = "<img src=x onerror=alert(1)>";
  raw.availablePlayers[0].name = canary;
  const result = validateSnapshot(raw);
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.availablePlayers[0].name, canary);
});

test("normalization strips unrecognized top-level fields", () => {
  const raw = fixture();
  raw.unexpected = "discard me";
  const normalized = normalizeSnapshot(raw);
  assert.equal("unexpected" in normalized, false);
});

test("partial coverage validates with an explicit confidence warning", () => {
  const raw = fixture();
  raw.source.coverage.availablePlayers.complete = false;
  const result = validateSnapshot(raw);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((warning) => /partial/i.test(warning)));
});
