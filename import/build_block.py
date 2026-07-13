#!/usr/bin/env python3
"""
Merge extracted block part-files -> validate -> emit Supabase load SQL + review_needed.csv.

Usage:
    python3 import/build_block.py <block_number>

Reads:   import/out/block<N>_part*.json   (from the extraction sub-agents)
Writes:  import/out/block<N>.sql          (INSERT ... INTO public.questions)
         import/out/block<N>_review_needed.csv
         import/out/block<N>.merged.json   (merged, for the record)

The .sql / .json outputs contain licensed content and are gitignored.
"""
import csv
import json
import sys
from glob import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"

import string

VALID_QTYPES = {"mechanism", "diagnosis", "next-step", "interpretation", "association"}
VALID_LETTERS = set(string.ascii_uppercase)  # A–Z: extended-matching items exceed A–F


def dollar_quote(text: str, tag: str) -> str:
    """Safely wrap arbitrary text (quotes, newlines, arrows) as a Postgres string literal."""
    delim = f"${tag}$"
    if delim in (text or ""):
        # Fall back to a numbered tag if the content collides (extremely unlikely).
        i = 0
        while f"${tag}{i}$" in (text or ""):
            i += 1
        delim = f"${tag}{i}$"
    return f"{delim}{text or ''}{delim}"


def load_items(block: int):
    parts = sorted(glob(str(OUT / f"block{block}_part*.json")))
    if not parts:
        sys.exit(f"No part files found: import/out/block{block}_part*.json")
    items = []
    for p in parts:
        data = json.loads(Path(p).read_text())
        items.extend(data["items"])
    items.sort(key=lambda x: x["q_number"])
    return items, parts


def validate(items, block):
    warnings = []
    qnums = [it["q_number"] for it in items]
    expected = list(range(min(qnums), min(qnums) + 20)) if qnums else []
    if len(items) != 20:
        warnings.append(f"Expected 20 items, got {len(items)}")
    if qnums != expected:
        warnings.append(f"Non-sequential/incomplete q_numbers: {qnums}")
    for it in items:
        q = it["q_number"]
        letters = {o["letter"] for o in it["options"]}
        if it["correct_letter"] not in letters:
            warnings.append(f"Q{q}: correct_letter '{it['correct_letter']}' not among options {sorted(letters)}")
        if it["correct_letter"] not in VALID_LETTERS:
            warnings.append(f"Q{q}: correct_letter '{it['correct_letter']}' not A–F")
        if it["question_type"] not in VALID_QTYPES:
            warnings.append(f"Q{q}: question_type '{it['question_type']}' not in taxonomy")
        if len((it.get("vignette_text") or "").strip()) < 50 and not it.get("needs_image"):
            warnings.append(f"Q{q}: vignette < 50 chars — possible extraction error")
        if not (it.get("source_explanation") or "").strip():
            warnings.append(f"Q{q}: empty source_explanation")
        if it.get("highlight_correct_letter") and it["highlight_correct_letter"] != it["correct_letter"]:
            warnings.append(f"Q{q}: highlight ({it['highlight_correct_letter']}) != printed answer ({it['correct_letter']})")
        if it.get("block_number") != block:
            warnings.append(f"Q{q}: block_number {it.get('block_number')} != {block}")
    return warnings


def emit_sql(items, block):
    lines = [
        "-- Auto-generated question-bank load for block %d. Licensed content — do not commit/push." % block,
        "-- Run in the Supabase SQL Editor (service context bypasses RLS; questions has no app write policy).",
        "begin;",
        "",
    ]
    for it in items:
        opts_json = json.dumps(it["options"], ensure_ascii=False)
        img = it.get("clinical_image_url")
        img_sql = dollar_quote(img, "img") if img else "null"
        enr = it.get("enriched_explanation")
        enr_sql = dollar_quote(enr, "enr") if enr else "null"
        lines.append(
            "insert into public.questions\n"
            "  (block_number, q_number, vignette_text, options, correct_letter,\n"
            "   clinical_image_url, source_explanation, enriched_explanation,\n"
            "   system_tag, discipline_tag, question_type)\n"
            "values (\n"
            f"  {block}, {it['q_number']},\n"
            f"  {dollar_quote(it['vignette_text'], 'vig')},\n"
            f"  {dollar_quote(opts_json, 'opt')}::jsonb,\n"
            f"  {dollar_quote(it['correct_letter'], 'cl')},\n"
            f"  {img_sql},\n"
            f"  {dollar_quote(it['source_explanation'], 'exp')},\n"
            f"  {enr_sql},\n"
            f"  {dollar_quote(it['system_tag'], 'sys')},\n"
            f"  {dollar_quote(it['discipline_tag'], 'dis')},\n"
            f"  {dollar_quote(it['question_type'], 'qt')}\n"
            ")\n"
            "on conflict (q_number) do nothing;\n"
        )
    lines.append("commit;")
    (OUT / f"block{block}.sql").write_text("\n".join(lines))


def emit_review_csv(items, block):
    rows = []
    for it in items:
        q = it["q_number"]
        for nr in it.get("numeric_review", []) or []:
            rows.append([q, "numeric", nr.get("field", ""), nr.get("value", ""), nr.get("why", "")])
        if it.get("needs_image"):
            rows.append([q, "needs_image", "", "", "options/answer depend on a clinical figure"])
        if it.get("has_figure"):
            rows.append([q, "figure", f"page {it.get('figure_page')}", "", it.get("figure_desc", "")])
        if it.get("highlight_correct_letter") and it["highlight_correct_letter"] != it["correct_letter"]:
            rows.append([q, "answer_mismatch", "", "",
                         f"highlight={it['highlight_correct_letter']} printed={it['correct_letter']}"])
        if (it.get("extraction_notes") or "").strip():
            rows.append([q, "note", "", "", it["extraction_notes"]])
    path = OUT / f"block{block}_review_needed.csv"
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["q_number", "flag_type", "field", "value", "detail"])
        w.writerows(rows)
    return len(rows)


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 import/build_block.py <block_number>")
    block = int(sys.argv[1])
    items, parts = load_items(block)
    (OUT / f"block{block}.merged.json").write_text(
        json.dumps({"block_number": block, "count": len(items), "items": items}, ensure_ascii=False, indent=2)
    )
    warnings = validate(items, block)
    emit_sql(items, block)
    n_review = emit_review_csv(items, block)

    print(f"Block {block}: merged {len(items)} items from {len(parts)} part file(s).")
    print(f"  -> import/out/block{block}.sql")
    print(f"  -> import/out/block{block}_review_needed.csv ({n_review} rows to eyeball)")
    figs = [it['q_number'] for it in items if it.get('has_figure')]
    print(f"  figures to crop/upload: {figs if figs else 'none'}")
    ans = {}
    for it in items:
        ans[it['correct_letter']] = ans.get(it['correct_letter'], 0) + 1
    print(f"  answer distribution: " + ", ".join(f"{k}:{ans[k]}" for k in sorted(ans)))
    if warnings:
        print("\n  VALIDATION WARNINGS:")
        for w in warnings:
            print(f"   - {w}")
    else:
        print("\n  validation: clean")


if __name__ == "__main__":
    main()
