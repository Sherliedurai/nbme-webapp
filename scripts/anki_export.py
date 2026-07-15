#!/usr/bin/env python3
"""
NBME → Anki (.apkg) export — deterministic cards via genanki.

Card rules (CLAUDE.md, enforced here):
  * 1 card per question (a 2nd cloze only when it tests a separable mechanism).
  * Always a QUESTION with ONE retrievable answer — never a paragraph.
  * Front = compressed clinical TRIGGER (from the physician-reviewed `hook`),
    NOT the vignette. Back = the answer + at most a short clincher.
  * Hard caps: front <= 20 words, back <= 25 words.
  * NEVER puts knockdowns / full mechanism (answer_lock) / how_they_test on cards.
    The app teaches; Anki drills.

Generates from a SET of questions (the app exports her incorrect + flagged set),
so it works the moment she has misses — no rebuild of the whole bank.

Usage:
  # Format test — print sample cards, write nothing:
  python3 scripts/anki_export.py --from-block1 --sample 3
  # Full deck from the app's exported selection:
  python3 scripts/anki_export.py nbme-anki-selection.json -o nbme_review.apkg
  # Deck from block 1 (local licensed data):
  python3 scripts/anki_export.py --from-block1 -o nbme31_block1.apkg
"""
import argparse, json, re, sys, hashlib

FRONT_CAP, BACK_CAP = 20, 25
ASK = {
    "diagnosis": "→ dx?",
    "mechanism": "→ mechanism?",
    "next-step": "→ next step?",
    "interpretation": "→ interpret?",
    "association": "→ ?",
}
ABSOLUTES = re.compile(r"\b(always|never|prevents?|all|none)\b", re.I)

# Stable ids (genanki needs deterministic model/deck ids so re-imports update, not dup).
BASIC_MODEL_ID = 1607392319
CLOZE_MODEL_ID = 1607392320
DECK_ID_BASE = 20250714


def strip_md(s: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"\1", s or "").strip()


def wc(s: str) -> int:
    return len(s.split())


def last_sentence(s: str) -> str:
    parts = [p for p in re.split(r"(?<=[.;])\s+", s.strip()) if p.strip()]
    return parts[-1].strip() if parts else s.strip()


def build_trigger(hook: str) -> str:
    """The clinical trigger = the clause opposite the answer in the hook.

    Hooks read "TRIGGER = ANSWER" (trigger-first) or "ANSWER = ... = ANSWER"
    (answer-first). Prefer the leading clause; if it's too short to be a trigger
    (i.e. it's the answer term), fall back to the clinical clause before the last
    "=".
    """
    h = strip_md(hook)
    segs = [x.strip() for x in re.split(r"\s=\s", h) if x.strip()]
    if len(segs) >= 2:
        if wc(segs[0]) >= 3:
            trig = segs[0]
        else:
            cand = last_sentence(segs[-2])
            trig = cand if wc(cand) >= 2 else segs[0]
    else:
        trig = last_sentence(h)
    trig = re.sub(r"^[→\-\s]+", "", trig).rstrip(" .").strip()
    return trig


def clamp_words(s: str, cap: int) -> str:
    words = s.split()
    return s if len(words) <= cap else " ".join(words[:cap])


def build_cards(item: dict) -> list:
    """Return 1 (or 2) card dicts for one question. Never raises; flags in lint."""
    qtype = (item.get("question_type") or "").strip()
    ans = strip_md(item.get("answer") or "").rstrip(".").strip()
    trig = build_trigger(item.get("hook") or "")
    ask = ASK.get(qtype, "→ ?")

    keep = max(1, FRONT_CAP - wc(ask))
    front = f"{clamp_words(trig, keep)} {ask}".strip()
    back = clamp_words(ans, BACK_CAP)

    cards = [{"type": "basic", "front": front, "back": back}]

    # Optional 2nd card: a cloze on a SEPARABLE mechanism. Only when the answer
    # term literally appears in the hook AND the hook is a tight one-liner — that
    # way the cloze tests the mechanism line, not a duplicate of the basic card.
    if qtype in ("mechanism", "association") and ans:
        h = strip_md(item.get("hook") or "")
        first_sentence = re.split(r"(?<=[.;])\s+", h)[0].strip()
        if ans.lower() in first_sentence.lower() and wc(first_sentence) <= BACK_CAP:
            cloze = re.sub(re.escape(ans), "{{c1::" + ans + "}}", first_sentence, count=1, flags=re.I)
            if "{{c1::" in cloze:
                cards.append({"type": "cloze", "text": cloze})
    return cards


def lint(item, cards, warnings):
    tag = f"Q{item.get('q_number','?')}"
    for c in cards:
        text = c.get("front", "") + " " + c.get("back", "") + " " + c.get("text", "")
        if c["type"] == "basic":
            if wc(c["front"]) > FRONT_CAP:
                warnings.append(f"{tag}: front {wc(c['front'])}w > {FRONT_CAP}")
            if wc(c["back"]) > BACK_CAP:
                warnings.append(f"{tag}: back {wc(c['back'])}w > {BACK_CAP}")
            if wc(c["front"]) < 3:
                warnings.append(f"{tag}: front looks too thin — check the trigger: {c['front']!r}")
        for m in ABSOLUTES.findall(text):
            warnings.append(f"{tag}: absolute word '{m}' on a card — verify it's literally true")


def sanitize_tag(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", (s or "").strip()).strip("_") or "untagged"


def load_block1():
    items = json.load(open("import/out/block1.merged.json"))["items"]
    enr = {e["q_number"]: e for e in json.load(open("import/out/enrich_block1_full.json"))["enrichments"]}
    out = []
    for it in items:
        e = enr.get(it["q_number"], {})
        correct = next((o["text"] for o in it["options"] if o["letter"] == it["correct_letter"]), "")
        out.append({
            "q_number": it["q_number"], "nbme_form": it.get("nbme_form", 31),
            "block_number": it["block_number"], "system": it["system_tag"],
            "discipline": it["discipline_tag"], "question_type": it["question_type"],
            "answer": correct, "hook": e.get("hook", ""),
        })
    return out


def load_selection(path):
    """App export: {questions:[{q_number,nbme_form,system_tag,discipline_tag,question_type,answer,hook}]}."""
    data = json.load(open(path))
    rows = data.get("questions", data if isinstance(data, list) else [])
    out = []
    for r in rows:
        out.append({
            "q_number": r.get("q_number"), "nbme_form": r.get("nbme_form", 31),
            "block_number": r.get("block_number"), "system": r.get("system_tag") or r.get("system"),
            "discipline": r.get("discipline_tag") or r.get("discipline"),
            "question_type": r.get("question_type"), "answer": r.get("answer") or r.get("correct_text"),
            "hook": r.get("hook", ""),
        })
    return out


def write_apkg(items, path, deck_name):
    import genanki
    basic = genanki.Model(
        BASIC_MODEL_ID, "NBME Basic",
        fields=[{"name": "Front"}, {"name": "Back"}, {"name": "Extra"}],
        templates=[{"name": "Card 1",
                    "qfmt": "{{Front}}",
                    "afmt": '{{FrontSide}}<hr id="answer">{{Back}}<br><span style="color:#888;font-size:12px">{{Extra}}</span>'}],
        css=".card{font-family:-apple-system,Segoe UI,sans-serif;font-size:19px;text-align:center;color:#1e293b}",
    )
    cloze = genanki.Model(
        CLOZE_MODEL_ID, "NBME Cloze", model_type=genanki.Model.CLOZE,
        fields=[{"name": "Text"}, {"name": "Extra"}],
        templates=[{"name": "Cloze", "qfmt": "{{cloze:Text}}",
                    "afmt": '{{cloze:Text}}<br><span style="color:#888;font-size:12px">{{Extra}}</span>'}],
        css=".card{font-family:-apple-system,Segoe UI,sans-serif;font-size:19px;text-align:center;color:#1e293b}",
    )
    deck = genanki.Deck(DECK_ID_BASE, deck_name)
    warnings, n = [], 0
    for it in items:
        cards = build_cards(it)
        lint(it, cards, warnings)
        tags = [sanitize_tag(it.get("system")), sanitize_tag(it.get("discipline")),
                sanitize_tag(it.get("question_type")), f"NBME{it.get('nbme_form',31)}"]
        extra = f"NBME {it.get('nbme_form',31)} · Block {it.get('block_number','?')} · Q{it.get('q_number','?')}"
        for c in cards:
            if c["type"] == "basic":
                deck.add_note(genanki.Note(model=basic, fields=[c["front"], c["back"], extra], tags=tags))
            else:
                deck.add_note(genanki.Note(model=cloze, fields=[c["text"], extra], tags=tags))
            n += 1
    genanki.Package(deck).write_to_file(path)
    return n, warnings


def print_samples(items, k):
    warnings = []
    shown = 0
    print(f"\n=== SAMPLE CARDS (format test) — {min(k,len(items))} of {len(items)} questions ===\n")
    for it in items:
        cards = build_cards(it)
        lint(it, cards, warnings)
        if shown < k:
            print(f"Q{it['q_number']}  [{it['question_type']}]  ({it.get('system')})")
            for c in cards:
                if c["type"] == "basic":
                    print(f"  FRONT ({wc(c['front'])}w): {c['front']}")
                    print(f"  BACK  ({wc(c['back'])}w): {c['back']}")
                else:
                    print(f"  CLOZE : {c['text']}")
            print()
            shown += 1
    # full-set lint summary so caps are proven across ALL cards, not just samples
    allcards = [c for it in items for c in build_cards(it)]
    over_f = [1 for it in items for c in build_cards(it) if c["type"] == "basic" and wc(c["front"]) > FRONT_CAP]
    over_b = [1 for it in items for c in build_cards(it) if c["type"] == "basic" and wc(c["back"]) > BACK_CAP]
    print(f"--- SELF-LINT over all {len(items)} questions / {len(allcards)} cards ---")
    print(f"front>{FRONT_CAP}w: {len(over_f)} | back>{BACK_CAP}w: {len(over_b)} | warnings: {len(warnings)}")
    for w in warnings:
        print("  ⚠ " + w)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("selection", nargs="?", help="app-exported selection JSON")
    ap.add_argument("--from-block1", action="store_true", help="use local block-1 licensed data")
    ap.add_argument("--sample", type=int, metavar="N", help="print N sample cards, write nothing")
    ap.add_argument("-o", "--out", help="output .apkg path")
    ap.add_argument("--deck", default="NBME Review", help="Anki deck name")
    a = ap.parse_args()

    if a.from_block1:
        items = load_block1()
    elif a.selection:
        items = load_selection(a.selection)
    else:
        ap.error("give a selection JSON or --from-block1")

    if a.sample is not None:
        print_samples(items, a.sample)
        return
    if not a.out:
        ap.error("need -o OUT.apkg to write a deck (or use --sample)")
    n, warnings = write_apkg(items, a.out, a.deck)
    print(f"wrote {a.out}: {n} cards from {len(items)} questions")
    if warnings:
        print(f"{len(warnings)} lint warning(s):")
        for w in warnings:
            print("  ⚠ " + w)


if __name__ == "__main__":
    main()
