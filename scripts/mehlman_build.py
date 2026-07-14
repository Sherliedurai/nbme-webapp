#!/usr/bin/env python3
"""
One-time: convert Mehlman HY PDFs -> markdown + a chunked, keyword+tag index.
No vector DB.

Reality of these PDFs (discovered by inspection): they are NOT uniformly
heading-sectioned. They are bulleted lists of HY items — a "-" line starts an
item (a vignette "…; Dx? → answer" plus mechanism), with "o" answer sub-bullets
and wrapped continuation lines until the next "-". That HY item is the natural
retrieval unit (it literally encodes "how they test X" + the key facts), so we
chunk by item. Files that aren't bulleted (question banks / prose) fall back to
blank-line paragraph chunks.

Outputs (gitignored — third-party content):
  import/mehlman/md/<file>.md
  import/mehlman/chunks.json  [{id,file,label,source_label,text,tokens,file_tags}]
"""
import fitz, json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "Mehlman HY pdfs "
MD = ROOT / "import/mehlman/md"; MD.mkdir(parents=True, exist_ok=True)
CHUNKS = ROOT / "import/mehlman/chunks.json"

EXCLUDE = re.compile(r"(MEHLMANMEDICAL|\.COM)", re.I)
PAGENUM = re.compile(r"^\s*\d{1,3}\s*$")
RUNHEAD = re.compile(r"^HY\b", re.I)
SOCIAL = {"YouTube", "Instagram", "Facebook", "Reddit", "Twitter", "TikTok"}
BULLET = {"-", "–", "—", "•", "▪", "*"}
DOTLEADER = re.compile(r"[.…]{6,}")          # table-of-contents dot leaders
NUM = re.compile(r"^(\d{1,3})[.)]\s*(.*)$")        # numbered-question marker

FILE_TAGS = {
    "HY Arrows": ["physiology", "arrows"],
    "HY Biochem": ["biochemistry", "metabolism", "enzyme", "vitamin", "cofactor", "metabolic"],
    "HY Biostatistics Review": ["biostatistics", "epidemiology", "statistics", "study"],
    "HY Cardio": ["cardiovascular", "cardiac", "heart", "vascular", "murmur", "vessel", "valve"],
    "HY Communication_Ethics": ["ethics", "communication", "behavioral"],
    "HY Dermatology": ["skin", "dermatology", "derm", "rash", "lesion", "melanoma", "keratosis"],
    "HY Endocrine": ["endocrine", "hormone", "thyroid", "adrenal", "bone", "osteoporosis", "pituitary", "bisphosphonate"],
    "HY Equation Questions for USMLE Step 1": ["equation", "physiology", "calculation", "renal"],
    "HY Family medicine": ["family", "primary", "mixed"],
    "HY Gastrointestinal": ["gastrointestinal", "gi", "liver", "bowel", "hepatic"],
    "HY Genetics": ["genetics", "inheritance", "chromosome", "embryology", "congenital"],
    "HY Heme_Onc": ["hematologic", "heme", "blood", "anemia", "oncology", "cancer", "lymph", "transfusion", "coagulation"],
    "HY Immunology": ["immune", "immunology", "hypersensitivity", "antibody", "complement", "immunodeficiency", "cytokine", "mhc"],
    "HY Mixed USMLE Review Part I": ["mixed"], "HY Mixed USMLE Review Part II": ["mixed"],
    "HY Mixed USMLE Review Part III": ["mixed"], "HY Mixed USMLE Review Part IV": ["mixed"],
    "HY MSK_Anatomy": ["musculoskeletal", "msk", "bone", "muscle", "anatomy", "joint", "nerve"],
    "HY Neuro": ["nervous", "neuro", "brain", "seizure", "stroke"],
    "HY Neuroanatomy": ["nervous", "neuroanatomy", "brain", "cranial", "tract", "cortex", "embryology"],
    "HY Obgyn": ["reproductive", "obgyn", "pregnancy", "gynecology", "obstetric"],
    "HY Pediatrics": ["pediatrics", "peds", "congenital", "neonatal"],
    "HY Psych": ["psychiatry", "psych", "behavioral", "mood"],
    "HY Pulmonary": ["respiratory", "pulmonary", "lung", "abg", "ventilation"],
    "HY Renal": ["renal", "kidney", "urinary", "nephro", "acid", "electrolyte", "acidosis", "alkalosis"],
    "HY Surgery": ["surgery", "surgical", "trauma"],
}

STOP = set("""a an the of to in on for with and or is are was were be been being at by from as this that these those it
patient patients following most likely cause causes shows show which who man woman male female old year years boy girl
history presents comes physician because after before during due more less than not no yes also within into out over
answer answers nbme usmle step example eg ie etc pic picture image shown below above see note his her their its
you your will can may would could should if then when where what how why increased decreased high low normal dx
will get tested doc document purpose review high yield hy points focus based""".split())
TOKEN = re.compile(r"[a-z][a-z0-9\-]{2,}")


def toks(text):
    return sorted({t for t in TOKEN.findall(text.lower()) if t not in STOP})


def norm(s):
    return (s.replace("à", "→").replace(" ", " ")
             .replace("“", '"').replace("”", '"').replace("’", "'").strip())


def is_noise(s):
    return (not s or EXCLUDE.search(s) or PAGENUM.match(s) or RUNHEAD.match(s)
            or s in SOCIAL or s.startswith("@") or DOTLEADER.search(s))


def num_boundary(s):
    """Return the trailing text if `s` is a numbered-question marker, else None.
    Accepts a lone 'N.' or 'N. <Capitalized vignette>'; rejects '1.5 mg' etc."""
    m = NUM.match(s)
    if not m:
        return None
    rest = m.group(2)
    if rest == "" or rest[:1].isupper() or rest[:1] in '"“':
        return rest
    return None


def clean_lines(doc):
    out = []
    for p in range(doc.page_count):
        for ln in doc[p].get_text("text").splitlines():
            s = ln.strip()
            if not is_noise(s):
                out.append(s)
    return out


LABEL_JUNK = {"above", "below", "yes", "no", "answer", "this", "that", "it",
              "annoying but yes", "normal range is", "the following", "shown"}


def label_of(text):
    """Short citation label: the answer/Dx phrase if present, else the first clause."""
    t = text.replace('"', "").strip()
    # case-insensitive: Mehlman writes "Answer =" / "answer =" / "Dx →" inconsistently
    for m in re.finditer(r"(?:answer(?:\s+on\s+\w+)?\s*=|Dx\??\s*→|Tx\s+of\s|→)\s*([A-Za-z][^→.;:()]{2,55})", t, re.I):
        cand = m.group(1).strip().rstrip(",").strip()
        if cand and len(cand) > 3 and cand.lower() not in LABEL_JUNK:
            return cand[:55]
    # Numbered banks (Genetics/Ethics/Biostat): "The correct answer is X. <Concept> is…"
    m = re.search(r"correct answer is\s+[A-Za-z][.):]?\s+([A-Z][A-Za-z0-9 /'-]{3,45})", t)
    if m:
        cand = re.split(r"\s+(?:is|are|was|were|refers|occurs|describes|represents)\s+", m.group(1))[0]
        cand = " ".join(cand.split()[:6]).strip()
        # skip pronoun/article starts (e.g. "This patient's", "The diagnosis") — fall to vignette
        if len(cand) > 3 and cand.lower() not in LABEL_JUNK \
                and not re.match(r"^(This|The|These|Those|It|He|She|They|Patient|A |An )\b", cand):
            return cand[:50]
    head = re.split(r"[;?]", t)[0]
    return " ".join(head.split()[:9])[:60]


def chunk_markers(lines, mode):
    """Chunk at item boundaries. mode='bullet' splits on lone '-' lines;
    mode='number' splits on numbered-question markers ('N.' / 'N. Vignette…')."""
    started, items, cur = False, [], []
    for s in lines:
        if mode == "bullet":
            is_b, rest = (s in BULLET), ""
        else:
            r = num_boundary(s)
            is_b, rest = (r is not None), (r or "")
        if is_b:
            started = True
            if cur:
                items.append(" ".join(cur)); cur = []
            if rest:
                cur.append(rest)
            continue
        if not started:
            continue               # drop front-matter before the first item
        cur.append(re.sub(r"^o\s+", "", s))   # strip "o" sub-bullet marker
    if cur:
        items.append(" ".join(cur))
    return [norm(t) for t in items if len(t.strip()) > 15]


def choose_chunks(lines, doc):
    """Auto-detect the file's item format and chunk accordingly."""
    n_bul = sum(1 for s in lines if s in BULLET)
    n_num = sum(1 for s in lines if num_boundary(s) is not None)
    if n_bul >= 8 and n_bul >= n_num:
        return chunk_markers(lines, "bullet"), "bullet"
    if n_num >= 8:
        return chunk_markers(lines, "number"), "number"
    return chunk_paragraphs(doc), "paras"


def chunk_paragraphs(doc):
    """Fallback for non-bulleted files: blank-line paragraph blocks."""
    out = []
    for p in range(doc.page_count):
        for b in doc[p].get_text("blocks"):
            s = " ".join(x.strip() for x in b[4].splitlines() if x.strip())
            if not is_noise(s.split(" ")[0]) and len(s) > 40 and not EXCLUDE.search(s):
                out.append(norm(s))
    return out


def main():
    all_chunks, cid = [], 0
    for pdf in sorted(SRC.glob("*.pdf")):
        stem = pdf.stem
        doc = fitz.open(pdf)
        items, mode = choose_chunks(clean_lines(doc), doc)
        ftags = FILE_TAGS.get(stem, ["mixed"])
        md = [f"# {stem}\n"]
        for text in items:
            lbl = label_of(text)
            md.append(f"- **{lbl}** — {text}")
            all_chunks.append({
                "id": cid, "file": stem, "label": lbl,
                "source_label": f"{stem} › {lbl}",
                "text": text, "tokens": toks(text), "file_tags": ftags,
            })
            cid += 1
        (MD / f"{stem}.md").write_text("\n".join(md))
        print(f"  {stem:<42} {doc.page_count:>3}p  {len(items):>4} {mode}")
    CHUNKS.write_text(json.dumps(all_chunks, ensure_ascii=False))
    print(f"\nTotal: {len(all_chunks)} chunks -> {CHUNKS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
