/**
 * Pinned afdocs version surfaced in the agent-fix prompt, the methodology
 * page, and the in-product reference. Bumping this single constant updates
 * everywhere the visitor sees the `npx afdocs@X` command.
 *
 * Bump procedure:
 *   1. `npm install --save-dev afdocs@<new-version>`
 *   2. `npm run audit:afdocs > docs/audits/afdocs-rubric.md`
 *   3. Review the diff; soften /methodology copy if shared-ID count dropped
 *   4. Update this constant
 *
 * See `docs/audits/afdocs-rubric.md` for the alignment snapshot under the
 * currently-pinned version.
 */
export const AFDOCS_PINNED_VERSION = "0.18";
