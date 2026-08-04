#!/usr/bin/env python3
"""
Per-form merge / validate / consolidated-SQL builder. Adapts build_block.py for the
multi-form world (migration 0006): every row carries nbme_form=<form> and the conflict
guard is (nbme_form, q_number) — NOT q_number alone (which would collide across forms).

Usage: build_form.py --form NN merge <block> | build_form.py --form NN sql

Subcommands
  merge <N>   Read import/out<form>/block<N>_part*.json -> validate -> write
              import/out<form>/block<N>.merged.json + block<N>_review_needed.csv.
  sql         Read all import/out<form>/block*.merged.json (enrichment merged in if present)
              -> ONE transactional import/out<form>/load_form<form>.sql (INSERT ... nbme_form=<form>).

SQL only. Nothing is written to the DB (CLAUDE.md #1). Outputs are gitignored.
"""
import argparse, csv, json, string, sys
from glob import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Bound at runtime from --form (see main()); no form is baked in.
OUT = None
NBME_FORM = None

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
        sys.exit(f"No part files: import/out{NBME_FORM}/block{block}_part*.json")
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
        # D3: prior taker's filled-radio pick, captured separately from the key. Informational
        # only — correct_letter is set solely from the printed "Correct Answer:" line and is
        # never derived from this. Surfaced so the physician can see which distractor was chosen.
        # Forms that don't capture selected_letter have no key here, so nothing is emitted.
        sel = it.get("selected_letter")
        if sel and sel != it["correct_letter"]:
            rows.append([q, "prior_taker_pick", "", "", f"selected={sel} (correct={it['correct_letter']})"])
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
        f"-- Consolidated Form {NBME_FORM} question-bank load (nbme_form={NBME_FORM}, {len(items)} items). Licensed content — do not commit/push.",
        "-- Run in the Supabase SQL Editor (service context bypasses RLS; questions has no app write policy).",
        "-- Prereqs: migrations 0001-0008 applied (esp. 0006 nbme_form, 0003 enriched_explanation jsonb).",
        "-- Idempotent: conflict guard on (nbme_form, q_number) — safe to re-run; will not touch other forms.",
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
        # source_explanation precedence (additive, form-safe — D1):
        #   1) official NBME explanation printed on the page (forms like 28 that carry one)
        #   2) previous test-taker's note (forms like 20 with no official explanation)
        #   3) explicit placeholder (NOT NULL column)
        # Forms without an official_explanation key fall straight through to the prior behavior,
        # so Form 20 and any explanation-less form are byte-for-byte unchanged.
        src = (it.get("official_explanation") or "").strip()
        if not src:
            src = (it.get("student_note") or "").strip()
        if not src:
            src = "(NBME self-assessment — no official explanation provided.)"
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
    lines.append(f"-- verify: expect {len(items)} Form-{NBME_FORM} rows, {n_enriched} enriched.")
    lines.append("-- select count(*) as total, count(enriched_explanation) as enriched")
    lines.append(f"--   from public.questions where nbme_form = {NBME_FORM};")
    (OUT / f"load_form{NBME_FORM}.sql").write_text("\n".join(lines))
    print(f"wrote import/out{NBME_FORM}/load_form{NBME_FORM}.sql — {len(items)} inserts, {n_enriched} enriched.")


def main():
    global OUT, NBME_FORM
    ap = argparse.ArgumentParser(description="Per-form merge / validate / consolidated-SQL builder.")
    ap.add_argument("--form", type=int, required=True, help="NBME form number (e.g. 20). No default.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    mp = sub.add_parser("merge", help="merge + validate one block")
    mp.add_argument("block", type=int)
    sub.add_parser("sql", help="emit consolidated load SQL for all merged blocks")
    a = ap.parse_args()
    NBME_FORM = a.form
    # Outputs live under <repo>/import/out<form>/ (gitignored), NOT beside the script.
    # ROOT is <repo>/scripts, so the form dir is ROOT.parent/import/out<form>. This matches
    # PIPELINE.md, .gitignore (import/out*/), and every path message emitted in this file.
    # (When this logic lived in import/build_form20.py, ROOT was import/ and ROOT/out20 was
    # already import/out20; the generalization moved the file to scripts/ and must re-root here.)
    OUT = ROOT.parent / "import" / f"out{a.form}"
    if a.cmd == "merge":
        cmd_merge(a.block)
    else:
        cmd_sql()


if __name__ == "__main__":
    main()
