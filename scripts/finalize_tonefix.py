#!/usr/bin/env python3
"""
Merge the tone-fixed v2 parts, re-validate sources against the retrieval pack,
and lint for absolutes / narrative hooks / length. Backs up the prior full file.
Writes import/out/enrich_block1_full.json only if --write is passed.
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
O = ROOT / "import/out"
inp = {q["q_number"]: q for q in json.loads((O / "enrich_input_block1.json").read_text())}
parts = []
for f in ["enrich_block1_v2_partA.json", "enrich_block1_v2_partB.json"]:
    parts += json.loads((O / f).read_text())["enrichments"]
by_q = {e["q_number"]: e for e in parts}

def nkey(s): return re.sub(r"\s+", " ", (s or "")).strip()

ABS = re.compile(r"\b(always|never|all of|none of|every|completely|entirely|eliminat\w+|"
                 r"guarantee\w*|essentially never|nothing to do|purely)\b", re.I)
PREVENT = re.compile(r"\bprevent(s|ed|ion)?\b", re.I)
NARR = re.compile(r"(\?|\byou\b|\byour\b|\bpicture\b|stop it|at the door|steals|is booked|"
                  r"what kills|leaves the barn|\bimagine\b|\bthink of\b)", re.I)

issues = []
for n in range(1, 21):
    e = by_q.get(n)
    if not e:
        issues.append(f"Q{n}: MISSING from rewrite"); continue
    valid = {nkey(r["source_label"]) for r in inp[n]["retrieved"]} | {"model"}
    orig = next(x for x in json.loads((O / "enrich_block1_full.json").read_text())["enrichments"] if x["q_number"] == n)

    # source preservation (count + validity + order vs original)
    for sec in ("high_yield", "how_they_test"):
        if len(e[sec]) != len(orig[sec]):
            issues.append(f"Q{n} {sec}: item count {len(e[sec])} != original {len(orig[sec])}")
        for i, (new, old) in enumerate(zip(e[sec], orig[sec])):
            if nkey(new.get("source")) not in valid:
                issues.append(f"Q{n} {sec}[{i}]: invalid source {new.get('source')!r}")
            elif nkey(new.get("source")) != nkey(old.get("source")):
                issues.append(f"Q{n} {sec}[{i}]: source changed from original")

    # tone: hook narrative
    if NARR.search(e["hook"]):
        issues.append(f"Q{n} hook narrative/2nd-person: {e['hook']}")
    if len(e["hook"].split()) > 26:
        issues.append(f"Q{n} hook long ({len(e['hook'].split())}w)")

    # absolutes everywhere
    blobs = [("answer_lock", e["answer_lock"]), ("hook", e["hook"])]
    blobs += [(f"knock:{k['option'][:18]}", k["reason"]) for k in e["knockdowns"]]
    blobs += [(f"hy[{i}]", x["fact"]) for i, x in enumerate(e["high_yield"])]
    blobs += [(f"test[{i}]", x["scenario"] + " " + x["answer"]) for i, x in enumerate(e["how_they_test"])]
    for where, txt in blobs:
        if ABS.search(txt):
            issues.append(f"Q{n} {where} ABSOLUTE: …{ABS.search(txt).group(0)}… {txt[:70]}")
        if PREVENT.search(txt):
            issues.append(f"Q{n} {where} 'prevent' (review): {txt[:70]}")

    # length: terse high_yield / how_they_test
    for i, x in enumerate(e["high_yield"]):
        if len(x["fact"].split()) > 30:
            issues.append(f"Q{n} hy[{i}] long ({len(x['fact'].split())}w): {x['fact'][:60]}")
    for i, x in enumerate(e["how_they_test"]):
        if len(x["answer"].split()) > 22:
            issues.append(f"Q{n} test[{i}] answer long ({len(x['answer'].split())}w)")

print(f"merged {len(by_q)}/20 questions")
if issues:
    print(f"\n{len(issues)} LINT ISSUES:")
    for i in issues:
        print("  -", i)
else:
    print("\nLINT: clean")

if "--write" in sys.argv and not any("MISSING" in i or "invalid source" in i or "count" in i for i in issues):
    (O / "enrich_block1_full.json").rename(O / "enrich_block1_full_v1.json")
    (O / "enrich_block1_full.json").write_text(
        json.dumps({"enrichments": [by_q[n] for n in range(1, 21)]}, ensure_ascii=False, indent=2))
    print("\nwrote enrich_block1_full.json (backed up prior as _v1)")
