"""Vector layouts for reviewed grade-1 Russian-language teaching visuals.

These illustrations use authored pedagogy from grade1_editorial.json; they do not
inherit unrelated advanced-syntax tables from frp_tasks/ru.json.
"""
import html
import json
import textwrap
from pathlib import Path

DATA = json.loads((Path(__file__).resolve().parent / "grade1_editorial.json").read_text(encoding="utf-8"))
LESSONS = {x["lesson_id"]: x for x in DATA["lessons"]}

def e(value):
    return html.escape(str(value), quote=True)

def text(x, y, value, size=31, color="#3c3332", bold=False, limit=70, leading=1.34):
    paragraphs = str(value).split("\n")
    lines = []
    for para in paragraphs:
        lines.extend(textwrap.wrap(para, width=limit, break_long_words=False) or [""])
    return "".join(
        f'<text x="{x}" y="{y+i*size*leading:.0f}" font-family="DejaVu Sans,Arial,sans-serif" '
        f'font-size="{size}" font-weight="{"bold" if bold else "normal"}" fill="{color}">{e(line)}</text>'
        for i, line in enumerate(lines)
    )

def box(x,y,w,h,fill="#f6ece3",stroke="#dbbdad",r=26):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'

def render_grade1(lesson):
    spec = LESSONS.get(lesson["lesson_id"])
    if spec is None:
        raise ValueError("Missing authored content: " + lesson["lesson_id"])
    grade = lesson["grade"]
    topic = lesson["topic"]
    content = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">',
        '<rect width="1920" height="1080" fill="#fff9f1"/>',
        '<rect x="44" y="39" width="1832" height="1002" rx="42" fill="#fffdf8" stroke="#763540" stroke-width="6"/>',
        '<path d="M72 192 H1848" stroke="#e1cab8" stroke-width="2"/>',
        '<rect x="72" y="68" width="1776" height="115" rx="28" fill="#762b35"/>',
        text(110,143,"РУССКИЙ ЯЗЫК  ·  1 КЛАСС",33,"#fffaf3",True,50),
        '<circle cx="1762" cy="127" r="35" fill="#f7ead8"/>',
        '<path d="M1744 119 Q1762 109 1780 119 V143 Q1762 133 1744 143 Z" fill="none" stroke="#762b35" stroke-width="3"/>',
        text(118,256,topic,43,"#6d2b36",True,62),
        text(118,323,spec["headline"],42,"#3a4e40",True,60),
        '<path d="M121 365 H1801" stroke="#ccb4a7" stroke-width="2"/>',
        '<circle cx="1778" cy="319" r="9" fill="#c69e78"/>',
        '<circle cx="1744" cy="343" r="7" fill="#9caf9b"/>'
    ]
    cards = spec["cards"]
    kind = spec["layout"]
    if kind == "steps":
        for i,c in enumerate(cards):
            y=408+i*144
            content.extend([
                box(122,y,1670,116,("#f3e6da" if i%2==0 else "#edf0e6")),
                f'<circle cx="182" cy="{y+58}" r="33" fill="#763540"/>',
                f'<text x="182" y="{y+69}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="34" fill="#fffaf3">{i+1}</text>',
                text(247,y+50,c["title"],34,"#762b35",True,23),
                text(770,y+62,c["text"],29,"#3a3837",False,65)
            ])
        content.append('<path d="M182 534 V550 M182 678 V694" stroke="#a7b49d" stroke-width="5" stroke-dasharray="8 9"/>')
    elif kind == "compare":
        for i,c in enumerate(cards):
            x=122+i*854
            content.extend([
                box(x,414,815,402,("#f3e7dd" if i==0 else "#edf0e6")),
                f'<circle cx="{x+405}" cy="500" r="47" fill="{("#763540" if i==0 else "#50705e")}"/>',
                f'<text x="{x+405}" y="518" font-family="Georgia" font-size="49" text-anchor="middle" fill="#fffaf3">{i+1}</text>',
                text(x+56,612,c["title"],39,"#6d2b36",True,28),
                text(x+56,692,c["text"],32,"#343635",False,37)
            ])
        content.append('<path d="M944 540 V710" stroke="#bca89d" stroke-width="3" stroke-dasharray="8 12"/>')
    elif kind == "alphabet":
        for i,c in enumerate(cards):
            y=411+i*139
            content.extend([box(122,y,1670,113,("#f3e6db" if i%2==0 else "#eaf0e6")),
                            text(196,y+72,c["title"],46,"#3f453a",True,45)])
    elif kind == "sentence":
        content.extend([
            box(122,414,1670,420,"#f3e8dc"),
            text(168,488,"СЛОВА",28,"#762b35",True,30),
            box(165,512,365,86,"#fffdf8","#b8a297",16),
            box(572,512,365,86,"#fffdf8","#b8a297",16),
            text(214,571,"Птицы",39,"#383b37",True,20),
            text(639,571,"поют",39,"#383b37",True,20),
            '<path d="M956 556 H1155 L1127 536 M1155 556 L1127 577" stroke="#50705e" fill="none" stroke-width="8" stroke-linecap="round"/>',
            text(1240,571,"Птицы поют.",42,"#762b35",True,20),
            text(165,702,"ЗАГЛАВНАЯ БУКВА   +   ПРОБЕЛ   +   ТОЧКА",30,"#3a4e40",True,53)
        ])
    else:
        cols = 2 if len(cards) == 4 else 3
        for i,c in enumerate(cards):
            x=122+(i%cols)*(854 if cols==2 else 565)
            y=410+(i//cols)*(203 if cols==2 else 0)
            w=811 if cols==2 else 535
            h=176 if cols==2 else 394
            content.extend([
                box(x,y,w,h,("#f3e6dc" if i%2==0 else "#eaf0e7")),
                f'<circle cx="{x+52}" cy="{y+63}" r="21" fill="{("#763540" if i%2==0 else "#50705e")}"/>',
                text(x+90,y+75,c["title"],(28 if cols==2 else 33),"#762b35",True,(32 if cols==2 else 24)),
                text(x+43,y+(131 if cols==2 else 182),c["text"],(28 if cols==2 else 31),"#333635",False,(48 if cols==2 else 27))
            ])
    # A dedicated reminder is always separate from the lesson diagram.
    content.extend([
        box(122,858,1670,114,"#faf2e7","#cfb7a5",22),
        '<path d="M163 903 L175 882 L187 903 L212 907 L194 925 L199 950 L175 936 L151 950 L156 925 L138 907 Z" fill="#bf8e61" opacity="0.85"/>',
        text(228,914,spec["note"],27,"#4a3835",False,90,1.28),
        text(123,1014,"Учебная схема · авторский пример · ФРП 1–4 классы",20,"#7d726b",False,85),
        text(1645,1014,lesson["lesson_id"],20,"#7d726b",False,20),
        "</svg>"
    ])
    return "\n".join(content), "curated"
