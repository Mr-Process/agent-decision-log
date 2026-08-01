import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "./worker.js";

// Fallback base class for Node.js test runner environment
class BaseMcpAgent<T = any> {
  env: T;
  constructor(env?: T) {
    this.env = env as any;
  }
}

let TargetMcpAgent = BaseMcpAgent;
try {
  // @ts-ignore
  const agentsModule = await import("agents/mcp");
  if (agentsModule && agentsModule.McpAgent) {
    TargetMcpAgent = agentsModule.McpAgent as any;
  }
} catch {
  // Fallback in Node test runner env
}

const LogDecisionSchema = {
  agent_id: z.string().describe("Unique identifier for the agent"),
  session_id: z.string().describe("Session identifier"),
  tool_name: z.string().describe("Name of the tool that was called"),
  input: z.string().optional().describe("JSON string of the tool input"),
  output: z.string().optional().describe("JSON string of the tool output"),
  reasoning: z.string().optional().describe("Agent's reasoning for the call"),
  result_status: z.enum(["success", "error", "timeout"]).describe("Outcome of the tool call"),
  duration_ms: z.number().optional().describe("Duration in milliseconds"),
};

const QueryLogsSchema = {
  agent_id: z.string().optional().describe("Filter by agent"),
  session_id: z.string().optional().describe("Filter by session"),
  tool_name: z.string().optional().describe("Filter by tool name"),
  result_status: z.string().optional().describe("Filter by status"),
  limit: z.number().optional().describe("Max results (default 100)"),
};

export class DecisionLogMCP extends TargetMcpAgent {
  server = new McpServer({
    name: "agent-decision-log",
    version: "0.1.0",
  });

  async init() {
    this.server.tool(
      "log_decision",
      "Log a tool call decision made by an AI agent. Call this after every tool invocation.",
      LogDecisionSchema,
      async (args: any) => {
        const doId = (this as any).env.DECISION_LOG.idFromName(args.agent_id);
        const stub = (this as any).env.DECISION_LOG.get(doId);
        const entry = {
          id: crypto.randomUUID(),
          agent_id: args.agent_id,
          session_id: args.session_id,
          timestamp: new Date().toISOString(),
          tool_name: args.tool_name,
          input: args.input ? JSON.parse(args.input) : null,
          output: args.output ? JSON.parse(args.output) : null,
          reasoning: args.reasoning ?? null,
          result_status: args.result_status,
          duration_ms: args.duration_ms ?? 0,
          metadata: {},
        };
        await stub.fetch("https://do/insert", {
          method: "POST",
          body: JSON.stringify(entry),
          headers: { "Content-Type": "application/json" },
        });
        return {
          content: [{ type: "text" as const, text: `Logged: ${entry.id} at ${entry.timestamp}` }],
        };
      }
    );

    this.server.tool(
      "query_logs",
      "Query the decision log. Returns recent entries matching the filters.",
      QueryLogsSchema,
      async (args: any) => {
        const doName = args.agent_id || "global";
        const doId = (this as any).env.DECISION_LOG.idFromName(doName);
        const stub = (this as any).env.DECISION_LOG.get(doId);
        const params = new URLSearchParams();
        if (args.agent_id) params.set("agent_id", args.agent_id);
        if (args.session_id) params.set("session_id", args.session_id);
        if (args.tool_name) params.set("tool_name", args.tool_name);
        if (args.result_status) params.set("result_status", args.result_status);
        if (args.limit) params.set("limit", String(args.limit));
        const res = await stub.fetch(`https://do/query?${params}`);
        const logs = await res.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(logs, null, 2) }],
        };
      }
    );
  }
}
