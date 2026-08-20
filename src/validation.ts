import { z } from "zod";
import type { LogEntry, LogQuery } from "./types.js";

export const MAX_BATCH_ENTRIES = 100;
export const MAX_JSON_FIELD_BYTES = 32 * 1024;
export const MAX_REASONING_CHARS = 8_192;
export const MAX_METADATA_BYTES = 16 * 1024;

const identifier = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:@/-]+$/, "Invalid identifier format.");
const traceIdentifier = z.string().trim().regex(/^trc_[A-Za-z0-9_-]{12,128}$/, "Invalid trace ID.");
const status = z.enum(["success", "error", "timeout"]);
const duration = z.number().finite().min(0).max(86_400_000);
const optionalReasoning = z.string().max(MAX_REASONING_CHARS).nullable().optional();
const arbitraryObject = z.record(z.string(), z.unknown()).default({});

const incomingEntry = z.object({
  agent_id: identifier,
  session_id: identifier,
  trace_id: traceIdentifier.nullable().optional(),
  tool_name: identifier,
  input: z.unknown().nullable().optional(),
  output: z.unknown().nullable().optional(),
  reasoning: optionalReasoning,
  result_status: status,
  duration_ms: duration.optional().default(0),
  metadata: arbitraryObject,
}).strict();

const sensitiveKey = /(api[-_]?key|authorization|token|password|secret|cookie|private[-_]?key|credential)/i;
const textEncoder = new TextEncoder();

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function byteLength(value: unknown): number {
  try {
    return textEncoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    throw new ValidationError("Value must be JSON-serializable.");
  }
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[TRUNCATED_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const safe: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      safe[key] = sensitiveKey.test(key) ? "[REDACTED]" : redact(child, depth + 1);
    }
    return safe;
  }
  if (typeof value === "string" && value.length > 8_192) return `${value.slice(0, 8_192)}[TRUNCATED]`;
  return value;
}

function redactAndBound(value: unknown, maximumBytes: number, field: string): unknown {
  const safe = redact(value);
  if (byteLength(safe) > maximumBytes) {
    throw new ValidationError(`${field} exceeds the ${maximumBytes}-byte limit after redaction.`);
  }
  return safe;
}

export function parseEntry(payload: unknown, timestamp = new Date().toISOString()): LogEntry {
  const parsed = incomingEntry.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(`Invalid log entry: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }

  return {
    id: crypto.randomUUID(),
    agent_id: parsed.data.agent_id,
    session_id: parsed.data.session_id,
    trace_id: parsed.data.trace_id ?? null,
    timestamp,
    tool_name: parsed.data.tool_name,
    input: redactAndBound(parsed.data.input ?? null, MAX_JSON_FIELD_BYTES, "input"),
    output: redactAndBound(parsed.data.output ?? null, MAX_JSON_FIELD_BYTES, "output"),
    reasoning: parsed.data.reasoning ?? null,
    result_status: parsed.data.result_status,
    duration_ms: parsed.data.duration_ms,
    metadata: redactAndBound(parsed.data.metadata, MAX_METADATA_BYTES, "metadata") as Record<string, unknown>,
  };
}

export function parseBatch(payload: unknown): LogEntry[] {
  const parsed = z.object({ entries: z.array(z.unknown()).min(1).max(MAX_BATCH_ENTRIES) }).strict().safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(`Invalid batch: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  return parsed.data.entries.map((entry) => parseEntry(entry));
}

function dateOrUndefined(value: string | undefined, name: string): string | undefined {
  if (!value) return undefined;
  if (Number.isNaN(Date.parse(value))) throw new ValidationError(`${name} must be an ISO-8601 timestamp.`);
  return value;
}

export function parseQuery(params: Record<string, string | undefined>): LogQuery {
  const limit = params.limit === undefined ? 100 : Number(params.limit);
  const offset = params.offset === undefined ? 0 : Number(params.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ValidationError("limit must be an integer from 1 to 100.");
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw new ValidationError("offset must be an integer from 0 to 100000.");

  const resultStatus = params.result_status;
  if (resultStatus && !status.safeParse(resultStatus).success) {
    throw new ValidationError("result_status must be success, error, or timeout.");
  }

  const optionalIdentifier = (value: string | undefined, name: string): string | undefined => {
    if (!value) return undefined;
    const result = identifier.safeParse(value);
    if (!result.success) throw new ValidationError(`${name} is invalid.`);
    return result.data;
  };

  return {
    agent_id: optionalIdentifier(params.agent_id, "agent_id"),
    session_id: optionalIdentifier(params.session_id, "session_id"),
    trace_id: params.trace_id ? (() => { const result = traceIdentifier.safeParse(params.trace_id); if (!result.success) throw new ValidationError("trace_id is invalid."); return result.data; })() : undefined,
    tool_name: optionalIdentifier(params.tool_name, "tool_name"),
    result_status: resultStatus,
    since: dateOrUndefined(params.since, "since"),
    until: dateOrUndefined(params.until, "until"),
    limit,
    offset,
  };
}

export function parseOptionalJson(value: string | undefined, field: "input" | "output"): unknown {
  if (!value) return null;
  if (textEncoder.encode(value).byteLength > MAX_JSON_FIELD_BYTES) {
    throw new ValidationError(`${field} exceeds the ${MAX_JSON_FIELD_BYTES}-byte limit.`);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new ValidationError(`${field} must be valid JSON.`);
  }
}
