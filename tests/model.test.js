import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_SNAPSHOT } from "../site/data/demo-snapshot.js";
import {
  analyzeWaivers,
  buildClaimGroups,
  compareRecommendations,
  evaluateFreshness,
} from "../site/modules/model.js";

const NOW = new Date("2026-09-02T14:00:00.000Z");

function snapshotAt(ageHours = 1) {
  const snapshot = structuredClone(DEMO_SNAPSHOT);
  snapshot.source.isDemo = false;
  snapshot.source.platform = "espn";
  const capturedAt = new Date(NOW.getTime() - ageHours * 3_600_000).toISOString();
  snapshot.source.capturedAt = capturedAt;
  snapshot.source.surfaces = snapshot.source.surfaces.map((surface) => ({ ...surface, capturedAt }));
  snapshot.league.waivers.nextResetAt = new Date(NOW.getTime() + 6 * 24 * 3_600_000).toISOString();
  return snapshot;
}

test("freshness boundaries are deterministic at two and six hours", () => {
  assert.equal(evaluateFreshness(snapshotAt(2), NOW).state, "fresh");
  assert.equal(evaluateFreshness(snapshotAt(2.01), NOW).state, "aging");
  assert.equal(evaluateFreshness(snapshotAt(6), NOW).state, "aging");
  assert.equal(evaluateFreshness(snapshotAt(6.01), NOW).state, "stale");
  assert.equal(evaluateFreshness(snapshotAt(24.01), NOW).state, "expired");
});

test("the oldest required surface controls freshness", () => {
  const snapshot = snapshotAt(1);
  snapshot.source.surfaces.find((surface) => surface.kind === "waiverOrder").capturedAt = new Date(NOW.getTime() - 7 * 3_600_000).toISOString();
  assert.equal(evaluateFreshness(snapshot, NOW).state, "stale");
});

test("future and invalid analysis times fail closed", () => {
  const future = snapshotAt(1);
  future.source.surfaces[0].capturedAt = new Date(NOW.getTime() + 20 * 60_000).toISOString();
  assert.equal(evaluateFreshness(future, NOW).actionable, false);
  assert.equal(evaluateFreshness(future, "not-a-date").state, "invalid");
});

test("missing or failed required surfaces cannot produce actionable verdicts", () => {
  const missing = snapshotAt(1);
  missing.source.surfaces = missing.source.surfaces.filter((surface) => surface.kind !== "available");
  const missingResult = analyzeWaivers({ snapshot: missing, asOf: NOW });
  assert.equal(missingResult.status, "refresh_required");
  assert.equal(missingResult.freshness.actionable, false);
  assert.ok(missingResult.recommendations.every((item) => item.verdict === "REFRESH REQUIRED"));

  const failed = snapshotAt(1);
  failed.source.surfaces.find((surface) => surface.kind === "leagueSettings").status = "failed";
  const failedResult = analyzeWaivers({ snapshot: failed, asOf: NOW });
  assert.equal(failedResult.status, "refresh_required");
  assert.equal(failedResult.freshness.actionable, false);
  assert.ok(failedResult.recommendations.every((item) => item.verdict === "REFRESH REQUIRED"));
});

test("truthy isDemo and coverage strings fail closed when validation is bypassed", () => {
  const snapshot = snapshotAt(7);
  snapshot.source.isDemo = "false";
  snapshot.source.coverage.availablePlayers.complete = "false";
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  assert.equal(result.freshness.actionable, false);
  assert.ok(result.recommendations.every((item) => item.confidence <= 60));
  assert.ok(result.recommendations.every((item) => item.verdict === "REFRESH REQUIRED"));
});

test("an old snapshot cannot bypass freshness by claiming to be demo data", () => {
  const snapshot = snapshotAt(7);
  snapshot.source.isDemo = true;
  snapshot.source.platform = "demo";
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  assert.equal(result.freshness.state, "stale");
  assert.equal(result.freshness.actionable, false);
});

test("stale analysis stays visible but every verdict requires refresh", () => {
  const result = analyzeWaivers({ snapshot: snapshotAt(7), asOf: NOW });
  assert.equal(result.status, "refresh_required");
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.recommendations.every((item) => item.verdict === "REFRESH REQUIRED"));
});

test("free agents have no priority cost", () => {
  const snapshot = snapshotAt(1);
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  const freeAgent = result.recommendations.find((item) => item.candidate.availability === "FA");
  assert.equal(freeAgent.priorityCost, 0);
});

test("last waiver priority has zero preservation cost after reset", () => {
  const snapshot = snapshotAt(1);
  snapshot.teams.find((team) => team.isMine).waiverPriority = snapshot.league.teamCount;
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  const waiver = result.recommendations.find((item) => item.candidate.availability === "WA");
  assert.equal(waiver.priorityCost, 0);
});

test("first waiver priority carries more cost than last priority", () => {
  const first = snapshotAt(1);
  first.teams.find((team) => team.isMine).waiverPriority = 1;
  const last = snapshotAt(1);
  last.teams.find((team) => team.isMine).waiverPriority = last.league.teamCount;
  const firstWaiver = analyzeWaivers({ snapshot: first, asOf: NOW }).recommendations.find((item) => item.candidate.availability === "WA");
  const lastWaiver = analyzeWaivers({ snapshot: last, asOf: NOW }).recommendations.find((item) => item.candidate.playerId === firstWaiver.candidate.playerId);
  assert.ok(firstWaiver.priorityCost > lastWaiver.priorityCost);
});

test("missing projections cap confidence below claim level", () => {
  const snapshot = snapshotAt(1);
  snapshot.availablePlayers[0].weeklyProjection = null;
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  const recommendation = result.recommendations.find((item) => item.addPlayerId === snapshot.availablePlayers[0].playerId);
  assert.ok(recommendation.confidence <= 55);
  assert.notEqual(recommendation.verdict, "CLAIM");
  assert.notEqual(recommendation.verdict, "STRONG CLAIM");
});

test("unknown drop eligibility is review-only", () => {
  const snapshot = snapshotAt(1);
  for (const player of snapshot.teams.find((team) => team.isMine).players) player.droppable = null;
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  assert.ok(result.recommendations.every((item) => item.legality === "verify"));
  assert.ok(result.recommendations.every((item) => !["CLAIM", "STRONG CLAIM"].includes(item.verdict)));
});

test("incomplete available-player coverage caps confidence", () => {
  const snapshot = snapshotAt(1);
  snapshot.source.coverage.availablePlayers.complete = false;
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  assert.ok(result.recommendations.every((item) => item.confidence <= 60));
});

test("incomplete league roster coverage caps confidence", () => {
  const snapshot = snapshotAt(1);
  snapshot.source.coverage.teams.complete = false;
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  assert.ok(result.recommendations.every((item) => item.confidence <= 60));
});

test("an elite healthy starter charges backup redundancy at one-starter positions", () => {
  const snapshot = snapshotAt(1);
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  const tightEnd = result.recommendations.find((item) => item.candidate.position === "TE");
  assert.ok(tightEnd.redundancyPenalty > 0);
  assert.ok(tightEnd.candidate.weeklyProjection < snapshot.teams.find((team) => team.isMine).players.find((player) => player.position === "TE").weeklyProjection);
});

test("adding a second one-starter position charges roster balance when dropping elsewhere", () => {
  const snapshot = snapshotAt(1);
  const result = analyzeWaivers({ snapshot, asOf: NOW });
  const tightEnd = result.recommendations.find((item) => item.candidate.position === "TE");
  assert.notEqual(tightEnd.drop.position, "TE");
  assert.equal(tightEnd.rosterBalancePenalty, 16);
});

test("same-drop moves become an ordered first-success fallback ladder", () => {
  const plan = [
    { planId: "one", addPlayerId: "add-one", dropPlayerId: "drop-one" },
    { planId: "two", addPlayerId: "add-two", dropPlayerId: "drop-one" },
    { planId: "three", addPlayerId: "add-three", dropPlayerId: "drop-two" },
  ];
  const result = buildClaimGroups(plan);
  assert.equal(result.valid, true);
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].mode, "first_success");
  assert.deepEqual(result.groups[0].claims.map((claim) => claim.planId), ["one", "two"]);
});

test("a duplicate add target invalidates the plan", () => {
  const result = buildClaimGroups([
    { planId: "one", addPlayerId: "same-add", dropPlayerId: "drop-one" },
    { planId: "two", addPlayerId: "same-add", dropPlayerId: "drop-two" },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /more than once/.test(error)));
});

test("recommendation ordering is stable under shuffled inputs", () => {
  const normal = snapshotAt(1);
  const shuffled = snapshotAt(1);
  shuffled.availablePlayers.reverse();
  shuffled.teams.reverse();
  for (const team of shuffled.teams) team.players.reverse();
  const left = analyzeWaivers({ snapshot: normal, asOf: NOW }).recommendations.map((item) => item.id);
  const right = analyzeWaivers({ snapshot: shuffled, asOf: NOW }).recommendations.map((item) => item.id);
  assert.deepEqual(right, left);
});

test("exact ties use bytewise player IDs, never display names", () => {
  const base = { netScore: 10, confidence: 80, dropPlayerId: "drop" };
  const sorted = [
    { ...base, addPlayerId: "b", candidate: { name: "Alpha" } },
    { ...base, addPlayerId: "a", candidate: { name: "Zulu" } },
  ].sort(compareRecommendations);
  assert.deepEqual(sorted.map((item) => item.addPlayerId), ["a", "b"]);
});
