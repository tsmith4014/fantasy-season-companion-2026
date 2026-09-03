export const SNAPSHOT_SCHEMA_VERSION = 1;
export const MAX_SNAPSHOT_BYTES = 5_000_000;

const POSITIONS = new Set(["QB", "RB", "WR", "TE", "FLEX", "D/ST", "DST", "K"]);
const FORBIDDEN_KEYS = /^(?:cookie|cookies|token|access[_-]?token|refresh[_-]?token|authorization|auth|session|session[_-]?id|password|espn[_-]?s2|swid|api[_-]?key|x[_-]?api[_-]?key|client[_-]?secret|secret[_-]?key|credential|credentials)$/i;
const REQUIRED_SURFACES = ["roster", "available", "waiverOrder", "leagueSettings"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, maximum = 160) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalText(value, maximum = 160) {
  const normalized = text(value, maximum);
  return normalized || null;
}

function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function validateBoolean(value, path, errors, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return;
  if (typeof value !== "boolean") errors.push(`${path} must be a boolean.`);
}

function position(value) {
  const normalized = text(value, 16).toUpperCase().split(",")[0].trim();
  return normalized === "DST" ? "D/ST" : normalized;
}

function hasForbiddenKey(value, path = "snapshot") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = hasForbiddenKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key) || FORBIDDEN_KEYS.test(key)) return `${path}.${key}`;
    const found = hasForbiddenKey(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function validInstant(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizePlayer(raw, rostered) {
  return {
    playerId: text(raw?.playerId, 120),
    name: text(raw?.name, 120),
    nflTeam: text(raw?.nflTeam, 12).toUpperCase(),
    position: position(raw?.position),
    status: optionalText(raw?.status, 32),
    slot: rostered ? text(raw?.slot ?? "BE", 16).toUpperCase() : null,
    availability: rostered ? null : text(raw?.availability ?? "WA", 32),
    opponent: optionalText(raw?.opponent, 32),
    gameStatus: optionalText(raw?.gameStatus, 80),
    weeklyProjection: number(raw?.weeklyProjection),
    seasonProjection: number(raw?.seasonProjection),
    seasonAverage: number(raw?.seasonAverage),
    percentStarted: number(raw?.percentStarted),
    rosteredPct: number(raw?.rosteredPct),
    rosterChangePct: number(raw?.rosterChangePct),
    droppable: rostered ? booleanOrNull(raw?.droppable) : null,
    locked: rostered ? raw?.locked === true : false,
    eligibleSlots: Array.isArray(raw?.eligibleSlots)
      ? [...new Set(raw.eligibleSlots.map((item) => text(item, 16).toUpperCase()).filter(Boolean))]
      : [],
  };
}

function normalizeTeam(raw) {
  return {
    teamId: text(raw?.teamId, 120),
    name: text(raw?.name, 120),
    managerName: optionalText(raw?.managerName, 120),
    isMine: raw?.isMine === true,
    waiverPriority: integer(raw?.waiverPriority),
    players: Array.isArray(raw?.players) ? raw.players.map((player) => normalizePlayer(player, true)) : [],
  };
}

export function normalizeSnapshot(raw) {
  const coverage = raw?.source?.coverage ?? {};
  const availableCoverage = coverage.availablePlayers ?? {};
  const teamCoverage = coverage.teams ?? {};
  const starters = raw?.league?.roster?.starters ?? {};
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    source: {
      platform: text(raw?.source?.platform, 40).toLowerCase(),
      method: text(raw?.source?.method, 80),
      capturedAt: text(raw?.source?.capturedAt, 40),
      isDemo: raw?.source?.isDemo === true,
      surfaces: Array.isArray(raw?.source?.surfaces)
        ? raw.source.surfaces.slice(0, 20).map((surface) => ({
            kind: text(surface?.kind, 40),
            capturedAt: text(surface?.capturedAt, 40),
            status: text(surface?.status, 24).toLowerCase(),
          }))
        : [],
      coverage: {
        availablePlayers: {
          complete: availableCoverage.complete === true,
          rowCount: integer(availableCoverage.rowCount, 0),
          pageCount: integer(availableCoverage.pageCount, 0),
          strategy: text(availableCoverage.strategy, 80),
          positions: Array.isArray(availableCoverage.positions)
            ? availableCoverage.positions.slice(0, 16).map((item) => text(item, 8).toUpperCase())
            : [],
        },
        teams: {
          complete: teamCoverage.complete === true,
          rowCount: integer(teamCoverage.rowCount, 0),
        },
      },
    },
    league: {
      season: integer(raw?.league?.season),
      teamCount: integer(raw?.league?.teamCount),
      scoring: {
        format: text(raw?.league?.scoring?.format ?? raw?.league?.scoring, 40),
        receptionPoints: number(raw?.league?.scoring?.receptionPoints),
      },
      roster: {
        size: integer(raw?.league?.roster?.size),
        bench: integer(raw?.league?.roster?.bench, 0),
        ir: integer(raw?.league?.roster?.ir, 0),
        starters: Object.fromEntries(
          ["QB", "RB", "WR", "TE", "FLEX", "D/ST", "K"].map((slot) => [slot, integer(starters[slot] ?? starters[slot === "D/ST" ? "DST" : slot], 0)]),
        ),
      },
      waivers: {
        system: text(raw?.league?.waivers?.system, 80),
        periodDays: integer(raw?.league?.waivers?.periodDays),
        order: text(raw?.league?.waivers?.order, 120),
        myPriority: integer(raw?.league?.waivers?.myPriority),
        nextResetAt: optionalText(raw?.league?.waivers?.nextResetAt, 40),
      },
      tradeDeadline: optionalText(raw?.league?.tradeDeadline ?? raw?.league?.trades?.deadline, 40),
    },
    myTeamId: text(raw?.myTeamId, 120),
    teams: Array.isArray(raw?.teams) ? raw.teams.slice(0, 32).map(normalizeTeam) : [],
    availablePlayers: Array.isArray(raw?.availablePlayers)
      ? raw.availablePlayers.slice(0, 2_000).map((player) => normalizePlayer(player, false))
      : [],
  };
}

function validatePlayer(player, path, errors) {
  if (!player.playerId) errors.push(`${path}.playerId is required.`);
  if (!player.name) errors.push(`${path}.name is required.`);
  if (!POSITIONS.has(player.position)) errors.push(`${path}.position is unsupported.`);
  for (const key of ["weeklyProjection", "seasonProjection", "seasonAverage", "percentStarted", "rosteredPct", "rosterChangePct"]) {
    if (player[key] !== null && !Number.isFinite(player[key])) errors.push(`${path}.${key} must be numeric or null.`);
  }
}

export function validateSnapshot(raw, { byteLength } = {}) {
  const errors = [];
  const warnings = [];
  if (Number.isFinite(byteLength) && byteLength > MAX_SNAPSHOT_BYTES) {
    return { ok: false, errors: [`Snapshot exceeds the ${MAX_SNAPSHOT_BYTES.toLocaleString()} byte limit.`], warnings, snapshot: null };
  }
  if (!isRecord(raw)) return { ok: false, errors: ["Snapshot must be a JSON object."], warnings, snapshot: null };
  const forbidden = hasForbiddenKey(raw);
  if (forbidden) errors.push(`Forbidden authentication field found at ${forbidden}.`);
  if (raw.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    const message = raw.schemaVersion === 0
      ? "Schema v0 is historical summary data and cannot produce waiver advice. Run a fresh schema-v1 capture."
      : `Unsupported schema version: ${String(raw.schemaVersion)}.`;
    return { ok: false, errors: [message], warnings, snapshot: null };
  }
  validateBoolean(raw?.source?.isDemo, "source.isDemo", errors);
  validateBoolean(raw?.source?.coverage?.availablePlayers?.complete, "source.coverage.availablePlayers.complete", errors);
  validateBoolean(raw?.source?.coverage?.teams?.complete, "source.coverage.teams.complete", errors);
  for (const [teamIndex, team] of (Array.isArray(raw.teams) ? raw.teams : []).entries()) {
    validateBoolean(team?.isMine, `teams[${teamIndex}].isMine`, errors);
    for (const [playerIndex, player] of (Array.isArray(team?.players) ? team.players : []).entries()) {
      validateBoolean(player?.locked, `teams[${teamIndex}].players[${playerIndex}].locked`, errors, { optional: true });
      validateBoolean(player?.droppable, `teams[${teamIndex}].players[${playerIndex}].droppable`, errors, { optional: true });
    }
  }
  const snapshot = normalizeSnapshot(raw);
  if (!snapshot.source.platform) errors.push("source.platform is required.");
  if ((snapshot.source.platform === "demo") !== snapshot.source.isDemo) errors.push("source.isDemo must be true only for the demo platform.");
  if (!validInstant(snapshot.source.capturedAt)) errors.push("source.capturedAt must be a valid ISO timestamp.");
  for (const [index, surface] of snapshot.source.surfaces.entries()) {
    if (!surface.kind || !validInstant(surface.capturedAt) || !surface.status) errors.push(`source.surfaces[${index}] needs a kind, status, and valid timestamp.`);
  }
  if (!Number.isInteger(snapshot.league.season) || snapshot.league.season < 2020 || snapshot.league.season > 2100) errors.push("league.season is invalid.");
  if (!Number.isInteger(snapshot.league.teamCount) || snapshot.league.teamCount < 2 || snapshot.league.teamCount > 32) errors.push("league.teamCount must be from 2 to 32.");
  if (!Number.isInteger(snapshot.league.roster.size) || snapshot.league.roster.size < 1 || snapshot.league.roster.size > 40) errors.push("league.roster.size must be from 1 to 40.");
  if (!snapshot.myTeamId) errors.push("myTeamId is required.");
  if (snapshot.teams.length !== snapshot.league.teamCount) errors.push("teams length must equal league.teamCount.");
  if (!snapshot.availablePlayers.length) errors.push("availablePlayers must contain at least one player.");

  const teamIds = new Set();
  const rosteredIds = new Set();
  for (const [teamIndex, team] of snapshot.teams.entries()) {
    const path = `teams[${teamIndex}]`;
    if (!team.teamId) errors.push(`${path}.teamId is required.`);
    if (teamIds.has(team.teamId)) errors.push(`Duplicate teamId: ${team.teamId}.`);
    teamIds.add(team.teamId);
    if (team.players.length < 1 || team.players.length > snapshot.league.roster.size + snapshot.league.roster.ir) {
      errors.push(`${path}.players count is outside the configured roster bounds.`);
    }
    for (const [playerIndex, player] of team.players.entries()) {
      validatePlayer(player, `${path}.players[${playerIndex}]`, errors);
      if (rosteredIds.has(player.playerId)) errors.push(`Rostered playerId appears more than once: ${player.playerId}.`);
      rosteredIds.add(player.playerId);
    }
  }
  const mine = snapshot.teams.filter((team) => team.teamId === snapshot.myTeamId && team.isMine);
  if (mine.length !== 1) errors.push("Exactly one isMine team must match myTeamId.");

  const availableIds = new Set();
  for (const [index, player] of snapshot.availablePlayers.entries()) {
    validatePlayer(player, `availablePlayers[${index}]`, errors);
    if (!player.availability) errors.push(`availablePlayers[${index}].availability is required.`);
    if (availableIds.has(player.playerId)) errors.push(`Duplicate available playerId: ${player.playerId}.`);
    if (rosteredIds.has(player.playerId)) errors.push(`Player ${player.playerId} is both rostered and available.`);
    availableIds.add(player.playerId);
  }

  const availableCoverage = snapshot.source.coverage.availablePlayers;
  if (availableCoverage.rowCount !== snapshot.availablePlayers.length) errors.push("Available-player coverage rowCount does not match availablePlayers length.");
  if (!availableCoverage.complete) warnings.push("Available-player coverage is partial; recommendation confidence will be capped.");
  if (!snapshot.source.coverage.teams.complete) warnings.push("League roster coverage is partial.");
  for (const kind of REQUIRED_SURFACES) {
    const matches = snapshot.source.surfaces.filter((surface) => surface.kind === kind);
    if (matches.length !== 1) errors.push(`Exactly one required ${kind} surface is required.`);
    else if (matches[0].status !== "complete") errors.push(`Required ${kind} surface must have complete status.`);
  }
  if (snapshot.availablePlayers.some((player) => player.weeklyProjection === null || player.seasonProjection === null)) warnings.push("Some available players have missing projections.");
  if (mine[0]?.players.some((player) => player.droppable === null)) warnings.push("Some drop eligibility is unknown and must be verified in ESPN.");

  return { ok: errors.length === 0, errors, warnings, snapshot: errors.length ? null : snapshot };
}

export async function parseSnapshotFile(file) {
  if (!file || typeof file.text !== "function") throw new Error("Choose a JSON snapshot file.");
  if (file.size > MAX_SNAPSHOT_BYTES) throw new Error(`Snapshot exceeds the ${MAX_SNAPSHOT_BYTES.toLocaleString()} byte limit.`);
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error("Snapshot is not valid JSON.");
  }
  const result = validateSnapshot(raw, { byteLength: file.size });
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result;
}

export function publicSnapshotSummary(snapshot) {
  const mine = snapshot.teams.find((team) => team.teamId === snapshot.myTeamId);
  return {
    platform: snapshot.source.platform,
    season: snapshot.league.season,
    capturedAt: snapshot.source.capturedAt,
    teamCount: snapshot.league.teamCount,
    rosterCount: mine?.players.length ?? 0,
    availableCount: snapshot.availablePlayers.length,
    coverageComplete: snapshot.source.coverage.availablePlayers.complete,
  };
}
