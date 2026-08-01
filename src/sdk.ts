export class DecisionLogClient {
  constructor(private baseUrl: string, private apiKey?: string) {}

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async log(params: {
    agent_id: string;
    session_id: string;
    tool_name: string;
    input?: unknown;
    output?: unknown;
    reasoning?: string;
    result_status: "success" | "error" | "timeout";
    duration_ms?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; timestamp: string }> {
    const res = await fetch(`${this.baseUrl}/log`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(`Log failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async logBatch(
    entries: Array<{
      agent_id: string;
      session_id: string;
      tool_name: string;
      input?: unknown;
      output?: unknown;
      reasoning?: string;
      result_status: "success" | "error" | "timeout";
      duration_ms?: number;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<{ count: number }> {
    const res = await fetch(`${this.baseUrl}/log/batch`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) {
      throw new Error(`Batch log failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async query(queryParams: {
    agent_id?: string;
    session_id?: string;
    tool_name?: string;
    result_status?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: unknown[] }> {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined) searchParams.set(k, String(v));
    }
    const res = await fetch(`${this.baseUrl}/logs?${searchParams}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Query failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async count(agent_id?: string): Promise<number> {
    const res = await fetch(
      `${this.baseUrl}/count${agent_id ? `?agent_id=${agent_id}` : ""}`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) {
      throw new Error(`Count failed: ${res.status}`);
    }
    const data = (await res.json()) as { count: number };
    return data.count;
  }
}
