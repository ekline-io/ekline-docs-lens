export function AccuracyDisclaimer() {
  return (
    <footer className="border-t border-rule bg-paper-dim/40 px-6 py-6">
      <div className="max-w-[1200px] mx-auto text-[12px] text-ink/65 leading-relaxed">
        <strong className="text-ink font-semibold">About these measurements.</strong>{" "}
        Docs Lens fetches every discovered page through three reader profiles.{" "}
        <strong>Raw HTTP</strong> uses undici plus Turndown, runs no JavaScript,
        and represents what Claude Code WebFetch, Cursor, and Continue see.{" "}
        <strong>Headless browser</strong> uses Playwright Chromium and
        represents what Atlas, Comet, and Cline see.{" "}
        <strong>Search snippet</strong> captures title, meta description, OG tags,
        first H1, and the first 200 characters of preview text, representing what
        ChatGPT Search, Perplexity, and You.com see. Per-page deltas, site rollups,
        and fix attribution all come from deterministic checks on those fetched
        artifacts. No LLMs run in the scoring path. Claude token counts are an{" "}
        <strong className="text-ink">≈ chars/4 approximation</strong>; GPT counts
        are precise via{" "}
        <code className="mono px-1 py-px rounded bg-paper text-ink/85 text-[11.5px]">
          js-tiktoken
        </code>
        . Every number on this page ties to a real HTTP response or a Playwright
        snapshot that a skeptic can re-run.
      </div>
    </footer>
  );
}
