#!/usr/bin/env python3
"""
Form 20 per-question Mehlman retrieval -> per-block enrichment input files.
Adapts build_enrich_input_blocks.py. Form 20 has NO official NBME explanation, so the
retrieval query is built from the correct-answer text + tags + the (unverified) student
note tokens — the student note is used ONLY to find relevant chunks, never as content.

Reads:  import/out20/block*.merged.json  +  import/mehlman/chunks.json
Writes: import/out20/enrich_input_block<N>.json  (N=1..10)
"""
import json, math, re, pathlib
from glob import glob

ROOT = pathlib.Path(__file__).resolve().parent.parent
O = ROOT / "import/out20"
chunks = json.loads((ROOT / "import/mehlman/chunks.json").read_text())

items = []
for m in sorted(glob(str(O / "block*.merged.json"))):
    items.extend(json.loads(pathlib.Path(m).read_text())["items"])

STOP = set("""a an the of to in on for with and or is are was were be been at by from as this that these those it
patient patients following most likely cause causes shows show which who man woman male female old year years
history presents comes physician because after during due more less than not no also within into over answer
his her their its will can may increased decreased high low normal dx most appropriate additional should when
involves commonly includes occurs present presentation use uses using another often typically usually seen
associated result results lead leads known called include""".split())
TOKEN = re.compile(r"[a-z][a-z0-9\-]{2,}")
def toks(t): return {x for x in TOKEN.findall((t or "").lower()) if x not in STOP}

N = len(chunks)
df = {}
for c in chunks:
    for t in set(c["tokens"]): df[t] = df.get(t, 0) + 1
AVGDL = sum(len(c["tokens"]) for c in chunks) / max(N, 1)
K1, B, DISTINCT_IDF = 1.2, 0.75, 3.0
def idf(t): return math.log((N + 1) / (1 + df.get(t, 0)))


def retrieve(it, k=4):
    ans = next((o["text"] for o in it["options"] if o["letter"] == it["correct_letter"]), "")
    # student_note names the dx/mechanism often — good retrieval signal, NEVER content
    q = toks(ans) | toks(it.get("student_note", "")) | toks(it["system_tag"]) | toks(it["discipline_tag"])
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
    return [{"source_label": c["source_label"], "score": round(s, 1), "text": c["text"][:700]} for s, c in scored[:k]]


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
        "student_note": it.get("student_note", ""),   # shown to enricher as UNVERIFIED hint
        "has_figure": it.get("has_figure", False), "needs_image": it.get("needs_image", False),
        "retrieved": retrieve(it),
    }
    by_block.setdefault(it["block_number"], []).append(rec)

for b, recs in sorted(by_block.items()):
    recs.sort(key=lambda r: r["q_number"])
    (O / f"enrich_input_block{b}.json").write_text(json.dumps(recs, ensure_ascii=False, indent=1))
    grounded = sum(1 for r in recs if r["retrieved"])
    print(f"block {b}: {len(recs)} questions, {grounded} with >=1 retrieved chunk -> enrich_input_block{b}.json")
