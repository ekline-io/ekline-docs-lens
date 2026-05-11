import type { ProfileId } from "@/lib/core/types";
import type { AuditEntry } from "@/lib/types";

export type FixSeverity = "fail" | "warn" | "info";
export type FixSource = "check" | "diff";

export interface FixFinding {
  id: string;
  title: string;
  severity: FixSeverity;
  source: FixSource;
  evidence: string;
  affectedProfiles: ProfileId[] | "general";
  fixHint: string;
  pageUrl: string;
  occurrences: number;
  /** HTTP probes recorded by the underlying check (when available). */
  audit?: AuditEntry[];
  /** One-line "what we concluded" from the check, mirrored for finding cards. */
  conclusion?: string;
}
