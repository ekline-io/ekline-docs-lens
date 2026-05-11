import { auditedFetch, header } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

export async function checkA2AAgentCard(baseUrl: string): Promise<CheckResult> {
  const origin = new URL(baseUrl).origin;
  const audit: AuditEntry[] = [];
  const url = `${origin}/.well-known/agent-card.json`;
  const res = await auditedFetch(url, audit, { note: "probe A2A agent card" });

  if (!res || res.statusCode !== 200) {
    const status = audit[audit.length - 1]?.status ?? 0;
    const inconclusive = status === 0;
    return {
      id: "a2a-agent-card",
      category: "capability-discovery",
      severity: "info",
      title: inconclusive
        ? "A2A agent card probe was inconclusive"
        : "No A2A agent card",
      message: inconclusive
        ? "We couldn't reach the well-known endpoint from here."
        : "/.well-known/agent-card.json is not published. Optional — required only if your product itself acts as an agent that other agents should be able to invoke.",
      fix: "If your product is a callable agent, publish /.well-known/agent-card.json describing your name, description, capabilities, and invocation endpoint. The A2A spec covers the schema.",
      source: "Agent-to-Agent (A2A) discovery",
      impl: "src/lib/checks/a2a.ts",
      audit,
      conclusion: inconclusive
        ? "A2A probe failed (no response)"
        : `A2A agent card not published (HTTP ${status})`,
    };
  }

  const ct = header(res.headers, "content-type") ?? "";
  let parsed: { name?: unknown; capabilities?: unknown } | null = null;
  try {
    const json = JSON.parse(res.body) as { name?: unknown; capabilities?: unknown };
    parsed = json;
  } catch {
    // not JSON
  }
  const hasName = parsed && typeof parsed.name === "string";
  const valid = !!parsed && hasName;

  return {
    id: "a2a-agent-card",
    category: "capability-discovery",
    severity: valid ? "pass" : "warn",
    title: valid
      ? "You publish an A2A agent card"
      : "A2A agent card present but malformed",
    message: valid
      ? `Other agents can discover your service as an agent and find its capabilities programmatically.`
      : `Server returned 200 for the card but the body doesn't have the expected shape (content-type: ${ct || "—"}). At minimum the card needs a "name" string field.`,
    fix: valid
      ? undefined
      : "Serve the card as `application/json` with at least `name`, `description`, and `capabilities` fields per the A2A spec.",
    source: "Agent-to-Agent (A2A) discovery",
    impl: "src/lib/checks/a2a.ts",
    audit,
    conclusion: valid
      ? "A2A agent card present and well-formed"
      : "A2A agent card present but missing required fields",
  };
}
