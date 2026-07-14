#!/usr/bin/env python3
"""
Mandatory self-lint for blocks 2-10 enrichment (CLAUDE.md).
For each block: validate sources vs the retrieval pack (invalid → "model", flagged),
scan absolutes, enforce the 24-word high_yield cap, check narrative hooks + bold,
count grounded vs model. Rewrites source-corrected files; prints a report.
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
O = ROOT / "import/out"
BLOCKS = range(2, 11)

def nkey(s): return re.sub(r"\s+", " ", (s or "")).strip()
def has_bold(s): return bool(re.search(r"\*\*.+?\*\*", s or ""))
def wc(s): return len(re.sub(r"\*\*", "", s or "").split())
ABS = re.compile(r"\b(always|never|all of|none of|every|completely|entirely|eliminate(s|d)?|"
                 r"guarantee\w*|essentially never|nothing to do|purely)\b", re.I)
PREVENT = re.compile(r"\bprevent(s|ed|ion)?\b", re.I)
NARR = re.compile(r"(\?|\byou\b|\byour\b|\bpicture\b|stop it|at the door|steals|is booked|"
                  r"what kills|leaves the barn|\bimagine\b)", re.I)

report = {"grounded": 0, "model": 0, "absolutes": [], "prevent": [], "caps": [],
          "bad_source": [], "blank_source": [], "narrative": [], "no_bold": [], "counts": {}}

for b in BLOCKS:
    ef = O / f"enrich_block{b}_full.json"
    inf = O / f"enrich_input_block{b}.json"
    if not ef.exists():
        report["counts"][b] = "MISSING FILE"; continue
    enr = json.loads(ef.read_text())["enrichments"]
    inp = {q["q_number"]: q for q in json.loads(inf.read_text())}
    report["counts"][b] = len(enr)

    for e in enr:
        n = e["q_number"]
        valid = {nkey(r["source_label"]): r["source_label"] for r in inp.get(n, {}).get("retrieved", [])}
        valid["model"] = "model"
        for sec in ("high_yield", "how_they_test"):
            for x in e.get(sec, []):
                s = x.get("source")
                if s is None or str(s).strip() == "":
                    report["blank_source"].append(f"b{b} q{n} {sec}"); x["source"] = "model"
                k = nkey(x.get("source"))
                if k in valid:
                    x["source"] = valid[k]
                else:
                    report["bad_source"].append(f"b{b} q{n} {sec}: {x.get('source')!r}")
                    x["source"] = "model"
                report["model" if x["source"] == "model" else "grounded"] += 1

        # tone/format lint
        if NARR.search(e.get("hook", "")):
            report["narrative"].append(f"b{b} q{n}: {e['hook'][:60]}")
        blobs = [("answer_lock", e.get("answer_lock", "")), ("hook", e.get("hook", ""))]
        blobs += [(f"knock[{i}]", k.get("reason", "")) for i, k in enumerate(e.get("knockdowns", []))]
        blobs += [(f"hy[{i}]", x.get("fact", "")) for i, x in enumerate(e.get("high_yield", []))]
        blobs += [(f"test[{i}]", x.get("scenario", "") + " " + x.get("answer", "")) for i, x in enumerate(e.get("how_they_test", []))]
        for where, txt in blobs:
            if ABS.search(txt):
                report["absolutes"].append(f"b{b} q{n} {where}: …{ABS.search(txt).group(0)}…")
            if PREVENT.search(txt):
                report["prevent"].append(f"b{b} q{n} {where}")
        for i, x in enumerate(e.get("high_yield", [])):
            if wc(x.get("fact", "")) > 24:
                report["caps"].append(f"b{b} q{n} hy[{i}]: {wc(x['fact'])}w")
            if not has_bold(x.get("fact", "")):
                report["no_bold"].append(f"b{b} q{n} hy[{i}]")
        if not has_bold(e.get("answer_lock", "")):
            report["no_bold"].append(f"b{b} q{n} answer_lock")

    ef.write_text(json.dumps({"enrichments": enr}, ensure_ascii=False, indent=2))

# ── report ──
print("=== SELF-LINT: blocks 2-10 ===")
print("per-block enrichment counts:", {b: report["counts"][b] for b in BLOCKS})
print(f"GROUNDED (Mehlman-cited): {report['grounded']}  |  MODEL: {report['model']}")
for key, label in [("absolutes", "ABSOLUTE-word hits"), ("caps", "24-word CAP violations"),
                   ("blank_source", "BLANK sources (→model)"), ("bad_source", "INVALID/fabricated sources (→model)"),
                   ("narrative", "NARRATIVE hooks"), ("no_bold", "items missing bold"),
                   ("prevent", "'prevent' (review)")]:
    items = report[key]
    print(f"\n{label}: {len(items)}")
    for x in items[:25]:
        print("  -", x)
    if len(items) > 25:
        print(f"  … +{len(items)-25} more")
