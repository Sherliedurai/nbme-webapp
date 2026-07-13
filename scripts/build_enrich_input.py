#!/usr/bin/env python3
"""
Build the per-question enrichment input: for each block-1 question, deterministically
retrieve the top Mehlman chunks (so grounding is code-driven, not model-driven) and
bundle them with the question + existing 3 layers. The LLM step then writes only
high_yield + how_they_test, grounded ONLY in these chunks.

Out: import/out/enrich_input_block1.json
"""
import json, math, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
chunks = json.loads((ROOT / "import/mehlman/chunks.json").read_text())
items = {i["q_number"]: i for i in json.loads((ROOT / "import/out/block1.merged.json").read_text())["items"]}
enrich = {e["q_number"]: e for e in json.loads((ROOT / "import/out/enrich_block1.json").read_text())["enrichments"]}

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
    exp = it["source_explanation"]
    eo = exp.split("Educational Objective:")[-1] if "Educational Objective:" in exp else ""
    q = toks(ans) | toks(eo) | toks(it["system_tag"]) | toks(it["discipline_tag"])
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
    return [{"source_label": c["source_label"], "score": round(s, 1),
             "text": c["text"][:700]} for s, c in scored[:k]]


out = []
for n in range(1, 21):
    it, e = items[n], enrich[n]
    ans = next((o["text"] for o in it["options"] if o["letter"] == it["correct_letter"]), "")
    out.append({
        "q_number": n,
        "vignette_text": it["vignette_text"],
        "options": it["options"],
        "correct_letter": it["correct_letter"],
        "correct_text": ans,
        "system_tag": it["system_tag"],
        "discipline_tag": it["discipline_tag"],
        "source_explanation": it["source_explanation"],
        "existing": {"answer_lock": e["answer_lock"], "hook": e["hook"], "knockdowns": e["knockdowns"]},
        "retrieved": retrieve(it),
    })

path = ROOT / "import/out/enrich_input_block1.json"
path.write_text(json.dumps(out, ensure_ascii=False, indent=1))
# report retrieval coverage
have = sum(1 for o in out if o["retrieved"])
print(f"wrote {path.relative_to(ROOT)} — {len(out)} questions, {have} with >=1 retrieved chunk")
for o in out:
    labels = [r["source_label"][:40] for r in o["retrieved"]]
    print(f"  Q{o['q_number']:>2} ({len(o['retrieved'])}): {labels}")
