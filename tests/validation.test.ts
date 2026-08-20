import assert from "node:assert/strict";
import { parseBatch, parseEntry, parseQuery, ValidationError } from "../src/validation.js";

function expectValidationError(action: () => unknown): void {
  assert.throws(action, ValidationError);
}

const entry = parseEntry({
  agent_id: "agent-1",
  session_id: "session-1",
  tool_name: "fetch_data",
  result_status: "success",
  input: { authorization: "Bearer secret", nested: { api_key: "hidden", value: 1 } },
  output: { ok: true },
  metadata: { token: "hidden" },
});

assert.deepEqual(entry.input, { authorization: "[REDACTED]", nested: { api_key: "[REDACTED]", value: 1 } });
assert.deepEqual(entry.metadata, { token: "[REDACTED]" });
expectValidationError(() => parseEntry({ agent_id: "agent 1", session_id: "s", tool_name: "t", result_status: "success" }));
expectValidationError(() => parseBatch({ entries: [] }));
expectValidationError(() => parseQuery({ agent_id: "agent-1", limit: "101" }));
assert.equal(parseQuery({ agent_id: "agent-1", limit: "100", offset: "0" }).limit, 100);

console.log("PASS: decision-log validation tests completed");
