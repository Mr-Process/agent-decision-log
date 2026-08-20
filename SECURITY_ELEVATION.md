# Agent Decision Log Security and Reliability Elevation

This change set hardens the decision-log service at its HTTP, browser, MCP, Durable Object, and scheduled-retention boundaries. No deployment or remote repository change has been made.

## Changes Applied

| Area | Previous behavior | Elevated behavior |
|---|---|---|
| Authentication | Data routes were unauthenticated whenever `API_KEY` was absent; `/mcp` was public. | Every data and MCP route now fails closed with `503` if `API_KEY` is not configured and returns `401` for invalid credentials. |
| CORS | `cors()` admitted every origin. | CORS returns an allowed origin only when it exactly matches `ALLOWED_ORIGINS`. |
| Dashboard rendering | Stored log fields were interpolated into `innerHTML`. | The dashboard creates cells with `textContent` and never interpolates log content into markup or attributes. |
| Log ingestion | HTTP and MCP accepted broad unbounded fields with inconsistent validation. | A shared validation module enforces identifier, enum, type, duration, batch-count, field-size, and pagination limits. |
| Sensitive data | Inputs, outputs, and metadata were persisted unchanged. | Recognized credential-like keys are redacted before storage; objects, arrays, depth, strings, and serialized size are bounded. |
| Query semantics | An omitted `agent_id` queried a `global` shard that was not populated by agent writes. | Query, count, and alert routes require an explicit agent ID and operate on that one isolated shard. |
| Retention | The scheduled job pruned only the `global` shard. | Every successful write registers its agent; the scheduled job retrieves this registry and prunes all registered shards with per-shard failure isolation. |
| MCP tools | MCP logging parsed JSON directly and allowed unbounded queries. | MCP calls use the same redaction/validation and required-agent-shard semantics as HTTP routes. |

## Required Deployment Configuration

| Configuration | Requirement |
|---|---|
| `API_KEY` | Required secret. Deploying without it leaves data and MCP routes deliberately unavailable. |
| `ALLOWED_ORIGINS` | Optional comma-separated exact browser origins. Leave unset to disable cross-origin browser access. |
| Cron schedule | Retain the daily schedule in `wrangler.jsonc`; its registry-backed behavior becomes effective as new agent writes register their shards. |

## Operational Notes

The embedded dashboard now prompts once per browser session for the API key and keeps it in session storage to send an `X-API-Key` header. This is an interim single-operator pattern. A multi-user deployment should replace it with a proper authenticated session mechanism rather than sharing one API key among users.

Retention can enumerate only agent IDs registered after this change is deployed. For pre-existing shards, perform a one-time migration that supplies their known IDs to the registry or invoke retention directly on the historic shard names.

Cross-agent aggregate queries are intentionally not provided in this elevation. The old fallback did not aggregate all agent shards; it returned only the separate `global` shard. A correct aggregate search requires a dedicated index or analytics pipeline with an explicit authorization model.

## Validation Performed

The full project passed strict TypeScript compilation. The existing API, dashboard, SDK, and performance E2E suite passed after its Durable Object mock was extended to support agent registration. The focused validation test also passed, verifying credential-key redaction, malformed identifier rejection, empty batch rejection, and bounded query pagination.

## Recommended Post-Deploy Checks

1. Confirm `/log` and `/mcp` return `503` when `API_KEY` is absent, then `401` for missing or invalid credentials after it is configured.
2. Verify `POST /log` redacts representative fields such as `authorization`, `api_key`, `token`, and nested secrets before storage.
3. Confirm a stored value that looks like HTML renders as literal text in the dashboard.
4. Write at least two agent IDs, run the scheduled retention handler in a staging environment, and verify both shards receive the deletion request.
5. Confirm `GET /logs`, `GET /count`, and `GET /alerts` reject a missing `agent_id` and observe only the requested agent’s data when supplied.
