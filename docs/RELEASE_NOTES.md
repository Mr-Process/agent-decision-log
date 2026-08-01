# Agent Decision Log v0.2.0 — Release Notes

Initial production release of **Agent Decision Log** — audit trail, batch decision logging, behavioral rules engine, and queryable log service for AI agents.

## 🎉 Key Features & Enhancements

### 🗄️ Durable Object SQLite Storage
- Isolated SQLite database per agent (`agent_id`) running on Cloudflare Durable Objects.
- Secondary indices on `agent_id`, `session_id`, `timestamp`, and `tool_name` for ultra-fast filtering.

### 🔌 Model Context Protocol (MCP) Server
- Built-in MCP server class (`DecisionLogMCP`) exposing native `log_decision` and `query_logs` tools for MCP-compliant agents (Claude, Antigravity, Cursor, etc.).

### ⚡ High-Throughput Batch Logging (`POST /log/batch`)
- Single-request batch logging endpoint to insert multiple tool call entries in parallel, reducing network overhead for high-speed agent loops.

### 🔒 Security & CORS
- Hono `cors()` middleware.
- Optional `API_KEY` authentication middleware (`x-api-key` header or `Authorization: Bearer <key>`).

### 🧹 Automated 30-Day Retention Cron
- Daily Cloudflare Cron Trigger (`0 0 * * *`) that auto-prunes decision logs older than 30 days.

### 🚨 Behavioral Rules Engine
- Evaluates log execution streams to surface active alerts:
  - `rapid_calls`: >20 tool calls in 60s
  - `high_error_rate`: >50% failure rate over 5min
  - `slow_calls`: Average duration >10s

### 📊 Web Dashboard & Interactive Swagger UI
- Interactive dark-mode log browser at `GET /`.
- Embedded Swagger UI portal at `GET /docs` & OpenAPI 3.0 spec at `GET /openapi.json`.

### 📦 Thin TypeScript SDK
- Client library `DecisionLogClient` for 2-line logging and querying.

### 🧪 100% E2E Test Coverage
- Automated E2E test suite covering API routes, authentication, batch operations, dashboard UI, and SDK client methods.
