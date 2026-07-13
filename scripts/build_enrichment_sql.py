#!/usr/bin/env python3
"""
Emit UPDATE statements that load block-1 enrichment into questions.enriched_explanation
(jsonb). Matches rows by q_number (unique). Licensed content -> output is gitignored.

Usage: python3 scripts/build_enrichment_sql.py <block_number>
Out:   import/out/block<N>_enrichment.sql
"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
O = ROOT / "import/out"


def dollar(text, tag):
    delim = f"${tag}$"
    if delim in text:
        i = 0
        while f"${tag}{i}$" in text:
            i += 1
        delim = f"${tag}{i}$"
    return f"{delim}{text}{delim}"


def main():
    block = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    enr = json.loads((O / f"enrich_block{block}_full.json").read_text())["enrichments"]
    lines = [
        f"-- Block {block} enrichment load. Licensed content — do not commit/push.",
        "-- Prereq: migration 0003 (enriched_explanation jsonb). Run in the Supabase SQL Editor.",
        "begin;",
        "",
    ]
    for e in enr:
        q = e["q_number"]
        payload = {k: e[k] for k in ("answer_lock", "hook", "knockdowns", "high_yield", "how_they_test")}
        js = json.dumps(payload, ensure_ascii=False)
        lines.append(
            f"update public.questions set enriched_explanation = {dollar(js, 'enr')}::jsonb "
            f"where q_number = {q};"
        )
    lines += ["", "commit;", ""]
    # sanity: verify each row exists / count
    lines.append(
        f"-- verify: {len(enr)} rows in block {block} should now be enriched\n"
        f"-- select count(*) from public.questions where block_number = {block} and enriched_explanation is not null;"
    )
    out = O / f"block{block}_enrichment.sql"
    out.write_text("\n".join(lines))
    print(f"wrote {out.relative_to(ROOT)} — {len(enr)} UPDATE statements")


if __name__ == "__main__":
    main()
