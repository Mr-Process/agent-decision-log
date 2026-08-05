import { Hono } from "hono";
import { cors } from "hono/cors";
import { DecisionLogDO } from "./do.js";
import { DecisionLogMCP } from "./mcp-server.js";
import type { LogEntry, LogQuery } from "./types.js";
import { defaultRules, evaluateRules } from "./rules.js";

export { DecisionLogDO, DecisionLogMCP };

export interface Env {
  DECISION_LOG: DurableObjectNamespace;
  API_KEY?: string;
}

export const app = new Hono<{ Bindings: Env }>();

// 1. Enable CORS for all routes
app.use("*", cors());

// 2. Authentication Middleware for API Endpoints
app.use("*", async (c, next) => {
  const path = c.req.path;
  // Public routes: Dashboard, Health, MCP, Docs, OpenAPI
  if (
    path === "/" ||
    path === "/health" ||
    path.startsWith("/mcp") ||
    path === "/docs" ||
    path === "/openapi.json"
  ) {
    return next();
  }

  // If API_KEY environment variable is configured, enforce auth check
  const requiredKey = c.env.API_KEY;
  if (requiredKey) {
    const apiKeyHeader = c.req.header("x-api-key");
    const authHeader = c.req.header("authorization");
    let bearerToken: string | undefined;
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      bearerToken = authHeader.substring(7).trim();
    }

    const providedKey = apiKeyHeader || bearerToken;
    if (!providedKey || providedKey !== requiredKey) {
      return c.json({ error: "Unauthorized: Invalid or missing API key" }, 401);
    }
  }

  return next();
});

// Dashboard UI
app.get("/", (c) => {
  return c.html(`<!DOCTYPE html>
<html>
<head>
  <title>Agent Decision Log</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1100px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; }
    h1 { margin-bottom: 16px; font-weight: 700; color: #38bdf8; display: flex; justify-content: space-between; align-items: center; }
    .nav-link { font-size: 14px; font-weight: 500; color: #38bdf8; text-decoration: none; border: 1px solid #0284c7; padding: 6px 12px; border-radius: 6px; }
    .nav-link:hover { background: #0284c7; color: white; }
    .filters { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; background: #1e293b; padding: 16px; border-radius: 8px; border: 1px solid #334155; }
    .filters input, .filters select { padding: 8px 12px; font-size: 14px; border: 1px solid #475569; border-radius: 6px; background: #0f172a; color: #f8fafc; }
    .filters button { padding: 8px 20px; cursor: pointer; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: 600; transition: background 0.2s; }
    .filters button:hover { background: #0369a1; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155; }
    th { text-align: left; padding: 12px 10px; background: #334155; color: #94a3b8; font-weight: 600; border-bottom: 2px solid #475569; }
    td { padding: 10px; border-bottom: 1px solid #334155; vertical-align: top; }
    .status-success { color: #4ade80; font-weight: 600; }
    .status-error { color: #f87171; font-weight: 600; }
    .status-timeout { color: #fb923c; font-weight: 600; }
    .reasoning { color: #94a3b8; font-style: italic; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .json-cell { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cbd5e1; font-family: monospace; }
  </style>
</head>
<body>
  <h1>
    <span>Agent Decision Log</span>
    <a href="/docs" class="nav-link">Interactive API Docs ➔</a>
  </h1>
  <div class="filters">
    <input id="agent_id" placeholder="Agent ID" />
    <input id="session_id" placeholder="Session ID" />
    <input id="tool_name" placeholder="Tool name" />
    <select id="result_status">
      <option value="">All statuses</option>
      <option value="success">Success</option>
      <option value="error">Error</option>
      <option value="timeout">Timeout</option>
    </select>
    <button onclick="loadLogs()">Search</button>
  </div>
  <table id="logTable">
    <thead>
      <tr>
        <th>Time</th>
        <th>Agent</th>
        <th>Session</th>
        <th>Tool</th>
        <th>Status</th>
        <th>Input</th>
        <th>Reasoning</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody id="logBody">
      <tr><td colspan="8" style="text-align:center; color:#94a3b8; padding: 24px;">No logs loaded. Click Search.</td></tr>
    </tbody>
  </table>
  <script>
    async function loadLogs() {
      const params = new URLSearchParams();
      const agent = document.getElementById('agent_id').value;
      const session = document.getElementById('session_id').value;
      const tool = document.getElementById('tool_name').value;
      const status = document.getElementById('result_status').value;
      if (agent) params.set('agent_id', agent);
      if (session) params.set('session_id', session);
      if (tool) params.set('tool_name', tool);
      if (status) params.set('result_status', status);
      params.set('limit', '200');

      const res = await fetch('/logs?' + params);
      const data = await res.json();
      const tbody = document.getElementById('logBody');
      if (!data.logs || data.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px;">No logs found.</td></tr>';
        return;
      }
      tbody.innerHTML = data.logs.map(l => {
        const time = new Date(l.timestamp).toLocaleString();
        const inputStr = l.input ? JSON.stringify(l.input).substring(0, 80) : '';
        return '<tr>' +
          '<td>' + time + '</td>' +
          '<td>' + l.agent_id + '</td>' +
          '<td>' + (l.session_id ? l.session_id.substring(0, 12) : '') + '</td>' +
          '<td>' + l.tool_name + '</td>' +
          '<td class="status-' + l.result_status + '">' + l.result_status + '</td>' +
          '<td class="json-cell" title="' + (l.input ? JSON.stringify(l.input).replace(/"/g, '&quot;') : '') + '">' + inputStr + '</td>' +
          '<td class="reasoning" title="' + (l.reasoning || '').replace(/"/g, '&quot;') + '">' + (l.reasoning || '') + '</td>' +
          '<td>' + l.duration_ms + 'ms</td>' +
        '</tr>';
      }).join('');
    }
    loadLogs();
  </script>
</body>
</html>`);
});

// Interactive Swagger UI Page
app.get("/docs", (c) => {
  return c.html(`<!DOCTYPE html>
<html>
<head>
  <title>Agent Decision Log - API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
      });
    };
  </script>
</body>
</html>`);
});

// OpenAPI JSON Schema Route
app.get("/openapi.json", (c) => {
  return c.json({
    openapi: "3.0.3",
    info: {
      title: "Agent Decision Log API",
      description: "Audit trail and queryable decision log service for AI agents running on Cloudflare Workers & Durable Objects SQLite.",
      version: "0.2.0"
    },
    paths: {
      "/health": {
        get: {
          summary: "Health Check",
          responses: {
            "200": { description: "Service online" }
          }
        }
      },
      "/log": {
        post: {
          summary: "Log a Decision",
          description: "Record an AI agent tool invocation decision",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogEntryInput" }
              }
            }
          },
          responses: {
            "201": { description: "Log entry created successfully" }
          }
        }
      },
      "/log/batch": {
        post: {
          summary: "Log Batch Decisions",
          description: "Insert multiple tool execution decisions in a single call",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    entries: {
                      type: "array",
                      items: { $ref: "#/components/schemas/LogEntryInput" }
                    }
                  }
                }
              }
            }
          },
          responses: {
            "201": { description: "Batch entries created successfully" }
          }
        }
      },
      "/logs": {
        get: {
          summary: "Query Decision Logs",
          parameters: [
            { name: "agent_id", in: "query", schema: { type: "string" } },
            { name: "session_id", in: "query", schema: { type: "string" } },
            { name: "tool_name", in: "query", schema: { type: "string" } },
            { name: "result_status", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100 } }
          ],
          responses: {
            "200": { description: "Matching log entries" }
          }
        }
      },
      "/count": {
        get: {
          summary: "Get Entry Count",
          parameters: [
            { name: "agent_id", in: "query", schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Total count" }
          }
        }
      },
      "/alerts": {
        get: {
          summary: "Behavioral Alerts",
          parameters: [
            { name: "agent_id", in: "query", schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Active alerts" }
          }
        }
      }
    },
    components: {
      schemas: {
        LogEntryInput: {
          type: "object",
          required: ["agent_id", "session_id", "tool_name", "result_status"],
          properties: {
            agent_id: { type: "string" },
            session_id: { type: "string" },
            tool_name: { type: "string" },
            result_status: { type: "string", enum: ["success", "error", "timeout"] },
            input: { type: "object", nullable: true },
            output: { type: "object", nullable: true },
            reasoning: { type: "string", nullable: true },
            duration_ms: { type: "integer", default: 0 }
          }
        }
      }
    }
  });
});

// Health check
app.get("/health", (c) => c.text("ok"));

// Log a single decision
app.post("/log", async (c) => {
  const body = await c.req.json();
  const { agent_id, session_id, tool_name, input, output, reasoning, result_status, duration_ms, metadata } = body;

  if (!agent_id || !session_id || !tool_name || !result_status) {
    return c.json({ error: "Missing required fields: agent_id, session_id, tool_name, result_status" }, 400);
  }

  const entry: LogEntry = {
    id: crypto.randomUUID(),
    agent_id,
    session_id,
    timestamp: new Date().toISOString(),
    tool_name,
    input: input ?? null,
    output: output ?? null,
    reasoning: reasoning ?? null,
    result_status,
    duration_ms: duration_ms ?? 0,
    metadata: metadata ?? {},
  };

  const doId = c.env.DECISION_LOG.idFromName(agent_id);
  const stub = c.env.DECISION_LOG.get(doId);
  await stub.fetch("https://do/insert", {
    method: "POST",
    body: JSON.stringify(entry),
    headers: { "Content-Type": "application/json" },
  });

  return c.json({ id: entry.id, timestamp: entry.timestamp }, 201);
});

// Log batch decisions
app.post("/log/batch", async (c) => {
  const body = await c.req.json();
  const { entries } = body as { entries: any[] };

  if (!Array.isArray(entries) || entries.length === 0) {
    return c.json({ error: "Invalid payload: 'entries' array required" }, 400);
  }

  const grouped = new Map<string, LogEntry[]>();
  for (const item of entries) {
    if (!item.agent_id || !item.session_id || !item.tool_name || !item.result_status) {
      continue;
    }
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      agent_id: item.agent_id,
      session_id: item.session_id,
      timestamp: item.timestamp || new Date().toISOString(),
      tool_name: item.tool_name,
      input: item.input ?? null,
      output: item.output ?? null,
      reasoning: item.reasoning ?? null,
      result_status: item.result_status,
      duration_ms: item.duration_ms ?? 0,
      metadata: item.metadata ?? {},
    };
    if (!grouped.has(entry.agent_id)) {
      grouped.set(entry.agent_id, []);
    }
    grouped.get(entry.agent_id)!.push(entry);
  }

  let totalInserted = 0;
  const promises = [];
  for (const [agent_id, agentEntries] of grouped.entries()) {
    const doId = c.env.DECISION_LOG.idFromName(agent_id);
    const stub = c.env.DECISION_LOG.get(doId);
    promises.push(
      stub.fetch("https://do/insert-batch", {
        method: "POST",
        body: JSON.stringify(agentEntries),
        headers: { "Content-Type": "application/json" },
      }).then(() => {
        totalInserted += agentEntries.length;
      })
    );
  }

  await Promise.all(promises);

  return c.json({ count: totalInserted }, 201);
});

// Query decisions
app.get("/logs", async (c) => {
  const query: LogQuery = {
    agent_id: c.req.query("agent_id"),
    session_id: c.req.query("session_id"),
    tool_name: c.req.query("tool_name"),
    result_status: c.req.query("result_status"),
    since: c.req.query("since"),
    until: c.req.query("until"),
    limit: c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : undefined,
    offset: c.req.query("offset") ? parseInt(c.req.query("offset")!, 10) : undefined,
  };

  const doName = query.agent_id || "global";
  const doId = c.env.DECISION_LOG.idFromName(doName);
  const stub = c.env.DECISION_LOG.get(doId);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) {
      params.append(k, String(v));
    }
  }
  const res = await stub.fetch("https://do/query?" + params.toString());
  const logs = await res.json();
  return c.json({ logs });
});

// Count entries
app.get("/count", async (c) => {
  const agent_id = c.req.query("agent_id");
  const doName = agent_id || "global";
  const doId = c.env.DECISION_LOG.idFromName(doName);
  const stub = c.env.DECISION_LOG.get(doId);
  const res = await stub.fetch("https://do/count" + (agent_id ? `?agent_id=${agent_id}` : ""));
  const count = await res.json();
  return c.json({ count });
});

// Rules & Alerts
app.get("/alerts", async (c) => {
  const agent_id = c.req.query("agent_id");
  const doName = agent_id || "global";
  const doId = c.env.DECISION_LOG.idFromName(doName);
  const stub = c.env.DECISION_LOG.get(doId);
  const res = await stub.fetch("https://do/query?limit=500");
  const logs = (await res.json()) as LogEntry[];
  const alerts = evaluateRules(logs, defaultRules());
  return c.json({ alerts });
});

// MCP Endpoint route
app.all("/mcp", (c) => {
  return c.json({ message: "MCP Server endpoint active via DecisionLogMCP class" }, 200);
});

// Worker handler with Scheduled Retention Event
export default {
  fetch: app.fetch,
  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    const retentionDays = 30;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    console.log(`[Retention Cron] Pruning logs older than ${cutoffDate}`);

    const globalDoId = env.DECISION_LOG.idFromName("global");
    const stub = env.DECISION_LOG.get(globalDoId);
    await stub.fetch("https://do/delete-before", {
      method: "POST",
      body: JSON.stringify({ timestamp: cutoffDate }),
      headers: { "Content-Type": "application/json" },
    });
  },
};
