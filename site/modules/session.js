import { analyzeWaivers } from "./model.js";

const STAGEABLE_VERDICTS = new Set(["WATCH", "CLAIM", "STRONG CLAIM"]);

function recommendationMap(analysis) {
  const recommendations = new Map();
  for (const base of analysis?.recommendations ?? []) {
    recommendations.set(base.id, base);
    for (const alternative of base.alternatives ?? []) recommendations.set(alternative.id, alternative);
  }
  return recommendations;
}

function planItemFromRecommendation(item, recommendation) {
  return {
    ...item,
    recommendationId: recommendation.id,
    addPlayerId: recommendation.addPlayerId,
    addName: recommendation.candidate.name,
    dropPlayerId: recommendation.dropPlayerId,
    dropName: recommendation.drop.name,
    verdict: recommendation.verdict,
    netScore: Math.round(recommendation.netScore * 10) / 10,
    confidence: Math.round(recommendation.confidence),
    legality: recommendation.legality,
  };
}

export function isStageableRecommendation(recommendation) {
  return Boolean(recommendation) && STAGEABLE_VERDICTS.has(recommendation.verdict);
}

export function reconcileClaimPlan(plan, analysis) {
  const current = recommendationMap(analysis);
  return (plan ?? []).flatMap((item) => {
    const recommendation = current.get(item?.recommendationId);
    if (!recommendation || recommendation.verdict === "PASS") return [];
    return [planItemFromRecommendation(item, recommendation)];
  });
}

export function refreshDecisionState({ snapshot, weights, plan = [], asOf = new Date() } = {}) {
  const analysis = analyzeWaivers({ snapshot, weights, asOf });
  return {
    analysis,
    plan: reconcileClaimPlan(plan, analysis),
  };
}

export function freshAudit(action, details = {}, at = new Date()) {
  const timestamp = at instanceof Date ? at : new Date(at);
  return [{ at: timestamp.toISOString(), action, ...details }];
}
