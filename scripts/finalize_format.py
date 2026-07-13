#!/usr/bin/env python3
"""
Stitch the terse/bold reformat: Q2 & Q16 from the current full file (already done)
+ v3 part files for the rest. Re-validate sources, lint tone/length, and confirm
every item has bold key words. Writes enrich_block1_full.json with --write
(backs up current as _v2).
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
O = ROOT / "import/out"
cur = {e["q_number"]: e for e in json.loads((O / "enrich_block1_full.json").read_text())["enrichments"]}
inp = {q["q_number"]: q for q in json.loads((O / "enrich_input_block1.json").read_text())}
v3 = {}
for f in ["enrich_block1_v3_partA.json", "enrich_block1_v3_partB.json"]:
    for e in json.loads((O / f).read_text())["enrichments"]:
        v3[e["q_number"]] = e

merged = {}
for n in range(1, 21):
    merged[n] = cur[n] if n in (2, 16) else v3.get(n)

def nkey(s): return re.sub(r"\s+", " ", (s or "")).strip()
def has_bold(s): return bool(re.search(r"\*\*.+?\*\*", s or ""))
ABS = re.compile(r"\b(always|never|all of|none of|every|completely|entirely|eliminat\w+|"
                 r"guarantee\w*|essentially never|nothing to do|purely)\b", re.I)
NARR = re.compile(r"(\?|\byou\b|\byour\b|\bpicture\b|stop it|at the door|steals|is booked|"
                  r"what kills|leaves the barn|\bimagine\b)", re.I)

issues = []
for n in range(1, 21):
    e = merged[n]
    if not e:
        issues.append(f"Q{n}: MISSING"); continue
    valid = {nkey(r["source_label"]) for r in inp[n]["retrieved"]} | {"model"}
    o = cur[n]
    for sec in ("high_yield", "how_they_test"):
        if len(e[sec]) != len(o[sec]):
            issues.append(f"Q{n} {sec}: count {len(e[sec])}!={len(o[sec])}")
        for i, x in enumerate(e[sec]):
            if nkey(x.get("source")) not in valid:
                issues.append(f"Q{n} {sec}[{i}]: invalid source {x.get('source')!r}")
    # bold present everywhere
    if not has_bold(e["answer_lock"]): issues.append(f"Q{n} answer_lock: no bold")
    if not has_bold(e["hook"]): issues.append(f"Q{n} hook: no bold")
    for i, k in enumerate(e["knockdowns"]):
        if not has_bold(k["reason"] + k["option"]): issues.append(f"Q{n} knock[{i}]: no bold")
    for i, x in enumerate(e["high_yield"]):
        if not has_bold(x["fact"]): issues.append(f"Q{n} hy[{i}]: no bold")
        if len(re.sub(r"\*\*", "", x["fact"]).split()) > 24: issues.append(f"Q{n} hy[{i}] long ({len(x['fact'].split())}w)")
    for i, x in enumerate(e["how_they_test"]):
        if not has_bold(x["answer"]): issues.append(f"Q{n} test[{i}]: answer no bold")
    # tone
    if NARR.search(e["hook"]): issues.append(f"Q{n} hook narrative: {e['hook']}")
    for label, txt in [("answer_lock", e["answer_lock"]), ("hook", e["hook"])] + \
            [(f"hy{i}", x["fact"]) for i, x in enumerate(e["high_yield"])] + \
            [(f"knock{i}", k["reason"]) for i, k in enumerate(e["knockdowns"])]:
        if ABS.search(txt): issues.append(f"Q{n} {label} ABSOLUTE: {ABS.search(txt).group(0)}")

print(f"stitched {sum(1 for v in merged.values() if v)}/20")
print("LINT: clean" if not issues else f"\n{len(issues)} ISSUES:")
for i in issues: print("  -", i)

blocking = [i for i in issues if "MISSING" in i or "invalid source" in i or "count" in i]
if "--write" in sys.argv and not blocking:
    (O / "enrich_block1_full.json").rename(O / "enrich_block1_full_v2.json")
    (O / "enrich_block1_full.json").write_text(
        json.dumps({"enrichments": [merged[n] for n in range(1, 21)]}, ensure_ascii=False, indent=2))
    print("\nwrote enrich_block1_full.json (prior backed up as _v2)")
elif "--write" in sys.argv:
    print("\nNOT written — blocking issues above")
