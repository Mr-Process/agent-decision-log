# Agent Decision Log — API Documentation

**Version:** `0.2.0`  
**Base URL:** `https://agent-decision-log.<your-subdomain>.workers.dev`  
**Local Base URL:** `http://localhost:8787`  

Agent Decision Log provides a persistent audit trail, batch logging, automated retention, and queryable decision log service for AI agents running on Cloudflare Workers & Durable Objects SQLite.

---

## Authentication

When the `API_KEY` environment variable is set on the Cloudflare Worker, all API endpoints (`/log`, `/log/batch`, `/logs`, `/count`, `/alerts`) require authentication.

Authentication can be passed via either:
1. `Authorization: Bearer <YOUR_API_KEY>`
2. `x-api-key: <YOUR_API_KEY>`

Public endpoints (`/health`, `/`, `/mcp`) remain unauthenticated.

---

## Endpoints

### 1. Health Check (`GET /health`)
- **URL:** `/health`
- **Method:** `GET`
- **Authentication:** None
- **Response (200 OK):** `ok`

---

### 2. Log a Single Decision (`POST /log`)
- **URL:** `/log`
- **Method:** `POST`
- **Authentication:** Optional / Required if `API_KEY` set

#### Request Body
```json
{
  "agent_id": "agent-alpha",
  "session_id": "sess-9821",
  "tool_name": "web_search",
  "input": { "query": "latest AI research" },
  "output": { "results": ["paper1"] },
  "reasoning": "Searching for context",
  "result_status": "success",
  "duration_ms": 240
}
```

#### Response (201 Created)
```json
{
  "id": "c1f7b8d0-23a9-450a-9d22-123456789abc",
  "timestamp": "2026-07-31T21:00:00.000Z"
}
```

---

### 3. Log Batch Decisions (`POST /log/batch`)

High-throughput endpoint to insert multiple tool call decisions in a single HTTP request.

- **URL:** `/log/batch`
- **Method:** `POST`
- **Authentication:** Optional / Required if `API_KEY` set

#### Request Body
```json
{
  "entries": [
    {
      "agent_id": "agent-alpha",
      "session_id": "sess-9821",
      "tool_name": "fetch_url",
      "result_status": "success",
      "duration_ms": 40
    },
    {
      "agent_id": "agent-alpha",
      "session_id": "sess-9821",
      "tool_name": "parse_html",
      "result_status": "success",
      "duration_ms": 12
    }
  ]
}
```

#### Response (201 Created)
```json
{
  "count": 2
}
```

---

### 4. Query Decision Logs (`GET /logs`)
- **URL:** `/logs`
- **Method:** `GET`
- **Query Params:** `agent_id`, `session_id`, `tool_name`, `result_status`, `since`, `until`, `limit`, `offset`.

---

### 5. Get Entry Count (`GET /count`)
- **URL:** `/count`
- **Method:** `GET`
- **Query Params:** `agent_id`

---

### 6. Behavioral Alerts (`GET /alerts`)
- **URL:** `/alerts`
- **Method:** `GET`
- **Query Params:** `agent_id`

---

## Code Examples

### cURL (Single & Batch Logging with Auth)

```bash
# Log a decision
curl -X POST http://localhost:8787/log \
  -H "Authorization: Bearer secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-agent",
    "session_id": "sess-1",
    "tool_name": "search_web",
    "result_status": "success"
  }'

# Batch log decisions
curl -X POST http://localhost:8787/log/batch \
  -H "x-api-key: secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      { "agent_id": "my-agent", "session_id": "sess-1", "tool_name": "tool_a", "result_status": "success" },
      { "agent_id": "my-agent", "session_id": "sess-1", "tool_name": "tool_b", "result_status": "success" }
    ]
  }'
```

### TypeScript SDK Batch Usage

```typescript
import { DecisionLogClient } from "agent-decision-log";

const client = new DecisionLogClient("http://localhost:8787", "secret-key");

// Batch log decisions
const res = await client.logBatch([
  { agent_id: "agent-1", session_id: "sess-1", tool_name: "tool1", result_status: "success" },
  { agent_id: "agent-1", session_id: "sess-1", tool_name: "tool2", result_status: "success" }
]);

console.log("Inserted count:", res.count);
```
