# Agent Decision Log 📜🤖

> Centralized, high-performance audit trail and decision log service designed specifically for AI agents, multi-agent frameworks, and autonomous LLM tool calling systems.

Built on **Cloudflare Workers**, **Durable Objects (SQLite)**, **Hono**, and `@modelcontextprotocol/sdk`.

---

## 🎯 What is Agent Decision Log?

When AI agents execute multi-step workflows, they autonomously invoke tools—searching the web, executing code, mutating databases, or making API calls. Without a dedicated audit trail, engineering teams face significant operational challenges:

1. **Debugging Agent Loops & Hallucination**: Uncovering why an agent entered an infinite loop or invoked incorrect tool sequences.
2. **Auditability & Compliance**: Maintaining a permanent, searchable log of every tool execution, input parameter, output result, reasoning chain, and execution status (`success`, `error`, `timeout`).
3. **Behavioral Anomaly Detection**: Identifying runaway agents that execute tool calls too rapidly or experience high failure rates.
4. **Multi-Agent Isolation**: Tracking decisions across different agents (`agent_id`) and user sessions (`session_id`).

**Agent Decision Log** solves these problems by providing an ultra-fast, multi-tenant audit trail service deployed to Cloudflare's global edge network.

---

## ✨ Key Capabilities

- **🗄️ Isolated SQLite Durable Objects**: Each agent (`agent_id`) gets its own isolated Cloudflare Durable Object containing an embedded SQLite database with indexed lookups on agent ID, session ID, tool name, and timestamps.
- **🔌 Model Context Protocol (MCP) Server**: Exposes native MCP tools (`log_decision` and `query_logs`) allowing any MCP-compliant agent (Claude Desktop, Antigravity, Cursor, etc.) to log its own decisions seamlessly.
- **⚡ High-Throughput Batch Logging**: Single HTTP request endpoint (`POST /log/batch`) allowing high-speed agent loops to flush multiple log entries in parallel.
- **🚨 Real-Time Rules & Behavioral Alerts**: Built-in rules engine automatically evaluates tool execution streams to detect:
  - **`rapid_calls`**: >20 tool calls in 60 seconds (warning).
  - **`high_error_rate`**: >50% failure rate over 5 minutes (critical).
  - **`slow_calls`**: Average duration >10 seconds over 5 minutes (info).
- **📊 Embedded Web Dashboard (`GET /`)**: Interactive dark-mode dashboard for searching, filtering, and inspecting decision logs live.
- **📖 Interactive API Docs (`GET /docs`)**: Embedded Swagger UI and OpenAPI 3.0 spec (`/openapi.json`) for interactive API testing.
- **🔒 API Key Auth & CORS Security**: Optional `API_KEY` middleware (`Authorization: Bearer <key>` or `x-api-key`) and CORS headers.
- **🧹 Automated Data Retention**: Daily Cloudflare Cron Trigger (`0 0 * * *`) that automatically prunes decision logs older than 30 days.
- **📦 Thin TypeScript SDK**: Client library (`DecisionLogClient`) for 2-line integration in non-MCP TypeScript apps.

---

## 🏗️ System Architecture

```
                               ┌──────────────────────────────────────────────┐
                               │             Client Integrations              │
                               ├──────────────────────┬───────────────────────┤
                               │  MCP-Connected Agent │  TypeScript SDK App   │
                               └──────────┬───────────┴───────────┬───────────┘
                                          │                       │
                                   MCP Protocol             HTTP / JSON
                                          │                       │
                                          ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Cloudflare Workers Edge                                   │
│                                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                               Hono HTTP API Router                                  │   │
│   │                                                                                     │   │
│   │  GET /              POST /log           POST /log/batch     GET /logs    GET /alerts  │   │
│   │  (Web Dashboard)    (Single Log)        (Batch Logging)     (Query)      (Anomalies)  │   │
│   └───────────────────────────┬─────────────────────────────────────┬───────────────────┘   │
│                               │                                     │                       │
│                               ▼                                     ▼                       │
│   ┌─────────────────────────────────────────┐   ┌───────────────────────────────────────┐   │
│   │       Durable Object: agent-alpha       │   │        Durable Object: agent-beta     │   │
│   │  ┌───────────────────────────────────┐  │   │  ┌─────────────────────────────────┐  │   │
│   │  │   SQLite Table: log_entries       │  │   │  │   SQLite Table: log_entries     │  │   │
│   │  │   (id, session, tool, reasoning)  │  │   │  │   (id, session, tool, reasoning)│  │   │
│   │  └───────────────────────────────────┘  │   │  └─────────────────────────────────┘  │   │
│   └─────────────────────────────────────────┘   └───────────────────────────────────────┘   │
│                                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                    Daily Data Retention Cron Handler (0 0 * * *)                     │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Schema (`LogEntry`)

Each logged decision records the following fields:

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Unique decision log entry ID |
| `agent_id` | `string` | Agent identifier |
| `session_id` | `string` | Conversation or run session ID |
| `timestamp` | `string` (ISO 8601) | Execution timestamp |
| `tool_name` | `string` | Name of the tool invoked (e.g. `search_web`, `execute_code`) |
| `input` | `object` \| `null` | JSON payload of input arguments passed to the tool |
| `output` | `object` \| `null` | JSON payload of output returned by the tool |
| `reasoning` | `string` \| `null` | Agent's self-reported reasoning trace for invoking the tool |
| `result_status` | `string` | Outcome status (`"success"` \| `"error"` \| `"timeout"`) |
| `duration_ms` | `number` | Execution time in milliseconds |
| `metadata` | `object` | Arbitrary custom metadata key-value pairs |

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run E2E Test Suite

```bash
npm test
```

### 3. Start Local Development Server

```bash
npm run dev
```

The service will run locally at `http://localhost:8787`.
- **Web Dashboard**: `http://localhost:8787/`
- **Interactive Swagger Docs**: `http://localhost:8787/docs`
- **OpenAPI Spec**: `http://localhost:8787/openapi.json`

### 4. Deploy to Cloudflare Workers

```bash
npm run deploy
```

---

## 💻 Integration Examples

### TypeScript SDK (`DecisionLogClient`)

```typescript
import { DecisionLogClient } from "./src/index.js";

const client = new DecisionLogClient("http://localhost:8787", "YOUR_API_KEY");

// 1. Log a single tool execution
const result = await client.log({
  agent_id: "researcher-agent",
  session_id: "session-402",
  tool_name: "fetch_arxiv_paper",
  input: { arxiv_id: "2401.00001" },
  output: { title: "Agentic AI Architectures" },
  reasoning: "User asked for recent papers on AI agents",
  result_status: "success",
  duration_ms: 320
});

console.log("Logged decision ID:", result.id);

// 2. High-throughput batch logging
await client.logBatch([
  { agent_id: "worker-1", session_id: "job-10", tool_name: "parse_pdf", result_status: "success", duration_ms: 45 },
  { agent_id: "worker-1", session_id: "job-10", tool_name: "extract_text", result_status: "success", duration_ms: 12 }
]);

// 3. Query decision history
const { logs } = await client.query({
  agent_id: "researcher-agent",
  result_status: "success",
  limit: 50
});

console.log("Queried decision logs:", logs);
```

### cURL HTTP API

```bash
# Log a tool decision
curl -X POST http://localhost:8787/log \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "code-agent",
    "session_id": "sess-881",
    "tool_name": "run_command",
    "input": {"command": "npm test"},
    "output": {"exit_code": 0},
    "reasoning": "Verifying test suite passed",
    "result_status": "success",
    "duration_ms": 1150
  }'

# Query decision logs
curl "http://localhost:8787/logs?agent_id=code-agent&limit=10"

# Fetch active alerts
curl "http://localhost:8787/alerts?agent_id=code-agent"
```

---

## 📁 Repository File Structure

```plaintext
agent-decision-log/
├── src/
│   ├── types.ts          # Core interfaces (LogEntry, LogQuery, Rule, Alert)
│   ├── do.ts             # DecisionLogDO Durable Object (SQLite table & indices)
│   ├── mcp-server.ts     # DecisionLogMCP (log_decision & query_logs tools)
│   ├── sdk.ts            # DecisionLogClient TypeScript SDK
│   ├── rules.ts          # Behavioral Rules Engine (anomaly evaluation)
│   ├── worker.ts         # Hono edge router, CORS, Auth, Dashboard, Swagger UI, Cron
│   └── index.ts          # Library barrel export
├── tests/                # Automated End-to-End Test Suite
│   ├── api-e2e.test.ts   # API workflow & auth E2E tests
│   ├── dashboard-e2e.test.ts # Web Dashboard UI & Swagger UI E2E tests
│   ├── sdk-e2e.test.ts   # SDK signature tests
│   ├── assert.ts         # Assertion helpers
│   └── run-e2e.ts        # Master E2E runner
├── docs/                 # Documentation
│   ├── API.md            # Complete API Reference Guide
│   └── openapi.yaml      # OpenAPI 3.0.3 Specification
├── package.json          # Dependencies & npm scripts
├── tsconfig.json         # TypeScript configuration
├── wrangler.jsonc        # Cloudflare Wrangler configuration
├── LICENSE               # MIT License
└── README.md             # Project overview & documentation
```

---

## 📜 License

[MIT License](LICENSE) © 2026 Mr-Process
