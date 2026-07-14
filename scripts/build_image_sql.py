#!/usr/bin/env python3
"""
Emit UPDATE statements that set questions.clinical_image_url to the private-bucket
object path for each cropped figure. Path convention: block-<NN>/q<QQQQ>.png
(matches import/images/block-NN/qQQQQ.png). Owner uploads those files to the
'clinical-images' bucket preserving the path, then runs this SQL. Output gitignored.
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
O = ROOT / "import/out"
items = json.loads((O / "blocks2-10.merged.json").read_text())["items"]
figs = sorted((it for it in items if it.get("has_figure")), key=lambda x: x["q_number"])

lines = ["-- Set clinical_image_url for blocks 2-10 figures. Licensed — do not commit.",
         "-- Prereq: upload import/images/block-NN/*.png to the private 'clinical-images'",
         "-- bucket preserving the block-NN/qQQQQ.png path. Then run in the SQL Editor.",
         "begin;", ""]
missing = []
for it in figs:
    q, b = it["q_number"], it["block_number"]
    path = f"block-{b:02d}/q{q:04d}.png"
    if not (ROOT / "import/images" / path).exists():
        missing.append((q, path))
    lines.append(f"update public.questions set clinical_image_url = '{path}' where q_number = {q};")
lines += ["", "commit;", "",
          f"-- verify: {len(figs)} rows should have a clinical_image_url",
          f"-- select count(*) from public.questions where clinical_image_url is not null and block_number between 2 and 10;"]
(O / "blocks2-10_images.sql").write_text("\n".join(lines))

print(f"wrote blocks2-10_images.sql — {len(figs)} UPDATEs")
print("figure files present:", len(figs) - len(missing), "/", len(figs))
if missing:
    print("MISSING crop files:")
    for q, p in missing:
        print(f"  q{q}: {p}")
