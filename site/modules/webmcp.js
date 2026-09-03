export function registerWaiverTools({ context = globalThis.document?.modelContext, getState, stageClaim } = {}) {
  if (!context?.registerTool || typeof getState !== "function" || typeof stageClaim !== "function") return () => {};
  const lifecycle = new AbortController();
  const register = (tool) => {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {
      // The visible app remains fully functional when experimental WebMCP is unavailable.
    }
  };
  register({
    name: "read_waiver_recommendations",
    title: "Read waiver recommendations",
    description: "Read the current locally computed add/drop recommendations without changing the claim plan.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute() {
      const state = getState();
      return {
        dataState: state.dataState,
        recommendations: state.recommendations.slice(0, 10).map((item) => ({
          id: item.id,
          add: item.candidate.name,
          drop: item.drop.name,
          verdict: item.verdict,
          netScore: Math.round(item.netScore * 10) / 10,
          confidence: Math.round(item.confidence),
        })),
      };
    },
  });
  register({
    name: "stage_waiver_claim",
    title: "Stage waiver claim",
    description: "Add one visible recommendation to the local review plan. This never submits a transaction to ESPN.",
    inputSchema: {
      type: "object",
      properties: { recommendationId: { type: "string", minLength: 3, maxLength: 260 } },
      required: ["recommendationId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      if (!input || typeof input.recommendationId !== "string") throw new TypeError("recommendationId is required.");
      return stageClaim(input.recommendationId);
    },
  });
  return () => lifecycle.abort();
}
