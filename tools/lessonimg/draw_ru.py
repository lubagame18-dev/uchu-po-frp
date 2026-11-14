#!/usr/bin/env python3
"""Собственные схемы «Учу по ФРП» для уроков русского языка (без ИИ, обозначения как в школьных учебниках).

Морфемы: приставка – уголок сверху, корень – дуга, суффикс – «домик», окончание – рамка, основа – скобка снизу.
Члены предложения: подлежащее – одна черта, сказуемое – две, дополнение – пунктир,
определение – волнистая, обстоятельство – точка-тире. Причастный оборот – волнистая линия,
над определяемым словом крестик и стрелка с вопросом; деепричастный оборот – точка-тире.
Звуки: гласный – красный, твёрдый согласный – синий, мягкий согласный – зелёный.
Рисуется Pillow с точным измерением ширины текста. Результат: img/lessons/own/r_<имя>.webp и tools/lessonimg/own.json.
"""
import json, math, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "img", "lessons", "own")
META = os.path.join(ROOT, "tools", "lessonimg", "own.json")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BLUE, RED, GREEN, GOLD, VIOLET = "#4F84D1", "#DB6A5E", "#4FA87F", "#E2A93B", "#8E72CC"
SOFT = {"blue": "#DCE8F8", "red": "#F9DEDA", "green": "#DDF1E6", "gold": "#FBEFD2", "violet": "#E9E1F6"}
INK, GREY = "#2B2F3A", "#5A6170"
meta = {k: v for k, v in (json.load(open(META, encoding="utf-8")) if os.path.exists(META) else {}).items() if not k.startswith("r_")}


class Pic:
    def __init__(self, w, h):
        self.im = Image.new("RGB", (w, h), "white"); self.d = ImageDraw.Draw(self.im); self.w, self.h = w, h

    def f(self, size, bold=False, mono=False):
        return ImageFont.truetype(MONO if mono else (BOLD if bold else FONT), size)

    def tw(self, s, size, bold=False, mono=False):
        return self.d.textlength(s, font=self.f(size, bold, mono))

    def text(self, x, y, s, size=40, color=INK, bold=False, anchor="ls", mono=False):
        self.d.text((x, y), s, fill=color, font=self.f(size, bold, mono), anchor=anchor)
        return x + self.tw(s, size, bold, mono)

    def word(self, x, y, parts, size=46, color=INK, hl=None, bold=False):
        """Пишет части слова подряд (на базовой линии y); возвращает [(x0, x1)] каждой части."""
        out = []
        for i, p in enumerate(parts):
            w = self.tw(p, size, bold)
            if hl and i in hl:
                self.d.rectangle([x - 2, y - size * .82, x + w + 2, y + size * .22], fill=hl[i])
            self.text(x, y, p, size, color, bold)
            out.append((x, x + w)); x += w
        return out

    def words(self, x, y, ws, size):
        out = []
        for w in ws:
            a, b = self.word(x, y, [w], size)[0]; out.append((a, b)); x = b + self.tw(" ", size)
        return out

    def line(self, pts, color=INK, w=4):
        self.d.line(pts, fill=color, width=w, joint="curve")

    def dashed(self, x1, x2, y, color, w=4, pattern=(16, 10)):
        x, k = x1, 0
        while x < x2:
            seg = pattern[k % len(pattern)]
            if k % 2 == 0:
                self.line([(x, y), (min(x + seg, x2), y)], color, w)
            x += seg; k += 1

    def under(self, x1, x2, y, kind, color):
        if kind == "single":
            self.line([(x1, y), (x2, y)], color)
        elif kind == "double":
            self.line([(x1, y), (x2, y)], color); self.line([(x1, y + 9), (x2, y + 9)], color)
        elif kind == "dash":
            self.dashed(x1, x2, y, color, pattern=(16, 10))
        elif kind == "dashdot":
            self.dashed(x1, x2, y, color, pattern=(18, 8, 4, 8))
        elif kind == "wavy":
            self.line([(x, y + 6 * math.sin((x - x1) * 2 * math.pi / 22)) for x in range(int(x1), int(x2) + 1, 2)], color, 4)

    def arrow(self, a, b, color, w=4, bend=-60):
        (x1, y1), (x2, y2) = a, b
        mx, my = (x1 + x2) / 2, min(y1, y2) + bend
        pts = [((1 - t) ** 2 * x1 + 2 * (1 - t) * t * mx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * my + t * t * y2) for t in [i / 40 for i in range(41)]]
        self.line(pts, color, w)
        (px, py), (qx, qy) = pts[-3], pts[-1]
        ang = math.atan2(qy - py, qx - px)
        for s in (.45, -.45):
            self.line([(qx, qy), (qx - 20 * math.cos(ang + s), qy - 20 * math.sin(ang + s))], color, w)

    def cross(self, x, y, color, r=10):
        self.line([(x - r, y - r), (x + r, y + r)], color, 4); self.line([(x - r, y + r), (x + r, y - r)], color, 4)

    def box(self, x1, y1, x2, y2, fill, edge, r=16, w=3):
        self.d.rounded_rectangle([x1, y1, x2, y2], radius=r, fill=fill, outline=edge, width=w)

    def save(self, name, title, caption):
        os.makedirs(OUT, exist_ok=True)
        bb = Image.eval(self.im, lambda v: 255 - v).getbbox() or (0, 0, self.w, self.h)
        pad = 30
        im = self.im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(self.w, bb[2] + pad), min(self.h, bb[3] + pad)))
        im.thumbnail((1100, 800))
        im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=90, method=6)
        meta[name] = {"title": title, "caption": caption}


def morph(p, spans, kinds, top, bottom, color=BLUE):
    for (a, b), k in zip(spans, kinds):
        if k == "pref":
            p.line([(a + 3, top - 22), (b - 3, top - 22), (b - 3, top - 4)], color, 4)
        elif k == "root":
            p.d.arc([a + 2, top - 40, b - 2, top + 16], 180, 360, fill=color, width=4)
        elif k == "suf":
            p.line([(a + 4, top - 2), ((a + b) / 2, top - 30), (b - 4, top - 2)], color, 4)
        elif k == "end":
            if b - a < 4:  # нулевое окончание – пустая рамка
                a, b = a + 8, a + 38
            p.d.rectangle([a - 3, top + 2, b + 3, bottom], outline=color, width=4)


def morphemes():
    p = Pic(1500, 520)
    y = 230
    sp = p.word(60, y, ["под", "снеж", "ник", "и"], 84)
    morph(p, sp, ["pref", "root", "suf", "end"], y - 66, y + 22)
    p.line([(sp[0][0], y + 32), (sp[0][0], y + 48), (sp[2][1], y + 48), (sp[2][1], y + 32)], RED, 4)
    lx = 700
    for i, (k, t) in enumerate([("pref", "приставка"), ("root", "корень"), ("suf", "суффикс"), ("end", "окончание")]):
        x, yy = lx + (i % 2) * 380, 150 + (i // 2) * 110
        morph(p, [(x, x + 70)], [k], yy - 10, yy + 34)
        p.text(x + 95, yy + 26, t, 34)
    x, yy = lx, 380
    p.line([(x, yy), (x, yy + 16), (x + 70, yy + 16), (x + 70, yy)], RED, 4); p.text(x + 95, yy + 22, "основа", 34)
    p.save("r_morphemes", "Состав слова", "Разбор по составу: под-снеж-ник-и – приставка, корень, суффикс, окончание; основа подснежник-")


def sentence_members():
    p = Pic(1700, 560)
    y = 140
    words = ["Весёлые", "дети", "быстро", "бегут", "по", "зелёному", "лугу."]
    kinds = ["wavy", "single", "dashdot", "double", "dashdot", "wavy", "dashdot"]
    sp = p.words(50, y, words, 58)
    for (a, b), k, w in zip(sp, kinds, words):
        b2 = b - (p.tw(".", 58) if w.endswith(".") else 0)
        p.under(a, b2, y + 18, k, RED if k in ("single", "double") else BLUE)
    for i, (k, t) in enumerate([("single", "подлежащее"), ("double", "сказуемое"), ("dash", "дополнение"), ("wavy", "определение"), ("dashdot", "обстоятельство")]):
        xx, yy = 60 + (i % 3) * 540, 300 + (i // 3) * 110
        p.under(xx, xx + 120, yy, k, RED if k in ("single", "double") else BLUE); p.text(xx + 150, yy + 12, t, 36)
    p.save("r_sentence", "Члены предложения", "Подлежащее и сказуемое – грамматическая основа; дополнение, определение, обстоятельство – второстепенные члены")


def sounds():
    p = Pic(1500, 560)
    p.text(60, 190, "лиса", 90)
    ix = 60 + p.tw("л", 90) + p.tw("и", 90) / 2
    p.line([(ix + 2, 100), (ix + 20, 72)], INK, 6)
    p.text(60, 300, "[л'иса]", 56, GREY)
    for i, c in enumerate([GREEN, RED, BLUE, RED]):
        x = 560 + i * 170
        p.d.rectangle([x, 110, x + 140, 220], fill=c, outline=INK, width=3)
    p.line([(560 + 170 + 60, 95), (560 + 170 + 85, 65)], INK, 6)
    for i, (c, t) in enumerate([(RED, "гласный"), (BLUE, "твёрдый согласный"), (GREEN, "мягкий согласный")]):
        x, yy = 60 + i * 470, 430
        p.d.rectangle([x, yy - 40, x + 60, yy + 4], fill=c, outline=INK, width=2); p.text(x + 80, yy, t, 34)
    p.save("r_sounds", "Звуки и буквы", "Звуковая схема слова «лиса»: [л'] мягкий согласный, [и] ударный гласный, [с] твёрдый согласный, [а] гласный")


def alphabet():
    letters = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
    vowels, signs = set("АЕЁИОУЫЭЮЯ"), set("ЪЬ")
    p = Pic(1500, 700)
    for i, ch in enumerate(letters):
        r, c = divmod(i, 11)
        x, y = 40 + c * 128, 40 + r * 150
        fill, edge = (SOFT["red"], RED) if ch in vowels else ((SOFT["violet"], VIOLET) if ch in signs else (SOFT["blue"], BLUE))
        p.box(x, y, x + 112, y + 124, fill, edge, 18, 3)
        p.text(x + 56, y + 80, ch + ch.lower(), 46, INK, True, anchor="ms")
    p.text(40, 560, "33 буквы: 10 гласных, 21 согласная; ъ и ь звуков не обозначают", 36, GREY)
    p.save("r_alphabet", "Русский алфавит", "Русский алфавит: 33 буквы; гласные – розовые, согласные – голубые, ъ и ь – сиреневые")


def card(name, title, caption, head, rows, note=None):
    p = Pic(1600, 260 + 110 * len(rows) + (90 if note else 0))
    hw = p.tw(head, 46, True)
    p.box(40, 30, 40 + hw + 80, 130, SOFT["gold"], GOLD, 24, 3); p.text(80, 100, head, 46, INK, True)
    for r, row in enumerate(rows):
        y, x = 240 + r * 110, 80
        for w in row:
            parts = w.split("*")
            sp = p.word(x, y, parts, 54, hl={i: SOFT["red"] for i in range(1, len(parts), 2)})
            x = sp[-1][1] + 90
    if note:
        p.text(80, 240 + len(rows) * 110, note, 34, GREY)
    p.save(name, title, caption)


def declension():
    p = Pic(1600, 720)
    data = [("1-е склонение", "ж. и м. р. на -а, -я", ["мам|а", "земл|я", "пап|а"], "blue", BLUE),
            ("2-е склонение", "м. р. с нулевым окончанием,", ["стол|", "кон|ь", "окн|о", "пол|е"], "red", RED),
            ("3-е склонение", "ж. р. на -ь", ["ноч|ь", "мыш|ь", "тетрад|ь"], "green", GREEN)]
    for i, (h, d, ex, s, c) in enumerate(data):
        x0 = 30 + i * 520
        p.box(x0, 30, x0 + 490, 120, SOFT[s], c, 20, 3); p.text(x0 + 245, 92, h, 40, INK, True, anchor="ms")
        p.text(x0 + 245, 175, d, 28, GREY, anchor="ms")
        if i == 1:
            p.text(x0 + 245, 212, "ср. р. на -о, -е", 28, GREY, anchor="ms")
        for k, w in enumerate(ex):
            stem, end = w.split("|"); y = 300 + k * 95
            x1 = p.text(x0 + 150, y, stem, 50)
            ew = p.tw(end, 50) if end else 26
            p.text(x1, y, end, 50)
            p.d.rectangle([x1 - 3, y - 44, x1 + ew + 3, y + 12], outline=c, width=4)
    p.save("r_declension", "Три склонения существительных", "Склонения имён существительных: 1-е – мама, земля; 2-е – стол, конь, окно, поле; 3-е – ночь, мышь")


def conjugation():
    p = Pic(1600, 600)
    for i, (h, e, ex, s, c) in enumerate([("I спряжение", "-ешь, -ет, -ем, -ете, -ут (-ют)", "читаешь, пишут", "blue", BLUE),
                                           ("II спряжение", "-ишь, -ит, -им, -ите, -ат (-ят)", "говоришь, сидят", "red", RED)]):
        x0 = 30 + i * 780
        p.box(x0, 30, x0 + 740, 120, SOFT[s], c, 20, 3); p.text(x0 + 370, 92, h, 42, INK, True, anchor="ms")
        p.text(x0 + 30, 195, e, 36); p.text(x0 + 30, 265, ex, 38, c, True)
    p.text(40, 370, "Ко II спряжению относятся глаголы на -ить (кроме брить, стелить)", 32)
    p.text(40, 420, "и 11 исключений: гнать, держать, дышать, слышать, видеть, ненавидеть,", 30, GREY)
    p.text(40, 465, "смотреть, обидеть, терпеть, вертеть, зависеть", 30, GREY)
    p.save("r_conjugation", "Спряжение глаголов", "Личные окончания глаголов I и II спряжения")


def parts_of_speech():
    p = Pic(1600, 700)
    groups = [("Самостоятельные", ["имя существительное", "имя прилагательное", "имя числительное", "местоимение", "глагол", "наречие"], "blue", BLUE, 600),
              ("Служебные", ["предлог", "союз", "частица"], "red", RED, 420), ("Особые", ["междометие", "звукоподражательные", "слова"], "gold", GOLD, 470)]
    x = 30
    for h, items, s, c, w in groups:
        p.box(x, 30, x + w - 30, 120, SOFT[s], c, 20, 3); p.text(x + (w - 30) / 2, 92, h, 38, INK, True, anchor="ms")
        for k, it in enumerate(items):
            p.text(x + 20, 190 + k * 62, ("• " if not (h == "Особые" and k == 2) else "   ") + it, 32)
        x += w
    p.text(40, 620, "Причастие и деепричастие – особые формы глагола", 30, GREY)
    p.save("r_parts_of_speech", "Части речи", "Части речи в русском языке: самостоятельные, служебные, междометия и звукоподражательные слова")


def punct_schemes():
    p = Pic(1600, 600)
    rows = [("Однородные члены", "О, О и О.    О, но О."), ("Обобщающее слово", "О: О, О, О."), ("Сложное предложение", "[ ], и [ ].    [ ], (что … )."),
            ("Прямая речь", "«П», – а.    А: «П»."), ("Обращение", "О, … .   … , О, … .   … , О!")]
    for i, (a, b) in enumerate(rows):
        y = 80 + i * 105
        p.text(40, y, a, 36, BLUE, True); p.text(560, y, b, 40, INK, mono=True)
    p.save("r_punctuation", "Схемы пунктуации", "Схемы предложений: однородные члены, обобщающее слово, сложное предложение, прямая речь, обращение")


def participle():
    p = Pic(1700, 480)
    y = 250
    sp = p.words(50, y, ["Лес,", "окутанный", "утренним", "туманом,", "молчал."], 58)
    a, b = sp[1][0], sp[3][1] - p.tw(",", 58)
    p.under(a, b, y + 20, "wavy", BLUE)
    lx = (sp[0][0] + sp[0][1] - p.tw(",", 58)) / 2
    p.cross(lx, y - 75, RED)
    p.arrow((lx + 14, y - 90), ((a + b) / 2, y - 62), RED, bend=-70)
    p.text((lx + (a + b) / 2) / 2, y - 150, "какой?", 38, RED, anchor="ms")
    p.text(50, y + 130, "Определяемое слово – существительное; оборот после него выделяется запятыми", 30, GREY)
    p.save("r_participle", "Причастный оборот", "Причастный оборот: над определяемым словом крестик, от него стрелка с вопросом, оборот подчёркнут волнистой линией")


def gerund():
    p = Pic(1700, 480)
    y = 250
    sp = p.words(50, y, ["Улыбаясь", "друзьям,", "девочка", "вошла", "в", "класс."], 58)
    a, b = sp[0][0], sp[1][1] - p.tw(",", 58)
    p.under(a, b, y + 20, "dashdot", BLUE); p.under(*sp[2], y + 20, "single", RED); p.under(*sp[3], y + 20, "double", RED)
    vx = (sp[3][0] + sp[3][1]) / 2
    p.arrow((vx, y - 62), ((a + b) / 2, y - 62), BLUE, bend=-70)
    p.text(((a + b) / 2 + vx) / 2, y - 145, "вошла как? что делая?", 36, BLUE, anchor="ms")
    p.text(50, y + 130, "Деепричастный оборот – обстоятельство; выделяется запятыми", 30, GREY)
    p.save("r_gerund", "Деепричастный оборот", "Деепричастный оборот зависит от глагола-сказуемого и подчёркивается точкой с тире")


def syllables():
    p = Pic(1700, 360)
    x = 50
    for k, w in enumerate(["ка-ран-даш", "ли-си-ца", "ко-ро-ва"]):
        parts = w.split("-")
        c = [BLUE, RED, GREEN][k]
        for i, s in enumerate(parts):
            a, b = p.word(x, 150, [s], 62)[0]
            p.d.arc([a, 140, b, 200], 0, 180, fill=c, width=4)
            x = b
            if i < len(parts) - 1:
                x = p.text(x + 6, 150, "-", 62, GREY) + 6
        x += 110
    p.text(50, 290, "Сколько в слове гласных, столько и слогов", 36, GREY)
    p.save("r_syllables", "Слоги и перенос", "Деление слов на слоги: сколько гласных, столько слогов; переносим по слогам")


def text_parts():
    p = Pic(1600, 380)
    for i, (t, s, c) in enumerate([("Вступление", "blue", BLUE), ("Основная часть", "green", GREEN), ("Заключение", "violet", VIOLET)]):
        x = 30 + i * 520
        p.box(x, 40, x + 440, 180, SOFT[s], c, 26, 3); p.text(x + 220, 125, t, 40, INK, True, anchor="ms")
        if i < 2:
            p.line([(x + 452, 110), (x + 508, 110)], INK, 5); p.line([(x + 508, 110), (x + 490, 96)], INK, 5); p.line([(x + 508, 110), (x + 490, 124)], INK, 5)
    p.text(40, 270, "Тема – о чём текст. Основная мысль – главное, что хочет сказать автор.", 32, GREY)
    p.save("r_text", "Текст и его части", "Строение текста: вступление, основная часть, заключение; тема и основная мысль")


def styles():
    p = Pic(1600, 470)
    st = [("разговорный", "общение в быту", "blue", BLUE), ("научный", "сообщить знания", "red", RED), ("официально-деловой", "документы", "green", GREEN),
          ("публицистический", "воздействовать", "gold", GOLD), ("художественный", "образ, чувство", "violet", VIOLET)]
    for i, (a, b, s, c) in enumerate(st):
        x, y = 30 + (i % 3) * 520, 30 + (i // 3) * 210
        p.box(x, y, x + 490, y + 170, SOFT[s], c, 22, 3)
        p.text(x + 245, y + 75, a, 36, INK, True, anchor="ms"); p.text(x + 245, y + 130, b, 30, GREY, anchor="ms")
    p.save("r_styles", "Стили речи", "Функциональные стили речи и их задачи")


def phrase():
    p = Pic(1800, 420)
    items = [("читать", "книгу", 0, "что?", "управление"), ("красивый", "дом", 1, "какой?", "согласование"), ("бежать", "быстро", 0, "как?", "примыкание")]
    x = 50
    for a_w, b_w, main, q, t in items:
        sp = p.words(x, 260, [a_w, b_w], 52)
        mx = (sp[main][0] + sp[main][1]) / 2; dx = (sp[1 - main][0] + sp[1 - main][1]) / 2
        p.cross(mx, 178, RED, 9)
        p.arrow((mx + (12 if dx > mx else -12), 165), (dx, 190), RED, bend=-55)
        p.text((mx + dx) / 2, 92, q, 32, RED, anchor="ms")
        p.text((sp[0][0] + sp[1][1]) / 2, 340, t, 30, GREY, anchor="ms")
        x = sp[1][1] + 150
    p.save("r_phrase", "Словосочетание", "Словосочетание: над главным словом крестик, от него вопрос к зависимому; виды связи")


morphemes(); sentence_members(); sounds(); alphabet()
card("r_zhi_shi", "Жи-ши, ча-ща, чу-щу", "Правописание сочетаний жи-ши, ча-ща, чу-щу",
     "ЖИ, ШИ – с И;   ЧА, ЩА – с А;   ЧУ, ЩУ – с У", [["ж*и*раф", "ш*и*на", "лыж*и*"], ["ч*а*йка", "щ*а*вель", "туч*а*"], ["ч*у*до", "щ*у*ка", "круж*у*"]])
card("r_chk_chn", "Сочетания чк, чн, чт, нщ, щн", "Сочетания чк, чн, чт, нщ, щн пишутся без мягкого знака",
     "ЧК, ЧН, ЧТ, НЩ, ЩН – без Ь", [["до*чк*а", "ре*чн*ой", "*чт*о"], ["каме*нщ*ик", "мо*щн*ый"]])
card("r_soft_sign", "Мягкий знак", "Мягкий знак – показатель мягкости и разделительный мягкий знак",
     "Ь обозначает мягкость и разделяет", [["кон*ь*", "пен*ь*", "огон*ь*"], ["вороб*ь*и", "плат*ь*е", "сем*ь*я"]])
card("r_vowels_check", "Безударные гласные в корне", "Безударную гласную в корне проверяй ударением",
     "Безударную гласную проверь ударением", [["в*о*да́ – во́ды", "л*е*са́ – ле́с"], ["тр*а*ва́ – тра́вы", "з*и*ма́ – зи́мы"]])
card("r_paired", "Парные согласные", "Парный согласный проверяй словом, где после него стоит гласный",
     "Парный согласный проверь гласным после него", [["ду*б* – ду*б*ы", "гла*з* – гла*з*а"], ["ло*д*ка – ло*д*очка", "кни*ж*ка – кни*ж*ечка"]])
card("r_n_nn", "Н и НН в прилагательных", "Одна и две буквы н в суффиксах прилагательных",
     "-ОНН-, -ЕНН- – НН;   -ИН-, -АН-, -ЯН- – Н", [["тума*нн*ый", "клюкв*енн*ый"], ["лебед*ин*ый", "кож*ан*ый", "серебр*ян*ый"]], "Исключения: стеклянный, оловянный, деревянный")
card("r_not_verbs", "НЕ с глаголами", "Не с глаголами пишется раздельно",
     "НЕ с глаголами – раздельно", [["*не* знать", "*не* читал", "*не* играй"]], "Слитно, если без НЕ не употребляется: негодовать, ненавидеть")
card("r_capital", "Заглавная буква", "Заглавная буква в начале предложения и в именах собственных",
     "Пиши с большой буквы", [["*М*ама", "*М*осква", "*В*олга"], ["*Ж*учка", "*Т*аня", "*У*рал"]])
declension(); conjugation(); parts_of_speech(); punct_schemes(); participle(); gerund(); syllables(); text_parts(); styles(); phrase()

exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "draw_ru_more.py"), encoding="utf-8").read())

json.dump(meta, open(META, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(sum(k.startswith("r_") for k in meta), "схем по русскому")
