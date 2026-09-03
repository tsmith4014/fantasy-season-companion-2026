const POSITION_ALIASES = new Map([
  ["DST", "D/ST"],
  ["DEF", "D/ST"],
  ["D/ST", "D/ST"],
]);

export const DEFAULT_WEIGHTS = Object.freeze({
  restOfSeason: 34,
  nextWeek: 24,
  rosterNeed: 18,
  market: 10,
  roleTrend: 8,
  health: 6,
});

export const FRESHNESS_POLICY = Object.freeze({
  freshHours: 2,
  usableHours: 6,
  expiredHours: 24,
});

const STARTER_SLOTS = new Set(["QB", "RB", "WR", "TE", "FLEX", "D/ST", "DST", "K"]);
const BENCH_SLOTS = new Set(["BE", "BENCH", "BN"]);
const INJURED_SLOTS = new Set(["IR", "RESERVE"]);

export function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

export function normalizePosition(position) {
  const value = String(position ?? "").trim().toUpperCase().split(",")[0].trim();
  return POSITION_ALIASES.get(value) ?? value;
}

export function stableCompare(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentile(value, population, fallback = 45) {
  const numeric = numberOrNull(value);
  const values = population.map(numberOrNull).filter((item) => item !== null).sort((a, b) => a - b);
  if (numeric === null || values.length < 2) return fallback;
  const below = values.filter((item) => item < numeric).length;
  const equal = values.filter((item) => item === numeric).length;
  return clamp(((below + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100);
}

function weightedAverage(parts, weights) {
  const available = Object.entries(parts).filter(([, value]) => Number.isFinite(value));
  const totalWeight = available.reduce((sum, [key]) => sum + (weights[key] ?? 0), 0);
  if (!totalWeight) return 0;
  return available.reduce((sum, [key, value]) => sum + value * (weights[key] ?? 0), 0) / totalWeight;
}

function healthScore(status) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (["IR", "O", "OUT", "SUSP"].includes(normalized)) return 5;
  if (["D", "DOUBTFUL"].includes(normalized)) return 30;
  if (["Q", "QUESTIONABLE"].includes(normalized)) return 68;
  if (["P", "PROBABLE"].includes(normalized)) return 88;
  return 100;
}

function requiredSurfaceAge(snapshot, asOf) {
  const surfaces = Array.isArray(snapshot?.source?.surfaces) ? snapshot.source.surfaces : [];
  const requiredKinds = ["roster", "available", "waiverOrder", "leagueSettings"];
  const required = [];
  for (const kind of requiredKinds) {
    const matches = surfaces.filter((surface) => surface?.kind === kind);
    if (matches.length !== 1 || String(matches[0]?.status ?? "").toLowerCase() !== "complete") {
      return { hours: Infinity, oldestAt: null, future: false };
    }
    const timestamp = Date.parse(matches[0].capturedAt);
    if (!Number.isFinite(timestamp)) return { hours: Infinity, oldestAt: null, future: false };
    required.push(timestamp);
  }
  const timestamps = required;
  const oldest = Math.min(...timestamps);
  const newest = Math.max(...timestamps);
  const now = asOf.getTime();
  return {
    hours: Math.max(0, (now - oldest) / 3_600_000),
    oldestAt: new Date(oldest).toISOString(),
    future: newest > now + 10 * 60_000,
  };
}

export function evaluateFreshness(snapshot, asOfInput = new Date(), policy = FRESHNESS_POLICY) {
  const asOf = asOfInput instanceof Date ? asOfInput : new Date(asOfInput);
  if (!Number.isFinite(asOf.getTime())) {
    return { state: "invalid", ageHours: Infinity, multiplier: 0, actionable: false, message: "Analysis time is invalid." };
  }
  const age = requiredSurfaceAge(snapshot, asOf);
  if (age.future) {
    return { state: "invalid", ageHours: 0, multiplier: 0, actionable: false, message: "A required capture time is in the future." };
  }
  if (!Number.isFinite(age.hours)) {
    return { state: "missing", ageHours: Infinity, multiplier: 0, actionable: false, message: "Required capture times are missing." };
  }
  if (age.hours > policy.expiredHours) {
    return { state: "expired", ageHours: age.hours, multiplier: 0.25, actionable: false, message: "Snapshot expired; refresh before planning claims." };
  }
  if (age.hours > policy.usableHours) {
    return { state: "stale", ageHours: age.hours, multiplier: 0.45, actionable: false, message: "Refresh required before claim advice." };
  }
  if (snapshot?.source?.isDemo === true && snapshot?.source?.platform === "demo") {
    return { state: "demo", ageHours: age.hours, multiplier: 0.92, actionable: true, message: "Fictional demo data." };
  }
  if (age.hours > policy.freshHours) {
    return { state: "aging", ageHours: age.hours, multiplier: 0.85, actionable: true, message: "Usable, but refresh close to waiver processing." };
  }
  return { state: "fresh", ageHours: age.hours, multiplier: 1, actionable: true, message: "Capture is fresh." };
}

function playerPopulations(snapshot) {
  const players = [
    ...(snapshot?.teams ?? []).flatMap((team) => team.players ?? []),
    ...(snapshot?.availablePlayers ?? []),
  ];
  const byPosition = new Map();
  for (const player of players) {
    const position = normalizePosition(player.position);
    if (!byPosition.has(position)) byPosition.set(position, []);
    byPosition.get(position).push(player);
  }
  return byPosition;
}

function componentScores(player, peers) {
  const seasonValues = peers.map((item) => item.seasonProjection);
  const weeklyValues = peers.map((item) => item.weeklyProjection);
  const seasonAverage = numberOrNull(player.seasonAverage);
  const weekly = numberOrNull(player.weeklyProjection);
  const rosterChange = numberOrNull(player.rosterChangePct);
  return {
    restOfSeason: percentile(player.seasonProjection, seasonValues),
    nextWeek: percentile(player.weeklyProjection, weeklyValues),
    market: numberOrNull(player.rosteredPct) ?? 45,
    roleTrend: clamp(50 + (rosterChange ?? 0) * 6 + ((weekly ?? seasonAverage ?? 0) - (seasonAverage ?? weekly ?? 0)) * 4),
    health: healthScore(player.status),
  };
}

function rosterNeedScore(position, roster, leagueRoster, candidate) {
  const normalized = normalizePosition(position);
  const required = Number(leagueRoster?.starters?.[normalized] ?? 0);
  const flexShares = { RB: 0.45, WR: 0.45, TE: 0.1 };
  const flexShare = (flexShares[normalized] ?? 0) * Number(leagueRoster?.starters?.FLEX ?? 0);
  const reserveTarget = ["RB", "WR"].includes(normalized) ? 1.5 : ["QB", "TE"].includes(normalized) ? 0.25 : 0;
  const targetDepth = required + flexShare + reserveTarget;
  const usable = roster.filter((player) => normalizePosition(player.position) === normalized && healthScore(player.status) >= 30);
  const starterTarget = required;
  let depthGap = 12;
  if (usable.length < starterTarget) depthGap = 100;
  else if (usable.length < targetDepth) depthGap = clamp(20 + ((targetDepth - usable.length) / Math.max(0.25, targetDepth - starterTarget)) * 25);
  const weekly = usable.map((player) => numberOrNull(player.weeklyProjection)).filter((value) => value !== null).sort((a, b) => b - a);
  const weakestStarter = weekly[Math.max(0, Math.ceil(starterTarget) - 1)] ?? null;
  const candidateWeekly = numberOrNull(candidate?.weeklyProjection);
  const startUpgrade = weakestStarter === null || candidateWeekly === null
    ? 45
    : clamp(18 + (candidateWeekly - weakestStarter) * 10);
  return clamp(depthGap * 0.58 + startUpgrade * 0.42);
}

function normalizeWeights(weights = {}) {
  const merged = { ...DEFAULT_WEIGHTS, ...weights };
  for (const key of Object.keys(DEFAULT_WEIGHTS)) merged[key] = clamp(merged[key], 0, 100);
  return merged;
}

function valuePlayer(player, peers, roster, leagueRoster, weights) {
  const components = componentScores(player, peers);
  components.rosterNeed = rosterNeedScore(player.position, roster, leagueRoster, player);
  return {
    score: weightedAverage(components, weights),
    components,
  };
}

function starterPenalty(player, candidate) {
  const slot = String(player.slot ?? "").trim().toUpperCase();
  if (normalizePosition(player.position) === normalizePosition(candidate?.position)) return 4;
  if (STARTER_SLOTS.has(slot)) return 30;
  if (INJURED_SLOTS.has(slot)) return 12;
  return 0;
}

function eligibilityForDrop(player) {
  if (player.locked === true || player.droppable === false) return "illegal";
  if (player.droppable === true) return "legal";
  const slot = String(player.slot ?? "").trim().toUpperCase();
  return BENCH_SLOTS.has(slot) ? "verify" : "illegal";
}

function availabilityKind(player) {
  const value = String(player.availability ?? "").trim().toUpperCase();
  if (["FA", "FREE AGENT", "AVAILABLE"].includes(value)) return "free_agent";
  return "waiver";
}

function priorityCost(snapshot, player, asOf) {
  if (availabilityKind(player) === "free_agent") return 0;
  const teamCount = Number(snapshot?.league?.teamCount);
  const myTeam = (snapshot?.teams ?? []).find((team) => team.teamId === snapshot?.myTeamId);
  const priority = Number(myTeam?.waiverPriority ?? snapshot?.league?.waivers?.myPriority);
  if (!Number.isFinite(teamCount) || teamCount <= 1 || !Number.isFinite(priority) || priority < 1 || priority > teamCount) return null;
  const nextReset = Date.parse(snapshot?.league?.waivers?.nextResetAt);
  if (!Number.isFinite(nextReset)) return null;
  const strength = clamp((teamCount - priority) / (teamCount - 1), 0, 1);
  const remaining = clamp((nextReset - asOf.getTime()) / (7 * 24 * 3_600_000), 0, 1);
  return 8 * strength * remaining;
}

function redundancyPenalty(candidate, roster, leagueRoster) {
  const position = normalizePosition(candidate.position);
  if (!["QB", "TE", "D/ST", "K"].includes(position)) return 0;
  if (Number(leagueRoster?.starters?.[position] ?? 0) < 1) return 0;
  const candidateWeek = numberOrNull(candidate.weeklyProjection);
  const currentWeeks = roster
    .filter((player) => normalizePosition(player.position) === position && healthScore(player.status) >= 30)
    .map((player) => numberOrNull(player.weeklyProjection))
    .filter((value) => value !== null);
  if (candidateWeek === null || !currentWeeks.length) return 0;
  const bestCurrent = Math.max(...currentWeeks);
  if (candidateWeek > bestCurrent) return 0;
  return clamp(14 + (bestCurrent - candidateWeek) * 2, 0, 24);
}

function rosterBalancePenalty(candidate, drop, roster, leagueRoster) {
  const addPosition = normalizePosition(candidate.position);
  const dropPosition = normalizePosition(drop.position);
  if (!["QB", "TE", "D/ST", "K"].includes(addPosition) || addPosition === dropPosition) return 0;
  const required = Number(leagueRoster?.starters?.[addPosition] ?? 0);
  const current = roster.filter((player) => normalizePosition(player.position) === addPosition && healthScore(player.status) >= 30).length;
  if (required < 1 || current < required) return 0;
  return ["D/ST", "K"].includes(addPosition) ? 20 : 16;
}

function confidenceFor(snapshot, candidate, drop, freshness, legality) {
  const coverage = snapshot?.source?.coverage;
  const inputs = [candidate.seasonProjection, candidate.weeklyProjection, drop.seasonProjection, drop.weeklyProjection];
  const present = inputs.filter((value) => numberOrNull(value) !== null).length / inputs.length;
  let confidence = 88 * freshness.multiplier * (0.72 + present * 0.28);
  if (coverage?.availablePlayers?.complete !== true || coverage?.teams?.complete !== true) confidence = Math.min(confidence, 60);
  if (!candidate.playerId || !drop.playerId) confidence = Math.min(confidence, 40);
  if (legality === "verify") confidence = Math.min(confidence, 69);
  if (numberOrNull(candidate.weeklyProjection) === null || numberOrNull(drop.weeklyProjection) === null) confidence = Math.min(confidence, 55);
  return clamp(confidence);
}

function verdictFor(netScore, confidence, actionable, legality, priorityKnown) {
  if (!actionable || legality === "illegal") return "REFRESH REQUIRED";
  if (!priorityKnown || legality === "verify") return netScore >= 3 ? "WATCH" : "PASS";
  if (netScore >= 22 && confidence >= 75) return "STRONG CLAIM";
  if (netScore >= 10 && confidence >= 70) return "CLAIM";
  if (netScore >= 3) return "WATCH";
  return "PASS";
}

function explanation(candidate, drop, components, netScore, priority, redundancy) {
  const labels = [
    ["restOfSeason", "rest-of-season value"],
    ["nextWeek", "next-week outlook"],
    ["rosterNeed", "roster fit"],
    ["market", "market demand"],
    ["roleTrend", "role trend"],
    ["health", "current availability"],
  ];
  const reasons = labels
    .sort((a, b) => components[b[0]] - components[a[0]] || stableCompare(a[0], b[0]))
    .slice(0, 2)
    .map(([, label]) => label);
  const redundancyNote = redundancy > 0 ? ` A current ${normalizePosition(candidate.position)} starter already projects ahead, so backup redundancy is charged.` : "";
  const reason = `${candidate.name} grades best on ${reasons.join(" and ")}; the model charges the value of dropping ${drop.name}.${redundancyNote}`;
  const reversal = netScore >= 3
    ? `Reconsider if ${candidate.name}'s role shrinks, ${drop.name}'s status improves, or availability changes before processing.`
    : `Reconsider only if ${candidate.name} gains a larger role or a cheaper drop becomes available.`;
  const priorityNote = priority === 0 ? "No waiver-priority cost for a free agent." : "Waiver-priority cost is included.";
  return { reason, reversal, priorityNote };
}

function validatePlanPairs(groups) {
  const seenAdds = new Set();
  const seenDrops = new Map();
  const errors = [];
  for (const group of groups) {
    for (const claim of group.claims ?? []) {
      if (seenAdds.has(claim.addPlayerId)) errors.push(`Player ${claim.addPlayerId} appears more than once.`);
      seenAdds.add(claim.addPlayerId);
      const previousGroup = seenDrops.get(claim.dropPlayerId);
      if (previousGroup && previousGroup !== group.groupId) errors.push(`Drop ${claim.dropPlayerId} appears in separate groups.`);
      seenDrops.set(claim.dropPlayerId, group.groupId);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function buildClaimGroups(planItems) {
  const byDrop = new Map();
  for (const item of planItems ?? []) {
    if (!item?.addPlayerId || !item?.dropPlayerId) continue;
    if (!byDrop.has(item.dropPlayerId)) byDrop.set(item.dropPlayerId, []);
    byDrop.get(item.dropPlayerId).push({ ...item });
  }
  const groups = [...byDrop.entries()].map(([dropPlayerId, claims], index) => ({
    groupId: `drop-${dropPlayerId}-${index + 1}`,
    mode: "first_success",
    dropPlayerId,
    claims,
  }));
  return { groups, ...validatePlanPairs(groups) };
}

export function analyzeWaivers({ snapshot, asOf = new Date(), weights = DEFAULT_WEIGHTS } = {}) {
  const now = asOf instanceof Date ? asOf : new Date(asOf);
  const freshness = evaluateFreshness(snapshot, now);
  const myTeam = (snapshot?.teams ?? []).find((team) => team.teamId === snapshot?.myTeamId);
  if (!snapshot || !myTeam || !Array.isArray(snapshot.availablePlayers)) {
    return { status: "invalid", gates: ["A validated schema-v1 snapshot is required."], freshness, recommendations: [], diagnostics: {} };
  }

  const normalizedWeights = normalizeWeights(weights);
  const populations = playerPopulations(snapshot);
  const roster = myTeam.players ?? [];
  const rosterIds = new Set((snapshot.teams ?? []).flatMap((team) => team.players ?? []).map((player) => player.playerId));
  const candidates = snapshot.availablePlayers.filter((player) => !rosterIds.has(player.playerId));
  const dropCandidates = roster.filter((player) => eligibilityForDrop(player) !== "illegal");
  const pairs = [];
  let illegalCount = roster.length - dropCandidates.length;

  for (const candidate of candidates) {
    const position = normalizePosition(candidate.position);
    const peers = populations.get(position) ?? [];
    const candidateValue = valuePlayer(candidate, peers, roster, snapshot.league?.roster, normalizedWeights);
    const candidatePairs = [];
    for (const drop of dropCandidates) {
      const dropPeers = populations.get(normalizePosition(drop.position)) ?? [];
      const dropValue = valuePlayer(drop, dropPeers, roster, snapshot.league?.roster, normalizedWeights);
      const legality = eligibilityForDrop(drop);
      const priority = priorityCost(snapshot, candidate, now);
      const priorityKnown = priority !== null;
      const redundancy = redundancyPenalty(candidate, roster, snapshot.league?.roster);
      const candidateScore = candidateValue.score - redundancy;
      const dropCost = dropValue.score + starterPenalty(drop, candidate);
      const balancePenalty = rosterBalancePenalty(candidate, drop, roster, snapshot.league?.roster);
      const netScore = candidateScore - dropCost - (priority ?? 0) - balancePenalty - 2;
      const confidence = confidenceFor(snapshot, candidate, drop, freshness, legality);
      const verdict = verdictFor(netScore, confidence, freshness.actionable, legality, priorityKnown);
      const copy = explanation(candidate, drop, candidateValue.components, netScore, priority ?? 0, redundancy);
      candidatePairs.push({
        id: `${candidate.playerId}::${drop.playerId}`,
        addPlayerId: candidate.playerId,
        dropPlayerId: drop.playerId,
        candidate,
        drop,
        legality,
        candidateScore,
        dropCost,
        priorityCost: priority,
        redundancyPenalty: redundancy,
        rosterBalancePenalty: balancePenalty,
        churnCost: 2,
        netScore,
        confidence,
        verdict,
        components: candidateValue.components,
        ...copy,
      });
    }
    candidatePairs.sort(compareRecommendations);
    if (candidatePairs.length) {
      const best = { ...candidatePairs[0], alternatives: candidatePairs.slice(1, 4) };
      pairs.push(best);
    }
  }

  pairs.sort(compareRecommendations);
  const gates = [];
  if (!freshness.actionable) gates.push(freshness.message);
  if (snapshot?.source?.coverage?.availablePlayers?.complete !== true) gates.push("Available-player coverage is partial; claim confidence is capped.");
  if (snapshot?.source?.coverage?.teams?.complete !== true) gates.push("League roster coverage is partial; claim confidence is capped.");
  if (!dropCandidates.length) gates.push("No verified or reviewable drop candidates were captured.");
  const status = gates.some((gate) => /refresh|expired|required capture/i.test(gate)) ? "refresh_required" : "ready";
  return {
    status,
    gates,
    freshness,
    recommendations: pairs,
    diagnostics: { candidateCount: candidates.length, dropCandidateCount: dropCandidates.length, excludedDropCount: illegalCount },
  };
}

export function compareRecommendations(left, right) {
  return right.netScore - left.netScore
    || right.confidence - left.confidence
    || stableCompare(left.addPlayerId, right.addPlayerId)
    || stableCompare(left.dropPlayerId, right.dropPlayerId);
}

export function replaceDrop(recommendation, dropPlayerId) {
  if (recommendation.dropPlayerId === dropPlayerId) return recommendation;
  return recommendation.alternatives?.find((item) => item.dropPlayerId === dropPlayerId) ?? recommendation;
}
