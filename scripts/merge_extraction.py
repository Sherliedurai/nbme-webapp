#!/usr/bin/env python3
"""
Merge extract_part*.json (blocks 2-10 extraction) → validate → per-block load SQL
+ combined review_needed CSV + figure list. Licensed content → outputs gitignored.

Usage: python3 scripts/merge_extraction.py
"""
import csv, json, string, sys
from glob import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "import/out"
VALID_QTYPES = {"mechanism", "diagnosis", "next-step", "interpretation", "association"}
LETTERS = set(string.ascii_uppercase)


def dollar_quote(text, tag):
    text = text or ""
    delim = f"${tag}$"
    if delim in text:
        i = 0
        while f"${tag}{i}$" in text:
            i += 1
        delim = f"${tag}{i}$"
    return f"{delim}{text}{delim}"


def main():
    parts = sorted(glob(str(OUT / "extract_part*.json")))
    if not parts:
        sys.exit("no extract_part*.json found")
    by_q = {}
    dupes = []
    for p in parts:
        data = json.loads(Path(p).read_text())
        for it in data.get("items", []):
            q = it["q_number"]
            if q in by_q:
                dupes.append(q)
                continue  # keep first; report the dupe
            by_q[q] = it

    # Genuine source-PDF gaps (verified by eye): item 41 (S1 40→42) and item 158
    # (S4 7→9, with a duplicated item-7 page). These q_numbers do not exist.
    KNOWN_GAPS = {41, 158}

    # scope to blocks 2-10 (q21-200); q1-20 belong to block 1 (already done)
    items = [by_q[q] for q in sorted(by_q) if 21 <= q <= 200 and q not in KNOWN_GAPS]

    # ── validation ──
    warnings = []
    present = sorted(it["q_number"] for it in items)
    expected = [q for q in range(21, 201) if q not in KNOWN_GAPS]
    missing = [q for q in expected if q not in present]
    print(f"(known source gaps excluded from target: {sorted(KNOWN_GAPS)})")
    extra = [q for q in present if q not in expected]
    if missing:
        warnings.append(f"MISSING q_numbers ({len(missing)}): {missing}")
    if extra:
        warnings.append(f"UNEXPECTED q_numbers: {extra}")
    if dupes:
        warnings.append(f"DUPLICATE q_numbers seen across parts: {sorted(set(dupes))}")

    for it in items:
        q = it["q_number"]
        if it.get("block_number") != -(-q // 20):
            warnings.append(f"q{q}: block_number {it.get('block_number')} != {-(-q//20)}")
        letters = {o["letter"] for o in it["options"]}
        if it["correct_letter"] not in letters:
            warnings.append(f"q{q}: correct_letter {it['correct_letter']} not in options {sorted(letters)}")
        if it["correct_letter"] not in LETTERS:
            warnings.append(f"q{q}: correct_letter {it['correct_letter']!r} not A-Z")
        if it["question_type"] not in VALID_QTYPES:
            warnings.append(f"q{q}: question_type {it['question_type']!r} off-taxonomy")
        if len((it.get("vignette_text") or "").strip()) < 50 and not it.get("needs_image"):
            warnings.append(f"q{q}: vignette < 50 chars")
        if not (it.get("source_explanation") or "").strip():
            warnings.append(f"q{q}: empty source_explanation")
        if it.get("highlight_correct_letter") and it["highlight_correct_letter"] != it["correct_letter"]:
            warnings.append(f"q{q}: highlight {it['highlight_correct_letter']} != printed {it['correct_letter']}")

    # ── per-block SQL ──
    blocks = {}
    for it in items:
        blocks.setdefault(it["block_number"], []).append(it)
    for b, its in sorted(blocks.items()):
        lines = [f"-- Block {b} question load. Licensed content — do not commit/push.",
                 "-- Run in Supabase SQL Editor (bypasses RLS; questions has no app write policy).",
                 "begin;", ""]
        for it in sorted(its, key=lambda x: x["q_number"]):
            opts = json.dumps(it["options"], ensure_ascii=False)
            lines.append(
                "insert into public.questions\n"
                "  (block_number, q_number, vignette_text, options, correct_letter,\n"
                "   clinical_image_url, source_explanation, enriched_explanation,\n"
                "   system_tag, discipline_tag, question_type)\nvalues (\n"
                f"  {b}, {it['q_number']},\n  {dollar_quote(it['vignette_text'],'vig')},\n"
                f"  {dollar_quote(opts,'opt')}::jsonb,\n  {dollar_quote(it['correct_letter'],'cl')},\n"
                f"  {dollar_quote(it['clinical_image_url'],'img') if it.get('clinical_image_url') else 'null'},\n"
                f"  {dollar_quote(it['source_explanation'],'exp')},\n  null,\n"
                f"  {dollar_quote(it['system_tag'],'sys')},\n  {dollar_quote(it['discipline_tag'],'dis')},\n"
                f"  {dollar_quote(it['question_type'],'qt')}\n)\non conflict (q_number) do nothing;\n")
        lines.append("commit;")
        (OUT / f"block{b}.sql").write_text("\n".join(lines))

    # ── review CSV + figure list ──
    rows, figs = [], []
    for it in items:
        q = it["q_number"]
        for nr in it.get("numeric_review", []) or []:
            rows.append([q, "numeric", nr.get("field", ""), nr.get("value", ""), nr.get("why", "")])
        if it.get("needs_image"):
            rows.append([q, "needs_image", "", "", "answer/options depend on a figure"])
        if it.get("has_figure"):
            figs.append((q, it.get("figure_page"), it.get("figure_desc", "")))
            rows.append([q, "figure", f"page {it.get('figure_page')}", "", it.get("figure_desc", "")])
        if it.get("highlight_correct_letter") and it["highlight_correct_letter"] != it["correct_letter"]:
            rows.append([q, "answer_mismatch", "", "", f"hl={it['highlight_correct_letter']} printed={it['correct_letter']}"])
        if (it.get("extraction_notes") or "").strip():
            rows.append([q, "note", "", "", it["extraction_notes"]])
    with (OUT / "blocks2-10_review_needed.csv").open("w", newline="") as f:
        w = csv.writer(f); w.writerow(["q_number", "flag_type", "field", "value", "detail"]); w.writerows(rows)
    (OUT / "blocks2-10.merged.json").write_text(json.dumps({"count": len(items), "items": items}, ensure_ascii=False, indent=1))

    # ── report ──
    print(f"merged {len(items)} items (q21-200) from {len(parts)} parts")
    print(f"per-block counts: " + ", ".join(f"b{b}:{len(v)}" for b, v in sorted(blocks.items())))
    print(f"figures to crop: {len(figs)}")
    ans = {}
    for it in items:
        ans[it["correct_letter"]] = ans.get(it["correct_letter"], 0) + 1
    print("answer distribution: " + ", ".join(f"{k}:{ans[k]}" for k in sorted(ans)))
    print(f"review_needed rows: {len(rows)}")
    print("\nVALIDATION: " + ("clean" if not warnings else f"{len(warnings)} issues:"))
    for wmsg in warnings:
        print("  -", wmsg)


if __name__ == "__main__":
    main()
