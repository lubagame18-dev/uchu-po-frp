#!/usr/bin/env python3
"""Собственные чертежи и схемы «Учу по ФРП» для уроков математики (без ИИ, построены по формулам).

Каждая картинка строится matplotlib по точным формулам/координатам, поэтому всё на ней верно.
Результат: img/lessons/own/m_<имя>.webp и tools/lessonimg/own.json (название и подпись).
В правилах tools/lessonimg/math.txt такая картинка указывается как «own:m_<имя>».
Запуск: python3 tools/lessonimg/draw_math.py
"""
import io, json, math, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Polygon, Rectangle, Wedge, FancyArrowPatch, Arc
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "img", "lessons", "own")
META = os.path.join(ROOT, "tools", "lessonimg", "own.json")
C = ["#5B8FD9", "#E57A6E", "#5DB28A", "#E9B44C", "#9A7FD1", "#4FB3C4"]
SOFT = ["#DCE8F8", "#F9DEDA", "#DDF1E6", "#FBEFD2", "#E9E1F6", "#D9F0F3"]
INK = "#2B2F3A"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 15, "axes.edgecolor": INK, "text.color": INK,
                     "axes.labelcolor": INK, "xtick.color": INK, "ytick.color": INK, "mathtext.fontset": "dejavuserif"})
meta = {k: v for k, v in (json.load(open(META, encoding="utf-8")) if os.path.exists(META) else {}).items() if not k.startswith("m_")}


def save(fig, name, title, caption):
    os.makedirs(OUT, exist_ok=True)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, facecolor="white", bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    im = Image.open(buf).convert("RGB")
    im.thumbnail((1100, 800))
    im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=86, method=6)
    meta[name] = {"title": title, "caption": caption}


def blank(w=10, h=6.2):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


def axes_plot(xr, yr, w=10, h=6.4, grid=True):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(*xr); ax.set_ylim(*yr)
    ax.spines["left"].set_position("zero"); ax.spines["bottom"].set_position("zero")
    ax.spines["right"].set_color("none"); ax.spines["top"].set_color("none")
    ax.plot(1, 0, ">", color=INK, transform=ax.get_yaxis_transform(), clip_on=False)
    ax.plot(0, 1, "^", color=INK, transform=ax.get_xaxis_transform(), clip_on=False)
    if grid:
        ax.grid(True, color="#E3E6EC", lw=1)
    ax.set_xlabel("x", loc="right"); ax.set_ylabel("y", loc="top", rotation=0)
    return fig, ax


def arrow(ax, a, b, color=INK, lw=2, ms=18, style="-|>"):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle=style, mutation_scale=ms, color=color, lw=lw))


# ---------- числа и действия ----------
def numline(lo, hi, name, title, caption, marks=None, w=11):
    fig, ax = blank(w, 2.6)
    ax.set_xlim(lo - .8, hi + .9); ax.set_ylim(-1.3, 1.3)
    arrow(ax, (lo - .6, 0), (hi + .8, 0), lw=2.2)
    for k in range(lo, hi + 1):
        ax.plot([k, k], [-.15, .15], color=INK, lw=2)
        ax.text(k, -.55, str(k).replace("-", "−"), ha="center", va="center", fontsize=16)
    ax.plot(0, 0, "o", color=INK, ms=6)
    for x, lab, col in marks or []:
        ax.plot(x, 0, "o", ms=13, color=col, zorder=5)
        ax.text(x, .62, lab, ha="center", fontsize=17, color=col, weight="bold")
    save(fig, name, title, caption)


numline(-6, 6, "m_numline_int", "Координатная прямая", "Координатная прямая: начало отсчёта 0, единичный отрезок, точки A(−4), B(3)",
        marks=[(-4, "A", C[1]), (3, "B", C[0])])
numline(0, 10, "m_numline_10", "Числовой луч от 0 до 10", "Числовой луч: число 7 – это 5 и ещё 2", marks=[(5, "5", C[2]), (7, "7", C[1])])


def jumps():
    fig, ax = blank(11, 3.2)
    ax.set_xlim(-.8, 10.9); ax.set_ylim(-1.3, 2.2)
    arrow(ax, (-.6, 0), (10.8, 0), lw=2.2)
    for k in range(11):
        ax.plot([k, k], [-.15, .15], color=INK, lw=2); ax.text(k, -.55, str(k), ha="center", fontsize=16)
    for a in range(4, 7):
        ax.add_patch(FancyArrowPatch((a, .15), (a + 1, .15), connectionstyle="arc3,rad=-.6", arrowstyle="-|>", mutation_scale=16, color=C[0], lw=2))
    for a in range(4, 2, -1):
        ax.add_patch(FancyArrowPatch((a, -.15), (a - 1, -.15), connectionstyle="arc3,rad=-.6", arrowstyle="-|>", mutation_scale=16, color=C[1], lw=2))
    ax.text(5.5, 1.35, "4 + 3 = 7", color=C[0], fontsize=18, ha="center", weight="bold")
    ax.text(3.5, -1.15, "4 − 2 = 2", color=C[1], fontsize=18, ha="center", weight="bold")
    save(fig, "m_jumps", "Сложение и вычитание на числовом луче", "Прибавить – шаги вправо, вычесть – шаги влево")


jumps()


def tenframe():
    fig, ax = blank(10, 4.4)
    ax.set_xlim(-.3, 11.6); ax.set_ylim(-1.0, 2.6)
    for f, n in enumerate([10, 3]):
        x0 = f * 6.2
        for i in range(10):
            r, c = divmod(i, 5)
            ax.add_patch(Rectangle((x0 + c, 1 - r), 1, 1, fill=False, ec=INK, lw=1.6))
            if i < n:
                ax.add_patch(Circle((x0 + c + .5, 1.5 - r), .36, color=C[0] if f == 0 else C[1]))
    ax.text(2.5, -.65, "1 десяток", ha="center", fontsize=17); ax.text(8.7, -.65, "3 единицы", ha="center", fontsize=17)
    ax.text(5.85, 1.0, "+", fontsize=26, ha="center", va="center")
    ax.text(11.4, 1.0, "= 13", fontsize=24, ha="left", va="center", weight="bold")
    ax.set_xlim(-.3, 13.8)
    save(fig, "m_tenframe", "Десяток и единицы", "Число 13: один десяток и три единицы")


tenframe()


def place_value():
    fig, ax = blank(11, 3.6)
    heads = [("класс миллионов", 3), ("класс тысяч", 3), ("класс единиц", 3)]
    digits = "005384217"
    names = ["сотни", "десятки", "единицы"] * 3
    ax.set_xlim(0, 9); ax.set_ylim(0, 3.3)
    for g in range(3):
        ax.add_patch(Rectangle((g * 3, 2.3), 3, .9, color=SOFT[g], ec=INK, lw=1.4))
        ax.text(g * 3 + 1.5, 2.75, heads[g][0], ha="center", va="center", fontsize=14, weight="bold")
    for i in range(9):
        ax.add_patch(Rectangle((i, 1.3), 1, 1, fill=False, ec=INK, lw=1.2))
        ax.text(i + .5, 1.8, names[i], ha="center", va="center", fontsize=10.5)
        ax.add_patch(Rectangle((i, .2), 1, 1.1, color=SOFT[i // 3], ec=INK, lw=1.2))
        ax.text(i + .5, .75, digits[i] if i >= 2 else "", ha="center", va="center", fontsize=24, weight="bold", color=C[i // 3])
    save(fig, "m_place_value", "Классы и разряды", "Таблица классов и разрядов: число 5 384 217")


place_value()


def mult_array():
    fig, ax = blank(9, 4.6)
    for r in range(3):
        for c in range(5):
            ax.add_patch(Circle((c * 1.1, -r * 1.1), .4, color=C[r % 3]))
    ax.text(6.0, -1.1, "3 · 5 = 15", fontsize=26, va="center", weight="bold")
    ax.text(2.2, .85, "5 в каждом ряду", ha="center", fontsize=15)
    ax.text(-1.0, -1.1, "3 ряда", ha="center", va="center", fontsize=15, rotation=90)
    ax.set_xlim(-1.5, 9.5); ax.set_ylim(-3, 1.4)
    save(fig, "m_mult_array", "Смысл умножения", "Умножение – сложение одинаковых слагаемых: 5 + 5 + 5 = 3 · 5")


mult_array()


def mult_table():
    fig, ax = blank(8.6, 8.6)
    n = 10
    for i in range(n + 1):
        for j in range(n + 1):
            if i == 0 and j == 0:
                ax.add_patch(Rectangle((0, -0), 1, 1, color="#FFFFFF", ec=INK, lw=.8)); ax.text(.5, .5, "·", ha="center", va="center", fontsize=20); continue
            v = (i or 1) * (j or 1) if i and j else (i or j)
            head = i == 0 or j == 0
            col = SOFT[0] if head else (SOFT[3] if i == j else "white")
            ax.add_patch(Rectangle((j, -i), 1, 1, color=col, ec="#9AA3B2", lw=.8))
            ax.text(j + .5, -i + .5, str(v), ha="center", va="center", fontsize=13, weight="bold" if head else None)
    ax.set_xlim(-.1, 11.1); ax.set_ylim(-10.1, 1.1)
    save(fig, "m_mult_table", "Таблица умножения", "Таблица умножения (Пифагора): на пересечении строки и столбца – произведение")


mult_table()


# ---------- дроби, проценты ----------
def fractions_pies():
    fig, ax = blank(11, 4)
    for k, (n, den) in enumerate([(1, 2), (1, 3), (3, 4), (5, 8)]):
        cx = k * 3
        for i in range(den):
            ax.add_patch(Wedge((cx, 0), 1.2, 90 - 360 * (i + 1) / den, 90 - 360 * i / den, fc=C[k] if i < n else "white", ec=INK, lw=1.6))
        ax.text(cx, -1.75, f"$\\frac{{{n}}}{{{den}}}$", ha="center", fontsize=30)
    ax.set_xlim(-1.5, 10.5); ax.set_ylim(-2.4, 1.4)
    save(fig, "m_fraction_pies", "Доли и дроби", "Закрашенная часть круга: 1/2, 1/3, 3/4, 5/8")


fractions_pies()


def fraction_bars():
    fig, ax = blank(11, 4.2)
    rows = [(1, 1), (1, 2), (2, 4), (4, 8), (3, 4)]
    for r, (n, d) in enumerate(rows):
        for i in range(d):
            ax.add_patch(Rectangle((i * 8 / d, -r), 8 / d, .78, fc=C[r] if i < n else "white", ec=INK, lw=1.3))
        ax.text(-.6, -r + .39, f"$\\frac{{{n}}}{{{d}}}$" if d > 1 else "1", ha="right", va="center", fontsize=22)
    ax.set_xlim(-1.8, 8.3); ax.set_ylim(-4.3, 1)
    save(fig, "m_fraction_bars", "Сравнение дробей", "Полоски дробей: 1/2 = 2/4 = 4/8, а 3/4 больше 1/2")


fraction_bars()


def hundred(name, shaded, title, caption, label):
    fig, ax = blank(7, 7.2)
    for i in range(100):
        r, c = divmod(i, 10)
        ax.add_patch(Rectangle((c, -r), 1, 1, fc=C[0] if i < shaded else "white", ec="#8C96A8", lw=.9))
    ax.text(5, 1.5, label, ha="center", fontsize=26, weight="bold")
    ax.set_xlim(-.2, 10.2); ax.set_ylim(-9.2, 2.3)
    save(fig, name, title, caption)


hundred("m_decimal_grid", 37, "Десятичные дроби", "37 клеток из 100 – это 0,37", "0,37")
hundred("m_percent_grid", 25, "Проценты", "25 % – это 25 частей из 100, то есть четверть", "25 % = 0,25 = 1/4")


def sieve():
    fig, ax = blank(8, 8.4)
    pr = [n for n in range(2, 101) if all(n % d for d in range(2, int(n ** .5) + 1))]
    for n in range(1, 101):
        r, c = divmod(n - 1, 10)
        ax.add_patch(Rectangle((c, -r), 1, 1, fc=SOFT[2] if n in pr else "white", ec="#9AA3B2", lw=.8))
        ax.text(c + .5, -r + .5, str(n), ha="center", va="center", fontsize=13, weight="bold" if n in pr else None, color=C[2] if n in pr else "#7A8394")
    ax.set_xlim(-.2, 10.2); ax.set_ylim(-9.2, 1.2)
    save(fig, "m_primes", "Простые числа", "Решето Эратосфена: простые числа до 100 выделены")


sieve()


def scales():
    fig, ax = blank(10, 5.4)
    ax.plot([0, 0], [-2.2, 1], color=INK, lw=4)
    ax.add_patch(Polygon([[-1, -2.2], [1, -2.2], [0, -1.5]], color=INK))
    ax.plot([-3.6, 3.6], [1, 1], color=INK, lw=4)
    for s in (-1, 1):
        x = 3.0 * s
        ax.plot([x - 1.2, x, x + 1.2], [-.2, 1, -.2], color="#8C96A8", lw=1.5)
        ax.add_patch(Rectangle((x - 1.6, -.45), 3.2, .25, color=INK))
    ax.add_patch(Rectangle((-4.3, -.2), 1.1, 1.0, fc=C[1], ec=INK)); ax.text(-3.75, .3, "x", ha="center", va="center", fontsize=26, color="white", weight="bold")
    for i in range(3):
        ax.add_patch(Circle((-2.6 + i * .0, -.2 + .38 + i * .0), .0))
    for i in range(3):
        ax.add_patch(Circle((-2.75 + (i % 2) * .55, .12 + (i // 2) * .55), .26, color=C[0]))
    for i in range(7):
        ax.add_patch(Circle((2.0 + (i % 4) * .6, .12 + (i // 4) * .55), .26, color=C[0]))
    ax.text(0, -3.1, "x + 3 = 7     x = 7 − 3     x = 4", ha="center", fontsize=22, weight="bold")
    ax.set_xlim(-5, 5); ax.set_ylim(-3.6, 2)
    save(fig, "m_equation_scales", "Уравнение как весы", "Уравнение – равенство с неизвестным: обе части «весят» одинаково")


scales()


# ---------- геометрия ----------
def shapes():
    fig, ax = blank(12, 4.2)
    ax.add_patch(Rectangle((0, 0), 2.6, 1.8, fc=SOFT[0], ec=C[0], lw=2.5))
    ax.add_patch(Rectangle((3.4, 0), 1.8, 1.8, fc=SOFT[1], ec=C[1], lw=2.5))
    ax.add_patch(Polygon([[6, 0], [8.2, 0], [7.0, 1.9]], fc=SOFT[2], ec=C[2], lw=2.5))
    ax.add_patch(Circle((9.9, .9), .95, fc=SOFT[3], ec=C[3], lw=2.5))
    ax.add_patch(Polygon([[11.4 + .9 * math.cos(a), .9 + .9 * math.sin(a)] for a in np.linspace(math.pi / 2, 2.5 * math.pi, 6)[:-1]], fc=SOFT[4], ec=C[4], lw=2.5))
    for x, t in [(1.3, "прямоугольник"), (4.3, "квадрат"), (7.1, "треугольник"), (9.9, "круг"), (11.4, "пятиугольник")]:
        ax.text(x, -.55, t, ha="center", fontsize=13)
    ax.set_xlim(-.3, 12.6); ax.set_ylim(-.9, 2.2)
    save(fig, "m_shapes", "Геометрические фигуры", "Плоские фигуры: прямоугольник, квадрат, треугольник, круг, многоугольник")


shapes()


def point_line():
    fig, ax = blank(11, 3.8)
    ax.plot(.5, 1, "o", color=C[1], ms=10); ax.text(.5, 1.4, "A", fontsize=18, ha="center")
    ax.plot([2, 5], [1, 1], color=C[0], lw=3); ax.plot([2, 5], [1, 1], "o", color=C[0], ms=9)
    ax.text(2, 1.4, "B", fontsize=18, ha="center"); ax.text(5, 1.4, "C", fontsize=18, ha="center"); ax.text(3.5, .4, "отрезок BC", ha="center", fontsize=14)
    arrow(ax, (6.2, 1), (9.0, 1), color=C[2], lw=3); ax.plot(6.2, 1, "o", color=C[2], ms=9); ax.text(6.2, 1.4, "O", fontsize=18, ha="center"); ax.text(7.6, .4, "луч", ha="center", fontsize=14)
    ax.add_patch(FancyArrowPatch((9.6, 1), (12.6, 1), arrowstyle="<|-|>", mutation_scale=18, color=C[4], lw=3)); ax.text(11.1, .4, "прямая", ha="center", fontsize=14)
    ax.text(.5, .4, "точка", ha="center", fontsize=14)
    ax.set_xlim(0, 13); ax.set_ylim(0, 2)
    save(fig, "m_point_line", "Точка, отрезок, луч, прямая", "Точка, отрезок, луч и прямая")


point_line()


def angles():
    fig, ax = blank(14, 3.8)
    for k, (deg, name) in enumerate([(50, "острый"), (90, "прямой"), (130, "тупой"), (180, "развёрнутый")]):
        x0 = [0, 3.4, 7.0, 12.0][k]
        a = math.radians(deg)
        ax.plot([x0, x0 + 2], [0, 0], color=INK, lw=2.5); ax.plot([x0, x0 + 2 * math.cos(a)], [0, 2 * math.sin(a)], color=INK, lw=2.5)
        if deg == 90:
            ax.add_patch(Rectangle((x0, 0), .3, .3, fill=False, ec=C[k], lw=2))
        else:
            ax.add_patch(Arc((x0, 0), .9, .9, theta1=0, theta2=deg, color=C[k], lw=2.5))
        ax.text(x0 + (1 if deg < 180 else 0), -.55, f"{name}, {deg}°", ha="center", fontsize=14)
    ax.set_xlim(-.4, 14.4); ax.set_ylim(-.9, 2.1)
    save(fig, "m_angles", "Виды углов", "Острый, прямой, тупой и развёрнутый углы")


angles()


def adj_vert():
    fig, ax = blank(10, 5)
    for a in (25, 205):
        pass
    ax.plot([-3, 3], [-1.4, 1.4], color=INK, lw=2.5); ax.plot([-3, 3], [.9, -.9], color=INK, lw=2.5)
    t1 = math.degrees(math.atan2(1.4, 3)); t2 = math.degrees(math.atan2(.9, -3))
    ax.add_patch(Arc((0, 0), 1.4, 1.4, theta1=t1, theta2=t2, color=C[0], lw=3)); ax.text(0, .95, "1", color=C[0], fontsize=18, ha="center")
    ax.add_patch(Arc((0, 0), 1.4, 1.4, theta1=t1 + 180, theta2=t2 + 180, color=C[0], lw=3)); ax.text(0, -1.15, "3", color=C[0], fontsize=18, ha="center")
    ax.add_patch(Arc((0, 0), 1.0, 1.0, theta1=t2 - 180, theta2=t1, color=C[1], lw=3)); ax.text(.85, .05, "2", color=C[1], fontsize=18, va="center")
    ax.text(0, -2.1, "∠1 = ∠3 (вертикальные),  ∠1 + ∠2 = 180° (смежные)", ha="center", fontsize=16)
    ax.set_xlim(-3.4, 3.4); ax.set_ylim(-2.5, 1.7)
    save(fig, "m_adjacent_vertical", "Смежные и вертикальные углы", "Вертикальные углы равны, сумма смежных углов 180°")


adj_vert()


def transversal():
    fig, ax = blank(10, 5.6)
    ax.plot([-4, 4], [1, 1], color=C[0], lw=2.5); ax.plot([-4, 4], [-1, -1], color=C[0], lw=2.5)
    ax.text(4.1, 1, "a", fontsize=18, va="center"); ax.text(4.1, -1, "b", fontsize=18, va="center")
    ax.plot([-2, 2], [-2.4, 2.4], color=INK, lw=2.5); ax.text(2.1, 2.4, "c", fontsize=18)
    k = 2.4 / 2
    for (x, y), lab in [((1 / k, 1), ("1", "2", "3", "4")), ((-1 / k, -1), ("5", "6", "7", "8"))]:
        for (dx, dy), l in zip([(.45, .35), (-.55, .35), (-.55, -.45), (.45, -.45)], lab):
            ax.text(x + dx, y + dy, l, fontsize=16, ha="center", va="center", color=C[1])
    ax.text(0, -3.0, "a ∥ b:  ∠3 = ∠5 (накрест лежащие),  ∠1 = ∠5 (соответственные),  ∠4 + ∠5 = 180°", ha="center", fontsize=13)
    ax.set_xlim(-4.5, 4.6); ax.set_ylim(-3.4, 2.8)
    save(fig, "m_transversal", "Параллельные прямые и секущая", "Углы при параллельных прямых и секущей")


transversal()


def triangle_types():
    fig, ax = blank(12, 4.2)
    tri = [[[0, 0], [2.6, 0], [1.1, 2.0]], [[3.6, 0], [6.2, 0], [3.6, 2.0]], [[7.2, 0], [10.6, 0], [7.8, 1.3]], [[11.4, 0], [13.6, 0], [12.5, 1.9]]]
    names = ["остроугольный", "прямоугольный", "тупоугольный", "равносторонний"]
    for k, (p, n) in enumerate(zip(tri, names)):
        ax.add_patch(Polygon(p, fc=SOFT[k], ec=C[k], lw=2.5))
        ax.text(np.mean([q[0] for q in p]), -.55, n, ha="center", fontsize=13)
    ax.add_patch(Rectangle((3.6, 0), .28, .28, fill=False, ec=C[1], lw=2))
    ax.set_xlim(-.3, 13.9); ax.set_ylim(-.9, 2.3)
    save(fig, "m_triangle_types", "Виды треугольников", "Треугольники по углам и по сторонам")


triangle_types()


def triangle_lines():
    fig, ax = blank(10, 6)
    A, B, Cc = np.array([0, 0]), np.array([7, 0]), np.array([2.2, 4.2])
    ax.add_patch(Polygon([A, B, Cc], fill=False, ec=INK, lw=2.5))
    M = (A + B) / 2
    ax.plot(*zip(Cc, M), color=C[0], lw=2.5)
    H = np.array([Cc[0], 0]); ax.plot(*zip(Cc, H), color=C[1], lw=2.5, ls="--"); ax.add_patch(Rectangle((Cc[0], 0), .25, .25, fill=False, ec=C[1], lw=1.6))
    a, b = np.linalg.norm(Cc - B), np.linalg.norm(Cc - A)
    L = A + (B - A) * b / (a + b); ax.plot(*zip(Cc, L), color=C[2], lw=2.5)
    for P, t, d in [(A, "A", (-.3, -.3)), (B, "B", (.15, -.3)), (Cc, "C", (0, .2)), (M, "M", (0, -.45)), (H, "H", (-.1, -.45)), (L, "L", (0, -.45))]:
        ax.text(P[0] + d[0], P[1] + d[1], t, fontsize=17, ha="center")
    ax.text(7.6, 3.6, "CM – медиана", color=C[0], fontsize=15); ax.text(7.6, 3.0, "CH – высота", color=C[1], fontsize=15); ax.text(7.6, 2.4, "CL – биссектриса", color=C[2], fontsize=15)
    ax.set_xlim(-.6, 11); ax.set_ylim(-.8, 4.7)
    save(fig, "m_triangle_lines", "Медиана, биссектриса, высота", "Медиана, высота и биссектриса треугольника")


triangle_lines()


def pythagoras():
    fig, ax = blank(8, 7)
    a, b = 3, 4
    A, B, Cc = np.array([0, 0]), np.array([b, 0]), np.array([0, a])
    ax.add_patch(Polygon([A, B, Cc], fc=SOFT[3], ec=INK, lw=2.5))
    ax.add_patch(Polygon([A, B, B + [0, -b], A + [0, -b]], fc=SOFT[0], ec=C[0], lw=2))
    ax.add_patch(Polygon([A, Cc, Cc + [-a, 0], A + [-a, 0]], fc=SOFT[1], ec=C[1], lw=2))
    n = np.array([a, b]) / 5
    ax.add_patch(Polygon([B, Cc, Cc + n * 5, B + n * 5], fc=SOFT[2], ec=C[2], lw=2))
    ax.add_patch(Rectangle((0, 0), .3, .3, fill=False, ec=INK, lw=1.5))
    ax.text(2, -2, "$b^2$", fontsize=26, ha="center", va="center"); ax.text(-1.5, 1.5, "$a^2$", fontsize=26, ha="center", va="center")
    ax.text(4.4, 3.7, "$c^2$", fontsize=26, ha="center", va="center")
    ax.text(1.5, -5, "$a^2 + b^2 = c^2$", fontsize=28, ha="center")
    ax.set_xlim(-3.5, 7.5); ax.set_ylim(-5.6, 6.5)
    save(fig, "m_pythagoras", "Теорема Пифагора", "Квадрат гипотенузы равен сумме квадратов катетов")


pythagoras()


def quads():
    fig, ax = blank(12, 3.6)
    P = [[[0, 0], [2.2, 0], [2.8, 1.6], [.6, 1.6]], [[3.6, .8], [4.6, 0], [5.6, .8], [4.6, 1.6]], [[6.4, 0], [9.0, 0], [8.4, 1.6], [7.0, 1.6]], [[9.8, 0], [12.4, 0], [12.4, 1.6], [9.8, 1.6]]]
    N = ["параллелограмм", "ромб", "трапеция", "прямоугольник"]
    for k, (p, n) in enumerate(zip(P, N)):
        ax.add_patch(Polygon(p, fc=SOFT[k], ec=C[k], lw=2.5)); ax.text(np.mean([q[0] for q in p]), -.5, n, ha="center", fontsize=13)
    ax.set_xlim(-.3, 12.7); ax.set_ylim(-.8, 1.9)
    save(fig, "m_quadrilaterals", "Четырёхугольники", "Параллелограмм, ромб, трапеция, прямоугольник")


quads()


def circle_parts():
    fig, ax = blank(8, 7)
    ax.add_patch(Circle((0, 0), 3, fill=False, ec=INK, lw=2.5)); ax.plot(0, 0, "o", color=INK); ax.text(-.35, -.35, "O", fontsize=17)
    ax.plot([0, 3 * math.cos(.5)], [0, 3 * math.sin(.5)], color=C[0], lw=2.5); ax.text(1.0, 1.0, "r", fontsize=20, color=C[0])
    ax.plot([-3, 3], [0, 0], color=C[1], lw=2.5); ax.text(-2.2, .15, "d", fontsize=20, color=C[1])
    ax.plot([3 * math.cos(3.6), 3 * math.cos(5.3)], [3 * math.sin(3.6), 3 * math.sin(5.3)], color=C[2], lw=2.5); ax.text(-.6, -2.25, "хорда", color=C[2], fontsize=15)
    t = 2.2; P = np.array([3 * math.cos(t), 3 * math.sin(t)]); v = np.array([-math.sin(t), math.cos(t)])
    ax.plot(*zip(P - 2.2 * v, P + 2.2 * v), color=C[4], lw=2.5); ax.text(*(P + 2.3 * v + [-.6, 0]), "касательная", color=C[4], fontsize=15)
    ax.text(0, -3.9, "r – радиус, d – диаметр, d = 2r", ha="center", fontsize=16)
    ax.set_xlim(-4.5, 4.5); ax.set_ylim(-4.3, 4.6)
    save(fig, "m_circle_parts", "Окружность и её элементы", "Радиус, диаметр, хорда, касательная")


circle_parts()


def circumference():
    fig, ax = blank(11, 4.2)
    ax.add_patch(Circle((0, 1), 1, fill=False, ec=C[0], lw=3)); ax.plot([-1, 1], [1, 1], color=C[1], lw=2.5); ax.text(0, 1.15, "d", fontsize=18, color=C[1], ha="center")
    ax.plot([2, 2 + math.pi * 2], [0, 0], color=C[0], lw=4)
    for k in range(4):
        ax.plot([2 + 2 * k, 2 + 2 * k], [-.15, .15], color=INK, lw=2)
    ax.text(2 + math.pi, .45, "C = πd ≈ 3,14 · d", ha="center", fontsize=20, weight="bold")
    ax.set_xlim(-1.4, 8.8); ax.set_ylim(-.6, 2.2)
    save(fig, "m_circumference", "Длина окружности", "Окружность «разворачивается» примерно в три с небольшим диаметра: C = πd")


circumference()


def incircle():
    fig, ax = blank(10, 5.4)
    A, B, Cc = np.array([0., 0]), np.array([6., 0]), np.array([1.8, 4.])
    a, b, c = np.linalg.norm(B - Cc), np.linalg.norm(A - Cc), np.linalg.norm(A - B)
    I = (a * A + b * B + c * Cc) / (a + b + c); s = (a + b + c) / 2; r = math.sqrt((s - a) * (s - b) * (s - c) / s)
    ax.add_patch(Polygon([A, B, Cc], fill=False, ec=INK, lw=2.5)); ax.add_patch(Circle(I, r, fill=False, ec=C[0], lw=2.5)); ax.plot(*I, "o", color=C[0])
    D = 2 * (A[0] * (B[1] - Cc[1]) + B[0] * (Cc[1] - A[1]) + Cc[0] * (A[1] - B[1]))
    ux = ((A @ A) * (B[1] - Cc[1]) + (B @ B) * (Cc[1] - A[1]) + (Cc @ Cc) * (A[1] - B[1])) / D
    uy = ((A @ A) * (Cc[0] - B[0]) + (B @ B) * (A[0] - Cc[0]) + (Cc @ Cc) * (B[0] - A[0])) / D
    O = np.array([ux, uy]); R = np.linalg.norm(O - A)
    ax.add_patch(Circle(O, R, fill=False, ec=C[1], lw=2.5, ls="--"))
    ax.text(7.0, 3.2, "вписанная окружность", color=C[0], fontsize=15); ax.text(7.0, 2.5, "описанная окружность", color=C[1], fontsize=15)
    ax.set_xlim(-1.2, 11.5); ax.set_ylim(O[1] - R - .2, O[1] + R + .2)
    save(fig, "m_inscribed", "Вписанная и описанная окружности", "Окружность, вписанная в треугольник, и окружность, описанная около него")


incircle()


def symmetry():
    fig, ax = blank(9, 5)
    p = np.array([[.5, 0], [2.2, .4], [1.6, 2.2], [.8, 1.4]])
    q = p.copy(); q[:, 0] *= -1
    ax.add_patch(Polygon(p, fc=SOFT[0], ec=C[0], lw=2.5)); ax.add_patch(Polygon(q, fc=SOFT[1], ec=C[1], lw=2.5))
    ax.plot([0, 0], [-.6, 2.8], color=INK, lw=2, ls="--"); ax.text(.1, 2.75, "ось симметрии", fontsize=14)
    for a, b in zip(p, q):
        ax.plot([a[0], b[0]], [a[1], b[1]], color="#B7BFCC", lw=1, ls=":")
    ax.set_xlim(-2.8, 3.6); ax.set_ylim(-.8, 3.1)
    save(fig, "m_symmetry", "Осевая симметрия", "Фигура и её отражение относительно оси симметрии")


symmetry()


def area_grid():
    fig, ax = blank(9, 5.4)
    for i in range(5):
        for j in range(3):
            ax.add_patch(Rectangle((i, j), 1, 1, fc=SOFT[0], ec=C[0], lw=1.4))
    ax.add_patch(Rectangle((0, 0), 5, 3, fill=False, ec=INK, lw=3))
    ax.text(2.5, -.6, "a = 5 см", ha="center", fontsize=17); ax.text(-.4, 1.5, "b = 3 см", ha="center", va="center", rotation=90, fontsize=17)
    ax.text(6.0, 2.0, "S = a · b = 15 см²", fontsize=20, weight="bold"); ax.text(6.0, 1.2, "P = 2(a + b) = 16 см", fontsize=20, weight="bold")
    ax.set_xlim(-1, 11.5); ax.set_ylim(-1.1, 3.4)
    save(fig, "m_area_rect", "Площадь и периметр прямоугольника", "Прямоугольник 5 см × 3 см: площадь 15 см², периметр 16 см")


area_grid()


def similar():
    fig, ax = blank(10, 4.6)
    t = np.array([[0, 0], [2.4, 0], [.8, 1.6]])
    ax.add_patch(Polygon(t, fc=SOFT[0], ec=C[0], lw=2.5)); ax.add_patch(Polygon(t * 1.6 + [3.5, 0], fc=SOFT[1], ec=C[1], lw=2.5))
    ax.text(1.2, -.5, "△ABC", ha="center", fontsize=16); ax.text(3.5 + 1.9, -.5, "△A₁B₁C₁", ha="center", fontsize=16)
    ax.text(5.4, 2.8, "k = A₁B₁ : AB = 1,6", ha="center", fontsize=17)
    ax.set_xlim(-.4, 8.0); ax.set_ylim(-.9, 3.2)
    save(fig, "m_similar", "Подобные треугольники", "Подобные треугольники: углы равны, стороны пропорциональны")


similar()


def vectors():
    fig, ax = blank(9, 5.6)
    a, b = np.array([4, 1]), np.array([1.5, 2.6])
    arrow(ax, (0, 0), tuple(a), C[0], 3); arrow(ax, (0, 0), tuple(b), C[1], 3); arrow(ax, (0, 0), tuple(a + b), C[2], 3)
    ax.plot(*zip(a, a + b), color="#9AA3B2", ls="--"); ax.plot(*zip(b, a + b), color="#9AA3B2", ls="--")
    ax.text(2.2, .1, "$\\vec a$", fontsize=22, color=C[0]); ax.text(.3, 1.6, "$\\vec b$", fontsize=22, color=C[1]); ax.text(3.0, 2.4, "$\\vec a+\\vec b$", fontsize=22, color=C[2])
    ax.set_xlim(-.5, 6.3); ax.set_ylim(-.5, 4)
    save(fig, "m_vectors", "Сложение векторов", "Правило параллелограмма: сумма векторов – диагональ")


vectors()


def thales():
    fig, ax = blank(9, 5.4)
    ax.plot([0, 6], [0, 3.6], color=INK, lw=2); ax.plot([0, 6.5], [0, 0], color=INK, lw=2)
    for k, x in enumerate([1.5, 3, 4.5]):
        y = x * .6; ax.plot([x, x + .9], [y, 0], color=C[k], lw=2.5)
        ax.plot(x, y, "o", color=INK, ms=5); ax.plot(x + .9, 0, "o", color=INK, ms=5)
    ax.text(3, -.7, "равные отрезки на одной стороне → равные на другой", ha="center", fontsize=14)
    ax.set_xlim(-.4, 7); ax.set_ylim(-1, 3.9)
    save(fig, "m_thales", "Теорема Фалеса", "Параллельные прямые отсекают на сторонах угла пропорциональные отрезки")


thales()


def solids():
    fig, ax = blank(13, 4.4)
    def cube(x0, w, h, d, col):
        f = np.array([[0, 0], [w, 0], [w, h], [0, h]]) + [x0, 0]; s = np.array([d * .6, d * .45])
        ax.add_patch(Polygon(f, fc=SOFT[col], ec=C[col], lw=2)); ax.add_patch(Polygon([f[1], f[1] + s, f[2] + s, f[2]], fc=SOFT[col], ec=C[col], lw=2))
        ax.add_patch(Polygon([f[3], f[2], f[2] + s, f[3] + s], fc=SOFT[col], ec=C[col], lw=2))
        for a, b in [(f[0], f[0] + s), (f[0] + s, f[1] + s), (f[0] + s, f[3] + s)]:
            ax.plot(*zip(a, b), color=C[col], lw=1.4, ls="--")
    cube(0, 1.6, 1.6, 1.6, 0); cube(3.0, 2.2, 1.3, 1.2, 1)
    # пирамида
    B = np.array([[6.2, 0], [8.0, 0], [8.7, .55], [6.9, .55]]); T = np.array([7.45, 2.2])
    for i in range(4):
        ls = "--" if i in (2, 3) else "-"
        ax.plot(*zip(B[i], B[(i + 1) % 4]), color=C[2], lw=2, ls="--" if i == 2 or i == 3 else "-")
        ax.plot(*zip(B[i], T), color=C[2], lw=2, ls="--" if i == 3 else "-")
    # цилиндр, конус, шар
    from matplotlib.patches import Ellipse
    ax.add_patch(Ellipse((10.0, 1.7), 1.6, .45, fill=False, ec=C[3], lw=2)); ax.plot([9.2, 9.2], [.0, 1.7], color=C[3], lw=2); ax.plot([10.8, 10.8], [0, 1.7], color=C[3], lw=2)
    ax.add_patch(Arc((10.0, 0), 1.6, .45, theta1=180, theta2=360, color=C[3], lw=2)); ax.add_patch(Arc((10.0, 0), 1.6, .45, theta1=0, theta2=180, color=C[3], lw=1.4, ls="--"))
    ax.add_patch(Arc((12.1, 0), 1.6, .45, theta1=180, theta2=360, color=C[4], lw=2)); ax.add_patch(Arc((12.1, 0), 1.6, .45, theta1=0, theta2=180, color=C[4], lw=1.4, ls="--"))
    ax.plot([11.3, 12.1, 12.9], [0, 2.1, 0], color=C[4], lw=2)
    ax.add_patch(Circle((14.2, .9), .9, fc=SOFT[5], ec=C[5], lw=2)); ax.add_patch(Ellipse((14.2, .9), 1.8, .45, fill=False, ec=C[5], lw=1.3, ls="--"))
    for x, t in [(.8, "куб"), (4.1, "параллелепипед"), (7.4, "пирамида"), (10.0, "цилиндр"), (12.1, "конус"), (14.2, "шар")]:
        ax.text(x, -.75, t, ha="center", fontsize=13)
    ax.set_xlim(-.3, 15.4); ax.set_ylim(-1.1, 2.5)
    save(fig, "m_solids", "Пространственные фигуры", "Куб, параллелепипед, пирамида, цилиндр, конус, шар")


solids()


# ---------- функции и графики ----------
def fn(name, title, caption, xr, yr, curves, notes=()):
    fig, ax = axes_plot(xr, yr)
    for f, lab, col, *dom in curves:
        x = np.linspace(*(dom[0] if dom else xr), 800)
        with np.errstate(all="ignore"):
            y = f(x)
        y = np.where(np.abs(y) > 60, np.nan, y)
        ax.plot(x, y, color=col, lw=3, label=lab)
    for x, y, t, col in notes:
        ax.plot(x, y, "o", color=col, ms=8, zorder=5); ax.text(x + .15, y + .3, t, color=col, fontsize=15)
    ax.legend(loc="upper left", frameon=True, fontsize=15)
    save(fig, name, title, caption)


fn("m_linear", "Линейная функция", "Графики линейных функций – прямые: y = 2x + 1 и y = −x + 3", (-4, 4), (-4, 6),
   [(lambda x: 2 * x + 1, "$y = 2x + 1$", C[0]), (lambda x: -x + 3, "$y = -x + 3$", C[1])], [(2 / 3, 7 / 3, "", C[2])])
fn("m_parabola", "Квадратичная функция", "Парабола y = x² − 2x − 3: вершина (1; −4), нули x = −1 и x = 3", (-3, 5), (-5, 6),
   [(lambda x: x ** 2 - 2 * x - 3, "$y = x^2 - 2x - 3$", C[0])], [(1, -4, "(1; −4)", C[1]), (-1, 0, "", C[2]), (3, 0, "", C[2])])
fn("m_hyperbola", "Обратная пропорциональность", "Гипербола y = 4/x", (-6, 6), (-6, 6),
   [(lambda x: 4 / x, "$y = \\frac{4}{x}$", C[0], (.6, 6)), (lambda x: 4 / x, None, C[0], (-6, -.6))])
fn("m_sqrt", "Функция y = √x", "График функции y = √x", (-1, 10), (-1, 4), [(np.sqrt, "$y = \\sqrt{x}$", C[0], (0, 10))], [(4, 2, "(4; 2)", C[1]), (9, 3, "(9; 3)", C[1])])
fn("m_power", "Степенные функции", "Графики y = x, y = x², y = x³", (-2.5, 2.5), (-4, 5),
   [(lambda x: x, "$y = x$", C[0]), (lambda x: x ** 2, "$y = x^2$", C[1]), (lambda x: x ** 3, "$y = x^3$", C[2])])
fn("m_exp_log", "Показательная и логарифмическая функции", "y = 2ˣ и y = log₂x симметричны относительно прямой y = x", (-3, 6), (-3, 6),
   [(lambda x: 2 ** x, "$y = 2^x$", C[0]), (lambda x: np.log2(x), "$y = \\log_2 x$", C[1], (.05, 6)), (lambda x: x, "$y = x$", "#B7BFCC")])
fn("m_trig", "Тригонометрические функции", "Графики y = sin x и y = cos x", (-6.6, 6.6), (-1.8, 1.8),
   [(np.sin, "$y = \\sin x$", C[0]), (np.cos, "$y = \\cos x$", C[1])])
fn("m_abs", "Модуль числа", "График функции y = |x|", (-4, 4), (-1, 4.5), [(np.abs, "$y = |x|$", C[0])])


def unit_circle():
    fig, ax = axes_plot((-1.5, 1.5), (-1.3, 1.3), 7, 6.4)
    ax.set_aspect("equal")
    ax.add_patch(Circle((0, 0), 1, fill=False, ec=INK, lw=2))
    a = math.radians(50); P = (math.cos(a), math.sin(a))
    ax.plot([0, P[0]], [0, P[1]], color=C[0], lw=2.5); ax.plot(*P, "o", color=C[0], ms=8)
    ax.plot([P[0], P[0]], [0, P[1]], color=C[1], lw=2.5, ls="--"); ax.plot([0, P[0]], [P[1], P[1]], color=C[2], lw=2.5, ls="--")
    ax.add_patch(Arc((0, 0), .5, .5, theta1=0, theta2=50, color=C[0], lw=2)); ax.text(.3, .1, "α", fontsize=18, color=C[0])
    ax.text(P[0] + .05, P[1] + .07, "P(cos α; sin α)", fontsize=14)
    ax.set_xticks([-1, 1]); ax.set_yticks([-1, 1])
    save(fig, "m_unit_circle", "Единичная окружность", "Синус и косинус угла на единичной окружности")


unit_circle()


def tangent_deriv():
    fig, ax = axes_plot((-1, 5), (-1, 6))
    f = lambda x: .3 * (x - 1) ** 3 - .9 * (x - 1) + 2.5
    x = np.linspace(-1, 4.6, 400); ax.plot(x, f(x), color=C[0], lw=3, label="$y = f(x)$")
    x0 = 3; k = .9 * (x0 - 1) ** 2 - .9
    t = np.linspace(1.6, 4.4, 10); ax.plot(t, f(x0) + k * (t - x0), color=C[1], lw=2.5, label="касательная")
    ax.plot(x0, f(x0), "o", color=C[1], ms=9); ax.text(x0 - 1.1, f(x0) + .4, "$f'(x_0) = \\tan\\alpha$", fontsize=16, color=C[1])
    ax.legend(loc="upper left", fontsize=14)
    save(fig, "m_derivative", "Производная и касательная", "Производная в точке – угловой коэффициент касательной")


tangent_deriv()


def integral_area():
    fig, ax = axes_plot((-.5, 4.5), (-.5, 5))
    f = lambda x: .25 * x ** 2 + 1
    x = np.linspace(-.5, 4.3, 300); ax.plot(x, f(x), color=C[0], lw=3, label="$y = f(x)$")
    xs = np.linspace(1, 3.5, 200); ax.fill_between(xs, 0, f(xs), color=SOFT[0], alpha=.9)
    ax.text(2.25, 1.0, "$S = \\int_a^b f(x)\\,dx$", fontsize=18, ha="center")
    ax.set_xticks([1, 3.5]); ax.set_xticklabels(["a", "b"])
    ax.legend(loc="upper left", fontsize=14)
    save(fig, "m_integral", "Интеграл и площадь", "Площадь криволинейной трапеции равна интегралу")


integral_area()


def coord_plane():
    fig, ax = axes_plot((-6, 6), (-5, 5), 9, 7.4)
    ax.set_aspect("equal"); ax.set_xticks(range(-5, 6)); ax.set_yticks(range(-4, 5))
    for (x, y, t, c) in [(3, 2, "A(3; 2)", C[0]), (-4, 1, "B(−4; 1)", C[1]), (-2, -3, "C(−2; −3)", C[2]), (4, -2, "D(4; −2)", C[4])]:
        ax.plot(x, y, "o", color=c, ms=10); ax.text(x + .2, y + .3, t, color=c, fontsize=15, weight="bold")
        ax.plot([x, x], [0, y], color=c, ls=":"); ax.plot([0, x], [y, y], color=c, ls=":")
    for (x, y, t) in [(4.5, 4, "I"), (-4.5, 4, "II"), (-4.5, -4, "III"), (4.5, -4, "IV")]:
        ax.text(x, y, t, fontsize=20, color="#9AA3B2", ha="center")
    save(fig, "m_coord_plane", "Координатная плоскость", "Прямоугольная система координат: точки и координатные четверти")


coord_plane()


def intervals():
    fig, ax = blank(11, 2.8)
    ax.set_xlim(-4.5, 6.5); ax.set_ylim(-1.3, 1.4)
    arrow(ax, (-4.3, 0), (6.3, 0), lw=2.2)
    ax.add_patch(Rectangle((-2, -.12), 5, .24, color=SOFT[0]))
    ax.plot(-2, 0, "o", mfc="white", mec=C[0], ms=13, mew=2.5); ax.plot(3, 0, "o", color=C[0], ms=13)
    ax.text(-2, -.65, "−2", ha="center", fontsize=17); ax.text(3, -.65, "3", ha="center", fontsize=17)
    ax.text(.5, .55, "−2 < x ≤ 3,   x ∈ (−2; 3]", ha="center", fontsize=19, weight="bold")
    save(fig, "m_intervals", "Числовые промежутки", "Решение неравенства на числовой прямой: (−2; 3]")


intervals()


# ---------- вероятность и статистика ----------
def dice():
    fig, ax = blank(11, 3.2)
    pips = {1: [(0, 0)], 2: [(-1, 1), (1, -1)], 3: [(-1, 1), (0, 0), (1, -1)], 4: [(-1, 1), (1, 1), (-1, -1), (1, -1)],
            5: [(-1, 1), (1, 1), (0, 0), (-1, -1), (1, -1)], 6: [(-1, 1), (1, 1), (-1, 0), (1, 0), (-1, -1), (1, -1)]}
    for k in range(1, 7):
        x0 = (k - 1) * 2.2
        ax.add_patch(matplotlib.patches.FancyBboxPatch((x0 - .8, -.8), 1.6, 1.6, boxstyle="round,pad=0.05,rounding_size=.25", fc="white", ec=INK, lw=2))
        for dx, dy in pips[k]:
            ax.add_patch(Circle((x0 + dx * .45, dy * .45), .14, color=C[1] if k == 1 else INK))
    ax.text(5.5, -1.5, "P(выпадет 6) = 1/6", ha="center", fontsize=19, weight="bold")
    ax.set_xlim(-1.2, 12.2); ax.set_ylim(-1.9, 1)
    save(fig, "m_dice", "Игральная кость и вероятность", "Шесть равновозможных исходов: вероятность каждого 1/6")


dice()


def prob_tree():
    fig, ax = blank(10, 5.6)
    def node(p, t, c=INK):
        ax.add_patch(Circle(p, .32, fc="white", ec=c, lw=2)); ax.text(*p, t, ha="center", va="center", fontsize=14, color=c)
    S = (0, 0); A, B = (3, 1.6), (3, -1.6)
    leaves = [(6.2, 2.4), (6.2, .8), (6.2, -.8), (6.2, -2.4)]
    for p, q in [(S, A), (S, B), (A, leaves[0]), (A, leaves[1]), (B, leaves[2]), (B, leaves[3])]:
        ax.plot(*zip(p, q), color="#9AA3B2", lw=2)
        ax.text((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + .2, "1/2", fontsize=13, color=C[0], ha="center")
    node(S, ""); node(A, "О", C[1]); node(B, "Р", C[2])
    for p, t in zip(leaves, ["ОО", "ОР", "РО", "РР"]):
        ax.text(p[0], p[1], t, va="center", fontsize=16)
        ax.text(p[0] + 1.3, p[1], "1/4", va="center", fontsize=15, color=C[0])
    ax.text(3.6, -3.4, "две монеты: О – орёл, Р – решка", ha="center", fontsize=14)
    ax.set_xlim(-.6, 8.4); ax.set_ylim(-3.8, 3.0)
    save(fig, "m_prob_tree", "Дерево вероятностей", "Дерево случайного опыта: два бросания монеты")


prob_tree()


def bar_chart():
    fig, ax = plt.subplots(figsize=(10, 5.6))
    d = ["Пн", "Вт", "Ср", "Чт", "Пт"]; v = [12, 18, 9, 15, 21]
    ax.bar(d, v, color=C[:5]); ax.axhline(np.mean(v), color=INK, ls="--", lw=1.5); ax.text(4.45, np.mean(v) + .5, f"среднее {np.mean(v):g}", ha="right", fontsize=14)
    for i, x in enumerate(v):
        ax.text(i, x + .4, str(x), ha="center", fontsize=15)
    ax.spines[["top", "right"]].set_visible(False); ax.set_ylim(0, 24)
    save(fig, "m_bar_chart", "Столбчатая диаграмма", "Столбчатая диаграмма и среднее арифметическое: 15")


bar_chart()


def histogram():
    rng = np.random.default_rng(7)
    data = rng.normal(150, 8, 300)
    fig, ax = plt.subplots(figsize=(10, 5.6))
    ax.hist(data, bins=12, color=SOFT[0], ec=C[0], lw=1.5)
    x = np.linspace(120, 180, 300); ax.plot(x, 300 * 5 * np.exp(-(x - 150) ** 2 / 128) / (8 * math.sqrt(2 * math.pi)), color=C[1], lw=3)
    ax.spines[["top", "right"]].set_visible(False)
    save(fig, "m_histogram", "Гистограмма и нормальное распределение", "Гистограмма данных и кривая нормального распределения")


histogram()


def scatter():
    rng = np.random.default_rng(3)
    x = rng.uniform(140, 185, 40); y = .9 * x - 90 + rng.normal(0, 5, 40)
    fig, ax = plt.subplots(figsize=(10, 5.6))
    ax.scatter(x, y, s=60, color=C[0]); k, b = np.polyfit(x, y, 1); t = np.array([138, 187]); ax.plot(t, k * t + b, color=C[1], lw=2.5)
    ax.spines[["top", "right"]].set_visible(False)
    save(fig, "m_scatter", "Диаграмма рассеивания", "Диаграмма рассеивания и линия тренда")


scatter()


def euler():
    fig, ax = blank(10, 5.8)
    ax.add_patch(Circle((-1, 0), 2, fc=C[0], alpha=.35, ec=C[0], lw=2.5)); ax.add_patch(Circle((1.2, 0), 2, fc=C[1], alpha=.35, ec=C[1], lw=2.5))
    ax.text(-2.2, 1.7, "A", fontsize=24, weight="bold", color=C[0]); ax.text(2.4, 1.7, "B", fontsize=24, weight="bold", color=C[1])
    ax.text(.1, 0, "A ∩ B", fontsize=18, ha="center", weight="bold")
    ax.text(.1, -2.65, "A ∪ B – всё закрашенное", ha="center", fontsize=15)
    ax.set_xlim(-3.4, 3.6); ax.set_ylim(-3.0, 2.3)
    save(fig, "m_euler", "Круги Эйлера", "Множества A и B: пересечение и объединение")


euler()


def graph_theory():
    fig, ax = blank(9, 5.4)
    P = {"A": (0, 0), "B": (2.5, 1.6), "C": (5, 0), "D": (2.5, -1.6), "E": (6.8, 1.4)}
    E = [("A", "B"), ("B", "C"), ("C", "D"), ("D", "A"), ("A", "C"), ("C", "E"), ("B", "E")]
    for a, b in E:
        ax.plot(*zip(P[a], P[b]), color="#8C96A8", lw=2.5)
    for k, (n, p) in enumerate(P.items()):
        ax.add_patch(Circle(p, .36, fc=SOFT[k], ec=C[k], lw=2.5)); ax.text(*p, n, ha="center", va="center", fontsize=17, weight="bold")
    ax.set_xlim(-.7, 7.6); ax.set_ylim(-2.2, 2.2)
    save(fig, "m_graph", "Граф: вершины и рёбра", "Граф из 5 вершин и 7 рёбер; степень вершины C равна 4")


graph_theory()


def pascal():
    fig, ax = blank(9, 5.6)
    rows = [[1]]
    for _ in range(6):
        r = rows[-1]; rows.append([1] + [r[i] + r[i + 1] for i in range(len(r) - 1)] + [1])
    for i, r in enumerate(rows):
        for j, v in enumerate(r):
            x = j - i / 2
            ax.add_patch(Circle((x, -i * .85), .36, fc=SOFT[i % 6], ec=C[i % 6], lw=1.5)); ax.text(x, -i * .85, str(v), ha="center", va="center", fontsize=14, weight="bold")
    ax.set_xlim(-3.8, 3.8); ax.set_ylim(-5.6, .6)
    save(fig, "m_pascal", "Треугольник Паскаля", "Треугольник Паскаля: число сочетаний из n по k")


pascal()


def progression():
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.6))
    n = np.arange(1, 8)
    ax[0].bar(n, 2 + 3 * (n - 1), color=C[0]); ax[0].set_title("арифметическая: aₙ = 2 + 3(n − 1)", fontsize=14)
    ax[1].bar(n, 2 ** (n - 1), color=C[1]); ax[1].set_title("геометрическая: bₙ = 2ⁿ⁻¹", fontsize=14)
    for a in ax:
        a.spines[["top", "right"]].set_visible(False); a.set_xticks(n)
    save(fig, "m_progression", "Прогрессии", "Арифметическая прогрессия растёт на одно и то же число, геометрическая – в одно и то же число раз")


progression()


def motion():
    fig, ax = blank(11, 3.4)
    ax.plot([0, 10], [0, 0], color=INK, lw=3); ax.plot([0, 10], [0, 0], "|", color=INK, ms=20, mew=3)
    ax.text(0, -.6, "A", fontsize=18, ha="center"); ax.text(10, -.6, "B", fontsize=18, ha="center")
    arrow(ax, (.3, .5), (3.5, .5), C[0], 3); arrow(ax, (9.7, .5), (6.0, .5), C[1], 3)
    ax.text(1.9, .85, "v₁ = 60 км/ч", color=C[0], fontsize=15, ha="center"); ax.text(7.9, .85, "v₂ = 40 км/ч", color=C[1], fontsize=15, ha="center")
    ax.text(5, -1.2, "s = (v₁ + v₂) · t", ha="center", fontsize=19, weight="bold")
    ax.set_xlim(-.6, 10.6); ax.set_ylim(-1.6, 1.3)
    save(fig, "m_motion", "Задачи на движение", "Движение навстречу: скорость сближения v₁ + v₂")


motion()


def clock():
    fig, ax = blank(6, 6)
    ax.add_patch(Circle((0, 0), 2.6, fc="white", ec=INK, lw=4))
    for h in range(1, 13):
        a = math.radians(90 - 30 * h); ax.text(2.1 * math.cos(a), 2.1 * math.sin(a), str(h), ha="center", va="center", fontsize=18, weight="bold")
    for m in range(60):
        a = math.radians(90 - 6 * m); r0 = 2.4 if m % 5 else 2.3
        ax.plot([r0 * math.cos(a), 2.55 * math.cos(a)], [r0 * math.sin(a), 2.55 * math.sin(a)], color=INK, lw=1 if m % 5 else 2.4)
    hh = math.radians(90 - (2 * 30 + 45 * .5)); mm = math.radians(90 - 45 * 6)
    ax.plot([0, 1.25 * math.cos(hh)], [0, 1.25 * math.sin(hh)], color=C[1], lw=7, solid_capstyle="round")
    ax.plot([0, 1.95 * math.cos(mm)], [0, 1.95 * math.sin(mm)], color=C[0], lw=4, solid_capstyle="round")
    ax.add_patch(Circle((0, 0), .12, color=INK)); ax.text(0, -3.2, "2 ч 45 мин", ha="center", fontsize=20, weight="bold")
    ax.set_xlim(-2.9, 2.9); ax.set_ylim(-3.6, 2.9)
    save(fig, "m_clock", "Часы и время", "Часы показывают 2 ч 45 мин: часовая стрелка – короткая, минутная – длинная")


clock()


def ruler():
    fig, ax = blank(11, 2.8)
    ax.add_patch(Rectangle((-.3, 0), 10.6, 1.2, fc=SOFT[3], ec=INK, lw=2))
    for mm in range(101):
        x = mm / 10; h = .55 if mm % 10 == 0 else (.38 if mm % 5 == 0 else .22)
        ax.plot([x, x], [1.2, 1.2 - h], color=INK, lw=1.6 if mm % 10 == 0 else .9)
        if mm % 10 == 0:
            ax.text(x, .3, str(mm // 10), ha="center", fontsize=14)
    ax.plot([0, 6.5], [1.55, 1.55], color=C[1], lw=5); ax.text(3.25, 1.8, "6 см 5 мм = 65 мм", ha="center", fontsize=16, color=C[1], weight="bold")
    ax.set_xlim(-.5, 10.5); ax.set_ylim(-.1, 2.3)
    save(fig, "m_ruler", "Единицы длины", "Измерение длины линейкой: 1 см = 10 мм")


ruler()


def rounding():
    numline_marks = [(47, "47", C[1])]
    fig, ax = blank(11, 2.8)
    ax.set_xlim(39, 51.5); ax.set_ylim(-1.3, 1.5)
    arrow(ax, (39.4, 0), (51.2, 0), lw=2.2)
    for k in range(40, 51):
        ax.plot([k, k], [-.12 if k % 10 else -.25, .12 if k % 10 else .25], color=INK, lw=2 if k % 10 == 0 else 1.2)
    ax.text(40, -.65, "40", ha="center", fontsize=16); ax.text(50, -.65, "50", ha="center", fontsize=16); ax.text(45, -.65, "45", ha="center", fontsize=14, color="#7A8394")
    ax.plot(47, 0, "o", color=C[1], ms=12); ax.text(47, .5, "47", ha="center", fontsize=17, color=C[1], weight="bold")
    arrow(ax, (47.2, .25), (49.8, .25), C[2], 2.5); ax.text(48.5, .85, "47 ≈ 50", color=C[2], fontsize=17, ha="center", weight="bold")
    save(fig, "m_rounding", "Округление чисел", "Число 47 ближе к 50, чем к 40: 47 ≈ 50")


rounding()


def order_ops():
    fig, ax = blank(10, 3.2)
    ax.text(5, 1.4, "(8 + 4) · 3 − 10 : 2", ha="center", fontsize=34, weight="bold")
    for x, n, c in [(3.0, "1", C[0]), (5.15, "2", C[1]), (7.8, "3", C[2]), (6.55, "4", C[4])]:
        ax.add_patch(Circle((x, 2.55), .28, color=c)); ax.text(x, 2.55, n, ha="center", va="center", fontsize=16, color="white", weight="bold")
    ax.text(5, .2, "= 12 · 3 − 5 = 36 − 5 = 31", ha="center", fontsize=24)
    ax.set_xlim(0, 10); ax.set_ylim(-.3, 3.0)
    save(fig, "m_order_ops", "Порядок действий", "Сначала действия в скобках, затем умножение и деление, затем сложение и вычитание")


order_ops()

json.dump(meta, open(META, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(meta), "картинок")
