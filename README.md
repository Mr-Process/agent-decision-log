# Agent Decision Log

Audit trail, batch logging, automated data retention, and queryable decision log service for AI agent tool calls. Any agent can log what it did, why, and what happened via MCP, HTTP API, or thin TypeScript SDK.

Built with **TypeScript**, **Cloudflare Workers**, **Durable Objects (SQLite)**, **Hono**, and `@modelcontextprotocol/sdk`.

---

## Features

- ⚡ **Cloudflare Edge Performance**: Low-latency global execution powered by Cloudflare Workers.
- 🗄️ **Durable Object SQLite Storage**: Isolated, indexed SQLite storage per agent.
- 🔌 **MCP Server Support**: Native `log_decision` and `query_logs` tools compatible with any MCP client.
- 📦 **High-Throughput Batch Logging**: Single-request `POST /log/batch` endpoint.
- 🔒 **Security**: Configurable `API_KEY` header/bearer auth and CORS headers.
- 🧹 **Automated Retention**: Daily cron trigger (`0 0 * * *`) auto-prunes logs older than 30 days.
- 🚨 **Rules Engine**: Automated pattern detection for `rapid_calls`, `high_error_rate`, and `slow_calls`.
- 📊 **Web Dashboard**: Interactive dark-mode dashboard at `/` for filtering and searching logs.
- 📦 **Thin TypeScript SDK**: 2-line client library (`DecisionLogClient`).

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run E2E Test Suite

```bash
npm test
```

### 3. Local Development

```bash
npm run dev
```

The service will start locally at `http://localhost:8787`.

### 4. Deploy to Cloudflare Workers

```bash
npm run deploy
```

---

## Usage

### Via HTTP API

```bash
# Log a decision
curl -X POST http://localhost:8787/log \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-agent",
    "session_id": "sess-1",
    "tool_name": "search_web",
    "input": {"query": "hello world"},
    "output": {"results": []},
    "reasoning": "User asked to search",
    "result_status": "success",
    "duration_ms": 150
  }'

# Batch log decisions
curl -X POST http://localhost:8787/log/batch \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      { "agent_id": "my-agent", "session_id": "sess-1", "tool_name": "tool_a", "result_status": "success" },
      { "agent_id": "my-agent", "session_id": "sess-1", "tool_name": "tool_b", "result_status": "success" }
    ]
  }'

# Query decision logs
curl "http://localhost:8787/logs?agent_id=my-agent"

# Check behavioral alerts
curl "http://localhost:8787/alerts?agent_id=my-agent"
```

### Via MCP

Connect any MCP-compatible agent to `https://your-worker.workers.dev/mcp`. Two tools are available:

- `log_decision` — log a tool call
- `query_logs` — query decision logs

### Via SDK

```typescript
import { DecisionLogClient } from "./src/index.js";

const client = new DecisionLogClient("http://localhost:8787");

// Single log
await client.log({
  agent_id: "my-agent",
  session_id: "sess-1",
  tool_name: "search_web",
  result_status: "success",
});

// Batch log
await client.logBatch([
  { agent_id: "my-agent", session_id: "sess-1", tool_name: "tool_1", result_status: "success" },
  { agent_id: "my-agent", session_id: "sess-1", tool_name: "tool_2", result_status: "success" }
]);
```

---

## GitHub Setup

To push this repository to GitHub:

```bash
git init
git add .
git commit -m "Initial commit: Agent Decision Log Cloudflare Worker & MCP service"
git branch -M main
git remote add origin https://github.com/Mr-Process/agent-decision-log.git
git push -u origin main
```

---

## License

MIT
