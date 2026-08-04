#!/usr/bin/env python3
"""
Per-form, per-question Mehlman retrieval -> per-block enrichment input files.
Generalized from build_enrich_input20.py (Form 20) and the old Form-31 build_enrich_input.py;
supersedes both. Takes --form NN and reads import/out<form>/.

Grounding signal for retrieval is CODE-DRIVEN, never model-driven:
  - Forms WITH an official NBME explanation (e.g. 28, 31): the official text — its
    "Educational Objective:" sentence if present (tightest), else the full explanation —
    plus the correct-answer text + tags. This is the authoritative signal.
  - Forms WITHOUT one (e.g. 20): fall back to the UNVERIFIED student_note, used ONLY to
    find relevant chunks, NEVER as content.
Each record also carries the official explanation so the enrichment step can ground
answer_lock/knockdowns/high_yield in NBME's own text (provenance "official").

Reads:  import/out<form>/block*.merged.json  +  import/mehlman/chunks.json
Writes: import/out<form>/enrich_input_block<N>.json  (one per block)

SQL/DB: none. Outputs are gitignored. Loud-fails on missing index/blocks.
"""
import argparse, json, math, re, pathlib, sys
from glob import glob

ROOT = pathlib.Path(__file__).resolve().parent.parent

STOP = set("""a an the of to in on for with and or is are was were be been at by from as this that these those it
patient patients following most likely cause causes shows show which who man woman male female old year years
history presents comes physician because after during due more less than not no also within into over answer
his her their its will can may increased decreased high low normal dx most appropriate additional should when
involves commonly includes occurs present presentation use uses using another often typically usually seen
associated result results lead leads known called include""".split())
TOKEN = re.compile(r"[a-z][a-z0-9\-]{2,}")
def toks(t): return {x for x in TOKEN.findall((t or "").lower()) if x not in STOP}


def official_text(it):
    """Richest retrieval signal for this item's answer, form-safe. Prefer the official NBME
    explanation (Form 28 field 'official_explanation'; Form 31 'source_explanation') — its
    Educational Objective sentence if present, else the whole thing. Else the Form-20
    student_note workaround (retrieval-only, never content). A Form-20 placeholder
    source_explanation ('...no official explanation provided.') is treated as absent."""
    off = (it.get("official_explanation") or it.get("source_explanation") or "").strip()
    if off and "no official explanation" not in off.lower():
        return off.split("Educational Objective:")[-1] if "Educational Objective:" in off else off
    return it.get("student_note", "")


def main():
    ap = argparse.ArgumentParser(description="Build per-block Mehlman retrieval input for enrichment.")
    ap.add_argument("--form", type=int, required=True, help="NBME form number (e.g. 28). No default.")
    a = ap.parse_args()
    O = ROOT / f"import/out{a.form}"

    chunks_path = ROOT / "import/mehlman/chunks.json"
    if not chunks_path.exists():
        sys.exit(f"FATAL: {chunks_path} missing — run mehlman_build.py first.")
    chunks = json.loads(chunks_path.read_text())
    if not chunks:
        sys.exit("FATAL: chunks.json is empty — the Mehlman index is not built; refusing to proceed "
                 "(every question would come back ungrounded).")

    merged = sorted(glob(str(O / "block*.merged.json")),
                    key=lambda p: int(pathlib.Path(p).stem.split("block")[1].split(".")[0]))
    if not merged:
        sys.exit(f"FATAL: no block*.merged.json in {O} — run build_form.py --form {a.form} merge first.")
    items = []
    for m in merged:
        items.extend(json.loads(pathlib.Path(m).read_text())["items"])

    N = len(chunks)
    df = {}
    for c in chunks:
        for t in set(c["tokens"]): df[t] = df.get(t, 0) + 1
    AVGDL = sum(len(c["tokens"]) for c in chunks) / max(N, 1)
    K1, B, DISTINCT_IDF = 1.2, 0.75, 3.0
    def idf(t): return math.log((N + 1) / (1 + df.get(t, 0)))

    def retrieve(it, k=4):
        ans = next((o["text"] for o in it["options"] if o["letter"] == it["correct_letter"]), "")
        q = toks(ans) | toks(official_text(it)) | toks(it["system_tag"]) | toks(it["discipline_tag"])
        qtags = toks(it["system_tag"]) | toks(it["discipline_tag"])
        scored = []
        for c in chunks:
            matched = q & set(c["tokens"])
            if not matched or max(idf(t) for t in matched) < DISTINCT_IDF:
                continue
            clen = max(len(c["tokens"]), 1)
            norm = (K1 + 1) / (1 + K1 * (1 - B + B * clen / AVGDL))
            score = sum(idf(t) for t in matched) * norm
            if qtags & set(c["file_tags"]): score *= 1.25
            scored.append((score, c))
        scored.sort(key=lambda x: -x[0])
        return [{"source_label": c["source_label"], "score": round(s, 1), "text": c["text"][:700]}
                for s, c in scored[:k]]

    by_block = {}
    for it in items:
        ans = next((o["text"] for o in it["options"] if o["letter"] == it["correct_letter"]), "")
        rec = {
            "q_number": it["q_number"], "block_number": it["block_number"],
            "vignette_text": it["vignette_text"], "options": it["options"],
            "correct_letter": it["correct_letter"], "correct_text": ans,
            "answer_confidence": it.get("answer_confidence"),
            "system_tag": it["system_tag"], "discipline_tag": it["discipline_tag"],
            "question_type": it["question_type"],
            # authoritative grounding text for the enricher (provenance "official"); "" if none
            "official_explanation": (it.get("official_explanation") or it.get("source_explanation") or ""),
            "student_note": it.get("student_note", ""),   # form-20 compat; unverified; retrieval-only
            "has_figure": it.get("has_figure", False), "needs_image": it.get("needs_image", False),
            "retrieved": retrieve(it),
        }
        by_block.setdefault(it["block_number"], []).append(rec)

    total, total_ground = 0, 0
    for b, recs in sorted(by_block.items()):
        recs.sort(key=lambda r: r["q_number"])
        (O / f"enrich_input_block{b}.json").write_text(json.dumps(recs, ensure_ascii=False, indent=1))
        g = sum(1 for r in recs if r["retrieved"]); total += len(recs); total_ground += g
        print(f"block {b}: {len(recs)} questions, {g} with >=1 retrieved chunk -> enrich_input_block{b}.json")
    print(f"total: {total} questions, {total_ground} with >=1 retrieved Mehlman chunk "
          f"({total - total_ground} rely on official/model only)")


if __name__ == "__main__":
    main()
