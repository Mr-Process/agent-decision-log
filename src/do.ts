import type { LogEntry, LogQuery } from "./types.js";

// Fallback base class for Node.js test runner where 'cloudflare:workers' virtual module is not native
class BaseDurableObject {
  ctx: any;
  env: any;
  constructor(ctx?: any, env?: any) {
    this.ctx = ctx;
    this.env = env;
  }
}

let TargetDurableObject = BaseDurableObject;
try {
  // @ts-ignore
  const cf = await import("cloudflare:workers");
  if (cf && cf.DurableObject) {
    TargetDurableObject = cf.DurableObject as any;
  }
} catch {
  // Fallback to BaseDurableObject in Node.js test environment
}

export class DecisionLogDO extends TargetDurableObject {
  private initialized = false;

  private getSql() {
    const storage = (this as any).ctx?.storage as any;
    return storage?.sql || storage;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const sql = this.getSql();
    if (!sql) return;
    await sql.exec(
      `CREATE TABLE IF NOT EXISTS log_entries (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input TEXT,
        output TEXT,
        reasoning TEXT,
        result_status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        metadata TEXT
      )`
    );
    await sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_agent ON log_entries(agent_id)`
    );
    await sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_session ON log_entries(session_id)`
    );
    await sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_timestamp ON log_entries(timestamp)`
    );
    await sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_tool ON log_entries(tool_name)`
    );
    this.initialized = true;
  }

  async insert(entry: LogEntry): Promise<void> {
    await this.init();
    const sql = this.getSql();
    if (!sql) return;
    await sql.exec(
      `INSERT INTO log_entries (id, agent_id, session_id, timestamp, tool_name, input, output, reasoning, result_status, duration_ms, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.agent_id,
      entry.session_id,
      entry.timestamp,
      entry.tool_name,
      JSON.stringify(entry.input),
      JSON.stringify(entry.output),
      entry.reasoning,
      entry.result_status,
      entry.duration_ms,
      JSON.stringify(entry.metadata)
    );
  }

  async insertBatch(entries: LogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.init();
    const sql = this.getSql();
    if (!sql) return;
    for (const entry of entries) {
      await sql.exec(
        `INSERT INTO log_entries (id, agent_id, session_id, timestamp, tool_name, input, output, reasoning, result_status, duration_ms, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entry.id,
        entry.agent_id,
        entry.session_id,
        entry.timestamp,
        entry.tool_name,
        JSON.stringify(entry.input),
        JSON.stringify(entry.output),
        entry.reasoning,
        entry.result_status,
        entry.duration_ms,
        JSON.stringify(entry.metadata)
      );
    }
  }

  async query(q: LogQuery): Promise<LogEntry[]> {
    await this.init();
    const sql = this.getSql();
    if (!sql) return [];
    let queryStr = "SELECT * FROM log_entries WHERE 1=1";
    const params: unknown[] = [];

    if (q.agent_id) { queryStr += " AND agent_id = ?"; params.push(q.agent_id); }
    if (q.session_id) { queryStr += " AND session_id = ?"; params.push(q.session_id); }
    if (q.tool_name) { queryStr += " AND tool_name = ?"; params.push(q.tool_name); }
    if (q.result_status) { queryStr += " AND result_status = ?"; params.push(q.result_status); }
    if (q.since) { queryStr += " AND timestamp >= ?"; params.push(q.since); }
    if (q.until) { queryStr += " AND timestamp <= ?"; params.push(q.until); }

    queryStr += " ORDER BY timestamp DESC";
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;
    queryStr += ` LIMIT ${limit} OFFSET ${offset}`;

    const result = await sql.exec(queryStr, ...params);
    const rows: LogEntry[] = [];
    for (const row of result) {
      const r = row as Record<string, unknown>;
      rows.push({
        id: r.id as string,
        agent_id: r.agent_id as string,
        session_id: r.session_id as string,
        timestamp: r.timestamp as string,
        tool_name: r.tool_name as string,
        input: r.input ? JSON.parse(r.input as string) : null,
        output: r.output ? JSON.parse(r.output as string) : null,
        reasoning: r.reasoning as string | null,
        result_status: r.result_status as LogEntry["result_status"],
        duration_ms: r.duration_ms as number,
        metadata: r.metadata ? JSON.parse(r.metadata as string) : {},
      });
    }
    return rows;
  }

  async count(agent_id?: string): Promise<number> {
    await this.init();
    const sql = this.getSql();
    if (!sql) return 0;
    let queryStr = "SELECT COUNT(*) as count FROM log_entries";
    const params: unknown[] = [];
    if (agent_id) { queryStr += " WHERE agent_id = ?"; params.push(agent_id); }
    const result = await sql.exec(queryStr, ...params);
    const rows = Array.from(result);
    const row = (rows[0] ?? { count: 0 }) as Record<string, unknown>;
    return Number(row.count);
  }

  async deleteBefore(timestamp: string): Promise<number> {
    await this.init();
    const sql = this.getSql();
    if (!sql) return 0;
    const result = await sql.exec(
      "DELETE FROM log_entries WHERE timestamp < ?",
      timestamp
    );
    return result.meta?.changes ?? 0;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/insert" && request.method === "POST") {
      const entry = (await request.json()) as LogEntry;
      await this.insert(entry);
      return new Response("ok", { status: 201 });
    }

    if (url.pathname === "/insert-batch" && request.method === "POST") {
      const entries = (await request.json()) as LogEntry[];
      await this.insertBatch(entries);
      return new Response("ok", { status: 201 });
    }

    if (url.pathname === "/delete-before" && request.method === "POST") {
      const { timestamp } = (await request.json()) as { timestamp: string };
      const count = await this.deleteBefore(timestamp);
      return Response.json({ deleted: count });
    }

    if (url.pathname === "/query") {
      const params = url.searchParams;
      const q: LogQuery = {
        agent_id: params.get("agent_id") || undefined,
        session_id: params.get("session_id") || undefined,
        tool_name: params.get("tool_name") || undefined,
        result_status: params.get("result_status") || undefined,
        since: params.get("since") || undefined,
        until: params.get("until") || undefined,
        limit: params.get("limit") ? parseInt(params.get("limit")!, 10) : undefined,
        offset: params.get("offset") ? parseInt(params.get("offset")!, 10) : undefined,
      };
      const rows = await this.query(q);
      return Response.json(rows);
    }

    if (url.pathname === "/count") {
      const params = url.searchParams;
      const agent_id = params.get("agent_id") || undefined;
      const n = await this.count(agent_id);
      return Response.json(n);
    }

    return new Response("Not found", { status: 404 });
  }
}
