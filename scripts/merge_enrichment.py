#!/usr/bin/env python3
"""
Per-form enrichment merge + THREE-way provenance QA + self-lint. Generalized from the
Form-31 block-1 merge_enrichment.py; supersedes it. Takes --form NN, reads import/out<form>/.

Generation contract (what the enrichment step must emit, one file per block):
  import/out<form>/enrich_block<N>.json =
    {"enrichments":[{ "q_number":int,
                      "answer_lock":str, "hook":str,
                      "knockdowns":[{"option":str,"reason":str}],
                      "high_yield":[{"fact":str,"source":str}],
                      "how_they_test":[{"scenario":str,"answer":str,"source":str}],
                      "primary_discipline":str }, ...]}

This script:
  1. Validates every high_yield/how_they_test `source` under a THREE-way taxonomy:
       - "official"        -> backed by THIS item's printed NBME explanation. Allowed only if the
                              item actually has a non-empty official_explanation (else -> "model").
       - "<Mehlman label>" -> allowed iff it is an exact source_label in THIS q's retrieval pack.
       - "model"           -> ungrounded; always allowed.
     Anything else is downgraded to "model" and reported. (Never fabricate a source — CLAUDE.md #3.)
  2. Self-lints: absolute words (always/never/all of/none of/every/prevents), 24-word high_yield cap.
     Also scans answer_lock/hook for absolutes (the precision-loss failure mode).
  3. Normalizes compound discipline_tag -> primary_discipline (the enricher's pick): keeps the
     original in discipline_tag_original and sets discipline_tag = primary so the custom-block
     filter works. Only rewrites items whose tag actually changed.
  4. Merges enriched_explanation (the 5-section object) INTO import/out<form>/block<N>.merged.json
     so `build_form.py --form NN sql` picks it up.

Reports the official / Mehlman / model split separately (owner request), plus all lint hits.
SQL/DB: none. Writes only the gitignored merged JSON. Loud-fails on missing inputs.
"""
import argparse, json, re, pathlib, sys
from glob import glob

ROOT = pathlib.Path(__file__).resolve().parent.parent
ABS = re.compile(r"\b(always|never|all of|none of|every|essentially never|prevents?)\b", re.I)
CAP = 24  # high_yield words per fact; FINAL per CLAUDE.md — this script flags, never relaxes.
VERBATIM_RUN = 8  # words. An enriched field sharing >=8 consecutive words with official_explanation is
                  # copying licensed NBME prose. The enricher must GROUND in official text but REWRITE it
                  # into the terse app voice — verbatim NBME text must never enter enriched_explanation
                  # (which loads to the DB). Shared short terminology (a few words) never triggers this.

def nkey(s): return re.sub(r"\s+", " ", (s or "")).strip()
def nwords(s): return len((s or "").split())


def verbatim_span(text, official):
    """Longest run (>=VERBATIM_RUN words) of `text` that appears verbatim inside `official`,
    else ''. Only copied clauses/sentences trip it, not shared medical terms."""
    tw = re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (text or "").lower())).split()
    o = " " + re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (official or "").lower())) + " "
    best, i = "", 0
    while i <= len(tw) - VERBATIM_RUN:
        j = i + VERBATIM_RUN
        if f" {' '.join(tw[i:j])} " in o:
            while j < len(tw) and f" {' '.join(tw[i:j + 1])} " in o:
                j += 1
            span = " ".join(tw[i:j])
            if len(span) > len(best):
                best = span
            i = j
        else:
            i += 1
    return best


def main():
    ap = argparse.ArgumentParser(description="Merge enrichment + 3-way provenance QA + self-lint.")
    ap.add_argument("--form", type=int, required=True, help="NBME form number (e.g. 28). No default.")
    a = ap.parse_args()
    O = ROOT / f"import/out{a.form}"

    blocks = sorted(int(pathlib.Path(p).stem.split("block")[1].split(".")[0])
                    for p in glob(str(O / "enrich_block*.json")))
    if not blocks:
        sys.exit(f"FATAL: no enrich_block*.json in {O} — generate enrichments first.")

    counts = {"official": 0, "mehlman": 0, "model": 0}
    issues = []
    per_q = []
    to_write = {}
    nverbatim = 0
    naccepted_abs = 0   # absolutes explicitly marked absolute_ok (literally true + officially supported)

    for b in blocks:
        enr_p, inp_p, mrg_p = (O / f"enrich_block{b}.json", O / f"enrich_input_block{b}.json",
                               O / f"block{b}.merged.json")
        for p in (inp_p, mrg_p):
            if not p.exists():
                sys.exit(f"FATAL: missing {p}")
        enrich = {e["q_number"]: e for e in json.loads(enr_p.read_text())["enrichments"]}
        packs = {q["q_number"]: q for q in json.loads(inp_p.read_text())}
        mdata = json.loads(mrg_p.read_text())

        for it in mdata["items"]:
            n = it["q_number"]
            e = enrich.get(n)
            if not e:
                issues.append(f"Q{n}: no enrichment generated")
                continue
            pack = packs.get(n, {})
            valid_labels = {nkey(r["source_label"]): r["source_label"] for r in pack.get("retrieved", [])}
            has_official = bool((pack.get("official_explanation") or "").strip())

            def fix_source(src, where):
                k = nkey(src)
                if k == "official":
                    if has_official:
                        counts["official"] += 1
                        return "official"
                    issues.append(f"Q{n} {where}: 'official' but item has no official_explanation -> 'model'")
                    counts["model"] += 1
                    return "model"
                if k in ("", "model"):
                    counts["model"] += 1
                    return "model"
                if k in valid_labels:
                    counts["mehlman"] += 1
                    return valid_labels[k]   # canonical exact source_label from the retrieval pack
                issues.append(f"Q{n} {where}: source {src!r} not 'official' and not in retrieval pack -> 'model'")
                counts["model"] += 1
                return "model"

            # An entry (or answer_lock/hook via item-level) may carry "absolute_ok": true when the
            # absolute is literally true AND supported by the official text (e.g. "every drug of abuse
            # ↑ dopamine"). Such hits are ACCEPTED (counted, with reason kept in the data), not violations.
            hy = []
            for x in e.get("high_yield", []):
                x["source"] = fix_source(x.get("source"), "high_yield")
                if ABS.search(x.get("fact", "")):
                    if x.get("absolute_ok"):
                        naccepted_abs += 1
                    else:
                        issues.append(f"Q{n} high_yield ABSOLUTE: {x['fact'][:70]}")
                w = nwords(x.get("fact", ""))
                if w > CAP:
                    issues.append(f"Q{n} high_yield OVER CAP ({w}>{CAP} words): {x['fact'][:70]}")
                hy.append(x)
            tt = []
            for x in e.get("how_they_test", []):
                x["source"] = fix_source(x.get("source"), "how_they_test")
                if ABS.search((x.get("scenario", "") + " " + x.get("answer", ""))):
                    if x.get("absolute_ok"):
                        naccepted_abs += 1
                    else:
                        issues.append(f"Q{n} how_they_test ABSOLUTE: {x.get('scenario','')[:70]}")
                tt.append(x)
            for fld in ("answer_lock", "hook"):
                if ABS.search(e.get(fld, "")):
                    if e.get("absolute_ok"):
                        naccepted_abs += 1
                    else:
                        issues.append(f"Q{n} {fld} ABSOLUTE: {e.get(fld,'')[:70]}")

            # verbatim-overlap lint: no enriched (DB-bound) field may copy a long span of the
            # licensed official explanation — it must be REWRITTEN into the app voice.
            official = pack.get("official_explanation") or ""
            if official:
                scan = [("answer_lock", e.get("answer_lock", "")), ("hook", e.get("hook", ""))]
                scan += [("knockdown", k.get("reason", "")) for k in e.get("knockdowns", [])]
                scan += [("high_yield", x.get("fact", "")) for x in hy]
                scan += [("how_they_test", x.get("scenario", "") + " " + x.get("answer", "")) for x in tt]
                for where, txt in scan:
                    sp = verbatim_span(txt, official)
                    if sp:
                        nverbatim += 1
                        issues.append(f"Q{n} {where} VERBATIM-OVERLAP ({len(sp.split())} words vs official): \"{sp[:80]}\"")

            it["enriched_explanation"] = {
                "answer_lock": e["answer_lock"], "hook": e["hook"],
                "knockdowns": e["knockdowns"], "high_yield": hy, "how_they_test": tt,
            }
            # discipline normalization (folded-in fix): keep original, set primary so the filter works
            pd = (e.get("primary_discipline") or "").strip()
            if pd and pd != it.get("discipline_tag"):
                it["discipline_tag_original"] = it["discipline_tag"]
                it["discipline_tag"] = pd
            it["primary_discipline"] = pd or it.get("discipline_tag")
            per_q.append((n, len(hy), len(tt)))
        to_write[b] = (mrg_p, mdata)

    for b, (p, d) in to_write.items():
        p.write_text(json.dumps(d, ensure_ascii=False, indent=2))

    tot = sum(counts.values())
    print(f"=== ENRICHMENT MERGE + SELF-LINT (form {a.form}) ===")
    print(f"enriched items: {len(per_q)}")
    print(f"provenance of high_yield+how_they_test sources: "
          f"official={counts['official']}  Mehlman={counts['mehlman']}  model={counts['model']}  (total {tot})")
    if tot:
        print(f"  ratio -> official {counts['official']*100//tot}% / "
              f"Mehlman {counts['mehlman']*100//tot}% / model {counts['model']*100//tot}%")
    print(f"verbatim-overlap flags (enriched field copying >= {VERBATIM_RUN} words of official prose): {nverbatim}")
    print(f"accepted absolutes (absolute_ok, literally true + officially supported): {naccepted_abs}")
    print(f"lint issues (disallowed): {len(issues)}")
    for i in issues:
        print("  -", i)
    if not issues:
        print("  clean (no invalid sources, no absolutes, no cap violations, no verbatim overlap)")


if __name__ == "__main__":
    main()
