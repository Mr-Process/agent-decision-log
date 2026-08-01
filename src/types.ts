export interface LogEntry {
  id: string;
  agent_id: string;
  session_id: string;
  timestamp: string;
  tool_name: string;
  input: unknown;
  output: unknown;
  reasoning: string | null;
  result_status: "success" | "error" | "timeout";
  duration_ms: number;
  metadata: Record<string, unknown>;
}

export interface LogQuery {
  agent_id?: string;
  session_id?: string;
  tool_name?: string;
  result_status?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  pattern: {
    metric: "call_count" | "error_rate" | "duration" | "tool_sequence";
    window_ms: number;
    threshold: number;
    operator: ">" | "<" | ">=" | "<=" | "==";
  };
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface Alert {
  rule_id: string;
  rule_name: string;
  severity: "info" | "warning" | "critical";
  message: string;
  agent_id: string;
  timestamp: string;
  context: Record<string, unknown>;
}
