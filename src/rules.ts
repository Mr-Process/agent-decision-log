import type { LogEntry, Rule, Alert } from "./types.js";

export function defaultRules(): Rule[] {
  return [
    {
      id: "rapid_calls",
      name: "Rapid Tool Calls",
      description: "Agent calls tools more than 20 times in 60 seconds",
      pattern: { metric: "call_count", window_ms: 60000, threshold: 20, operator: ">" },
      severity: "warning",
      message: "Agent is calling tools rapidly: {{count}} calls in {{window_s}}s",
    },
    {
      id: "high_error_rate",
      name: "High Error Rate",
      description: "Error rate exceeds 50% in a 5-minute window",
      pattern: { metric: "error_rate", window_ms: 300000, threshold: 50, operator: ">" },
      severity: "critical",
      message: "Error rate {{rate}}% in the last {{window_s}}s exceeds 50%",
    },
    {
      id: "slow_calls",
      name: "Slow Tool Calls",
      description: "Average tool duration exceeds 10 seconds",
      pattern: { metric: "duration", window_ms: 300000, threshold: 10000, operator: ">" },
      severity: "info",
      message: "Average duration {{avg_ms}}ms exceeds 10s",
    },
  ];
}

export function evaluateRules(entries: LogEntry[], rules: Rule[]): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();
  const parsedEntries = entries.map((e) => ({
    entry: e,
    time: new Date(e.timestamp).getTime()
  }));

  for (const rule of rules) {
    const windowStart = now - rule.pattern.window_ms;
    const windowEntries = parsedEntries
      .filter((pe) => pe.time >= windowStart)
      .map((pe) => pe.entry);

    if (windowEntries.length === 0) continue;

    switch (rule.pattern.metric) {
      case "call_count": {
        const count = windowEntries.length;
        if (compare(count, rule.pattern.operator, rule.pattern.threshold)) {
          alerts.push(makeAlert(rule, entries[0].agent_id, {
            count,
            window_s: rule.pattern.window_ms / 1000,
          }));
        }
        break;
      }
      case "error_rate": {
        const errors = windowEntries.filter((e) => e.result_status === "error").length;
        const rate = (errors / windowEntries.length) * 100;
        if (compare(rate, rule.pattern.operator, rule.pattern.threshold)) {
          alerts.push(makeAlert(rule, entries[0].agent_id, {
            rate: rate.toFixed(1),
            window_s: rule.pattern.window_ms / 1000,
          }));
        }
        break;
      }
      case "duration": {
        const avg = windowEntries.reduce((sum, e) => sum + e.duration_ms, 0) / windowEntries.length;
        if (compare(avg, rule.pattern.operator, rule.pattern.threshold)) {
          alerts.push(makeAlert(rule, entries[0].agent_id, {
            avg_ms: Math.round(avg),
          }));
        }
        break;
      }
      case "tool_sequence": {
        // Future: detect suspicious tool sequences
        break;
      }
    }
  }

  return alerts;
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case ">": return a > b;
    case "<": return a < b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    case "==": return a === b;
    default: return false;
  }
}

function makeAlert(rule: Rule, agent_id: string, context: Record<string, unknown>): Alert {
  let message = rule.message;
  for (const [k, v] of Object.entries(context)) {
    message = message.replace(`{{${k}}}`, String(v));
  }
  return {
    rule_id: rule.id,
    rule_name: rule.name,
    severity: rule.severity,
    message,
    agent_id,
    timestamp: new Date().toISOString(),
    context,
  };
}
