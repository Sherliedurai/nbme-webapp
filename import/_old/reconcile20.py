#!/usr/bin/env python3
"""
Reconcile the independent verification pass against extraction.

Reads:  import/out20/block<N>.merged.json          (extraction: correct_letter, numbers)
        import/out20/verify_block<N>.json           (blind re-read: verify_letter, number_flags)
Writes: import/out20/answer_key_reconciliation.csv  (every item: agree? + flags)
        stamps each merged item with answer_confidence:
          - "high"   if extraction letter == verify letter (two independent reads agree)
          - "low"    if they DISAGREE  (-> physician must adjudicate)
        and merges verify number_flags into numeric_review.

The reconciled confidence REPLACES the per-agent confidence (which was applied
inconsistently). Agreement between two blind reads is the real signal.
"""
import csv, json, pathlib
from glob import glob

ROOT = pathlib.Path(__file__).resolve().parent
O = ROOT / "out20"

rows = []
disagreements = []
n_total = n_agree = 0

for mp in sorted(glob(str(O / "block*.merged.json")), key=lambda p: int(pathlib.Path(p).stem.split("block")[1].split(".")[0])):
    b = int(pathlib.Path(mp).stem.split("block")[1].split(".")[0])
    merged = json.loads(pathlib.Path(mp).read_text())
    vp = O / f"verify_block{b}.json"
    verify = {}
    if vp.exists():
        for v in json.loads(vp.read_text())["items"]:
            verify[v["q_number"]] = v
    changed = False
    for it in merged["items"]:
        q = it["q_number"]
        v = verify.get(q)
        ext = it["correct_letter"]
        vl = (v or {}).get("verify_letter")
        agree = (v is not None) and (vl == ext)
        n_total += 1
        if agree:
            n_agree += 1
            it["answer_confidence"] = "high"
        elif v is None:
            it["answer_confidence"] = it.get("answer_confidence", "medium")  # no verify data
        else:
            it["answer_confidence"] = "low"
            disagreements.append((b, q, ext, vl, (v or {}).get("notes", "")))
        # merge number flags from verify into numeric_review
        for nf in (v or {}).get("number_flags", []) or []:
            it.setdefault("numeric_review", []).append(nf)
            changed = True
        rows.append([b, q, ext, vl if vl else "(no verify)", "AGREE" if agree else ("—" if v is None else "DISAGREE"),
                     (v or {}).get("marking", ""), (v or {}).get("notes", "")[:80]])
        changed = True
    if changed:
        pathlib.Path(mp).write_text(json.dumps(merged, ensure_ascii=False, indent=2))

with (O / "answer_key_reconciliation.csv").open("w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["block", "q_number", "extract_letter", "verify_letter", "verdict", "verify_marking", "verify_notes"])
    w.writerows(rows)

print(f"Reconciled {n_total} items: {n_agree} AGREE, {len(disagreements)} DISAGREE, {n_total-n_agree-len(disagreements)} no-verify-data.")
if disagreements:
    print("\nDISAGREEMENTS (physician must adjudicate — flagged answer_confidence=low):")
    for b, q, ext, vl, notes in disagreements:
        print(f"  block {b} q{q}: extract={ext} vs verify={vl}  | {notes[:90]}")
print("\n-> import/out20/answer_key_reconciliation.csv")
