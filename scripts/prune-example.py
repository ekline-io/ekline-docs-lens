#!/usr/bin/env python3
"""Prune a captured scan JSON for use as a homepage example.

Drops fields that aren't read by the UI (`rawArtifact`) and demotes per-page
markdown/screenshots beyond page[0]. Keeps everything the result page needs
to render: verdict, reader-profile cards, fix prompt, what-we-checked list,
and a fully-explorable first page (live preview + drilldown).

Usage: prune-example.py <input.json> <output.json>
"""
import json
import os
import sys


def prune_profile(p: dict, *, keep_markdown: bool, keep_screenshot: bool) -> dict:
    out = dict(p)
    out.pop("rawArtifact", None)
    if not keep_markdown:
        out.pop("markdown", None)
    if not keep_screenshot:
        out.pop("screenshot", None)
    return out


AFDOCS_DETAIL_KEEP = {"afdocsCategory", "afdocsStatus", "afdocsSpecUrl"}


def prune_afdocs_details(check: dict) -> dict:
    """Drop afdocs's verbose `details` payloads (link lists, page samples,
    fence inventories) — they're ~2 MB per scan. Keep only the small
    provenance keys our adapter stamps on every afdocs result."""
    if check.get("source") != "afdocs":
        return check
    details = check.get("details") or {}
    out = dict(check)
    out["details"] = {k: v for k, v in details.items() if k in AFDOCS_DETAIL_KEEP}
    return out


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    with open(src) as f:
        data = json.load(f)
    result = data.get("result", {})
    pages = result.get("pages") or []
    for idx, page in enumerate(pages):
        profiles = page.get("profiles") or {}
        keep_md = idx == 0
        keep_ss = idx == 0
        page["profiles"] = {
            pid: prune_profile(prof, keep_markdown=keep_md, keep_screenshot=keep_ss)
            for pid, prof in profiles.items()
        }
    site_checks = result.get("siteChecks") or []
    result["siteChecks"] = [prune_afdocs_details(c) for c in site_checks]
    with open(dst, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    in_kb = os.path.getsize(src) // 1024
    out_kb = os.path.getsize(dst) // 1024
    print(f"{src} ({in_kb} kb) -> {dst} ({out_kb} kb)")


if __name__ == "__main__":
    main()
