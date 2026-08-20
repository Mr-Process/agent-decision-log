import { Hono } from "hono";
import { cors } from "hono/cors";
import { DecisionLogDO } from "./do.js";
import { DecisionLogMCP } from "./mcp-server.js";
import type { LogEntry, LogQuery } from "./types.js";
import { defaultRules, evaluateRules } from "./rules.js";
import { parseBatch, parseEntry, parseQuery, ValidationError } from "./validation.js";

export { DecisionLogDO, DecisionLogMCP };

export interface Env {
  DECISION_LOG: DurableObjectNamespace;
  API_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

export const app = new Hono<{ Bindings: Env }>();

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

// CORS is disabled unless an operator supplies exact browser origins.
app.use("*", cors({
  origin: (origin, c) => allowedOrigins(c.env).includes(origin) ? origin : "",
  allowHeaders: ["Authorization", "Content-Type", "X-API-Key"],
  allowMethods: ["GET", "POST", "OPTIONS"],
}));

// Dashboard, health, and documentation are public. All data and MCP routes
// fail closed when API_KEY is absent or does not match.
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (path === "/" || path === "/health" || path === "/docs" || path === "/openapi.json") {
    return next();
  }

  const requiredKey = c.env.API_KEY;
  if (!requiredKey) {
    return c.json({ error: "Service misconfigured: API_KEY is required for protected routes." }, 503);
  }

  const authorization = c.req.header("authorization");
  const bearerToken = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : undefined;
  const providedKey = c.req.header("x-api-key") || bearerToken;
  if (!providedKey || !timingSafeEqual(providedKey, requiredKey)) {
    return c.json({ error: "Unauthorized" }, 401);
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
    function apiKey() {
      let key = sessionStorage.getItem('decisionLogApiKey');
      if (!key) {
        key = window.prompt('Enter the Agent Decision Log API key for this browser session:') || '';
        if (key) sessionStorage.setItem('decisionLogApiKey', key);
      }
      return key;
    }

    function appendCell(row, value, className, title) {
      const cell = document.createElement('td');
      if (className) cell.className = className;
      cell.textContent = value == null ? '' : String(value);
      if (title) cell.title = String(title);
      row.appendChild(cell);
    }

    function emptyState(tbody, message) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.style.cssText = 'text-align:center;color:#94a3b8;padding:24px;';
      cell.textContent = message;
      row.appendChild(cell);
      tbody.replaceChildren(row);
    }

    async function loadLogs() {
      const key = apiKey();
      const tbody = document.getElementById('logBody');
      if (!key) return emptyState(tbody, 'An API key is required to load logs.');

      const params = new URLSearchParams();
      const agent = document.getElementById('agent_id').value;
      const session = document.getElementById('session_id').value;
      const tool = document.getElementById('tool_name').value;
      const status = document.getElementById('result_status').value;
      if (!agent) return emptyState(tbody, 'Enter an Agent ID to query its isolated log shard.');
      params.set('agent_id', agent);
      if (session) params.set('session_id', session);
      if (tool) params.set('tool_name', tool);
      if (status) params.set('result_status', status);
      params.set('limit', '100');

      const res = await fetch('/logs?' + params, { headers: { 'X-API-Key': key } });
      if (!res.ok) return emptyState(tbody, 'Unable to load logs: ' + res.status);
      const data = await res.json();
      if (!data.logs || data.logs.length === 0) return emptyState(tbody, 'No logs found.');

      const rows = data.logs.map((log) => {
        const row = document.createElement('tr');
        const input = log.input ? JSON.stringify(log.input) : '';
        appendCell(row, new Date(log.timestamp).toLocaleString());
        appendCell(row, log.agent_id);
        appendCell(row, log.session_id ? log.session_id.substring(0, 12) : '');
        appendCell(row, log.tool_name);
        appendCell(row, log.result_status, 'status-' + log.result_status);
        appendCell(row, input.substring(0, 80), 'json-cell', input);
        appendCell(row, log.reasoning || '', 'reasoning', log.reasoning || '');
        appendCell(row, String(log.duration_ms) + 'ms');
        return row;
      });
      tbody.replaceChildren(...rows);
    }
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

async function registerAgent(env: Env, agentId: string): Promise<void> {
  const registry = env.DECISION_LOG.get(env.DECISION_LOG.idFromName("__agent_registry__"));
  const response = await registry.fetch("https://do/register-agent", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId }),
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Unable to register the agent shard for retention.");
}

// Log a single decision
app.post("/log", async (c) => {
  try {
    const body = await c.req.json();
    const entry = parseEntry(body);
    const stub = c.env.DECISION_LOG.get(c.env.DECISION_LOG.idFromName(entry.agent_id));
    const response = await stub.fetch("https://do/insert", {
      method: "POST",
      body: JSON.stringify(entry),
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error("The log shard rejected the entry.");
    await registerAgent(c.env, entry.agent_id);
    return c.json({ id: entry.id, timestamp: entry.timestamp }, 201);
  } catch (error) {
    const message = error instanceof ValidationError ? error.message : "Unable to persist log entry.";
    return c.json({ error: message }, error instanceof ValidationError ? 400 : 502);
  }
});

// Log batch decisions
app.post("/log/batch", async (c) => {
  try {
    const entries = parseBatch(await c.req.json());
    const grouped = new Map<string, typeof entries>();
    for (const entry of entries) {
      grouped.set(entry.agent_id, [...(grouped.get(entry.agent_id) ?? []), entry]);
    }

    for (const [agentId, agentEntries] of grouped) {
      const stub = c.env.DECISION_LOG.get(c.env.DECISION_LOG.idFromName(agentId));
      const response = await stub.fetch("https://do/insert-batch", {
        method: "POST",
        body: JSON.stringify(agentEntries),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("A log shard rejected the batch.");
      await registerAgent(c.env, agentId);
    }

    return c.json({ count: entries.length }, 201);
  } catch (error) {
    const message = error instanceof ValidationError ? error.message : "Unable to persist log batch.";
    return c.json({ error: message }, error instanceof ValidationError ? 400 : 502);
  }
});

// Query decisions in one explicitly selected agent shard.
app.get("/logs", async (c) => {
  try {
    const query = parseQuery({
      agent_id: c.req.query("agent_id"),
      session_id: c.req.query("session_id"),
      tool_name: c.req.query("tool_name"),
      result_status: c.req.query("result_status"),
      since: c.req.query("since"),
      until: c.req.query("until"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });
    if (!query.agent_id) return c.json({ error: "agent_id is required for shard-isolated queries." }, 400);

    const stub = c.env.DECISION_LOG.get(c.env.DECISION_LOG.idFromName(query.agent_id));
    const response = await stub.fetch("https://do/query?" + new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]): [string, string] => [key, String(value)])
    ));
    if (!response.ok) return c.json({ error: "Log shard query failed." }, 502);
    return c.json({ logs: await response.json() });
  } catch (error) {
    return c.json({ error: error instanceof ValidationError ? error.message : "Unable to query logs." }, 400);
  }
});

// Count entries in one explicitly selected agent shard.
app.get("/count", async (c) => {
  try {
    const query = parseQuery({ agent_id: c.req.query("agent_id") });
    if (!query.agent_id) return c.json({ error: "agent_id is required for shard-isolated counts." }, 400);
    const stub = c.env.DECISION_LOG.get(c.env.DECISION_LOG.idFromName(query.agent_id));
    const response = await stub.fetch("https://do/count?agent_id=" + encodeURIComponent(query.agent_id));
    if (!response.ok) return c.json({ error: "Log shard count failed." }, 502);
    return c.json({ count: await response.json() });
  } catch (error) {
    return c.json({ error: error instanceof ValidationError ? error.message : "Unable to count logs." }, 400);
  }
});

// Rules and alerts are evaluated only against the requested agent shard.
app.get("/alerts", async (c) => {
  try {
    const query = parseQuery({ agent_id: c.req.query("agent_id"), limit: "100" });
    if (!query.agent_id) return c.json({ error: "agent_id is required for shard-isolated alerts." }, 400);
    const stub = c.env.DECISION_LOG.get(c.env.DECISION_LOG.idFromName(query.agent_id));
    const response = await stub.fetch("https://do/query?agent_id=" + encodeURIComponent(query.agent_id) + "&limit=100");
    if (!response.ok) return c.json({ error: "Log shard alert query failed." }, 502);
    const logs = (await response.json()) as LogEntry[];
    return c.json({ alerts: evaluateRules(logs, defaultRules()) });
  } catch (error) {
    return c.json({ error: error instanceof ValidationError ? error.message : "Unable to evaluate alerts." }, 400);
  }
});

// MCP Endpoint route
app.all("/mcp", (c) => {
  return c.json({ message: "MCP Server endpoint active via DecisionLogMCP class" }, 200);
});

// Worker handler with scheduled retention across registered agent shards.
export default {
  fetch: app.fetch,
  async scheduled(_: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const retentionDays = 30;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const registry = env.DECISION_LOG.get(env.DECISION_LOG.idFromName("__agent_registry__"));
    const registryResponse = await registry.fetch("https://do/list-agents");
    if (!registryResponse.ok) throw new Error("Unable to load registered decision-log shards for retention.");

    const agentIds = (await registryResponse.json()) as string[];
    const retention = Promise.allSettled(agentIds.map(async (agentId) => {
      const shard = env.DECISION_LOG.get(env.DECISION_LOG.idFromName(agentId));
      const response = await shard.fetch("https://do/delete-before", {
        method: "POST",
        body: JSON.stringify({ timestamp: cutoffDate }),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`Retention failed for agent shard ${agentId}.`);
    }));

    ctx.waitUntil(retention.then((results) => {
      const failed = results.filter((result) => result.status === "rejected").length;
      console.log(`[Retention Cron] Processed ${agentIds.length} shard(s); failures=${failed}; cutoff=${cutoffDate}`);
    }));
  },
};
