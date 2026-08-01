import { app } from "../src/worker.js";
import { assertEqual, assertTrue } from "./assert.js";

export async function runDashboardE2ETests() {
  console.log("▶ Running Web Dashboard UI E2E Tests...");

  const res = await app.request("/", {}, {} as any);
  assertEqual(res.status, 200, "Dashboard returns HTTP 200 OK");
  const html = await res.text();

  assertTrue(html.includes("<!DOCTYPE html>"), "Contains valid HTML document declaration");
  assertTrue(html.includes("<title>Agent Decision Log</title>"), "Contains expected page title");
  assertTrue(html.includes('id="agent_id"'), "Renders Agent ID filter input element");
  assertTrue(html.includes('id="session_id"'), "Renders Session ID filter input element");
  assertTrue(html.includes('id="tool_name"'), "Renders Tool Name filter input element");
  assertTrue(html.includes('id="result_status"'), "Renders Result Status select dropdown element");
  assertTrue(html.includes('onclick="loadLogs()"'), "Renders Search button with loadLogs event trigger");
  assertTrue(html.includes('<table id="logTable">'), "Renders log results table container");
  assertTrue(html.includes('<tbody id="logBody">'), "Renders dynamic table body container");
  assertTrue(html.includes("async function loadLogs()"), "Includes client-side loadLogs JavaScript function");
  assertTrue(html.includes(".status-success"), "Includes status-success CSS styling rule");
  assertTrue(html.includes(".status-error"), "Includes status-error CSS styling rule");

  console.log("✅ Web Dashboard UI E2E Tests Passed successfully!\n");
}
