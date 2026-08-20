import { app } from "../src/worker.js";
import type { LogEntry } from "../src/types.js";
import { assertEqual, assertTrue } from "./assert.js";

class MockStorage {
  private logs: LogEntry[] = [];

  async insert(entry: LogEntry) {
    this.logs.push(entry);
  }

  async query(q: any) {
    let res = [...this.logs];
    if (q.agent_id) res = res.filter((l) => l.agent_id === q.agent_id);
    if (q.session_id) res = res.filter((l) => l.session_id === q.session_id);
    if (q.tool_name) res = res.filter((l) => l.tool_name === q.tool_name);
    if (q.result_status) res = res.filter((l) => l.result_status === q.result_status);
    return res;
  }

  async count(agent_id?: string) {
    if (agent_id) return this.logs.filter((l) => l.agent_id === agent_id).length;
    return this.logs.length;
  }

  async deleteBefore(timestamp: string) {
    const before = this.logs.length;
    this.logs = this.logs.filter((l) => l.timestamp >= timestamp);
    return before - this.logs.length;
  }
}

class MockDOStub {
  private agents = new Set<string>();
  constructor(private storage: MockStorage) {}

  async fetch(urlStr: string | Request, init?: RequestInit) {
    const url = new URL(typeof urlStr === "string" ? urlStr : urlStr.url);
    if (url.pathname === "/register-agent") {
      const body = JSON.parse(init?.body as string);
      this.agents.add(body.agent_id);
      return new Response("ok", { status: 201 });
    }
    if (url.pathname === "/list-agents") {
      return Response.json(Array.from(this.agents));
    }
    if (url.pathname === "/insert") {
      const body = JSON.parse(init?.body as string);
      await this.storage.insert(body);
      return new Response("ok", { status: 201 });
    }
    if (url.pathname === "/insert-batch") {
      const body = JSON.parse(init?.body as string);
      for (const entry of body) {
        await this.storage.insert(entry);
      }
      return new Response("ok", { status: 201 });
    }
    if (url.pathname === "/delete-before") {
      const { timestamp } = JSON.parse(init?.body as string);
      const count = await this.storage.deleteBefore(timestamp);
      return Response.json({ deleted: count });
    }
    if (url.pathname === "/query") {
      const q = {
        agent_id: url.searchParams.get("agent_id") || undefined,
        session_id: url.searchParams.get("session_id") || undefined,
        tool_name: url.searchParams.get("tool_name") || undefined,
        result_status: url.searchParams.get("result_status") || undefined,
      };
      const rows = await this.storage.query(q);
      return Response.json(rows);
    }
    if (url.pathname === "/count") {
      const agent_id = url.searchParams.get("agent_id") || undefined;
      const count = await this.storage.count(agent_id);
      return Response.json(count);
    }
    return new Response("Not found", { status: 404 });
  }
}

export async function runApiE2ETests() {
  console.log("\n▶ Running API & Performance E2E Tests...");

  const storage = new MockStorage();
  const mockStub = new MockDOStub(storage);
  const env = {
    DECISION_LOG: {
      idFromName: () => ({ toString: () => "mock-id" }),
      get: () => mockStub,
    } as any,
    API_KEY: "secret-test-key",
  };

  // 1. Health Check (Public - no auth required)
  const healthRes = await app.request("/health", {}, env);
  assertEqual(healthRes.status, 200, "Health check status 200");
  const healthText = await healthRes.text();
  assertEqual(healthText, "ok", "Health check text 'ok'");

  // 2. Authentication Protection Check (401 without key)
  const unauthRes = await app.request(
    "/log",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: "agent-1" }),
    },
    env
  );
  assertEqual(unauthRes.status, 401, "Protected route returns 401 Unauthorized without API key");

  // 3. Log Validation Error (With valid auth key)
  const invalidLogRes = await app.request(
    "/log",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer secret-test-key",
      },
      body: JSON.stringify({ agent_id: "agent-1" }),
    },
    env
  );
  assertEqual(invalidLogRes.status, 400, "Missing required fields returns status 400");

  // 4. Log Successful Decision
  const logRes = await app.request(
    "/log",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer secret-test-key",
      },
      body: JSON.stringify({
        agent_id: "agent-1",
        session_id: "sess-100",
        tool_name: "search_web",
        input: { query: "e2e testing" },
        output: { results: ["test1"] },
        reasoning: "Executing E2E test search",
        result_status: "success",
        duration_ms: 120,
      }),
    },
    env
  );
  assertEqual(logRes.status, 201, "Log decision returns status 201");
  const logData = (await logRes.json()) as any;
  assertTrue(!!logData.id, "Log response contains entry ID");
  assertTrue(!!logData.timestamp, "Log response contains timestamp");

  // 5. Batch Logging E2E (POST /log/batch)
  const batchRes = await app.request(
    "/log/batch",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "secret-test-key",
      },
      body: JSON.stringify({
        entries: [
          {
            agent_id: "batch-agent",
            session_id: "sess-batch-1",
            tool_name: "calc",
            result_status: "success",
            duration_ms: 5,
          },
          {
            agent_id: "batch-agent",
            session_id: "sess-batch-1",
            tool_name: "fetch",
            result_status: "success",
            duration_ms: 45,
          },
        ],
      }),
    },
    env
  );
  assertEqual(batchRes.status, 201, "Batch logging returns status 201");
  const batchData = (await batchRes.json()) as any;
  assertEqual(batchData.count, 2, "Batch logging inserts 2 entries");

  // 6. Query Logs
  const queryRes = await app.request(
    "/logs?agent_id=agent-1",
    { headers: { "Authorization": "Bearer secret-test-key" } },
    env
  );
  assertEqual(queryRes.status, 200, "Query logs returns status 200");
  const queryData = (await queryRes.json()) as any;
  assertEqual(queryData.logs.length, 1, "Query returns 1 log entry");

  // 7. Count Logs
  const countRes = await app.request(
    "/count?agent_id=batch-agent",
    { headers: { "Authorization": "Bearer secret-test-key" } },
    env
  );
  assertEqual(countRes.status, 200, "Count endpoint returns status 200");
  const countData = (await countRes.json()) as any;
  assertEqual(countData.count, 2, "Batch log count matches expected 2");

  // 8. Rapid Calls Alert Generation
  for (let i = 0; i < 22; i++) {
    await app.request(
      "/log",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer secret-test-key",
        },
        body: JSON.stringify({
          agent_id: "stress-agent",
          session_id: `sess-${i}`,
          tool_name: "quick_tool",
          result_status: "success",
          duration_ms: 10,
        }),
      },
      env
    );
  }

  const alertRes = await app.request(
    "/alerts?agent_id=stress-agent",
    { headers: { "Authorization": "Bearer secret-test-key" } },
    env
  );
  assertEqual(alertRes.status, 200, "Alerts endpoint returns status 200");
  const alertData = (await alertRes.json()) as any;
  assertTrue(alertData.alerts.length > 0, "Rapid calls trigger active alerts");
  assertEqual(alertData.alerts[0].rule_id, "rapid_calls", "Alert rule ID is rapid_calls");

  console.log("✅ API & Performance E2E Tests Passed successfully!\n");
}
