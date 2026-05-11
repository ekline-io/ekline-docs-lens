import { describe, it, expect } from "vitest";
import { countTokens } from "@/lib/tokenizer/count";

describe("countTokens", () => {
  it("returns zero for empty string", () => {
    expect(countTokens("")).toEqual({ claude: 0, gpt: 0 });
  });

  it("returns positive counts for prose", () => {
    const { claude, gpt } = countTokens(
      "Charges API. Create a charge with a single POST request."
    );
    expect(claude).toBeGreaterThan(5);
    expect(gpt).toBeGreaterThan(5);
  });

  it("Claude and GPT counts differ on a varied sample", () => {
    // GPT uses real BPE tokenization; Claude uses a chars/4 approximation
    // (see countTokens for why). On a varied sample they should produce
    // different counts.
    const sample = [
      "## Charges API",
      "",
      "```ts",
      "const charge = await stripe.charges.create({",
      "  amount: 2000,",
      "  currency: 'usd',",
      "  source: 'tok_visa',",
      "  description: 'Café — naïve façade 🚀',",
      "});",
      "```",
      "",
      "Idempotency-Key: 8f14e45f-ceea-467a-9575-d098b7f5e8a3",
      "Errors: 402 payment_required, 429 rate_limited.",
    ].join("\n");
    const { claude, gpt } = countTokens(sample);
    expect(claude).not.toBe(gpt);
  });
});
