import test from "node:test";
import assert from "node:assert/strict";
import { registerWaiverTools } from "../site/modules/webmcp.js";

test("WebMCP tools register with read and stage semantics", async () => {
  const registered = new Map();
  const context = {
    registerTool(tool) {
      registered.set(tool.name, tool);
    },
  };
  const recommendations = [{
    id: "add::drop",
    candidate: { name: "Demo Add" },
    drop: { name: "Demo Drop" },
    verdict: "WATCH",
    netScore: 8.24,
    confidence: 69.4,
  }];
  let staged = null;
  const cleanup = registerWaiverTools({
    context,
    getState: () => ({ dataState: "demo", recommendations }),
    stageClaim: (id) => {
      staged = id;
      return { staged: true, recommendationId: id };
    },
  });
  await Promise.resolve();
  assert.deepEqual([...registered.keys()].sort(), ["read_waiver_recommendations", "stage_waiver_claim"]);
  const read = registered.get("read_waiver_recommendations");
  assert.equal(read.annotations.readOnlyHint, true);
  assert.deepEqual(read.execute({}).recommendations[0], {
    id: "add::drop",
    add: "Demo Add",
    drop: "Demo Drop",
    verdict: "WATCH",
    netScore: 8.2,
    confidence: 69,
  });
  const stage = registered.get("stage_waiver_claim");
  assert.equal(stage.annotations.readOnlyHint, false);
  assert.deepEqual(stage.execute({ recommendationId: "add::drop" }), { staged: true, recommendationId: "add::drop" });
  assert.equal(staged, "add::drop");
  assert.throws(() => stage.execute({}), /required/);
  cleanup();
});

test("WebMCP gracefully skips unsupported browsers", () => {
  const cleanup = registerWaiverTools({ context: null, getState() {}, stageClaim() {} });
  assert.doesNotThrow(cleanup);
});
