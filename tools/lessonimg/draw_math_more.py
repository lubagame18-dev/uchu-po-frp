# Дополнительные собственные чертежи по математике: отдельная картинка для разных тем.
# Подключается из draw_math.py (exec) и пользуется его функциями save, blank, axes_plot, arrow, numline, fn, hundred.
from matplotlib.patches import Ellipse, FancyBboxPatch

# ---------- координатная прямая ----------
numline(-6, 6, "m_nl_opp", "Противоположные числа", "Противоположные числа −3 и 3 находятся на одинаковом расстоянии от нуля",
        marks=[(-3, "−3", C[1]), (3, "3", C[0])])
numline(-6, 6, "m_nl_cmp", "Сравнение чисел", "На координатной прямой больше то число, которое правее: −5 < −2 < 1 < 4",
        marks=[(-5, "−5", C[1]), (-2, "−2", C[3]), (1, "1", C[2]), (4, "4", C[0])])
numline(-3, 3, "m_nl_rational", "Рациональные числа", "Рациональные числа на координатной прямой: −2,5; −1/2; 1,5",
        marks=[(-2.5, "−2,5", C[1]), (-.5, "−½", C[3]), (1.5, "1,5", C[0])])
numline(0, 4, "m_nl_irr", "Иррациональные числа", "√2 ≈ 1,41 и π ≈ 3,14 на координатной прямой",
        marks=[(2 ** .5, "√2", C[1]), (math.pi, "π", C[0])])
numline(-5, 5, "m_nl_real", "Действительные числа", "Действительные числа на координатной прямой: каждой точке соответствует число",
        marks=[(-3.5, "−3,5", C[1]), (-(3 ** .5), "−√3", C[3]), (2 / 3, "⅔", C[2]), (math.e, "e", C[0])])
numline(0, 12, "m_nl_nat", "Натуральные числа на луче", "Натуральные числа на координатном луче: точки A(2), B(7), C(11)",
        marks=[(2, "A", C[1]), (7, "B", C[0]), (11, "C", C[2])])


def nl_dist():
    fig, ax = blank(11, 2.8)
    ax.set_xlim(-6.8, 6.9); ax.set_ylim(-1.3, 1.6)
    arrow(ax, (-6.6, 0), (6.8, 0), lw=2.2)
    for k in range(-6, 7):
        ax.plot([k, k], [-.15, .15], color=INK, lw=2); ax.text(k, -.55, str(k).replace("-", "−"), ha="center", fontsize=15)
    ax.plot(-3, 0, "o", color=C[1], ms=12); ax.plot(4, 0, "o", color=C[0], ms=12)
    ax.add_patch(FancyArrowPatch((-3, .35), (4, .35), arrowstyle="<|-|>", mutation_scale=16, color=C[2], lw=2))
    ax.text(.5, .7, "AB = |4 − (−3)| = 7", ha="center", fontsize=18, color=C[2], weight="bold")
    ax.text(-3, .35, "A", color=C[1], fontsize=16, ha="right", weight="bold"); ax.text(4.15, .35, "B", color=C[0], fontsize=16, weight="bold")
    save(fig, "m_nl_dist", "Расстояние между точками прямой", "Расстояние между точками A(−3) и B(4) равно модулю разности координат: 7")


nl_dist()


def nl_abs():
    fig, ax = blank(11, 2.8)
    ax.set_xlim(-6.8, 6.9); ax.set_ylim(-1.3, 1.7)
    arrow(ax, (-6.6, 0), (6.8, 0), lw=2.2)
    for k in range(-6, 7):
        ax.plot([k, k], [-.15, .15], color=INK, lw=2); ax.text(k, -.55, str(k).replace("-", "−"), ha="center", fontsize=15)
    for x, c in [(-4, C[1]), (4, C[0])]:
        ax.plot(x, 0, "o", color=c, ms=12)
        ax.add_patch(FancyArrowPatch((0, .3), (x, .3), arrowstyle="-|>", mutation_scale=16, color=c, lw=2))
    ax.text(-2, .7, "|−4| = 4", ha="center", fontsize=18, color=C[1], weight="bold"); ax.text(2, .7, "|4| = 4", ha="center", fontsize=18, color=C[0], weight="bold")
    save(fig, "m_nl_abs", "Модуль числа", "Модуль числа – расстояние от нуля до точки: |−4| = |4| = 4")


nl_abs()

# ---------- промежутки и неравенства ----------


def interval(name, title, caption, a, b, ca, cb, label, lo=-5, hi=6):
    fig, ax = blank(11, 2.8)
    ax.set_xlim(lo - .5, hi + .5); ax.set_ylim(-1.3, 1.4)
    arrow(ax, (lo - .3, 0), (hi + .3, 0), lw=2.2)
    L = a if a is not None else lo - .3; R = b if b is not None else hi + .3
    ax.add_patch(Rectangle((L, -.12), R - L, .24, color=SOFT[0]))
    for x, closed in [(a, ca), (b, cb)]:
        if x is None:
            continue
        ax.plot(x, 0, "o", ms=13, mew=2.5, mec=C[0], mfc=C[0] if closed else "white")
        ax.text(x, -.65, f"{x:g}".replace("-", "−"), ha="center", fontsize=17)
    ax.text((lo + hi) / 2, .55, label, ha="center", fontsize=19, weight="bold")
    save(fig, name, title, caption)


interval("m_iv_linear", "Линейное неравенство", "Решение неравенства 2x − 3 > 1: x > 2, промежуток (2; +∞)", 2, None, False, None, "2x − 3 > 1  ⇒  x > 2,   x ∈ (2; +∞)")
interval("m_iv_system", "Система неравенств", "Решение системы неравенств – пересечение промежутков: [−1; 4)", -1, 4, True, False, "x ≥ −1 и x < 4  ⇒  x ∈ [−1; 4)")
interval("m_iv_ray", "Числовой луч", "Промежуток (−∞; 3] на координатной прямой", None, 3, None, True, "x ≤ 3,   x ∈ (−∞; 3]")
interval("m_iv_seg", "Отрезок и интервал", "Числовой отрезок [−3; 2]: концы входят в промежуток", -3, 2, True, True, "−3 ≤ x ≤ 2,   x ∈ [−3; 2]")


def iv_method():
    fig, ax = blank(11, 3.0)
    ax.set_xlim(-5, 6); ax.set_ylim(-1.4, 1.6)
    arrow(ax, (-4.8, 0), (5.8, 0), lw=2.2)
    pts = [-2, 1, 4]
    for x in pts:
        ax.plot(x, 0, "o", ms=12, mew=2.5, mec=C[0], mfc="white"); ax.text(x, -.65, f"{x:g}".replace("-", "−"), ha="center", fontsize=17)
    for (l, r), s in zip([(-4.8, -2), (-2, 1), (1, 4), (4, 5.8)], ["−", "+", "−", "+"]):
        xs = np.linspace(l, r, 50); ax.plot(xs, .45 * np.sin((xs - l) / (r - l) * math.pi) * (1 if s == "+" else -1) + 0, color=C[1], lw=1.6)
        ax.text((l + r) / 2, .8 if s == "+" else -1.05, s, ha="center", fontsize=22, color=C[1], weight="bold")
    ax.text(.5, 1.3, "(x + 2)(x − 1)(x − 4) > 0", ha="center", fontsize=18, weight="bold")
    save(fig, "m_iv_method", "Метод интервалов", "Метод интервалов: знаки (x + 2)(x − 1)(x − 4) на промежутках; ответ (−2; 1) ∪ (4; +∞)")


iv_method()

# ---------- функции ----------
fn("m_fn_kx", "Прямая пропорциональность", "Графики y = kx проходят через начало координат: k = 2, k = 1/2, k = −1", (-4, 4), (-5, 5),
   [(lambda x: 2 * x, "$y = 2x$", C[0]), (lambda x: x / 2, "$y = x/2$", C[1]), (lambda x: -x, "$y = -x$", C[2])])
fn("m_fn_system", "Графическое решение системы", "Решение системы уравнений – координаты точки пересечения прямых: (1; 2)", (-3, 5), (-3, 6),
   [(lambda x: x + 1, "$y = x + 1$", C[0]), (lambda x: -2 * x + 4, "$y = -2x + 4$", C[1])], [(1, 2, "(1; 2)", C[2])])
fn("m_fn_b", "Сдвиг прямой", "Прямые y = x + b при разных b параллельны", (-4, 4), (-5, 6),
   [(lambda x: x + 3, "$y = x + 3$", C[0]), (lambda x: x, "$y = x$", C[1]), (lambda x: x - 2, "$y = x - 2$", C[2])])
fn("m_fn_quad_a", "Парабола y = ax²", "Ветви параболы y = ax² направлены вверх при a > 0 и вниз при a < 0", (-3, 3), (-5, 5),
   [(lambda x: x ** 2, "$y = x^2$", C[0]), (lambda x: .5 * x ** 2, "$y = 0{,}5x^2$", C[1]), (lambda x: -x ** 2, "$y = -x^2$", C[2])])
fn("m_fn_quad_shift", "Сдвиг параболы", "Парабола y = (x − 2)² + 1 – сдвиг y = x² на 2 вправо и на 1 вверх", (-3, 5), (-1, 8),
   [(lambda x: x ** 2, "$y = x^2$", "#B7BFCC"), (lambda x: (x - 2) ** 2 + 1, "$y = (x-2)^2 + 1$", C[0])], [(2, 1, "(2; 1)", C[1])])
fn("m_fn_quad_eq", "Корни квадратного уравнения", "Корни уравнения x² − x − 6 = 0 – абсциссы точек пересечения параболы с осью x: −2 и 3", (-4, 5), (-7, 7),
   [(lambda x: x ** 2 - x - 6, "$y = x^2 - x - 6$", C[0])], [(-2, 0, "−2", C[1]), (3, 0, "3", C[1])])
fn("m_fn_quad_ineq", "Квадратное неравенство", "Решение неравенства x² − 4 < 0 – промежуток (−2; 2), где парабола ниже оси x", (-4, 4), (-5, 6),
   [(lambda x: x ** 2 - 4, "$y = x^2 - 4$", C[0])], [(-2, 0, "−2", C[1]), (2, 0, "2", C[1])])
fn("m_fn_cubic", "Функция y = x³", "График кубической функции y = x³", (-2.5, 2.5), (-6, 6), [(lambda x: x ** 3, "$y = x^3$", C[0])])
fn("m_fn_root3", "Корень n-й степени", "Графики y = √x и y = ∛x", (-1, 9), (-1, 3.5),
   [(np.sqrt, "$y = \\sqrt{x}$", C[0], (0, 9)), (np.cbrt, "$y = \\sqrt[3]{x}$", C[1], (0, 9))])
fn("m_fn_exp", "Показательная функция", "y = 2ˣ возрастает, y = (1/2)ˣ убывает; оба графика проходят через (0; 1)", (-3, 3), (-.5, 8),
   [(lambda x: 2 ** x, "$y = 2^x$", C[0]), (lambda x: .5 ** x, "$y = (1/2)^x$", C[1])], [(0, 1, "(0; 1)", C[2])])
fn("m_fn_log", "Логарифмическая функция", "y = log₂x и y = log½x; оба графика проходят через (1; 0)", (-.5, 8), (-3.5, 3.5),
   [(np.log2, "$y = \\log_2 x$", C[0], (.05, 8)), (lambda x: -np.log2(x), "$y = \\log_{1/2} x$", C[1], (.05, 8))], [(1, 0, "(1; 0)", C[2])])
fn("m_fn_tan", "Функция y = tg x", "График функции y = tg x и его асимптоты x = ±π/2", (-4.8, 4.8), (-4, 4),
   [(np.tan, "$y = \\mathrm{tg}\\, x$", C[0], (-1.45, 1.45)), (np.tan, None, C[0], (1.7, 4.6)), (np.tan, None, C[0], (-4.6, -1.7))])
fn("m_fn_sin_a", "Преобразование графика синуса", "y = sin x и y = 2 sin x: растяжение вдоль оси y", (-6.6, 6.6), (-2.5, 2.5),
   [(np.sin, "$y = \\sin x$", C[0]), (lambda x: 2 * np.sin(x), "$y = 2\\sin x$", C[1])])
fn("m_fn_mono", "Возрастание и убывание", "Функция y = x³ − 3x возрастает, убывает и снова возрастает; экстремумы в точках −1 и 1", (-2.5, 2.5), (-4, 4),
   [(lambda x: x ** 3 - 3 * x, "$y = x^3 - 3x$", C[0])], [(-1, 2, "max", C[1]), (1, -2, "min", C[2])])
fn("m_fn_even", "Чётные и нечётные функции", "График чётной функции симметричен относительно оси y, нечётной – относительно начала координат", (-3, 3), (-4, 5),
   [(lambda x: x ** 2 - 1, "$y = x^2 - 1$ (чётная)", C[0]), (lambda x: x ** 3 / 3, "$y = x^3/3$ (нечётная)", C[1])])
fn("m_fn_piece", "Кусочная функция", "Кусочно заданная функция: y = −x при x < 0 и y = √x при x ≥ 0", (-4, 6), (-1, 4.5),
   [(lambda x: -x, "$y = -x,\\ x<0$", C[0], (-4, 0)), (np.sqrt, "$y = \\sqrt{x},\\ x \\geq 0$", C[1], (0, 6))])
fn("m_fn_inverse", "Обратная функция", "Графики взаимно обратных функций y = x² (x ≥ 0) и y = √x симметричны относительно y = x", (-.5, 4), (-.5, 4),
   [(lambda x: x ** 2, "$y = x^2$", C[0], (0, 2)), (np.sqrt, "$y = \\sqrt{x}$", C[1], (0, 4)), (lambda x: x, "$y = x$", "#B7BFCC")])
fn("m_fn_abs_eq", "Уравнения с модулем", "Уравнение |x − 1| = 2 имеет корни −1 и 3", (-3, 5), (-1, 4.5),
   [(lambda x: np.abs(x - 1), "$y = |x - 1|$", C[0]), (lambda x: 0 * x + 2, "$y = 2$", C[1])], [(-1, 2, "−1", C[2]), (3, 2, "3", C[2])])


def tangent_line():
    fig, ax = axes_plot((-1, 4), (-1, 9))
    x = np.linspace(-1, 3.2, 300); ax.plot(x, x ** 2, color=C[0], lw=3, label="$y = x^2$")
    t = np.linspace(0, 3.5, 10); ax.plot(t, 4 * t - 4, color=C[1], lw=2.5, label="$y = 4x - 4$")
    ax.plot(2, 4, "o", color=C[1], ms=9); ax.text(2.15, 3.3, "(2; 4)", color=C[1], fontsize=15)
    ax.legend(loc="upper left", fontsize=14)
    save(fig, "m_tangent_eq", "Уравнение касательной", "Касательная к параболе y = x² в точке x₀ = 2: y = 4x − 4")


tangent_line()


def limit_pic():
    fig, ax = axes_plot((-1, 6), (-1, 4))
    x = np.linspace(.3, 6, 300); ax.plot(x, 2 + 1 / x * np.sin(3 * x) * .9, color=C[0], lw=2.5, label="$y = f(x)$")
    ax.axhline(2, color=C[1], ls="--", lw=2); ax.text(5.9, 2.15, "y = 2", color=C[1], ha="right", fontsize=15)
    ax.legend(loc="upper left", fontsize=14)
    save(fig, "m_limit", "Предел функции", "Значения функции приближаются к числу 2 – предел функции")


limit_pic()


def primitive():
    fig, ax = axes_plot((-2.5, 2.5), (-1, 6))
    x = np.linspace(-2.4, 2.4, 300)
    for c, col in zip([0, 1.5, 3], C):
        ax.plot(x, x ** 2 + c, color=col, lw=2.5, label=f"$F(x) = x^2 + {c:g}$".replace(".", "{,}"))
    ax.legend(loc="upper center", fontsize=13)
    save(fig, "m_primitive", "Первообразная", "Первообразные функции f(x) = 2x: F(x) = x² + C, графики сдвинуты вдоль оси y")


primitive()

# ---------- геометрия: пространственные фигуры ----------
P3 = lambda p: (p[0] + .45 * p[1], p[2] + .35 * p[1])


def solid(name, title, caption, verts, edges, hidden=(), col=0, extra=None, size=(7, 6)):
    fig, ax = blank(*size)
    pts = {k: P3(v) for k, v in verts.items()}
    for a, b in edges:
        ax.plot(*zip(pts[a], pts[b]), color=C[col], lw=2.6, ls="--" if (a, b) in hidden or (b, a) in hidden else "-")
    for k, (x, y) in pts.items():
        if len(k) <= 2:
            ax.text(x + .08, y + .08, k, fontsize=16, color=INK)
    if extra:
        extra(ax, pts)
    xs = [p[0] for p in pts.values()]; ys = [p[1] for p in pts.values()]
    ax.set_xlim(min(xs) - .6, max(xs) + .8); ax.set_ylim(min(ys) - .6, max(ys) + .6)
    save(fig, name, title, caption)


cube_v = {"A": (0, 0, 0), "B": (3, 0, 0), "C": (3, 3, 0), "D": (0, 3, 0), "A₁": (0, 0, 3), "B₁": (3, 0, 3), "C₁": (3, 3, 3), "D₁": (0, 3, 3)}
cube_e = [("A", "B"), ("B", "C"), ("C", "D"), ("D", "A"), ("A₁", "B₁"), ("B₁", "C₁"), ("C₁", "D₁"), ("D₁", "A₁"), ("A", "A₁"), ("B", "B₁"), ("C", "C₁"), ("D", "D₁")]
cube_h = [("C", "D"), ("D", "A"), ("D", "D₁")]
solid("m_cube", "Куб", "Куб ABCDA₁B₁C₁D₁: 6 граней, 12 рёбер, 8 вершин; невидимые рёбра – пунктиром", cube_v, cube_e, cube_h)
box_v = {"A": (0, 0, 0), "B": (4, 0, 0), "C": (4, 2.4, 0), "D": (0, 2.4, 0), "A₁": (0, 0, 2.2), "B₁": (4, 0, 2.2), "C₁": (4, 2.4, 2.2), "D₁": (0, 2.4, 2.2)}
solid("m_cuboid", "Прямоугольный параллелепипед", "Прямоугольный параллелепипед: V = abc", box_v, cube_e + [("A", "C₁")], cube_h + [("A", "C₁")], col=1,
      extra=lambda ax, p: ax.text(*p["B"], "   V = a·b·c", fontsize=16, color=C[1], va="top"))


def sec(ax, p):
    poly = [P3((0, 0, 3)), P3((3, 0, 1.5)), P3((3, 3, 1.5)), P3((0, 3, 3))]
    ax.add_patch(Polygon(poly, fc=SOFT[1], ec=C[1], lw=2.5, alpha=.85))


solid("m_cube_section", "Сечение куба", "Сечение куба плоскостью – многоугольник, стороны которого лежат на гранях", cube_v, cube_e, cube_h, extra=sec)
pr_v = {"A": (0, 0, 0), "B": (3.4, 0, 0), "C": (1.4, 2.6, 0), "A₁": (0, 0, 3), "B₁": (3.4, 0, 3), "C₁": (1.4, 2.6, 3)}
solid("m_prism", "Призма", "Треугольная призма ABCA₁B₁C₁: основания – равные треугольники, боковые грани – параллелограммы", pr_v,
      [("A", "B"), ("B", "C"), ("C", "A"), ("A₁", "B₁"), ("B₁", "C₁"), ("C₁", "A₁"), ("A", "A₁"), ("B", "B₁"), ("C", "C₁")], [("A", "C"), ("C", "B"), ("C", "C₁")], col=2)
py_v = {"A": (0, 0, 0), "B": (3.4, 0, 0), "C": (3.4, 3.4, 0), "D": (0, 3.4, 0), "S": (1.7, 1.7, 3.6), "O": (1.7, 1.7, 0)}
solid("m_pyramid", "Пирамида", "Правильная четырёхугольная пирамида SABCD, SO – высота", py_v,
      [("A", "B"), ("B", "C"), ("C", "D"), ("D", "A"), ("S", "A"), ("S", "B"), ("S", "C"), ("S", "D"), ("S", "O")], [("C", "D"), ("D", "A"), ("S", "D"), ("S", "O")], col=3)
tet_v = {"A": (0, 0, 0), "B": (3.4, 0, 0), "C": (0.8, 2.9, 0), "D": (1.7, 1, 3.2)}
solid("m_tetra", "Тетраэдр", "Тетраэдр DABC: четыре грани – треугольники", tet_v, [("A", "B"), ("B", "C"), ("C", "A"), ("D", "A"), ("D", "B"), ("D", "C")], [("A", "C"), ("C", "B"), ("D", "C")], col=4)


def round_body(name, title, caption, kind):
    fig, ax = blank(6, 6)
    c = {"cyl": 0, "cone": 1, "sph": 2, "trunc": 3}[kind]
    if kind == "cyl":
        ax.add_patch(Ellipse((0, 3), 3, .8, fill=False, ec=C[c], lw=2.5)); ax.plot([-1.5, -1.5], [0, 3], color=C[c], lw=2.5); ax.plot([1.5, 1.5], [0, 3], color=C[c], lw=2.5)
        ax.add_patch(Arc((0, 0), 3, .8, theta1=180, theta2=360, color=C[c], lw=2.5)); ax.add_patch(Arc((0, 0), 3, .8, theta1=0, theta2=180, color=C[c], lw=1.6, ls="--"))
        ax.plot([0, 1.5], [0, 0], color=INK, lw=1.8); ax.text(.75, .12, "r", fontsize=17); ax.plot([0, 0], [0, 3], color=INK, lw=1.8, ls="--"); ax.text(.1, 1.5, "h", fontsize=17)
        ax.text(0, -1.0, "V = πr²h", ha="center", fontsize=18, weight="bold")
    elif kind == "cone":
        ax.add_patch(Arc((0, 0), 3, .8, theta1=180, theta2=360, color=C[c], lw=2.5)); ax.add_patch(Arc((0, 0), 3, .8, theta1=0, theta2=180, color=C[c], lw=1.6, ls="--"))
        ax.plot([-1.5, 0, 1.5], [0, 3.4, 0], color=C[c], lw=2.5); ax.plot([0, 0], [0, 3.4], color=INK, lw=1.8, ls="--"); ax.plot([0, 1.5], [0, 0], color=INK, lw=1.8)
        ax.text(.75, .12, "r", fontsize=17); ax.text(.1, 1.6, "h", fontsize=17); ax.text(.85, 1.9, "l", fontsize=17)
        ax.text(0, -1.0, "V = ⅓πr²h", ha="center", fontsize=18, weight="bold")
    elif kind == "sph":
        ax.add_patch(Circle((0, 1.6), 1.7, fc=SOFT[c], ec=C[c], lw=2.5)); ax.add_patch(Arc((0, 1.6), 3.4, .9, theta1=180, theta2=360, color=C[c], lw=1.8))
        ax.add_patch(Arc((0, 1.6), 3.4, .9, theta1=0, theta2=180, color=C[c], lw=1.4, ls="--")); ax.plot([0, 1.7], [1.6, 1.6], color=INK, lw=1.8); ax.text(.8, 1.75, "R", fontsize=17)
        ax.text(0, -.8, "S = 4πR²,   V = ⁴⁄₃πR³", ha="center", fontsize=18, weight="bold")
    else:
        ax.add_patch(Ellipse((0, 3), 1.8, .5, fill=False, ec=C[c], lw=2.5)); ax.plot([-1.6, -.9], [0, 3], color=C[c], lw=2.5); ax.plot([1.6, .9], [0, 3], color=C[c], lw=2.5)
        ax.add_patch(Arc((0, 0), 3.2, .8, theta1=180, theta2=360, color=C[c], lw=2.5)); ax.add_patch(Arc((0, 0), 3.2, .8, theta1=0, theta2=180, color=C[c], lw=1.6, ls="--"))
        ax.text(0, -1.0, "усечённый конус", ha="center", fontsize=18, weight="bold")
    ax.set_xlim(-2.4, 2.4); ax.set_ylim(-1.5, 4)
    save(fig, name, title, caption)


round_body("m_cylinder", "Цилиндр", "Цилиндр: радиус основания r, высота h; V = πr²h", "cyl")
round_body("m_cone", "Конус", "Конус: радиус r, высота h, образующая l; V = ⅓πr²h", "cone")
round_body("m_sphere", "Шар и сфера", "Шар радиуса R: площадь сферы 4πR², объём ⁴⁄₃πR³", "sph")
round_body("m_frustum", "Усечённый конус", "Усечённый конус – часть конуса между основанием и параллельным сечением", "trunc")


def planes(name, title, caption, kind):
    fig, ax = blank(8, 6)
    def plane(y0, col, lab, dx=0):
        ax.add_patch(Polygon([(0 + dx, y0), (5 + dx, y0), (6.5 + dx, y0 + 1.6), (1.5 + dx, y0 + 1.6)], fc=SOFT[col], ec=C[col], lw=2, alpha=.9))
        ax.text(.5 + dx, y0 + .2, lab, fontsize=18, color=C[col])
    if kind == "par":
        plane(0, 0, "α"); plane(2.8, 1, "β")
        ax.text(3.2, -.9, "α ∥ β", ha="center", fontsize=20, weight="bold")
    elif kind == "perp":
        plane(0, 0, "α"); ax.plot([3.2, 3.2], [.8, 4.4], color=C[1], lw=3); ax.plot(3.2, .8, "o", color=C[1]); ax.text(3.35, 3.8, "a", fontsize=18, color=C[1])
        ax.plot([3.2, 3.5, 3.5], [1.15, 1.25, .9], color=INK, lw=1.5)
        ax.text(3.2, -.9, "a ⊥ α", ha="center", fontsize=20, weight="bold")
    elif kind == "lineplane":
        plane(0, 0, "α"); ax.plot([1, 6.5], [3.0, 3.0], color=C[1], lw=3); ax.plot([1.8, 5.8], [.8, .8], color=C[2], lw=2, ls="--")
        ax.text(6.6, 3.0, "a", fontsize=18, color=C[1]); ax.text(5.9, .8, "b", fontsize=18, color=C[2])
        ax.text(3.2, -.9, "a ∥ b, b ⊂ α  ⇒  a ∥ α", ha="center", fontsize=19, weight="bold")
    elif kind == "skew":
        plane(0, 0, "α"); ax.plot([.8, 5.6], [.3, .7], color=C[1], lw=3)
        ax.plot([3.08, 2.8], [1.3, 4.2], color=C[2], lw=3); ax.plot([3.2, 3.08], [-.7, 1.3], color=C[2], lw=2, ls="--")
        ax.plot(3.08, 1.3, "o", color=C[2], ms=8)
        ax.text(5.7, .7, "a", fontsize=18, color=C[1]); ax.text(2.6, 4.2, "b", fontsize=18, color=C[2])
        ax.text(3.2, -1.3, "a и b – скрещивающиеся прямые", ha="center", fontsize=18, weight="bold")
    elif kind == "dihedral":
        ax.add_patch(Polygon([(0, 0), (5, 0), (6.2, 1.4), (1.2, 1.4)], fc=SOFT[0], ec=C[0], lw=2))
        ax.add_patch(Polygon([(1.2, 1.4), (6.2, 1.4), (6.2, 4.6), (1.2, 4.6)], fc=SOFT[1], ec=C[1], lw=2, alpha=.85))
        ax.add_patch(Arc((3.7, 1.4), 1.6, 1.6, theta1=200, theta2=270, color=INK, lw=2)); ax.text(3.0, .6, "φ", fontsize=20)
        ax.text(3.2, -.9, "двугранный угол", ha="center", fontsize=20, weight="bold")
    ax.set_xlim(-.5, 7.5); ax.set_ylim(-1.6, 5)
    save(fig, name, title, caption)


planes("m_planes_par", "Параллельные плоскости", "Параллельные плоскости α и β не имеют общих точек", "par")
planes("m_line_perp_plane", "Перпендикулярность прямой и плоскости", "Прямая перпендикулярна плоскости, если она перпендикулярна любой прямой этой плоскости", "perp")
planes("m_line_par_plane", "Параллельность прямой и плоскости", "Признак параллельности прямой и плоскости", "lineplane")
planes("m_skew", "Скрещивающиеся прямые", "Скрещивающиеся прямые не лежат в одной плоскости и не пересекаются", "skew")
planes("m_dihedral", "Двугранный угол", "Двугранный угол образован двумя полуплоскостями с общей прямой", "dihedral")

# ---------- вероятность ----------


def coin():
    fig, ax = blank(9, 4)
    for x, t, c in [(0, "О", C[0]), (3.2, "Р", C[1])]:
        ax.add_patch(Circle((x, 0), 1.1, fc=SOFT[0 if t == "О" else 1], ec=c, lw=3)); ax.text(x, 0, t, ha="center", va="center", fontsize=40, color=c, weight="bold")
    ax.text(1.6, -1.9, "P(орёл) = P(решка) = 1/2", ha="center", fontsize=19, weight="bold")
    ax.set_xlim(-1.5, 4.7); ax.set_ylim(-2.4, 1.4)
    save(fig, "m_coin", "Бросание монеты", "Два равновозможных исхода: орёл (О) и решка (Р), вероятность каждого 1/2")


coin()


def two_dice():
    fig, ax = blank(8, 8)
    for i in range(7):
        for j in range(7):
            if i == 0 and j == 0:
                continue
            v = i + j if i and j else (i or j)
            head = i == 0 or j == 0
            col = SOFT[0] if head else (SOFT[1] if i + j == 7 else "white")
            ax.add_patch(Rectangle((j, -i), 1, 1, fc=col, ec="#9AA3B2"))
            ax.text(j + .5, -i + .5, str(v), ha="center", va="center", fontsize=15, weight="bold" if head else None)
    ax.text(3.5, -6.9, "P(сумма = 7) = 6/36 = 1/6", ha="center", fontsize=18, weight="bold")
    ax.set_xlim(-.2, 7.2); ax.set_ylim(-7.4, 1.2)
    save(fig, "m_two_dice", "Два игральных кубика", "Таблица 36 равновозможных исходов броска двух кубиков; сумма 7 выпадает в 6 случаях")


two_dice()


def urn():
    fig, ax = blank(8, 5)
    ax.add_patch(FancyBboxPatch((0, 0), 4.4, 3, boxstyle="round,pad=0.1,rounding_size=.4", fc="#F5F7FA", ec=INK, lw=2))
    cols = [C[1]] * 3 + [C[0]] * 5
    for i, c in enumerate(cols):
        ax.add_patch(Circle((.6 + (i % 4) * 1.05, .7 + (i // 4) * 1.1), .4, color=c))
    ax.text(5.0, 2.0, "3 красных", fontsize=17, color=C[1]); ax.text(5.0, 1.3, "5 синих", fontsize=17, color=C[0])
    ax.text(2.2, -.9, "P(красный) = 3/8", ha="center", fontsize=19, weight="bold")
    ax.set_xlim(-.4, 7.6); ax.set_ylim(-1.4, 3.4)
    save(fig, "m_urn", "Вероятность события", "В урне 3 красных и 5 синих шаров: вероятность достать красный 3/8")


urn()


def binom():
    fig, ax = plt.subplots(figsize=(10, 5.6))
    n = 5; k = np.arange(n + 1); p = [math.comb(n, i) / 2 ** n for i in k]
    ax.bar(k, p, color=C[0]); [ax.text(i, v + .01, f"{math.comb(n, i)}/32", ha="center", fontsize=14) for i, v in zip(k, p)]
    ax.set_xlabel("число успехов k"); ax.set_ylabel("P"); ax.spines[["top", "right"]].set_visible(False)
    ax.set_title("Схема Бернулли: n = 5, p = 1/2", fontsize=16)
    save(fig, "m_binom", "Испытания Бернулли", "Распределение числа успехов в 5 испытаниях Бернулли с p = 1/2")


binom()


def geom_prob():
    fig, ax = blank(6, 6.4)
    ax.add_patch(Rectangle((0, 0), 4, 4, fc="white", ec=INK, lw=2)); ax.add_patch(Circle((2, 2), 1.2, fc=SOFT[1], ec=C[1], lw=2.5))
    for x, y in np.random.default_rng(3).uniform(0, 4, (40, 2)):
        ax.plot(x, y, "o", color=C[1] if (x - 2) ** 2 + (y - 2) ** 2 < 1.44 else C[0], ms=4)
    ax.text(2, -.7, "P = S(круга) / S(квадрата)", ha="center", fontsize=17, weight="bold")
    ax.set_xlim(-.3, 4.3); ax.set_ylim(-1.2, 4.3)
    save(fig, "m_geom_prob", "Геометрическая вероятность", "Геометрическая вероятность – отношение площадей: точка попадает в круг внутри квадрата")


geom_prob()


def venn_events(name, title, caption, mode):
    fig, ax = blank(8, 5)
    ax.add_patch(Rectangle((-3.4, -2.2), 6.8, 4.4, fill=False, ec=INK, lw=1.8)); ax.text(-3.2, 1.8, "Ω", fontsize=18)
    if mode == "inter":
        ax.add_patch(Circle((-.8, 0), 1.5, fc=SOFT[0], ec=C[0], lw=2, alpha=.8)); ax.add_patch(Circle((.8, 0), 1.5, fc=SOFT[1], ec=C[1], lw=2, alpha=.6))
        ax.text(-1.6, 0, "A", fontsize=20, color=C[0]); ax.text(1.5, 0, "B", fontsize=20, color=C[1]); ax.text(0, -2.8, "A ∩ B  и  A ∪ B", ha="center", fontsize=18, weight="bold")
    else:
        ax.add_patch(Circle((-1.5, 0), 1.2, fc=SOFT[0], ec=C[0], lw=2)); ax.add_patch(Circle((1.5, 0), 1.2, fc=SOFT[1], ec=C[1], lw=2))
        ax.text(-1.5, 0, "A", fontsize=20, color=C[0], ha="center"); ax.text(1.5, 0, "B", fontsize=20, color=C[1], ha="center")
        ax.text(0, -2.8, "A и B несовместны: P(A ∪ B) = P(A) + P(B)", ha="center", fontsize=16, weight="bold")
    ax.set_xlim(-3.6, 3.6); ax.set_ylim(-3.2, 2.4)
    save(fig, name, title, caption)


venn_events("m_ev_inter", "Операции над событиями", "Пересечение и объединение событий A и B на диаграмме Эйлера", "inter")
venn_events("m_ev_disjoint", "Несовместные события", "Несовместные события не могут произойти одновременно; вероятности складываются", "disj")


def cond_tree():
    fig, ax = blank(10, 5.6)
    S = (0, 0); A, B = (3, 1.6), (3, -1.6)
    L = [(6.2, 2.4), (6.2, .8), (6.2, -.8), (6.2, -2.4)]
    pr = ["0,3", "0,7", "0,9", "0,1", "0,2", "0,8"]
    for (p, q), t in zip([(S, A), (S, B), (A, L[0]), (A, L[1]), (B, L[2]), (B, L[3])], ["0,4", "0,6", "0,9", "0,1", "0,2", "0,8"]):
        ax.plot(*zip(p, q), color="#9AA3B2", lw=2); ax.text((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + .2, t, fontsize=13, color=C[0], ha="center")
    for p, t in [(A, "H₁"), (B, "H₂")]:
        ax.text(*p, t, fontsize=16, ha="center", va="center", bbox=dict(boxstyle="circle", fc="white", ec=C[1]))
    for p, t in zip(L, ["A", "Ā", "A", "Ā"]):
        ax.text(*p, t, fontsize=16, va="center")
    ax.text(3.5, -3.4, "P(A) = 0,4·0,9 + 0,6·0,2 = 0,48", ha="center", fontsize=16, weight="bold")
    ax.set_xlim(-.6, 7.6); ax.set_ylim(-3.8, 3.0)
    save(fig, "m_cond_tree", "Формула полной вероятности", "Дерево с условными вероятностями: P(A) = 0,4·0,9 + 0,6·0,2 = 0,48")


cond_tree()


def expect():
    fig, ax = plt.subplots(figsize=(10, 5.6))
    xs = [0, 1, 2, 3]; ps = [.1, .3, .4, .2]
    ax.bar(xs, ps, color=C[2], width=.5); ax.axvline(sum(x * p for x, p in zip(xs, ps)), color=C[1], ls="--", lw=2)
    ax.text(1.75, .42, "E(X) = 1,7", color=C[1], fontsize=16)
    for x, p in zip(xs, ps):
        ax.text(x, p + .01, f"{p:g}".replace(".", ","), ha="center", fontsize=14)
    ax.set_xticks(xs); ax.set_xlabel("значение X"); ax.set_ylabel("P"); ax.spines[["top", "right"]].set_visible(False)
    save(fig, "m_expect", "Математическое ожидание", "Распределение случайной величины и её математическое ожидание E(X) = 1,7")


expect()


def freq():
    fig, ax = plt.subplots(figsize=(10, 5.6))
    n = np.arange(1, 501); rng = np.random.default_rng(11)
    f = np.cumsum(rng.random(500) < .5) / n
    ax.plot(n, f, color=C[0], lw=2); ax.axhline(.5, color=C[1], ls="--", lw=2); ax.text(480, .52, "0,5", color=C[1], fontsize=15)
    ax.set_xlabel("число бросаний монеты"); ax.set_ylabel("частота орла"); ax.set_ylim(0, 1); ax.spines[["top", "right"]].set_visible(False)
    save(fig, "m_freq", "Частота и вероятность", "При многократных бросаниях монеты частота орла приближается к 0,5")


freq()

# ---------- статистика ----------


def pie():
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.pie([40, 25, 20, 15], labels=["футбол 40 %", "плавание 25 %", "шахматы 20 %", "лыжи 15 %"], colors=C[:4], startangle=90, textprops={"fontsize": 15}, wedgeprops={"ec": "white", "lw": 2})
    save(fig, "m_pie", "Круговая диаграмма", "Круговая диаграмма: доли целого в процентах")


pie()


def line_chart():
    fig, ax = plt.subplots(figsize=(10, 5.6))
    m = ["янв", "фев", "мар", "апр", "май", "июн", "июл"]; t = [-9, -8, -2, 6, 13, 17, 19]
    ax.plot(m, t, "o-", color=C[1], lw=3, ms=8); ax.axhline(0, color=INK, lw=1)
    for i, v in enumerate(t):
        ax.text(i, v + 1, f"{v}".replace("-", "−"), ha="center", fontsize=14)
    ax.set_ylabel("°C"); ax.spines[["top", "right"]].set_visible(False)
    save(fig, "m_line_chart", "Линейная диаграмма", "Линейная диаграмма: средняя температура по месяцам")


line_chart()


def deviations():
    fig, ax = plt.subplots(figsize=(10, 5.6))
    v = [4, 7, 5, 9, 5]; m = np.mean(v)
    ax.plot(range(1, 6), v, "o", color=C[0], ms=12); ax.axhline(m, color=C[1], ls="--", lw=2); ax.text(5.3, m + .15, "среднее 6", color=C[1], fontsize=15)
    for i, x in enumerate(v, 1):
        ax.plot([i, i], [m, x], color=C[2], lw=2.5); ax.text(i + .1, (m + x) / 2, f"{x - m:+g}".replace("-", "−"), fontsize=14, color=C[2])
    ax.set_xlim(.5, 6.2); ax.set_ylim(2, 10); ax.spines[["top", "right"]].set_visible(False)
    ax.set_title("Дисперсия = среднее квадратов отклонений = 3,2", fontsize=15)
    save(fig, "m_deviation", "Отклонения и дисперсия", "Отклонения значений 4, 7, 5, 9, 5 от среднего 6; дисперсия 3,2")


deviations()


def median_pic():
    fig, ax = blank(11, 2.6)
    vals = [2, 3, 3, 5, 8, 9, 12]
    for i, v in enumerate(vals):
        c = C[1] if i == 3 else C[0]
        ax.add_patch(FancyBboxPatch((i * 1.4, 0), 1.1, 1.1, boxstyle="round,pad=0.03,rounding_size=.2", fc=SOFT[1] if i == 3 else SOFT[0], ec=c, lw=2))
        ax.text(i * 1.4 + .55, .55, str(v), ha="center", va="center", fontsize=22, weight="bold", color=c)
    ax.text(4.75, -.6, "медиана = 5,  среднее = 6,  размах = 12 − 2 = 10", ha="center", fontsize=17)
    ax.set_xlim(-.3, 9.9); ax.set_ylim(-1, 1.3)
    save(fig, "m_median", "Медиана и размах", "Упорядоченный ряд 2, 3, 3, 5, 8, 9, 12: медиана 5, среднее 6, размах 10")


median_pic()


def data_table():
    fig, ax = blank(9, 4.2)
    rows = [["Класс", "5А", "5Б", "5В"], ["Отличники", "6", "4", "7"], ["Хорошисты", "12", "15", "10"]]
    for r, row in enumerate(rows):
        for c, t in enumerate(row):
            ax.add_patch(Rectangle((c * 2.2, -r), 2.2, 1, fc=SOFT[0] if r == 0 or c == 0 else "white", ec=INK, lw=1.4))
            ax.text(c * 2.2 + 1.1, -r + .5, t, ha="center", va="center", fontsize=16, weight="bold" if r == 0 or c == 0 else None)
    ax.set_xlim(-.2, 9); ax.set_ylim(-2.2, 1.2)
    save(fig, "m_data_table", "Таблицы с данными", "Таблица: строки и столбцы, на пересечении – значение")


data_table()

# ---------- арифметика ----------


def expr(name, title, caption, top, bottom, order):
    fig, ax = blank(10, 3.2)
    ax.text(5, 1.4, top, ha="center", fontsize=32, weight="bold")
    ax.text(5, .2, bottom, ha="center", fontsize=22)
    if order:
        ax.text(5, 2.5, order, ha="center", fontsize=15, color=C[0])
    ax.set_xlim(0, 10); ax.set_ylim(-.3, 3.0)
    save(fig, name, title, caption)


expr("m_ex_distrib", "Распределительное свойство", "Распределительное свойство умножения: a(b + c) = ab + ac", "a(b + c) = ab + ac", "7 · 13 = 7 · 10 + 7 · 3 = 70 + 21 = 91", None)
expr("m_ex_squares", "Формулы сокращённого умножения", "Квадрат суммы, квадрат разности и разность квадратов", "(a + b)² = a² + 2ab + b²", "(a − b)² = a² − 2ab + b²     a² − b² = (a − b)(a + b)", None)
expr("m_ex_factor", "Разложение на множители", "Вынесение общего множителя за скобки и группировка", "6x² + 9x = 3x(2x + 3)", "ax + ay + bx + by = (a + b)(x + y)", None)
expr("m_ex_powers", "Свойства степени", "Свойства степени с натуральным показателем", "aᵐ · aⁿ = aᵐ⁺ⁿ     aᵐ : aⁿ = aᵐ⁻ⁿ", "(aᵐ)ⁿ = aᵐⁿ     (ab)ⁿ = aⁿbⁿ     a⁰ = 1", None)
expr("m_ex_roots", "Свойства корней", "Свойства арифметического квадратного корня", "√(ab) = √a · √b", "√(a/b) = √a / √b     (√a)² = a     √(a²) = |a|", None)
expr("m_ex_frac_alg", "Алгебраические дроби", "Сокращение алгебраической дроби с помощью разложения на множители", "(x² − 9) / (x + 3) = x − 3", "при x ≠ −3", None)
expr("m_ex_quad", "Формула корней квадратного уравнения", "Дискриминант и корни квадратного уравнения", "ax² + bx + c = 0", "D = b² − 4ac,    x = (−b ± √D) / 2a", None)
expr("m_ex_vieta", "Теорема Виета", "Теорема Виета: x₁ + x₂ = −p, x₁ · x₂ = q", "x² + px + q = 0", "x₁ + x₂ = −p,    x₁ · x₂ = q", None)
expr("m_ex_log", "Свойства логарифмов", "Основные свойства логарифмов", "logₐ(bc) = logₐb + logₐc", "logₐ(b/c) = logₐb − logₐc     logₐbⁿ = n·logₐb", None)
expr("m_ex_trig_id", "Тригонометрические тождества", "Основное тригонометрическое тождество и формулы двойного угла", "sin²α + cos²α = 1", "sin 2α = 2 sin α cos α     cos 2α = cos²α − sin²α", None)
expr("m_ex_deriv", "Правила дифференцирования", "Производные основных функций и правила дифференцирования", "(xⁿ)′ = n·xⁿ⁻¹     (u + v)′ = u′ + v′", "(uv)′ = u′v + uv′     (sin x)′ = cos x", None)
expr("m_ex_mixed", "Действия с дробями", "Сложение дробей с разными знаменателями: приводим к общему знаменателю", "1/3 + 1/4 = 4/12 + 3/12 = 7/12", "2/3 · 3/5 = 6/15 = 2/5", None)
expr("m_ex_decimal", "Действия с десятичными дробями", "Сложение и умножение десятичных дробей", "2,35 + 1,7 = 4,05", "0,4 · 1,5 = 0,6", None)
expr("m_ex_neg", "Действия с отрицательными числами", "Правила знаков при сложении и умножении отрицательных чисел", "−7 + 3 = −4     −5 − 4 = −9", "(−3) · (−4) = 12     (−12) : 3 = −4", None)
expr("m_ex_div", "Деление с остатком", "Деление с остатком: делимое = делитель · неполное частное + остаток", "23 : 5 = 4 (ост. 3)", "23 = 5 · 4 + 3", None)
expr("m_ex_gcd", "НОД и НОК", "Наибольший общий делитель и наименьшее общее кратное чисел 12 и 18", "12 = 2·2·3     18 = 2·3·3", "НОД(12; 18) = 6     НОК(12; 18) = 36", None)
expr("m_ex_divis", "Признаки делимости", "Признаки делимости на 2, 3, 5, 9 и 10", "на 2: последняя цифра чётная     на 5: 0 или 5", "на 3 и 9: сумма цифр делится на 3 (9)     на 10: 0", None)
expr("m_ex_prop", "Пропорция", "Основное свойство пропорции: произведение крайних членов равно произведению средних", "a : b = c : d   ⇔   a · d = b · c", "3 : 4 = 6 : 8,   3 · 8 = 4 · 6", None)
expr("m_ex_column", "Сложение в столбик", "Сложение и вычитание многозначных чисел столбиком", "  347 + 285 = 632", "разряд под разрядом: единицы под единицами", None)
expr("m_ex_mult_col", "Умножение в столбик", "Умножение многозначного числа на однозначное: 124 · 3 = 372", "124 · 3 = 372", "4·3 = 12 (пишем 2, 1 в уме);  2·3 + 1 = 7;  1·3 = 3", None)
expr("m_ex_seq_arith", "Арифметическая прогрессия", "Формулы n-го члена и суммы арифметической прогрессии", "aₙ = a₁ + d(n − 1)", "Sₙ = (a₁ + aₙ)·n / 2", None)
expr("m_ex_seq_geom", "Геометрическая прогрессия", "Формулы n-го члена и суммы геометрической прогрессии", "bₙ = b₁ · qⁿ⁻¹", "Sₙ = b₁(qⁿ − 1)/(q − 1)", None)
expr("m_ex_comb", "Перестановки и сочетания", "Число перестановок и сочетаний", "Pₙ = n!     5! = 120", "Cₙᵏ = n! / (k!(n − k)!)     C₅² = 10", None)
expr("m_ex_percent", "Задачи на проценты", "Нахождение процента от числа и числа по его проценту", "20 % от 150 = 150 · 0,2 = 30", "30 – это 20 % числа:  30 : 0,2 = 150", None)
expr("m_ex_motion", "Задачи на движение", "Скорость, время и расстояние: s = v · t", "s = v · t", "v = s : t      t = s : v", None)
expr("m_ex_work", "Задачи на работу", "Работа, производительность и время: A = p · t", "A = p · t", "вместе: 1/6 + 1/3 = 1/2 работы в час  ⇒  2 ч", None)
expr("m_ex_eq_lin", "Линейное уравнение", "Решение линейного уравнения: перенос слагаемых и деление на коэффициент", "3x − 5 = 10", "3x = 15,    x = 5", None)
expr("m_ex_rational", "Дробно-рациональные уравнения", "Решение дробно-рационального уравнения с проверкой ОДЗ", "(x² − 4) / (x − 2) = 0", "x² − 4 = 0, x ≠ 2  ⇒  x = −2", None)
expr("m_ex_irr_eq", "Иррациональные уравнения", "Возведение в квадрат и проверка корней", "√(x + 3) = x − 3", "x + 3 = (x − 3)²  ⇒  x = 6 (x = 1 – посторонний)", None)
expr("m_ex_exp_eq", "Показательные уравнения", "Показательное уравнение: приводим к одному основанию", "2ˣ⁺¹ = 32", "2ˣ⁺¹ = 2⁵  ⇒  x = 4", None)
expr("m_ex_log_eq", "Логарифмические уравнения", "Логарифмическое уравнение и ОДЗ", "log₂(x − 1) = 3", "x − 1 = 8  ⇒  x = 9", None)
expr("m_ex_trig_eq", "Тригонометрические уравнения", "Решение простейших тригонометрических уравнений", "sin x = 1/2", "x = (−1)ⁿ·π/6 + πn,  n ∈ Z", None)
expr("m_ex_system", "Системы уравнений", "Решение системы способом сложения", "x + y = 7,   x − y = 1", "2x = 8  ⇒  x = 4,  y = 3", None)
expr("m_ex_complex", "Комплексные числа", "Комплексное число z = a + bi, i² = −1", "z = a + bi,   i² = −1", "(2 + 3i) + (1 − i) = 3 + 2i", None)
expr("m_ex_units", "Единицы величин", "Единицы длины, массы и времени", "1 км = 1000 м     1 м = 100 см", "1 т = 1000 кг     1 ч = 60 мин", None)
expr("m_ex_scale", "Масштаб", "Масштаб 1 : 100 000 – в 1 см на карте 1 км на местности", "1 : 100 000", "1 см на карте = 1 км на местности", None)
