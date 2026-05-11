"use client";

import { useState } from "react";

interface Props {
  prompt: string;
  failCount?: number;
  warnCount?: number;
}

export function AgentFixPrompt({ prompt, failCount = 0, warnCount = 0 }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalIssues = failCount + warnCount;

  return (
    <section className="px-6 py-10 border-b border-rule bg-gradient-to-br from-paper to-paper-tint/30">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-baseline gap-3 mb-4 flex-wrap">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink/50 mono">
            STEP THREE · ACTIONABLE
          </span>
        </div>
        <div className="flex items-end justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h3 className="h-display h-navy text-[24px] md:text-[30px] leading-tight">
              {totalIssues > 0
                ? `Hand this to your agent to fix ${totalIssues} issue${totalIssues === 1 ? "" : "s"}`
                : "Your prompt, ready when you need it"}
            </h3>
            <p className="text-[13px] text-ink/65 mt-2 max-w-2xl">
              Paste into Claude Code, Cursor, or any coding agent. The prompt names every failing
              check, explains the fix, and points the agent at <code className="mono px-1 py-px rounded bg-paper-dim text-ink/85 text-[11.5px]">npx afdocs check</code> for deeper detail.
            </p>
          </div>
          <button
            type="button"
            onClick={copy}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold tracking-tight transition-all duration-150 shrink-0 ${
              copied
                ? "bg-emerald-500 text-white"
                : "bg-ink text-white hover:bg-accent"
            }`}
          >
            {copied ? (
              <>
                <CheckIcon /> Copied to clipboard
              </>
            ) : (
              <>
                <CopyIcon /> Copy prompt
              </>
            )}
          </button>
        </div>
        <div className="rounded-xl overflow-hidden shadow-card-lift border border-[color:var(--color-rule-dark)]/20">
          {/* Terminal chrome */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[color:var(--color-agent-bg)] border-b border-white/5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-agent-muted)] mono">
              agent-fix-prompt.md
            </span>
            <span className="ml-auto text-[11px] text-[color:var(--color-agent-muted)] mono">
              {prompt.length.toLocaleString()} chars · {prompt.split("\n").length} lines
            </span>
          </div>
          <pre className="agent-scroll bg-[color:var(--color-agent-bg)] text-[color:var(--color-agent-fg)] p-5 overflow-x-auto overflow-y-auto max-h-[480px] text-[12.5px] leading-[1.7] font-mono whitespace-pre-wrap">
            {prompt}
          </pre>
        </div>
      </div>
    </section>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
