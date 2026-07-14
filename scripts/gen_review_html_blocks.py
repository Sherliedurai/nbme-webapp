#!/usr/bin/env python3
"""Standalone offline review HTML for blocks 2-10 (178 questions). Gitignored output."""
import hashlib, html, json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "enrichment_review_blocks2-10.html"
items = {i["q_number"]: i for i in json.loads((ROOT / "import/out/blocks2-10.merged.json").read_text())["items"]}
enr = {}
for b in range(2, 11):
    for e in json.loads((ROOT / f"import/out/enrich_block{b}_full.json").read_text())["enrichments"]:
        enr[e["q_number"]] = e

QLIST = sorted(items)                    # 21-200 minus gaps (41, 158)
BUILD = "b2-10-" + hashlib.sha1(json.dumps(enr, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:8]
FAMILY = "b2-10-"
g = sum(1 for e in enr.values() for x in e["high_yield"] + e["how_they_test"] if x["source"] != "model")
m = sum(1 for e in enr.values() for x in e["high_yield"] + e["how_they_test"] if x["source"] == "model")

# physician-call items I flagged during the run, categorized
SOURCE_ERR = {
    170: "NBME source mislabels specificity as “sensitivity”",
    183: "NBME source says ARPKD/PKD1, but the vignette is adult ADPKD (chr16)",
    197: "HUS mechanism kept as Shiga-toxin (not TTP/ADAMTS13, which the chunk loosely invoked)",
}
NUMERIC = {
    194: "creatinine 0.8 mg/dL — a digit was partly under a highlight",
    141: "thyroxine (T4) 50 µg/dL — legible but clinically high",
}
NEEDS_IMG = {51: "answer options are ON the figure", 103: "answer options are ON the figure"}


def esc(s): return html.escape(str(s), quote=True)
def md(s): return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html.escape(str(s), quote=True))


def src_chip(source):
    if (source or "model") == "model":
        return '<span class="src model">model-generated</span>'
    return f'<span class="src grounded" title="grounded in Mehlman">{esc(source)}</span>'


def card(n):
    it, e = items[n], enr[n]
    correct = next((o["text"] for o in it["options"] if o["letter"] == it["correct_letter"]), "")
    opts = "".join(f'<li{" class=correct" if o["letter"]==it["correct_letter"] else ""}>'
                   f'<b>{esc(o["letter"])}.</b> {esc(o["text"])}</li>' for o in it["options"])
    knocks = "".join(f'<li><b>{md(k["option"])}</b> — {md(k["reason"])}</li>' for k in e["knockdowns"])
    highs = "".join(f'<li>{md(x["fact"])} {src_chip(x.get("source"))}</li>' for x in e.get("high_yield", []))
    tests = "".join(f'<li><span class="scn">{md(x["scenario"])}</span> → <b>{md(x["answer"])}</b> '
                    f'{src_chip(x.get("source"))}</li>' for x in e.get("how_they_test", []))
    badges = ""
    if n in SOURCE_ERR:
        badges += f'<span class="badge err">⚑ NBME source error: {esc(SOURCE_ERR[n])}</span>'
    if n in NUMERIC:
        badges += f'<span class="badge num">🔢 verify number: {esc(NUMERIC[n])}</span>'
    if n in NEEDS_IMG:
        badges += '<span class="badge img">🖼 figure carries the answer options</span>'
    topic = f'{esc(it["system_tag"])} · {esc(it["discipline_tag"])} · {esc(it["question_type"])}'
    return f"""
<article class="card" id="q{n}" data-q="{n}" data-verdict="">
  <div class="head"><span class="qnum">Q{n}</span><span class="topic">{topic}</span>
    <span class="badges">{badges}</span></div>
  <details class="collapse vignette"><summary>Vignette &amp; options <span class="hint">(tap for context)</span></summary>
    <div class="pre">{esc(it["vignette_text"])}</div><ul class="options">{opts}</ul></details>
  <div class="correct">Correct answer &nbsp;<b>{esc(it["correct_letter"])} — {esc(correct)}</b></div>
  <div class="layer lock"><h3>Bottom line</h3><p>{md(e["answer_lock"])}</p></div>
  <div class="layer knock"><h3>Knockdowns</h3><ul>{knocks}</ul></div>
  <div class="layer hook"><h3>Remember it as</h3><p>{md(e["hook"])}</p></div>
  <div class="layer hy"><h3>High yield</h3><ul>{highs}</ul></div>
  <div class="layer test"><h3>How they test it</h3><ul>{tests}</ul></div>
  <details class="collapse source"><summary>Original NBME explanation <span class="hint">(compare if you want)</span></summary>
    <div class="pre">{esc(it["source_explanation"])}</div></details>
  <div class="review"><div class="verdicts" role="group" aria-label="verdict">
      <button data-v="approve">✓ Approve</button><button data-v="edit">✎ Needs edit</button>
      <button data-v="wrong">✕ Medically wrong</button></div>
    <textarea class="comment" rows="2" placeholder="Correction or comment (optional)…"></textarea></div>
</article>"""


# cards grouped by block with a section header
parts, cur = [], None
for n in QLIST:
    b = items[n]["block_number"]
    if b != cur:
        cur = b
        parts.append(f'<div class="blocksec">Block {b}</div>')
    parts.append(card(n))
CARDS = "\n".join(parts)

src_chips = " ".join(f'<a class="chip" href="#q{q}">Q{q}</a>' for q in SOURCE_ERR)
num_chips = " ".join(f'<a class="chip num" href="#q{q}">Q{q}</a>' for q in NUMERIC)
QLIST_JS = json.dumps(QLIST)

TEMPLATE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Blocks 2-10 — Enrichment Review</title>
<style>
  :root{--navy:#22314c;--ink:#1f2733;--muted:#5b6774;--line:#e3e8ef;--bg:#eef1f5;
    --lock:#1d4ed8;--knock:#b45309;--hook:#7c3aed;--approve:#15803d;--edit:#b45309;--wrong:#b91c1c;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:18px;line-height:1.55;-webkit-text-size-adjust:100%}
  .wrap{max-width:780px;margin:0 auto;padding:16px}
  header.top{position:sticky;top:0;z-index:10;background:var(--navy);color:#fff;padding:14px 16px;border-radius:0 0 14px 14px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
  header.top h1{margin:0 0 8px;font-size:1.15rem;font-weight:700}
  .progress{display:flex;align-items:center;gap:10px;font-size:.95rem}
  .bar{flex:1;height:8px;background:rgba(255,255,255,.25);border-radius:99px;overflow:hidden}
  .bar>i{display:block;height:100%;width:0;background:#7dd3a0;transition:width .2s}
  .notices{margin:14px 0 4px}
  .banner{background:#fff7ed;border:1px solid #fed7aa;color:#7c2d12;border-radius:12px;padding:12px 14px;margin-bottom:10px;font-size:.98rem}
  .banner b{color:#9a3412}
  .banner .chip{display:inline-block;background:#fb923c;color:#fff;font-weight:600;padding:3px 10px;border-radius:99px;text-decoration:none;margin:4px 6px 0 0;font-size:.9rem}
  .note{background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;border-radius:12px;padding:10px 14px;font-size:.92rem}
  .blocksec{position:sticky;top:64px;z-index:5;background:var(--navy);color:#fff;font-weight:800;
    padding:6px 14px;border-radius:8px;margin:26px 0 6px;font-size:.95rem;letter-spacing:.05em}
  article.card{background:#fff;border:1px solid var(--line);border-left:5px solid var(--line);border-radius:14px;padding:18px;margin:16px 0;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  .card[data-verdict="approve"]{border-left-color:var(--approve)}
  .card[data-verdict="edit"]{border-left-color:var(--edit)}
  .card[data-verdict="wrong"]{border-left-color:var(--wrong)}
  .head{display:flex;align-items:baseline;flex-wrap:wrap;gap:10px;margin-bottom:10px}
  .qnum{font-weight:800;color:var(--navy);font-size:1.15rem}
  .topic{color:var(--muted);font-weight:600;font-size:.85rem}
  .badges{flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px}
  .badge{font-size:.78rem;font-weight:700;padding:3px 9px;border-radius:99px}
  .badge.err{background:#fee2e2;color:#b91c1c} .badge.num{background:#fef3c7;color:#92400e} .badge.img{background:#e0e7ff;color:#3730a3}
  .banner.err{background:#fef2f2;border-color:#fecaca;color:#991b1b} .banner.err b{color:#b91c1c}
  .banner.num{background:#fffbeb;border-color:#fde68a;color:#92400e} .banner.num b{color:#92400e}
  .chip.num{background:#f59e0b}
  details.collapse{border:1px solid var(--line);border-radius:10px;margin:10px 0;background:#fafbfc}
  details.collapse>summary{cursor:pointer;padding:11px 14px;font-weight:600;color:var(--navy);list-style:none;user-select:none}
  details.collapse>summary::-webkit-details-marker{display:none}
  details.collapse>summary:before{content:"▸ ";color:var(--muted)}
  details.collapse[open]>summary:before{content:"▾ "}
  .hint{color:var(--muted);font-weight:400;font-size:.85rem}
  .pre{white-space:pre-wrap;padding:0 14px 12px;font-family:Georgia,Cambria,serif;font-size:1.02rem;line-height:1.7;color:#26303c}
  ul.options{margin:0;padding:2px 14px 14px 34px}
  ul.options li{margin:3px 0} ul.options li.correct{color:var(--approve);font-weight:600}
  .correct{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:10px;padding:9px 13px;margin:10px 0 4px;font-size:.98rem}
  .layer{margin:14px 0}
  .layer h3{margin:0 0 4px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em}
  .layer.lock h3{color:var(--lock)} .layer.knock h3{color:var(--knock)} .layer.hook h3{color:var(--hook)}
  .layer p{margin:0}
  .layer.knock ul{margin:0;padding-left:20px} .layer.knock li{margin:6px 0}
  .layer.hook{background:#f7f5ff;border:1px solid #e5ddff;border-radius:10px;padding:12px 14px}
  .layer.hook p{font-style:italic;color:#4c1d95}
  .layer.hy h3{color:#0f766e} .layer.test h3{color:#9d174d}
  .layer.hy ul,.layer.test ul{margin:0;padding-left:20px} .layer.hy li,.layer.test li{margin:8px 0}
  .layer.test .scn{color:#334155}
  .src{display:inline-block;font-size:.72rem;font-weight:600;padding:2px 8px;border-radius:99px;margin-left:4px;white-space:normal;vertical-align:baseline}
  .src.grounded{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
  .src.model{background:#fef3c7;color:#92400e;border:1px solid #fcd34d}
  .review{margin-top:16px;border-top:1px dashed var(--line);padding-top:14px}
  .verdicts{display:flex;gap:8px;flex-wrap:wrap}
  .verdicts button{flex:1;min-width:120px;min-height:46px;font-size:.95rem;font-weight:700;border:2px solid var(--line);background:#fff;color:var(--muted);border-radius:10px;cursor:pointer}
  .verdicts button[data-v="approve"].active{background:var(--approve);border-color:var(--approve);color:#fff}
  .verdicts button[data-v="edit"].active{background:var(--edit);border-color:var(--edit);color:#fff}
  .verdicts button[data-v="wrong"].active{background:var(--wrong);border-color:var(--wrong);color:#fff}
  textarea{width:100%;margin-top:10px;padding:11px;font:inherit;font-size:1rem;border:1px solid var(--line);border-radius:10px;resize:vertical}
  footer.bottom{margin:24px 0 60px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px}
  footer.bottom h2{margin:0 0 8px;font-size:1.05rem;color:var(--navy)}
  .btn{display:inline-block;min-height:48px;padding:0 20px;font-size:1rem;font-weight:700;background:var(--navy);color:#fff;border:none;border-radius:10px;cursor:pointer;line-height:48px}
  .btn.ghost{background:#fff;color:var(--navy);border:2px solid var(--navy)}
  #exportOut{margin-top:12px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem;min-height:120px;display:none}
  #copyMsg{color:var(--approve);font-weight:700;margin-left:10px}
</style></head><body>
<header class="top"><div class="wrap">
  <h1>Blocks 2-10 · Enrichment Review <span style="opacity:.55;font-size:.7rem;font-weight:500">build __BUILD__</span></h1>
  <div class="progress"><span id="progress">0 of __TOTAL__ reviewed</span><span class="bar"><i id="progressBar"></i></span></div>
</div></header>
<div class="wrap">
  <div class="notices">
    <div class="banner err"><b>🔴 3 NBME source-content errors — start here.</b>
      If you confirm these, our enrichment is <i>more accurate than NBME's own explanation</i> (worth knowing):
      __SRCCHIPS__</div>
    <div class="banner num"><b>🔢 Two numbers to eyeball:</b> __NUMCHIPS__ —
      q194 creatinine 0.8 (a digit was partly under a highlight); q141 T4 50 µg/dL (legible but clinically high).</div>
    <div class="note">
      __TOTAL__ questions (blocks 2-10). Five sections each; in <b>High yield</b> / <b>How they test it</b> every item
      shows its source: a <span class="src grounded">green Mehlman citation</span> when grounded, or an
      <span class="src model">amber model-generated</span> tag when not — <b>scrutinize the amber ones most</b>
      (__G__ grounded / __M__ model). q41 &amp; q158 are genuine gaps in the source PDF. Progress saves on this
      device — do a block at a time.
    </div>
  </div>
  __CARDS__
  <footer class="bottom"><h2>Export review</h2>
    <p style="margin:0 0 12px;color:#5b6774;font-size:.95rem">Export your verdicts + comments (any time) and send the file back.</p>
    <button class="btn" id="export">⬇ Export review</button><button class="btn ghost" id="copy">Copy JSON</button>
    <span id="copyMsg"></span><textarea id="exportOut" readonly></textarea></footer>
</div>
<script>
  const BUILD='__BUILD__', FAMILY='__FAMILY__', QLIST=__QLIST__, TOTAL=QLIST.length;
  const KEY='nbme-enrich-review-'+BUILD;
  Object.keys(localStorage).forEach(k=>{ if(k.startsWith('nbme-enrich-review-'+FAMILY) && k!==KEY) localStorage.removeItem(k); });
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}};
  const state=load(); const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
  function progress(){const n=Object.values(state).filter(x=>x&&x.verdict).length;
    document.getElementById('progress').textContent=`${n} of ${TOTAL} reviewed`;
    document.getElementById('progressBar').style.width=(n/TOTAL*100)+'%';}
  document.querySelectorAll('.card').forEach(card=>{const q=card.dataset.q, st=state[q]||{};
    card.dataset.verdict=st.verdict||'';
    card.querySelectorAll('.verdicts button').forEach(b=>{ if(st.verdict===b.dataset.v) b.classList.add('active');
      b.addEventListener('click',()=>{const cur=state[q]||{}; cur.verdict=cur.verdict===b.dataset.v?null:b.dataset.v;
        state[q]=cur; save(); card.querySelectorAll('.verdicts button').forEach(x=>x.classList.toggle('active',x.dataset.v===cur.verdict));
        card.dataset.verdict=cur.verdict||''; progress();});});
    const ta=card.querySelector('.comment'); ta.value=st.comment||'';
    ta.addEventListener('input',()=>{const cur=state[q]||{};cur.comment=ta.value;state[q]=cur;save();});});
  progress();
  function buildJSON(){const reviews=QLIST.map(q=>{const st=state[q]||{};
      return {q_number:q, verdict:st.verdict||null, comment:(st.comment||'').trim()};});
    const done=reviews.filter(r=>r.verdict).length;
    return JSON.stringify({blocks:"2-10", enrichment_version:BUILD, exported_at:new Date().toISOString(),
      reviewed:done, total:TOTAL, reviews}, null, 2);}
  function flash(msg){const m=document.getElementById('copyMsg');m.textContent=msg;setTimeout(()=>m.textContent='',3000);}
  document.getElementById('export').addEventListener('click',()=>{const out=buildJSON();const ta=document.getElementById('exportOut');
    ta.style.display='block';ta.value=out;
    try{const blob=new Blob([out],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');
      a.href=url;a.download='enrichment_review_blocks2-10_'+BUILD+'_results.json';a.click();URL.revokeObjectURL(url);flash('Downloaded ✓');}
    catch(e){flash('Select the text below & copy');}});
  document.getElementById('copy').addEventListener('click',async()=>{const out=buildJSON();const ta=document.getElementById('exportOut');
    ta.style.display='block';ta.value=out;
    try{await navigator.clipboard.writeText(out);flash('Copied to clipboard ✓');}catch(e){ta.focus();ta.select();flash('Select the text & copy manually');}});
</script></body></html>
"""

OUT.write_text(TEMPLATE.replace("__CARDS__", CARDS).replace("__BUILD__", BUILD)
               .replace("__FAMILY__", FAMILY).replace("__TOTAL__", str(len(QLIST)))
               .replace("__QLIST__", QLIST_JS).replace("__SRCCHIPS__", src_chips)
               .replace("__NUMCHIPS__", num_chips).replace("__G__", str(g)).replace("__M__", str(m)))
print(f"wrote {OUT.name} ({OUT.stat().st_size//1024} KB) — {len(QLIST)} questions, build {BUILD}, grounded {g}/model {m}")
