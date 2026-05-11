import { encodingForModel } from "js-tiktoken";

/**
 * Token-count wrapper used by every profile.
 *
 * GPT counts come from `js-tiktoken` — a pure-JS port of OpenAI's BPE
 * tokenizer. Exact token counts, no WASM, no bundler config needed for
 * Turbopack's dev server.
 *
 * Claude counts use a chars/4 approximation. Anthropic's official tokenizer
 * package transitively depends on the WASM build of `tiktoken` which doesn't
 * load under Turbopack without per-build configuration. The chars/4 ratio is
 * the standard rule-of-thumb (English prose ≈ 4 chars per Claude token; the
 * existing `tokensFromChars` helper in `src/lib/types.ts` uses the same
 * formula). The UI labels these counts with "≈" so readers know they're
 * estimates. This is acceptable for the v2 docs-lens — every figure on
 * screen ties to a real-world fetch and a deterministic count even if the
 * Claude column is a rounded approximation.
 */
const gptEncoder = encodingForModel("gpt-4o");

export interface TokenCounts {
  claude: number;
  gpt: number;
}

export function countTokens(text: string): TokenCounts {
  if (!text) return { claude: 0, gpt: 0 };
  return {
    claude: Math.round(text.length / 4),
    gpt: gptEncoder.encode(text).length,
  };
}
