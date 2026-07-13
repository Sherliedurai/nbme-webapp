#!/usr/bin/env python3
"""
Retrieve top Mehlman chunks for NBME questions (keyword + tag, idf-weighted).
Usage: python3 scripts/mehlman_retrieve.py 1 11 16
Prints the matched chunks and WHY they matched. No enrichment is written.
"""
import json, math, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
chunks = json.loads((ROOT / "import/mehlman/chunks.json").read_text())
items = {i["q_number"]: i for i in json.loads((ROOT / "import/out/block1.merged.json").read_text())["items"]}

TOPICS = {1: "ABO transfusion reaction", 5: "Folate deficiency", 6: "Chronic granulomatous disease",
          11: "Bisphosphonates / osteoporosis", 12: "Hypersensitivity pneumonitis", 16: "Melanoma",
          18: "Obstructive uropathy ABG", 20: "Tinea cruris"}

STOP = set("""a an the of to in on for with and or is are was were be been at by from as this that these those it
patient patients following most likely cause causes shows show which who man woman male female old year years
history presents comes physician because after during due more less than not no also within into over answer
his her their its will can may increased decreased high low normal dx most appropriate additional should when
involves commonly includes occurs present presentation use uses using another often typically usually seen
associated result results lead leads known called include""".split())
TOKEN = re.compile(r"[a-z][a-z0-9\-]{2,}")


def toks(text):
    return {t for t in TOKEN.findall((text or "").lower()) if t not in STOP}


# corpus idf + average length for BM25
N = len(chunks)
df = {}
for c in chunks:
    for t in set(c["tokens"]):
        df[t] = df.get(t, 0) + 1
AVGDL = sum(len(c["tokens"]) for c in chunks) / max(N, 1)
K1, B = 1.2, 0.75
DISTINCT_IDF = 3.0  # a shared term must be at least this distinctive to count

def idf(t):
    return math.log((N + 1) / (1 + df.get(t, 0)))


def query_terms(it):
    """Concept terms: correct-answer text + Educational Objective + tags."""
    ans = next((o["text"] for o in it["options"] if o["letter"] == it["correct_letter"]), "")
    exp = it["source_explanation"]
    eo = exp.split("Educational Objective:")[-1] if "Educational Objective:" in exp else ""
    q = toks(ans) | toks(eo) | toks(it["system_tag"]) | toks(it["discipline_tag"])
    return q, ans


def retrieve(it, k=4):
    q, ans = query_terms(it)
    qtags = toks(it["system_tag"]) | toks(it["discipline_tag"])
    scored = []
    for c in chunks:
        ctok = set(c["tokens"])
        matched = q & ctok
        if not matched:
            continue
        # require at least one genuinely distinctive shared term (kills generic-word matches)
        if max(idf(t) for t in matched) < DISTINCT_IDF:
            continue
        clen = max(len(ctok), 1)
        norm = (K1 + 1) / (1 + K1 * (1 - B + B * clen / AVGDL))  # BM25 length normalization
        score = sum(idf(t) for t in matched) * norm
        tag_hit = bool(qtags & set(c["file_tags"]))
        if tag_hit:
            score *= 1.25
        scored.append((score, tag_hit, matched, c))
    scored.sort(key=lambda x: -x[0])
    return q, ans, scored[:k]


for n in [int(a) for a in sys.argv[1:]] or [1, 11, 16]:
    it = items[n]
    q, ans, top = retrieve(it)
    topterms = sorted(q, key=lambda t: -idf(t))[:10]
    print("═" * 78)
    print(f"Q{n} · {TOPICS.get(n,'')}  | system={it['system_tag']} discipline={it['discipline_tag']}")
    print(f"correct answer: {it['correct_letter']} — {ans}")
    print(f"query terms (top idf): {', '.join(topterms)}")
    print("─" * 78)
    if not top:
        print("  (no matches)")
    for rank, (score, tag_hit, matched, c) in enumerate(top, 1):
        why = ", ".join(sorted(matched, key=lambda t: -idf(t))[:6])
        snip = c["text"][:150].replace("\n", " ")
        print(f"  {rank}. [{score:5.1f}]{' +tag' if tag_hit else '     '}  {c['source_label'][:70]}")
        print(f"       why: {why}")
        print(f"       “{snip}…”")
    print()
