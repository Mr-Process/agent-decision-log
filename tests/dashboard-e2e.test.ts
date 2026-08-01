import { app } from "../src/worker.js";
import { assertEqual, assertTrue } from "./assert.js";

export async function runDashboardE2ETests() {
  console.log("▶ Running Web Dashboard & Interactive Docs UI E2E Tests...");

  // 1. Dashboard UI Test
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

  // 2. Interactive Swagger UI Docs Test (/docs)
  const docsRes = await app.request("/docs", {}, {} as any);
  assertEqual(docsRes.status, 200, "Interactive Swagger UI returns HTTP 200 OK");
  const docsHtml = await docsRes.text();
  assertTrue(docsHtml.includes("swagger-ui"), "Includes Swagger UI bundle container");
  assertTrue(docsHtml.includes("/openapi.json"), "References OpenAPI JSON endpoint");

  // 3. OpenAPI JSON Spec Test (/openapi.json)
  const openapiRes = await app.request("/openapi.json", {}, {} as any);
  assertEqual(openapiRes.status, 200, "OpenAPI JSON endpoint returns HTTP 200 OK");
  const openapiJson = (await openapiRes.json()) as any;
  assertEqual(openapiJson.openapi, "3.0.3", "OpenAPI version is 3.0.3");
  assertTrue(!!openapiJson.paths["/log"], "OpenAPI spec includes /log path");
  assertTrue(!!openapiJson.paths["/log/batch"], "OpenAPI spec includes /log/batch path");

  console.log("✅ Web Dashboard & Interactive Docs UI E2E Tests Passed successfully!\n");
}
