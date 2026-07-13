#!/usr/bin/env python3
"""
Merge the 3 existing layers (enrich_block1.json) with the 2 grounded sections
(enrich_part{A,B}_hy.json) -> enrich_block1_full.json (5 sections).

QA: every high_yield/how_they_test `source` must be "model" OR an exact
source_label from that question's retrieval pack. Invented/blank sources are
downgraded to "model" and reported. Also scans facts/scenarios for absolutes.
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
O = ROOT / "import/out"
base = {e["q_number"]: e for e in json.loads((O / "enrich_block1.json").read_text())["enrichments"]}
inp = {q["q_number"]: q for q in json.loads((O / "enrich_input_block1.json").read_text())}
hy = {}
for f in ["enrich_partA_hy.json", "enrich_partB_hy.json"]:
    for it in json.loads((O / f).read_text())["items"]:
        hy[it["q_number"]] = it

ABS = re.compile(r"\b(always|never|all of|none of|every|essentially never)\b", re.I)
issues, grounded, model = [], 0, 0
full = []

def nkey(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


for n in range(1, 21):
    b, h = base[n], hy.get(n, {"high_yield": [], "how_they_test": []})
    # normalized map -> canonical label (tolerant of trailing/double whitespace quirks)
    valid_map = {nkey(r["source_label"]): r["source_label"] for r in inp[n]["retrieved"]}
    valid_map["model"] = "model"

    def fix_source(src, where):
        global grounded, model
        k = nkey(src)
        if k in valid_map:
            s = valid_map[k]
        else:
            issues.append(f"Q{n} {where}: source {src!r} not in retrieval pack -> 'model'")
            s = "model"
        if s == "model":
            model += 1
        else:
            grounded += 1
        return s

    high = []
    for x in h.get("high_yield", []):
        x["source"] = fix_source(x.get("source"), "high_yield")
        if ABS.search(x.get("fact", "")):
            issues.append(f"Q{n} high_yield absolute: {x['fact'][:60]}")
        high.append(x)
    tests = []
    for x in h.get("how_they_test", []):
        x["source"] = fix_source(x.get("source"), "how_they_test")
        if ABS.search(x.get("scenario", "") + " " + x.get("answer", "")):
            issues.append(f"Q{n} how_they_test absolute: {x.get('scenario','')[:60]}")
        tests.append(x)

    full.append({
        "q_number": n,
        "answer_lock": b["answer_lock"],
        "hook": b["hook"],
        "knockdowns": b["knockdowns"],
        "high_yield": high,
        "how_they_test": tests,
    })

(O / "enrich_block1_full.json").write_text(json.dumps({"enrichments": full}, ensure_ascii=False, indent=2))
print(f"wrote enrich_block1_full.json (20 questions, 5 sections)")
print(f"grounded-in-Mehlman: {grounded} | model: {model}")
print(f"per-Q high_yield / how_they_test counts:")
for e in full:
    print(f"  Q{e['q_number']:>2}: hy={len(e['high_yield'])} test={len(e['how_they_test'])}")
if issues:
    print("\nQA ISSUES:")
    for i in issues:
        print("  -", i)
else:
    print("\nQA: clean (all sources valid, no absolutes)")
