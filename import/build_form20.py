#!/usr/bin/env python3
"""
Form 20 merge / validate / consolidated-SQL builder. Adapts build_block.py for the
multi-form world (migration 0006): every row carries nbme_form=20 and the conflict
guard is (nbme_form, q_number) — NOT q_number alone (which would collide with Form 31).

Subcommands
  merge <N>   Read import/out20/block<N>_part*.json -> validate -> write
              import/out20/block<N>.merged.json + block<N>_review_needed.csv.
  sql         Read all import/out20/block*.merged.json (enrichment merged in if present)
              -> ONE transactional import/out20/load_form20.sql (INSERT ... nbme_form=20).

SQL only. Nothing is written to the DB (CLAUDE.md #1). Outputs are gitignored.
"""
import csv, json, string, sys
from glob import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out20"
NBME_FORM = 20

VALID_QTYPES = {"mechanism", "diagnosis", "next-step", "interpretation", "association"}
VALID_LETTERS = set(string.ascii_uppercase)


def dollar_quote(text, tag):
    text = text or ""
    delim = f"${tag}$"
    if delim in text:
        i = 0
        while f"${tag}{i}$" in text:
            i += 1
        delim = f"${tag}{i}$"
    return f"{delim}{text}{delim}"


def load_parts(block):
    parts = sorted(glob(str(OUT / f"block{block}_part*.json")))
    if not parts:
        sys.exit(f"No part files: import/out20/block{block}_part*.json")
    items = []
    for p in parts:
        items.extend(json.loads(Path(p).read_text())["items"])
    items.sort(key=lambda x: x["q_number"])
    return items, parts


def validate(items, block):
    w = []
    qnums = [it["q_number"] for it in items]
    expected = list(range((block - 1) * 20 + 1, (block - 1) * 20 + 21))
    if len(items) != 20:
        w.append(f"expected 20 items, got {len(items)}")
    if qnums != expected:
        w.append(f"q_numbers {qnums} != expected {expected}")
    for it in items:
        q = it["q_number"]
        letters = {o["letter"] for o in it["options"]}
        if it["correct_letter"] not in letters:
            w.append(f"Q{q}: correct_letter {it['correct_letter']!r} not in options {sorted(letters)}")
        if it["correct_letter"] not in VALID_LETTERS:
            w.append(f"Q{q}: correct_letter {it['correct_letter']!r} not A-Z")
        if it.get("question_type") not in VALID_QTYPES:
            w.append(f"Q{q}: question_type {it.get('question_type')!r} off-taxonomy")
        if len((it.get("vignette_text") or "").strip()) < 50 and not it.get("needs_image"):
            w.append(f"Q{q}: vignette < 50 chars")
        if it.get("block_number") != block:
            w.append(f"Q{q}: block_number {it.get('block_number')} != {block}")
        if it.get("answer_confidence") not in {"high", "medium", "low"}:
            w.append(f"Q{q}: answer_confidence {it.get('answer_confidence')!r} invalid")
    return w


def emit_review_csv(items, block):
    rows = []
    for it in items:
        q = it["q_number"]
        if it.get("answer_confidence") in {"low", "medium"}:
            rows.append([q, "answer_confidence", it["answer_confidence"], it["correct_letter"],
                         f"marking={it.get('answer_marking','')}"])
        for nr in it.get("numeric_review", []) or []:
            rows.append([q, "numeric", nr.get("field", ""), nr.get("value", ""), nr.get("why", "")])
        if it.get("needs_image"):
            rows.append([q, "needs_image", "", "", "options/answer depend on a figure"])
        if it.get("has_figure"):
            rows.append([q, "figure", f"page {it.get('figure_page')}", "", it.get("figure_desc", "")])
        hl = it.get("highlight_correct_letter")
        if hl and hl != it["correct_letter"]:
            rows.append([q, "answer_mismatch", "", "", f"highlight={hl} chosen={it['correct_letter']}"])
        if (it.get("extraction_notes") or "").strip():
            rows.append([q, "note", "", "", it["extraction_notes"]])
    path = OUT / f"block{block}_review_needed.csv"
    with path.open("w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["q_number", "flag_type", "field", "value", "detail"])
        wr.writerows(rows)
    return len(rows)


def cmd_merge(block):
    items, parts = load_parts(block)
    (OUT / f"block{block}.merged.json").write_text(
        json.dumps({"nbme_form": NBME_FORM, "block_number": block, "count": len(items), "items": items},
                   ensure_ascii=False, indent=2))
    warnings = validate(items, block)
    n_review = emit_review_csv(items, block)
    print(f"Block {block}: merged {len(items)} items from {len(parts)} part file(s).")
    print(f"  -> block{block}.merged.json ; block{block}_review_needed.csv ({n_review} rows)")
    lowconf = [it["q_number"] for it in items if it.get("answer_confidence") == "low"]
    figs = [it["q_number"] for it in items if it.get("has_figure")]
    ans = {}
    for it in items:
        ans[it["correct_letter"]] = ans.get(it["correct_letter"], 0) + 1
    print(f"  answers: " + ", ".join(f"{k}:{ans[k]}" for k in sorted(ans)))
    print(f"  LOW-confidence answers (verify!): {lowconf or 'none'}")
    print(f"  figures to crop: {figs or 'none'}")
    print("  validation: " + ("clean" if not warnings else ""))
    for x in warnings:
        print("   - " + x)


def cmd_sql():
    merged = sorted(glob(str(OUT / "block*.merged.json")), key=lambda p: int(Path(p).stem.split("block")[1].split(".")[0]))
    if not merged:
        sys.exit("No merged blocks found. Run `merge <N>` first.")
    items = []
    for m in merged:
        items.extend(json.loads(Path(m).read_text())["items"])
    items.sort(key=lambda x: x["q_number"])
    lines = [
        "-- Consolidated Form 20 question-bank load (nbme_form=20, 200 items). Licensed content — do not commit/push.",
        "-- Run in the Supabase SQL Editor (service context bypasses RLS; questions has no app write policy).",
        "-- Prereqs: migrations 0001-0008 applied (esp. 0006 nbme_form, 0003 enriched_explanation jsonb).",
        "-- Idempotent: conflict guard on (nbme_form, q_number) — safe to re-run; will not touch Form 31.",
        "begin;",
        "",
    ]
    n_enriched = 0
    for it in items:
        opts_json = json.dumps(it["options"], ensure_ascii=False)
        img = it.get("clinical_image_url")
        img_sql = dollar_quote(img, "img") if img else "null"
        enr = it.get("enriched_explanation")
        if enr:
            n_enriched += 1
            enr_js = enr if isinstance(enr, str) else json.dumps(enr, ensure_ascii=False)
            enr_sql = dollar_quote(enr_js, "enr") + "::jsonb"
        else:
            enr_sql = "null"
        # No NBME explanation exists for Form 20; store the previous test-taker's note if present
        # (clearly the only "explanation" text on the page), else an explicit placeholder. NOT NULL column.
        src = (it.get("student_note") or "").strip()
        src = src if src else "(NBME self-assessment — no official explanation provided.)"
        lines.append(
            "insert into public.questions\n"
            "  (nbme_form, block_number, q_number, vignette_text, options, correct_letter,\n"
            "   clinical_image_url, source_explanation, enriched_explanation,\n"
            "   system_tag, discipline_tag, question_type)\n"
            "values (\n"
            f"  {NBME_FORM}, {it['block_number']}, {it['q_number']},\n"
            f"  {dollar_quote(it['vignette_text'], 'vig')},\n"
            f"  {dollar_quote(opts_json, 'opt')}::jsonb,\n"
            f"  {dollar_quote(it['correct_letter'], 'cl')},\n"
            f"  {img_sql},\n"
            f"  {dollar_quote(src, 'exp')},\n"
            f"  {enr_sql},\n"
            f"  {dollar_quote(it['system_tag'], 'sys')},\n"
            f"  {dollar_quote(it['discipline_tag'], 'dis')},\n"
            f"  {dollar_quote(it['question_type'], 'qt')}\n"
            ")\n"
            "on conflict (nbme_form, q_number) do nothing;\n")
    lines.append("commit;")
    lines.append("")
    lines.append(f"-- verify: expect 200 Form-20 rows, {n_enriched} enriched.")
    lines.append("-- select count(*) as total, count(enriched_explanation) as enriched")
    lines.append("--   from public.questions where nbme_form = 20;")
    (OUT / "load_form20.sql").write_text("\n".join(lines))
    print(f"wrote import/out20/load_form20.sql — {len(items)} inserts, {n_enriched} enriched.")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "merge":
        cmd_merge(int(sys.argv[2]))
    elif len(sys.argv) >= 2 and sys.argv[1] == "sql":
        cmd_sql()
    else:
        sys.exit("Usage: build_form20.py merge <N> | sql")
