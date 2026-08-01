# Memory Record: Agent Decision Log Architecture

- **Key**: `agent-decision-log-architecture-v1`
- **Type**: `architecture`
- **Tags**: `cloudflare-workers`, `durable-objects`, `sqlite`, `hono`, `mcp`, `sdk`, `audit-log`
- **Created**: 2026-07-31

---

## 1. System Overview

`Agent Decision Log` is an audit trail service for AI agent tool calls running on Cloudflare Workers edge runtime with Durable Objects SQLite storage. It enables any agent (via MCP tool call, HTTP API, or thin TypeScript SDK) to record tool invocations, inputs, outputs, reasoning, duration, and execution status.

## 2. Core Architecture Components

### A. Durable Object Storage Layer (`src/do.ts`)
- **Class**: `DecisionLogDO` extending Cloudflare `DurableObject`.
- **Database**: SQLite storage per agent instance (`this.ctx.storage.sql`).
- **Table Schema (`log_entries`)**:
  - `id` (TEXT PRIMARY KEY)
  - `agent_id` (TEXT NOT NULL)
  - `session_id` (TEXT NOT NULL)
  - `timestamp` (TEXT NOT NULL)
  - `tool_name` (TEXT NOT NULL)
  - `input` (TEXT - JSON)
  - `output` (TEXT - JSON)
  - `reasoning` (TEXT - Nullable)
  - `result_status` (TEXT NOT NULL: `success` | `error` | `timeout`)
  - `duration_ms` (INTEGER NOT NULL)
  - `metadata` (TEXT - JSON)
- **Indices**: `idx_agent`, `idx_session`, `idx_timestamp`, `idx_tool`.

### B. HTTP API & Worker Router (`src/worker.ts`)
- **Framework**: Hono (`Hono<{ Bindings: Env }>`).
- **Endpoints**:
  - `POST /log`: Validates `agent_id`, `session_id`, `tool_name`, `result_status` and routes entry to DO stub.
  - `GET /logs`: Filters log entries by `agent_id`, `session_id`, `tool_name`, `result_status`, time range (`since`/`until`), with pagination (`limit`, `offset`).
  - `GET /count`: Returns total entry count for an agent.
  - `GET /alerts`: Fetches recent logs and runs the rules engine to surface active alerts.
  - `GET /health`: Health check (`ok`).
  - `GET /`: Interactive HTML/JS Web Dashboard.
  - `ALL /mcp`: Endpoint for MCP server communication.

### C. MCP Server Wrapper (`src/mcp-server.ts`)
- **Class**: `DecisionLogMCP` extending `McpAgent`.
- **Exposed Tools**:
  - `log_decision`: Logs tool call details (Zod schema validation).
  - `query_logs`: Queries recent tool execution logs matching parameters.

### D. Rules Engine (`src/rules.ts`)
- **Function**: `evaluateRules(entries, rules)`
- **Built-in Rules**:
  1. `rapid_calls` (warning): >20 tool calls within 60s window.
  2. `high_error_rate` (critical): >50% failure rate over 5min window.
  3. `slow_calls` (info): Average execution duration >10s over 5min window.

### E. Thin TypeScript SDK (`src/sdk.ts` & `src/index.ts`)
- **Class**: `DecisionLogClient`
- **Methods**: `log()`, `query()`, `count()`
