import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "./worker.js";
import { parseEntry, parseOptionalJson, parseQuery, ValidationError } from "./validation.js";

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

const identifier = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:@/-]+$/);
const LogDecisionSchema = {
  agent_id: identifier.describe("Unique identifier for the agent"),
  session_id: identifier.describe("Session identifier"),
  tool_name: identifier.describe("Name of the tool that was called"),
  input: z.string().max(32 * 1024).optional().describe("JSON string of the tool input"),
  output: z.string().max(32 * 1024).optional().describe("JSON string of the tool output"),
  reasoning: z.string().max(8_192).optional().describe("Agent's reasoning for the call"),
  result_status: z.enum(["success", "error", "timeout"]).describe("Outcome of the tool call"),
  duration_ms: z.number().finite().min(0).max(86_400_000).optional().describe("Duration in milliseconds"),
};

const QueryLogsSchema = {
  agent_id: identifier.describe("Agent shard to query"),
  session_id: identifier.optional().describe("Filter by session"),
  tool_name: identifier.optional().describe("Filter by tool name"),
  result_status: z.enum(["success", "error", "timeout"]).optional().describe("Filter by status"),
  limit: z.number().int().min(1).max(100).optional().describe("Max results (default 100)"),
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
        try {
          const env = (this as any).env as Env;
          const entry = parseEntry({
            ...args,
            input: parseOptionalJson(args.input, "input"),
            output: parseOptionalJson(args.output, "output"),
            metadata: {},
          });
          const shard = env.DECISION_LOG.get(env.DECISION_LOG.idFromName(entry.agent_id));
          const response = await shard.fetch("https://do/insert", {
            method: "POST",
            body: JSON.stringify(entry),
            headers: { "Content-Type": "application/json" },
          });
          if (!response.ok) throw new Error("The log shard rejected the entry.");
          const registry = env.DECISION_LOG.get(env.DECISION_LOG.idFromName("__agent_registry__"));
          await registry.fetch("https://do/register-agent", {
            method: "POST",
            body: JSON.stringify({ agent_id: entry.agent_id }),
            headers: { "Content-Type": "application/json" },
          });
          return { content: [{ type: "text" as const, text: `Logged: ${entry.id} at ${entry.timestamp}` }] };
        } catch (error) {
          const message = error instanceof ValidationError ? error.message : "Unable to persist decision log entry.";
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      }
    );

    this.server.tool(
      "query_logs",
      "Query the decision log. Returns recent entries matching the filters.",
      QueryLogsSchema,
      async (args: any) => {
        try {
          const env = (this as any).env as Env;
          const query = parseQuery(args);
          if (!query.agent_id) throw new ValidationError("agent_id is required for shard-isolated queries.");
          const shard = env.DECISION_LOG.get(env.DECISION_LOG.idFromName(query.agent_id));
          const params = new URLSearchParams(
            Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]): [string, string] => [key, String(value)])
          );
          const response = await shard.fetch(`https://do/query?${params}`);
          if (!response.ok) throw new Error("The log shard query failed.");
          return { content: [{ type: "text" as const, text: JSON.stringify(await response.json(), null, 2) }] };
        } catch (error) {
          const message = error instanceof ValidationError ? error.message : "Unable to query decision logs.";
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      }
    );
  }
}
