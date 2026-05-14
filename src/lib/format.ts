/**
 * Display formatters shared by the scan UI. Keep tiny and dependency-free —
 * called per render in tight loops (live feed, page matrix).
 */

export function formatChars(n: number): string {
  if (n === 0) return "0";
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export const formatTokens = formatChars;

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}
