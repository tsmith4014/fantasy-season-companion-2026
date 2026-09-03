import {
  buildClaimGroups,
  DEFAULT_WEIGHTS,
  normalizePosition,
  replaceDrop,
  stableCompare,
} from "./modules/model.js";
import { freshDemoSnapshot } from "./data/demo-snapshot.js";
import {
  freshAudit,
  isStageableRecommendation,
  refreshDecisionState,
} from "./modules/session.js";
import { parseSnapshotFile, publicSnapshotSummary } from "./modules/snapshot.js";
import { registerWaiverTools } from "./modules/webmcp.js";

const WEIGHT_LABELS = {
  restOfSeason: "Rest of season",
  nextWeek: "Next week",
  rosterNeed: "Roster need",
  market: "Market demand",
  roleTrend: "Role trend",
  health: "Status usability",
};
const VALID_VIEWS = new Set(["waivers", "health", "league", "trades", "data"]);

const state = {
  snapshot: freshDemoSnapshot(),
  dataState: "demo",
  analysis: null,
  weights: { ...DEFAULT_WEIGHTS },
  position: "ALL",
  search: "",
  sort: "net",
  plan: [],
  dropSelections: new Map(),
  pendingImport: null,
  audit: freshAudit("demo_loaded"),
};

const selectors = {
  modeBadge: document.querySelector("#data-mode-badge"),
  gateBanner: document.querySelector("#gate-banner"),
  gateTitle: document.querySelector("#gate-title"),
  gateCopy: document.querySelector("#gate-copy"),
  topMove: document.querySelector("#metric-top-move"),
  topDetail: document.querySelector("#metric-top-detail"),
  priority: document.querySelector("#metric-priority"),
  waiverRule: document.querySelector("#metric-waiver-rule"),
  freshness: document.querySelector("#metric-freshness"),
  coverage: document.querySelector("#metric-coverage"),
  planCount: document.querySelector("#metric-plan-count"),
  waiverList: document.querySelector("#waiver-list"),
  waiverEmpty: document.querySelector("#waiver-empty"),
  resultCount: document.querySelector("#result-count"),
  claimGroups: document.querySelector("#claim-groups"),
  claimEmpty: document.querySelector("#claim-empty"),
  exportPlan: document.querySelector("#export-plan"),
  healthSummary: document.querySelector("#health-summary"),
  rosterTable: document.querySelector("#roster-table"),
  leagueGrid: document.querySelector("#league-grid"),
  tradeList: document.querySelector("#trade-list"),
  snapshotTitle: document.querySelector("#data-snapshot-title"),
  snapshotFacts: document.querySelector("#snapshot-facts"),
  exportSnapshot: document.querySelector("#export-snapshot"),
  importDialog: document.querySelector("#import-dialog"),
  importSummary: document.querySelector("#import-summary"),
  importWarnings: document.querySelector("#import-warnings"),
  deleteDialog: document.querySelector("#delete-dialog"),
  toast: document.querySelector("#toast"),
  status: document.querySelector("#status-message"),
  search: document.querySelector("#player-search"),
  sort: document.querySelector("#recommendation-sort"),
  weightsPanel: document.querySelector("#weights-panel"),
  weightsToggle: document.querySelector("#weights-toggle"),
  weightControls: document.querySelector("#weight-controls"),
};

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.id) node.id = options.id;
  if (options.type) node.type = options.type;
  if (options.value !== undefined) node.value = String(options.value);
  if (options.title) node.title = options.title;
  if (options.disabled !== undefined) node.disabled = Boolean(options.disabled);
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value !== null && value !== undefined) node.setAttribute(name, String(value));
  }
  for (const [name, value] of Object.entries(options.dataset ?? {})) {
    node.dataset[name] = String(value);
  }
  const items = Array.isArray(children) ? children : [children];
  for (const child of items) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function replaceChildren(node, children) {
  node.replaceChildren(...children.filter(Boolean));
}

function formatScore(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : "—";
}

function formatProjection(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";
}

function formatAge(hours) {
  if (!Number.isFinite(hours)) return "Unknown";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
}

function formatCapturedAt(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function showToast(message) {
  selectors.toast.textContent = message;
  selectors.toast.hidden = false;
  selectors.status.textContent = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    selectors.toast.hidden = true;
  }, 3600);
}

function addAudit(action, details = {}) {
  state.audit.push({ at: new Date().toISOString(), action, ...details });
  state.audit = state.audit.slice(-100);
}

function applyDecisionState(refreshed) {
  const removedCount = Math.max(0, state.plan.length - refreshed.plan.length);
  state.analysis = refreshed.analysis;
  state.plan = refreshed.plan;
  if (removedCount) addAudit("plan_reconciled", { removedCount });
}

function currentTeam() {
  return state.snapshot.teams.find((team) => team.teamId === state.snapshot.myTeamId);
}

function getSelectedRecommendation(base) {
  const selectedDropId = state.dropSelections.get(base.addPlayerId);
  if (!selectedDropId) return base;
  const selected = replaceDrop(base, selectedDropId);
  return selected === base ? base : { ...selected, alternatives: base.alternatives };
}

function recommendationById(id) {
  for (const base of state.analysis.recommendations) {
    if (base.id === id) return base;
    const alternative = base.alternatives?.find((item) => item.id === id);
    if (alternative) return alternative;
  }
  return null;
}

function sortedFilteredRecommendations() {
  const query = state.search.trim().toLocaleLowerCase();
  const list = state.analysis.recommendations
    .map(getSelectedRecommendation)
    .filter((item) => state.position === "ALL" || normalizePosition(item.candidate.position) === state.position)
    .filter((item) => !query || [item.candidate.name, item.candidate.nflTeam, item.drop.name].some((value) => String(value ?? "").toLocaleLowerCase().includes(query)));

  const compare = {
    candidate: (a, b) => b.candidateScore - a.candidateScore,
    weekly: (a, b) => b.components.nextWeek - a.components.nextWeek,
    market: (a, b) => b.components.market - a.components.market,
    net: (a, b) => b.netScore - a.netScore,
  }[state.sort];
  return list.sort((a, b) => compare(a, b) || b.confidence - a.confidence || stableCompare(a.id, b.id));
}

function verdictClass(verdict) {
  if (verdict === "STRONG CLAIM") return "verdict verdict--strong";
  if (verdict === "CLAIM") return "verdict verdict--claim";
  if (verdict === "WATCH") return "verdict verdict--watch";
  if (verdict === "REFRESH REQUIRED") return "verdict verdict--refresh";
  return "verdict";
}

function statusClass(status) {
  const normalized = String(status ?? "").toUpperCase();
  if (["O", "OUT", "IR", "SUSP"].includes(normalized)) return "status-out";
  if (["Q", "D", "QUESTIONABLE", "DOUBTFUL"].includes(normalized)) return "status-q";
  return "";
}

function makePlayerCell(player) {
  const meta = el("div", { className: "player-meta" }, [
    el("span", { className: "position-dot", text: normalizePosition(player.position) }),
    el("span", { text: player.nflTeam || "—" }),
    player.opponent ? el("span", { text: player.opponent }) : null,
    player.status ? el("span", { className: statusClass(player.status), text: player.status }) : null,
  ]);
  return el("div", { className: "player-cell" }, [
    el("strong", { text: player.name }),
    meta,
  ]);
}

function makeDropCell(recommendation) {
  const wrapper = el("div", { className: "drop-cell" });
  wrapper.append(el("label", { text: "Drop cost", attrs: { for: `drop-${recommendation.addPlayerId}` } }));
  const select = el("select", {
    className: "drop-select",
    id: `drop-${recommendation.addPlayerId}`,
    dataset: { dropFor: recommendation.addPlayerId },
    attrs: { "aria-label": `Choose who to drop for ${recommendation.candidate.name}` },
  });
  const options = [recommendation, ...(recommendation.alternatives ?? [])]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.dropPlayerId === item.dropPlayerId) === index);
  for (const option of options) {
    select.append(el("option", {
      value: option.dropPlayerId,
      text: `${option.drop.name} · ${formatScore(option.dropCost)}`,
    }));
  }
  select.value = recommendation.dropPlayerId;
  wrapper.append(select);
  if (recommendation.legality === "verify") {
    wrapper.append(el("span", { className: "drop-meta", text: "Verify eligibility in ESPN" }));
  }
  return wrapper;
}

function makeExplanation(recommendation) {
  const detail = el("details", { className: "explanation" });
  detail.append(el("summary", { text: "Why this move?" }));
  const grid = el("div", { className: "explanation-grid" }, [
    el("p", {}, [el("strong", { text: "Read: " }), recommendation.reason, " ", recommendation.priorityNote]),
    el("p", {}, [el("strong", { text: "Reversal: " }), recommendation.reversal]),
  ]);
  const labels = {
    restOfSeason: "ROS",
    nextWeek: "Week",
    rosterNeed: "Need",
    market: "Market",
    roleTrend: "Trend",
    health: "Status",
  };
  const strip = el("div", { className: "component-strip" });
  for (const [key, label] of Object.entries(labels)) {
    strip.append(el("span", { className: "score-pill", text: `${label} ${formatScore(recommendation.components[key])}` }));
  }
  if (recommendation.redundancyPenalty > 0) {
    strip.append(el("span", { className: "score-pill", text: `Backup fit −${formatScore(recommendation.redundancyPenalty)}` }));
  }
  if (recommendation.rosterBalancePenalty > 0) {
    strip.append(el("span", { className: "score-pill", text: `Extra position −${formatScore(recommendation.rosterBalancePenalty)}` }));
  }
  detail.append(grid, strip);
  return detail;
}

function renderRecommendation(recommendation, rank) {
  const row = el("article", { className: "waiver-row", dataset: { recommendation: recommendation.id } });
  row.append(el("div", { className: "rank-number", text: rank }));
  row.append(makePlayerCell(recommendation.candidate));

  const scoreWidth = Math.max(3, Math.min(100, recommendation.netScore + 50));
  const score = el("div", { className: "score-cell" }, [
    el("strong", { text: recommendation.netScore >= 0 ? `+${formatScore(recommendation.netScore)}` : formatScore(recommendation.netScore) }),
    el("span", { className: "score-meta", text: `${formatScore(recommendation.confidence)}% confidence` }),
    el("progress", { className: "score-bar", value: scoreWidth, attrs: { max: 100, "aria-label": "Relative move score" } }),
  ]);
  row.append(score);
  row.append(makeDropCell(recommendation));
  row.append(el("div", { className: "verdict-cell" }, [
    el("span", { className: verdictClass(recommendation.verdict), text: recommendation.verdict }),
  ]));

  const alreadyPlanned = state.plan.some((item) => item.addPlayerId === recommendation.addPlayerId);
  const disabled = !state.analysis.freshness.actionable || alreadyPlanned || recommendation.verdict === "PASS";
  row.append(el("button", {
    className: "button button--small waiver-action",
    type: "button",
    text: alreadyPlanned ? "Staged" : recommendation.verdict === "PASS" ? "Not recommended" : recommendation.verdict === "WATCH" ? "Stage review" : "Plan claim",
    disabled,
    dataset: { stageId: recommendation.id },
    attrs: { "aria-label": `Stage adding ${recommendation.candidate.name} and dropping ${recommendation.drop.name}` },
  }));
  row.append(makeExplanation(recommendation));
  return row;
}

function renderGateAndMetrics() {
  const top = state.analysis.recommendations[0];
  const mine = currentTeam();
  const freshness = state.analysis.freshness;
  selectors.modeBadge.textContent = state.dataState === "demo" ? "Demo data" : "Private snapshot";
  selectors.modeBadge.className = state.dataState === "demo" ? "status-badge status-badge--demo" : "status-badge status-badge--private";

  selectors.gateBanner.className = "gate-banner";
  if (state.dataState === "demo") {
    selectors.gateTitle.textContent = "Fictional demo is loaded";
    selectors.gateCopy.textContent = "Import a fresh private snapshot for advice about your league.";
  } else if (!freshness.actionable) {
    selectors.gateBanner.classList.add("is-blocked");
    selectors.gateTitle.textContent = "Refresh before setting claims";
    selectors.gateCopy.textContent = freshness.message;
  } else {
    selectors.gateBanner.classList.add("is-ready");
    selectors.gateTitle.textContent = freshness.state === "fresh" ? "Snapshot is claim-ready" : "Snapshot is usable";
    selectors.gateCopy.textContent = state.analysis.gates[0] ?? "Recommendations use the current roster, player pool, and waiver rules.";
  }

  selectors.topMove.textContent = top ? `Add ${top.candidate.name}` : "No legal pair";
  selectors.topDetail.textContent = top ? `Drop ${top.drop.name} · ${top.verdict.toLocaleLowerCase()}` : "Refresh drop eligibility and the player pool.";
  const priority = mine?.waiverPriority ?? state.snapshot.league.waivers.myPriority;
  selectors.priority.textContent = Number.isFinite(priority) ? `${priority} of ${state.snapshot.league.teamCount}` : "Unknown";
  selectors.waiverRule.textContent = state.snapshot.league.waivers.order || state.snapshot.league.waivers.system || "Rule not captured";
  selectors.freshness.textContent = formatAge(freshness.ageHours);
  const coverage = state.snapshot.source.coverage.availablePlayers;
  selectors.coverage.textContent = `${coverage.rowCount} available players · ${coverage.complete ? "complete capture" : "partial capture"}`;
  selectors.planCount.textContent = `${state.plan.length} ${state.plan.length === 1 ? "move" : "moves"}`;
}

function renderWaivers() {
  renderGateAndMetrics();
  const recommendations = sortedFilteredRecommendations();
  const visible = recommendations.slice(0, 75);
  replaceChildren(selectors.waiverList, visible.map((item, index) => renderRecommendation(item, index + 1)));
  selectors.waiverEmpty.hidden = visible.length !== 0;
  selectors.resultCount.textContent = recommendations.length > visible.length
    ? `Showing ${visible.length} of ${recommendations.length} candidates`
    : `${recommendations.length} ${recommendations.length === 1 ? "candidate" : "candidates"}`;
}

function renderClaimPlan() {
  const { groups, valid } = buildClaimGroups(state.plan);
  const cards = groups.map((group, groupIndex) => {
    const dropName = group.claims[0]?.dropName ?? "selected player";
    const card = el("section", { className: "claim-group" });
    card.append(el("header", {}, [
      el("span", { text: `Ladder ${groupIndex + 1} · drop ${dropName}` }),
      el("span", { text: group.claims.length > 1 ? "first success wins" : "independent" }),
    ]));
    group.claims.forEach((claim, claimIndex) => {
      const stateIndex = state.plan.findIndex((item) => item.planId === claim.planId);
      card.append(el("div", { className: "claim-item" }, [
        el("span", { className: "claim-order", text: claimIndex + 1 }),
        el("div", { className: "claim-copy" }, [
          el("strong", { text: `Add ${claim.addName}` }),
          el("span", { text: `Drop ${claim.dropName} · ${claim.verdict}` }),
        ]),
        el("div", { className: "claim-actions" }, [
          el("button", {
            className: "icon-button",
            type: "button",
            text: "↑",
            title: "Move earlier",
            disabled: claimIndex === 0,
            dataset: { planAction: "up", planIndex: stateIndex },
            attrs: { "aria-label": `Move ${claim.addName} earlier` },
          }),
          el("button", {
            className: "icon-button",
            type: "button",
            text: "↓",
            title: "Move later",
            disabled: claimIndex === group.claims.length - 1,
            dataset: { planAction: "down", planIndex: stateIndex },
            attrs: { "aria-label": `Move ${claim.addName} later` },
          }),
          el("button", {
            className: "icon-button",
            type: "button",
            text: "×",
            title: "Remove",
            dataset: { planAction: "remove", planIndex: stateIndex },
            attrs: { "aria-label": `Remove ${claim.addName}` },
          }),
        ]),
      ]));
    });
    return card;
  });
  replaceChildren(selectors.claimGroups, cards);
  selectors.claimGroups.hidden = cards.length === 0;
  selectors.claimEmpty.hidden = cards.length !== 0;
  selectors.exportPlan.disabled = cards.length === 0 || !valid || !state.analysis.freshness.actionable;
}

function positionCounts(players) {
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, "D/ST": 0, K: 0 };
  for (const player of players ?? []) {
    const pos = normalizePosition(player.position);
    if (pos in counts) counts[pos] += 1;
  }
  return counts;
}

function rosterTarget(position) {
  const starters = state.snapshot.league.roster.starters;
  const base = Number(starters[position] ?? 0);
  const flex = ["RB", "WR", "TE"].includes(position) ? Number(starters.FLEX ?? 0) / 3 : 0;
  return base + flex + (["RB", "WR"].includes(position) ? 1 : 0);
}

function rosterShape(team) {
  const counts = positionCounts(team.players);
  const positions = ["QB", "RB", "WR", "TE"];
  const sorted = positions.map((position) => ({
    position,
    delta: counts[position] - rosterTarget(position),
  })).sort((a, b) => b.delta - a.delta || stableCompare(a.position, b.position));
  return { counts, surplus: sorted[0], need: sorted[sorted.length - 1] };
}

function renderHealth() {
  const team = currentTeam();
  const players = team?.players ?? [];
  const flagged = players.filter((player) => player.status);
  const bench = players.filter((player) => ["BE", "BENCH", "BN"].includes(String(player.slot).toUpperCase()));
  const counts = positionCounts(players);
  const strongest = Object.entries(counts).sort((a, b) => b[1] - a[1] || stableCompare(a[0], b[0]))[0];
  const weakestBench = [...bench].sort((a, b) => (Number(a.seasonProjection) || 0) - (Number(b.seasonProjection) || 0) || stableCompare(a.playerId, b.playerId))[0];
  const insights = [
    ["Rostered", `${players.length} players`, `${bench.length} bench spots captured.`],
    ["Status watch", `${flagged.length} flagged`, flagged.length ? "Confirm current designation and expected role." : "No captured availability labels."],
    ["Deepest room", strongest ? `${strongest[0]} · ${strongest[1]}` : "—", "Count only; quality is shown player by player."],
    ["Drop review", weakestBench?.name ?? "Verify bench", weakestBench ? `${formatProjection(weakestBench.seasonProjection)} projected season points.` : "No bench player was captured."],
  ];
  replaceChildren(selectors.healthSummary, insights.map(([label, value, copy]) => el("article", { className: "insight-card" }, [
    el("span", { text: label }),
    el("strong", { text: value }),
    el("p", { text: copy }),
  ])));

  const header = el("div", { className: "roster-row roster-row--header" }, ["Slot", "Player", "Pos", "Status", "Week", "Season"].map((label) => el("span", { text: label })));
  const rows = players.map((player) => el("div", { className: "roster-row" }, [
    el("strong", { text: player.slot || "—" }),
    el("div", { className: "roster-name" }, [
      el("strong", { text: player.name }),
      el("span", { text: player.nflTeam || "—" }),
    ]),
    el("span", { text: normalizePosition(player.position) }),
    el("span", { className: statusClass(player.status), text: player.status || "Active" }),
    el("span", { className: "numeric", text: formatProjection(player.weeklyProjection) }),
    el("span", { className: "numeric", text: formatProjection(player.seasonProjection) }),
  ]));
  replaceChildren(selectors.rosterTable, [header, ...rows]);
}

function renderLeague() {
  const cards = [...state.snapshot.teams]
    .sort((a, b) => Number(b.isMine) - Number(a.isMine) || (a.waiverPriority ?? 99) - (b.waiverPriority ?? 99) || stableCompare(a.teamId, b.teamId))
    .map((team) => {
      const shape = rosterShape(team);
      const card = el("article", { className: `team-card${team.isMine ? " is-mine" : ""}` });
      card.append(el("header", {}, [
        el("div", {}, [
          el("h3", { text: team.name || "Unnamed team" }),
          el("span", { text: team.isMine ? "Your roster" : "Opponent roster" }),
        ]),
        el("span", { className: "status-badge", text: Number.isFinite(team.waiverPriority) ? `Priority ${team.waiverPriority}` : "Priority —" }),
      ]));
      const shapeGrid = el("div", { className: "team-shape" });
      for (const position of ["QB", "RB", "WR", "TE", "D/ST"]) {
        shapeGrid.append(el("div", { className: "shape-stat" }, [
          el("strong", { text: shape.counts[position] }),
          el("span", { text: position }),
        ]));
      }
      card.append(shapeGrid);
      card.append(el("p", {
        className: "team-note",
        text: `Relative depth: ${shape.surplus.position}. Thinnest room: ${shape.need.position}. Recheck roles before proposing a trade.`,
      }));
      return card;
    });
  replaceChildren(selectors.leagueGrid, cards);
}

function renderTrades() {
  const mine = currentTeam();
  const myShape = rosterShape(mine);
  const trades = state.snapshot.teams
    .filter((team) => !team.isMine)
    .map((team) => {
      const shape = rosterShape(team);
      const giveFit = Math.max(0, myShape.surplus.delta - shape.need.delta);
      const getFit = Math.max(0, shape.surplus.delta - myShape.need.delta);
      return { team, shape, fit: giveFit + getFit };
    })
    .sort((a, b) => b.fit - a.fit || stableCompare(a.team.teamId, b.team.teamId));

  replaceChildren(selectors.tradeList, trades.map((trade, index) => el("article", { className: "trade-card" }, [
    el("div", {}, [
      el("p", { className: "eyebrow", text: `Partner ${index + 1}` }),
      el("h3", { text: trade.team.name || "Unnamed team" }),
    ]),
    el("div", { className: "trade-axis" }, [
      el("span", { text: "Your likely leverage" }),
      el("strong", { text: `${myShape.surplus.position} depth` }),
      el("p", { text: `They are relatively thinnest at ${trade.shape.need.position}.` }),
    ]),
    el("div", { className: "trade-axis" }, [
      el("span", { text: "Their likely leverage" }),
      el("strong", { text: `${trade.shape.surplus.position} depth` }),
      el("p", { text: `You are relatively thinnest at ${myShape.need.position}.` }),
    ]),
    el("span", { className: trade.fit > 1 ? "verdict verdict--claim" : "verdict verdict--watch", text: trade.fit > 1 ? "Explore" : "Weak fit" }),
  ])));
}

function appendFact(term, description) {
  selectors.snapshotFacts.append(
    el("dt", { text: term }),
    el("dd", { text: description }),
  );
}

function renderData() {
  const summary = publicSnapshotSummary(state.snapshot);
  selectors.snapshotTitle.textContent = state.dataState === "demo" ? "Fictional demo" : "Private league snapshot";
  selectors.snapshotFacts.replaceChildren();
  appendFact("Platform", summary.platform.toUpperCase());
  appendFact("Season", summary.season);
  appendFact("Captured", formatCapturedAt(summary.capturedAt));
  appendFact("League", `${summary.teamCount} teams`);
  appendFact("Your roster", `${summary.rosterCount} players`);
  appendFact("Available pool", `${summary.availableCount} players`);
  appendFact("Coverage", summary.coverageComplete ? "Complete" : "Partial");
  selectors.exportSnapshot.disabled = state.dataState === "demo";
}

function renderWeights() {
  const controls = Object.entries(WEIGHT_LABELS).map(([key, label]) => {
    const input = el("input", {
      type: "range",
      value: state.weights[key],
      attrs: { min: 0, max: 60, step: 1, id: `weight-${key}`, "aria-label": `${label} weight` },
      dataset: { weight: key },
    });
    return el("label", { className: "weight-control", attrs: { for: `weight-${key}` } }, [
      el("span", { text: label }),
      el("output", { text: state.weights[key], attrs: { for: `weight-${key}` } }),
      input,
    ]);
  });
  replaceChildren(selectors.weightControls, controls);
}

function renderAll() {
  const refreshed = refreshDecisionState({
    snapshot: state.snapshot,
    weights: state.weights,
    plan: state.plan,
    asOf: new Date(),
  });
  applyDecisionState(refreshed);
  renderWaivers();
  renderClaimPlan();
  renderHealth();
  renderLeague();
  renderTrades();
  renderData();
}

function setView(view, { updateHash = true } = {}) {
  const valid = VALID_VIEWS.has(view) ? view : "waivers";
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === valid;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === valid;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (updateHash) history.replaceState(null, "", `#${valid}`);
  document.querySelector(`[data-view-panel="${valid}"] h1`)?.focus({ preventScroll: true });
}

async function beginImport(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const result = await parseSnapshotFile(file);
    state.pendingImport = result;
    const summary = publicSnapshotSummary(result.snapshot);
    selectors.importSummary.textContent = `${summary.teamCount} teams, ${summary.rosterCount} players on your roster, and ${summary.availableCount} available players. Captured ${formatCapturedAt(summary.capturedAt)}.`;
    replaceChildren(selectors.importWarnings, result.warnings.map((warning) => el("p", { className: "warning-item", text: warning })));
    selectors.importDialog.showModal();
  } catch (error) {
    state.pendingImport = null;
    showToast(error instanceof Error ? error.message : "Snapshot validation failed.");
  }
}

function confirmImport() {
  if (!state.pendingImport?.snapshot) return;
  state.snapshot = state.pendingImport.snapshot;
  state.dataState = state.snapshot.source.isDemo ? "demo" : "private";
  state.pendingImport = null;
  state.plan = [];
  state.dropSelections.clear();
  state.audit = freshAudit("snapshot_imported", { capturedAt: state.snapshot.source.capturedAt });
  renderAll();
  showToast(state.dataState === "private" ? "Private snapshot loaded in this tab only." : "Fictional demo loaded.");
}

function useDemo() {
  state.snapshot = freshDemoSnapshot();
  state.dataState = "demo";
  state.plan = [];
  state.dropSelections.clear();
  state.pendingImport = null;
  state.audit = freshAudit("demo_loaded");
  renderAll();
  showToast("Fictional demo restored.");
}

function stageRecommendation(id) {
  const refreshed = refreshDecisionState({
    snapshot: state.snapshot,
    weights: state.weights,
    plan: state.plan,
    asOf: new Date(),
  });
  applyDecisionState(refreshed);
  if (!state.analysis.freshness.actionable) {
    renderWaivers();
    renderClaimPlan();
    throw new Error("Refresh the snapshot before staging claims.");
  }
  const recommendation = recommendationById(id);
  if (!recommendation) throw new Error("That recommendation is no longer available.");
  if (!isStageableRecommendation(recommendation)) throw new Error("Only watch or claim-level moves can be staged.");
  if (state.plan.some((item) => item.addPlayerId === recommendation.addPlayerId)) return { staged: false, reason: "already_staged" };
  const planItem = {
    planId: `plan-${recommendation.id}`,
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
  state.plan.push(planItem);
  addAudit("claim_staged", { recommendationId: recommendation.id });
  renderWaivers();
  renderClaimPlan();
  showToast(`Staged ${recommendation.candidate.name} for review.`);
  return { staged: true, recommendationId: recommendation.id, planSize: state.plan.length };
}

function movePlanItem(index, direction) {
  const item = state.plan[index];
  if (!item) return;
  const sameDropIndices = state.plan
    .map((candidate, candidateIndex) => candidate.dropPlayerId === item.dropPlayerId ? candidateIndex : -1)
    .filter((candidateIndex) => candidateIndex >= 0);
  const withinGroup = sameDropIndices.indexOf(index);
  const target = sameDropIndices[withinGroup + direction];
  if (target === undefined) return;
  [state.plan[index], state.plan[target]] = [state.plan[target], state.plan[index]];
  addAudit("claim_reordered", { planId: item.planId });
  renderClaimPlan();
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { attrs: { href: url, download: filename } });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportPlan() {
  const refreshed = refreshDecisionState({
    snapshot: state.snapshot,
    weights: state.weights,
    plan: state.plan,
    asOf: new Date(),
  });
  applyDecisionState(refreshed);
  renderWaivers();
  renderClaimPlan();
  if (!state.analysis.freshness.actionable) {
    showToast("Refresh the snapshot before exporting a claim plan.");
    return;
  }
  const claimPlan = buildClaimGroups(state.plan);
  if (!state.plan.length || !claimPlan.valid) {
    showToast("Stage a valid claim plan before exporting.");
    return;
  }
  downloadJson({
    schemaVersion: 1,
    kind: "waiver-review-plan",
    generatedAt: new Date().toISOString(),
    snapshotCapturedAt: state.snapshot.source.capturedAt,
    warning: "Review current availability and personally confirm every transaction in ESPN.",
    groups: claimPlan.groups,
    audit: state.audit,
  }, "waiver-review-plan.json");
  addAudit("plan_exported");
  showToast("Review plan downloaded locally.");
}

function exportSnapshot() {
  if (state.dataState !== "private") return;
  downloadJson(state.snapshot, "league-snapshot.json");
  addAudit("snapshot_exported");
  showToast("Snapshot copy downloaded locally.");
}

function resetWeights() {
  state.weights = { ...DEFAULT_WEIGHTS };
  addAudit("weights_reset");
  renderWeights();
  renderAll();
}

document.querySelectorAll("#snapshot-input, #snapshot-input-secondary").forEach((input) => {
  input.addEventListener("change", () => void beginImport(input));
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("button, a") : null;
  if (!target) return;
  if (target.dataset.view) setView(target.dataset.view);
  if (target.dataset.goView) setView(target.dataset.goView);
  if (target.dataset.stageId) {
    try {
      stageRecommendation(target.dataset.stageId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to stage that move.");
    }
  }
  if (target.dataset.planAction) {
    const index = Number(target.dataset.planIndex);
    if (target.dataset.planAction === "remove") {
      const [removed] = state.plan.splice(index, 1);
      if (removed) addAudit("claim_removed", { planId: removed.planId });
      renderWaivers();
      renderClaimPlan();
    } else {
      movePlanItem(index, target.dataset.planAction === "up" ? -1 : 1);
    }
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || !target.dataset.dropFor) return;
  state.dropSelections.set(target.dataset.dropFor, target.value);
  addAudit("drop_changed", { addPlayerId: target.dataset.dropFor, dropPlayerId: target.value });
  renderWaivers();
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.weight) return;
  state.weights[target.dataset.weight] = Number(target.value);
  const output = target.parentElement?.querySelector("output");
  if (output) output.textContent = target.value;
  renderAll();
});

selectors.search.addEventListener("input", () => {
  state.search = selectors.search.value;
  renderWaivers();
});

selectors.sort.addEventListener("change", () => {
  state.sort = selectors.sort.value;
  renderWaivers();
});

document.querySelector("#position-filters").addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-position]") : null;
  if (!button) return;
  state.position = button.dataset.position;
  document.querySelectorAll("[data-position]").forEach((candidate) => {
    const active = candidate === button;
    candidate.classList.toggle("is-active", active);
    candidate.setAttribute("aria-pressed", String(active));
  });
  renderWaivers();
});

selectors.weightsToggle.addEventListener("click", () => {
  const expanded = selectors.weightsToggle.getAttribute("aria-expanded") === "true";
  selectors.weightsToggle.setAttribute("aria-expanded", String(!expanded));
  selectors.weightsPanel.hidden = expanded;
});

document.querySelector("#reset-weights").addEventListener("click", resetWeights);
document.querySelector("#use-demo-button").addEventListener("click", useDemo);
document.querySelector("#clear-plan").addEventListener("click", () => {
  state.plan = [];
  addAudit("plan_cleared");
  renderWaivers();
  renderClaimPlan();
});
selectors.exportPlan.addEventListener("click", exportPlan);
selectors.exportSnapshot.addEventListener("click", exportSnapshot);
document.querySelector("#delete-data").addEventListener("click", () => selectors.deleteDialog.showModal());

document.querySelector("#confirm-import").addEventListener("click", (event) => {
  event.preventDefault();
  confirmImport();
  selectors.importDialog.close();
});

selectors.importDialog.addEventListener("close", () => {
  state.pendingImport = null;
});

document.querySelector("#confirm-delete").addEventListener("click", (event) => {
  event.preventDefault();
  selectors.deleteDialog.close();
  useDemo();
});

registerWaiverTools({
  getState: () => {
    const refreshed = refreshDecisionState({
      snapshot: state.snapshot,
      weights: state.weights,
      plan: state.plan,
      asOf: new Date(),
    });
    state.analysis = refreshed.analysis;
    return {
      dataState: state.dataState,
      recommendations: sortedFilteredRecommendations(),
    };
  },
  stageClaim: (recommendationId) => stageRecommendation(recommendationId),
});

window.addEventListener("hashchange", () => {
  const view = location.hash.slice(1);
  if (VALID_VIEWS.has(view)) setView(view);
});
window.addEventListener("focus", renderAll);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") renderAll();
});

renderWeights();
renderAll();
{
  const initialView = location.hash.slice(1);
  setView(VALID_VIEWS.has(initialView) ? initialView : "waivers", { updateHash: !location.hash || VALID_VIEWS.has(initialView) });
}

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
    selectors.status.textContent = "Offline support is unavailable in this browser.";
  });
}
