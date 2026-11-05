#!/usr/bin/env python3
"""Распознаёт таблицы из сканированных PDF и сохраняет их в JSON.

Нужны: PyMuPDF (fitz), Tesseract OCR с русским языком (rus.traineddata).
Пример:
  python ocr_pdf.py --subject math --title "Математика" book.pdf -o data/ref-tables.json
"""
import argparse
import json
import os
import subprocess
import tempfile

import fitz  # PyMuPDF


def tsv_words(img, tesseract, tessdata, dpi=250, psm=6):
    env = dict(os.environ)
    if tessdata:
        env["TESSDATA_PREFIX"] = tessdata
    cmd = [tesseract, img, "stdout", "-l", "rus", "--psm", str(psm), "-c", "tessedit_create_tsv=1"]
    r = subprocess.run(cmd, capture_output=True, env=env)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "replace")[:300])
    out = []
    for line in r.stdout.decode("utf-8", "replace").splitlines()[1:]:
        p = line.split("\t")
        if len(p) < 12 or p[0] != "5":
            continue
        try:
            out.append({
                "text": p[11].strip(),
                "x": int(p[6]), "y": int(p[7]),
                "w": int(p[8]), "h": int(p[9]),
                "conf": float(p[10]),
            })
        except ValueError:
            pass
    return out


def cell_text(words, bbox, z):
    if not bbox:
        return ""
    x0, y0, x1, y1 = bbox
    got = []
    for w in words:
        cx, cy = (w["x"] + w["w"] / 2) / z, (w["y"] + w["h"] / 2) / z
        if x0 <= cx <= x1 and y0 <= cy <= y1 and w["text"]:
            got.append(w)
    got.sort(key=lambda w: (round(w["y"] / max(w["h"], 1)), w["x"]))
    return " ".join(w["text"] for w in got).strip()


def title_above(words, bbox, z):
    x0, y0, x1, _ = bbox
    lines = {}
    for w in words:
        wy, wh = (w["y"] + w["h"]) / z, w["h"] / z
        if wy <= y0 + 2 and wy >= y0 - 110:
            lines.setdefault(round(w["y"] / max(w["h"], 1)), []).append(w)
    for key in sorted(lines, reverse=True):
        line = sorted(lines[key], key=lambda w: w["x"])
        text = " ".join(w["text"] for w in line).strip()
        if len(text) >= 4:
            return text
    return ""


def process(path, subject, source_title, tesseract, tessdata, dpi):
    doc = fitz.open(path)
    tables = []
    for pno in range(doc.page_count):
        page = doc[pno]
        found = page.find_tables()
        if not found.tables:
            continue
        zoom = dpi / 72
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        fd, img = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        pix.save(img)
        try:
            words = tsv_words(img, tesseract, tessdata, dpi=dpi)
        finally:
            try:
                os.unlink(img)
            except OSError:
                pass
        for ti, tab in enumerate(found.tables):
            rows, head = [], None
            for row in tab.rows:
                cells = [cell_text(words, c, zoom) for c in row.cells]
                if not any(cells):
                    continue
                if head is None:
                    head = cells
                else:
                    rows.append(cells)
            if not head or len(rows) < 1 or len(head) < 2:
                continue
            if sum(1 for c in head if c) < 2:
                continue
            title = title_above(words, tab.bbox, zoom) or f"Таблица {pno + 1}.{ti + 1}"
            tables.append({
                "subject": subject,
                "source": source_title,
                "page": pno + 1,
                "title": title[:160],
                "head": [c[:200] for c in head],
                "rows": [[c[:300] for c in r] for r in rows[:40]],
            })
        if pno % 10 == 0:
            print(f"{source_title}: стр. {pno + 1}/{doc.page_count}, таблиц {len(tables)}", flush=True)
    return tables


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", nargs="+")
    ap.add_argument("--subject", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--tesseract", default=r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    ap.add_argument("--tessdata", default=r"C:\tessdata_uchu")
    ap.add_argument("--dpi", type=int, default=230)
    ap.add_argument("-o", "--out", required=True)
    args = ap.parse_args()
    all_tables = []
    for i, pdf in enumerate(args.pdf):
        title = args.title or os.path.basename(pdf)
        if len(args.pdf) > 1:
            title = f"{title} ({i + 1})"
        all_tables.extend(process(pdf, args.subject, title, args.tesseract, args.tessdata, args.dpi))
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"tables": all_tables}, f, ensure_ascii=False, indent=1)
    print(f"Готово: {len(all_tables)} таблиц -> {args.out}")


if __name__ == "__main__":
    main()
