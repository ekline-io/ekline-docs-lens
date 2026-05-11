import { auditedFetch } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

const OAUTH_DISCOVERY_PATHS = [
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
];

/**
 * Probe the two RFC-blessed OAuth/OIDC discovery paths. Either path returning
 * 200 with a JSON body that has a string `issuer` is treated as a pass.
 *
 * Most docs-only sites won't publish either, so the negative result is `info`
 * not `warn` — this is informational and only actionable for products with
 * agentic API consumers.
 */
export async function checkOAuthDiscovery(baseUrl: string): Promise<CheckResult> {
  const origin = new URL(baseUrl).origin;
  const audit: AuditEntry[] = [];
  let foundPath: string | null = null;
  let issuer: string | null = null;

  for (const path of OAUTH_DISCOVERY_PATHS) {
    const url = `${origin}${path}`;
    const res = await auditedFetch(url, audit, { note: `probe ${path}` });
    if (res && res.statusCode === 200) {
      try {
        const json = JSON.parse(res.body) as { issuer?: unknown };
        if (typeof json.issuer === "string" && json.issuer.length > 0) {
          foundPath = path;
          issuer = json.issuer;
          break;
        }
      } catch {
        // not JSON — continue trying
      }
    }
  }

  if (foundPath && issuer) {
    return {
      id: "oauth-discovery",
      category: "capability-discovery",
      severity: "pass",
      title: "Agents can authenticate against your APIs",
      message: `OAuth/OIDC discovery is published at ${foundPath} (issuer: ${issuer}). Coding agents can programmatically obtain access tokens.`,
      source: "OpenID Connect Discovery / RFC 8414",
      impl: "src/lib/checks/oauth.ts",
      audit,
      conclusion: `OAuth discovery present at ${foundPath}`,
    };
  }

  return {
    id: "oauth-discovery",
    category: "capability-discovery",
    severity: "info",
    title: "No OAuth/OIDC discovery metadata",
    message:
      "Neither /.well-known/openid-configuration nor /.well-known/oauth-authorization-server returned a valid OAuth metadata document. Optional for docs-only sites; required if you have agentic API consumers.",
    fix: "If your product has protected APIs, publish /.well-known/openid-configuration (OIDC) or /.well-known/oauth-authorization-server (OAuth 2.0) with issuer, authorization_endpoint, token_endpoint, jwks_uri, and grant_types_supported.",
    source: "OpenID Connect Discovery / RFC 8414",
    impl: "src/lib/checks/oauth.ts",
    audit,
    conclusion: "No OAuth/OIDC discovery metadata at either well-known path",
  };
}

/**
 * Probe RFC 9728 OAuth Protected Resource metadata. A pass requires both
 * `resource` (string) and `authorization_servers` (array) — without those
 * fields the document isn't useful to an agent trying to find the issuer.
 */
export async function checkOAuthProtectedResource(baseUrl: string): Promise<CheckResult> {
  const origin = new URL(baseUrl).origin;
  const audit: AuditEntry[] = [];
  const url = `${origin}/.well-known/oauth-protected-resource`;
  const res = await auditedFetch(url, audit, { note: "probe oauth-protected-resource" });

  if (res && res.statusCode === 200) {
    try {
      const json = JSON.parse(res.body) as {
        resource?: unknown;
        authorization_servers?: unknown;
      };
      const hasResource = typeof json.resource === "string";
      const hasServers = Array.isArray(json.authorization_servers);
      if (hasResource && hasServers) {
        return {
          id: "oauth-protected-resource",
          category: "capability-discovery",
          severity: "pass",
          title: "Agents know which OAuth issuers serve your APIs",
          message:
            "OAuth Protected Resource metadata is published. Coding agents can discover which authorization servers issue tokens for your APIs.",
          source: "RFC 9728",
          impl: "src/lib/checks/oauth.ts",
          audit,
          conclusion: "OAuth Protected Resource metadata present",
        };
      }
    } catch {
      // fall through to info
    }
  }

  return {
    id: "oauth-protected-resource",
    category: "capability-discovery",
    severity: "info",
    title: "No OAuth Protected Resource metadata",
    message:
      "/.well-known/oauth-protected-resource is not published. Optional for docs-only sites; useful when your APIs are gated by OAuth and agents need to discover the issuer.",
    fix: "Publish /.well-known/oauth-protected-resource with `resource` (your API URL), `authorization_servers` (list of issuer URLs), and `scopes_supported`.",
    source: "RFC 9728",
    impl: "src/lib/checks/oauth.ts",
    audit,
    conclusion: "No OAuth Protected Resource metadata",
  };
}
