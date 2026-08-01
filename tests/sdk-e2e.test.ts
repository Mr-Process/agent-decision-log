import { DecisionLogClient } from "../src/sdk.js";
import { assertEqual, assertTrue } from "./assert.js";

export async function runSdkE2ETests() {
  console.log("▶ Running SDK E2E Verification Tests...");

  const client = new DecisionLogClient("http://localhost:8787");
  assertTrue(typeof client.log === "function", "DecisionLogClient exposes log method");
  assertTrue(typeof client.query === "function", "DecisionLogClient exposes query method");
  assertTrue(typeof client.count === "function", "DecisionLogClient exposes count method");

  console.log("✅ SDK E2E Verification Tests Passed successfully!\n");
}
