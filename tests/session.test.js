import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_SNAPSHOT } from "../site/data/demo-snapshot.js";
import {
  freshAudit,
  isStageableRecommendation,
  reconcileClaimPlan,
  refreshDecisionState,
} from "../site/modules/session.js";

const NOW = new Date("2026-09-02T14:00:00.000Z");

function privateSnapshotAt(ageHours) {
  const snapshot = structuredClone(DEMO_SNAPSHOT);
  const capturedAt = new Date(NOW.getTime() - ageHours * 3_600_000).toISOString();
  snapshot.source.isDemo = false;
  snapshot.source.platform = "espn";
  snapshot.source.capturedAt = capturedAt;
  snapshot.source.surfaces = snapshot.source.surfaces.map((surface) => ({ ...surface, capturedAt }));
  snapshot.league.waivers.nextResetAt = new Date(NOW.getTime() + 6 * 24 * 3_600_000).toISOString();
  return snapshot;
}

function planItem(recommendation) {
  return {
    planId: `plan-${recommendation.id}`,
    recommendationId: recommendation.id,
    addPlayerId: recommendation.addPlayerId,
    addName: recommendation.candidate.name,
    dropPlayerId: recommendation.dropPlayerId,
    dropName: recommendation.drop.name,
    verdict: recommendation.verdict,
    netScore: recommendation.netScore,
    confidence: recommendation.confidence,
    legality: recommendation.legality,
  };
}

test("action-time refresh closes a plan after the six-hour boundary", () => {
  const snapshot = privateSnapshotAt(1);
  const fresh = refreshDecisionState({ snapshot, plan: [], asOf: NOW });
  const recommendation = fresh.analysis.recommendations.find(isStageableRecommendation);
  assert.ok(recommendation);

  const stale = refreshDecisionState({
    snapshot,
    plan: [planItem(recommendation)],
    asOf: new Date(NOW.getTime() + 6 * 3_600_000),
  });
  assert.equal(stale.analysis.freshness.actionable, false);
  assert.equal(stale.plan.length, 1);
  assert.equal(stale.plan[0].verdict, "REFRESH REQUIRED");
  assert.equal(isStageableRecommendation(stale.analysis.recommendations[0]), false);
});

test("plan reconciliation updates current scores and removes moves that became passes", () => {
  const original = {
    planId: "plan-add-drop",
    recommendationId: "add::drop",
    addPlayerId: "add",
    addName: "Old Add",
    dropPlayerId: "drop",
    dropName: "Old Drop",
    verdict: "CLAIM",
    netScore: 20,
    confidence: 90,
    legality: "legal",
  };
  const passAnalysis = {
    recommendations: [{
      id: "add::drop",
      addPlayerId: "add",
      dropPlayerId: "drop",
      candidate: { name: "Current Add" },
      drop: { name: "Current Drop" },
      verdict: "PASS",
      netScore: 1,
      confidence: 88,
      legality: "legal",
      alternatives: [],
    }],
  };
  assert.deepEqual(reconcileClaimPlan([original], passAnalysis), []);

  passAnalysis.recommendations[0].verdict = "WATCH";
  passAnalysis.recommendations[0].netScore = 6.25;
  const [updated] = reconcileClaimPlan([original], passAnalysis);
  assert.equal(updated.addName, "Current Add");
  assert.equal(updated.dropName, "Current Drop");
  assert.equal(updated.verdict, "WATCH");
  assert.equal(updated.netScore, 6.3);
});

test("only watch and claim verdicts are stageable", () => {
  assert.equal(isStageableRecommendation({ verdict: "WATCH" }), true);
  assert.equal(isStageableRecommendation({ verdict: "CLAIM" }), true);
  assert.equal(isStageableRecommendation({ verdict: "STRONG CLAIM" }), true);
  assert.equal(isStageableRecommendation({ verdict: "PASS" }), false);
  assert.equal(isStageableRecommendation({ verdict: "REFRESH REQUIRED" }), false);
});

test("a data-boundary audit starts without prior private identifiers", () => {
  const audit = freshAudit("demo_loaded", {}, NOW);
  assert.deepEqual(audit, [{ at: NOW.toISOString(), action: "demo_loaded" }]);
  assert.equal(JSON.stringify(audit).includes("private-player-id"), false);
});
