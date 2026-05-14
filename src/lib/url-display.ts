/**
 * URL → display-string helpers. All three forgive bad input and return the
 * original string so they can be dropped in next to raw URL state without
 * adding error handling at every call site.
 */

/** "/docs/api" — trailing slash stripped except for root "/". */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname === "/" ? "/" : u.pathname.replace(/\/$/, "");
    return p || "/";
  } catch {
    return url;
  }
}

/** "docs.stripe.com" — hostname only. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** "docs.stripe.com/api/charges" — host + path (no trailing slash on root). */
export function hostAndPath(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname === "/" ? "" : u.pathname;
    return u.host + p;
  } catch {
    return url;
  }
}
