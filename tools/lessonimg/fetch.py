#!/usr/bin/env python3
"""База иллюстраций к урокам «Учу по ФРП» (версия 2: своя картинка для каждой темы).

Работает в GitHub Actions (там есть интернет). Для каждого урока из
integrations/chatgpt/claude_tasks/*.json и frp_tasks/*.json:
1) ищет в русской Википедии статьи именно по теме урока: по всей формулировке и по её частям.
   Статья принимается, только если все значимые слова её названия есть в теме урока
   (без годов, списков и посторонних уточнений) – так отсекаются случайные совпадения;
2) добавляет статьи из правил tools/lessonimg/<предмет>.txt («регулярка | статья; статья»,
   собственные чертежи – «own:имя»);
3) собирает картинки этих статей в порядке появления в тексте (главная иллюстрация первой),
   оставляет только файлы Викисклада со свободной лицензией (PD, CC0, CC BY, CC BY-SA),
   без значков, флагов, гербов, логотипов и мелочи;
4) назначает каждой теме картинку, которая в этом предмете ещё не занята другой темой
   (уроки одной и той же темы и контрольные/повторительные уроки могут совпадать);
5) пишет data/lesson-images.js и отчёт tools/lessonimg/report.txt (урок → статья → файл).
Подпись – описание файла на Викискладе (если оно на русском) или название статьи.
Запуск: python3 tools/lessonimg/fetch.py [предметы]
"""
import concurrent.futures as cf
import hashlib, io, json, os, re, sys, threading, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools", "lessonimg")
TASKS = os.path.join(ROOT, "integrations", "chatgpt", "claude_tasks")
FRP_TASKS = os.path.join(ROOT, "integrations", "chatgpt", "frp_tasks")
FRP_SUBJ = {"bio", "chem", "phys", "soc", "obzh", "math", "inf", "ru"}  # темы ChatGPT только читаем
OWN_FIRST = {"math", "ru"}  # точные собственные схемы важнее фото
IMG = os.path.join(ROOT, "img", "lessons")
OUT_JS = os.path.join(ROOT, "data", "lesson-images.js")
PEOPLE_JS = os.path.join(ROOT, "data", "people.js")
OUT_LOG = os.path.join(SRC, "report.txt")
UA = "UchuPoFRP-lessonimages/2.0 (https://uchu-po-frp.ru; educational site)"
RW = "https://ru.wikipedia.org/w/api.php"
CM = "https://commons.wikimedia.org/w/api.php"
OK_LIC = re.compile(r"public domain|^pd|cc0|cc[- ]by(?:[- ]sa)?[- ]?\d|cc[- ]by(?:-sa)?$", re.I)
BAD_LIC = re.compile(r"\bnc\b|non-?commercial|\bnd\b|no-?deriv|fair use", re.I)
BAD_FILE = re.compile(r"flag[_ ]of|coat[_ ]of[_ ]arms|герб|флаг|logo|логотип|icon|иконка|symbol|commons-|wiki|ambox|question[_ ]book|disambig|edit-|crystal[_ ]|nuvola|padlock|folder|wiktionary|portal|pictogram|emblem|seal[_ ]of|signature|подпись|blank|placeholder|\.(ogg|oga|ogv|webm|mid|midi|pdf|djvu|tif|tiff|wav|mp3|flac)$", re.I)
STOP = set("урок уроки тема теме темы обобщение повторение контроль контроля введение курс курса как что это для или его их при над под без про также который которые между этапы этап основные основы роль место значение общая характеристика особенности развитие история истории века веке начало конец середина середине второй первой половине половина годы годов край наш виды вид понятие понятия свойства свойство решение задач задачи работа практическая лабораторная".split())
GENERIC = {w[:5] for w in "запад восток государство революция культура общество человек религия искусство наука война политика экономика власть народ народы страна страны город природа право мораль семья реформа реформы империя россия мир".split()}
BAD_PAREN = re.compile(r"\((?:[^)]*\b)?(фильм|телесериал|сериал|мультфильм|песня|альбом|значения|кинотрилогия|группа|игра|журнал|газета|футбольный клуб|телепередача|сингл|компания|издательство|телеканал|видеоигра)", re.I)
REVIEW = re.compile(r"^(контрольн|итогов|резервн|повторени|обобщени|проверочн|анализ|работа над ошибками|защита|диктант|всероссийская проверочная|урок повторения|повторительно)", re.I)

_cache, _lock = {}, threading.Lock()


def get(url, params, tries=4):
    q = url + "?" + urllib.parse.urlencode(params)
    with _lock:
        if q in _cache:
            return _cache[q]
    for k in range(tries):
        try:
            req = urllib.request.Request(q, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                j = json.loads(r.read().decode("utf-8"))
            with _lock:
                _cache[q] = j
            return j
        except Exception:
            time.sleep(2 + 3 * k)
    return {}


def raw(url, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:
            time.sleep(2 + 3 * k)
    return None


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def read_rules(subj):
    out = []
    lines = []
    for fn in (os.path.join(SRC, subj + "_own.txt"), os.path.join(SRC, subj + ".txt")):  # сначала точные правила собственных карточек
        if os.path.exists(fn):
            own_file = fn.endswith("_own.txt")
            lines += [l.replace(" | own:", " | !own-first; own:", 1) if own_file else l for l in open(fn, encoding="utf-8").read().splitlines()]
    for line in lines:
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#") or " | " not in line:
            continue
        rx, _, titles = line.rpartition(" | ")
        rx, g = rx.strip(), (1, 11)
        m = re.match(r"@(\d+)-(\d+)\s+", rx)  # «@1-4 регулярка» – правило только для этих классов
        if m:
            g, rx = (int(m.group(1)), int(m.group(2))), rx[m.end():]
        titles = titles.strip()
        out.append((re.compile(rx, re.I), [] if titles == "-" else [t.strip() for t in titles.split(";") if t.strip()], g))
    return out


def words(s, n=3):
    return {w[:5] for w in re.findall(r"[а-яёa-z]{%d,}" % n, s.lower().replace("ё", "е")) if w not in STOP}


def clean_topic(t):
    m = re.search(r"«([^»]+)»", t)
    if m and re.search(r"контрол|повторен|обобщ|по теме|проект|лаборатор|практическ|решение задач|практикум|проверочн", t, re.I):
        t = m.group(1)
    t = re.sub(r"\((урок|часть)[^)]*\)", " ", t)
    t = re.sub(r"(Лабораторная|Практическая) работа(\s*№\s*\d+)?\.?", " ", t)
    return re.sub(r"\s+", " ", t).strip(" .:")


def topic_core(t):
    return " ".join(sorted(words(clean_topic(t), 3)))


def segments(t):
    q = clean_topic(t)
    parts = [q] + [p.strip() for p in re.split(r"[.;:!?]|\s[–—-]\s", q) if len(p.strip()) > 3]
    out = []
    for p in parts:
        if p and p not in out:
            out.append(p)
    return out[:5]


def search_articles(topic):
    tw = words(clean_topic(topic), 3)
    if not tw:
        return []
    out = []
    for q in segments(topic):
        j = get(RW, {"action": "query", "list": "search", "srsearch": q, "srlimit": 8, "srnamespace": 0, "format": "json"})
        for h in j.get("query", {}).get("search", []):
            t = h["title"]
            if t in out or re.match(r"(Список|Категория|Шаблон|Хронология)", t) or BAD_PAREN.search(t):
                continue
            if any(w.lower() not in set(re.findall(r"[а-яёa-z]+", topic.lower())) for w in re.findall(r"\b[А-Яа-яЁёA-Za-z]{1,2}\b", re.sub(r"\s*\(.*?\)", "", t)) if w.lower() not in ("и", "в", "на", "с", "о", "к", "у")):
                continue
            base = re.sub(r"\s*\(.*?\)\s*", " ", t)
            if re.search(r"\d", base) and not all(d in topic for d in re.findall(r"\d+", base)):
                continue
            hw = words(re.sub(r"\s[—–-]\s.*$", "", base), 3)
            if hw and hw <= tw and not (len(hw) == 1 and next(iter(hw)) in GENERIC):
                out.append(t)
        if len(out) >= 6:
            break
    return out[:6]


def article_files(title):
    """Файлы статьи в порядке появления; главная иллюстрация первой."""
    j = get(RW, {"action": "query", "titles": title, "prop": "pageimages|description|info", "piprop": "name", "redirects": 1, "inprop": "url", "format": "json"})
    page = next(iter((j.get("query", {}).get("pages", {}) or {}).values()), None)
    if not page or "missing" in page:
        return None
    art = {"title": page.get("title", title), "desc": page.get("description", ""), "url": page.get("fullurl", "")}
    files = [page["pageimage"]] if page.get("pageimage") else []
    p = get(RW, {"action": "parse", "page": art["title"], "prop": "images", "format": "json"})
    for f in (p.get("parse", {}) or {}).get("images", [])[:30]:
        if f not in files:
            files.append(f)
    art["files"] = [f for f in files if not BAD_FILE.search(f)][:24]
    return art


def commons_batch(files):
    out = {}
    for i in range(0, len(files), 40):
        chunk = files[i:i + 40]
        j = get(CM, {"action": "query", "titles": "|".join("File:" + f for f in chunk), "prop": "imageinfo",
                     "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 960, "iiextmetadatalanguage": "ru", "format": "json"})
        norm = {n["to"]: n["from"] for n in j.get("query", {}).get("normalized", [])}
        for pg in (j.get("query", {}).get("pages", {}) or {}).values():
            ii = (pg.get("imageinfo") or [None])[0]
            if not ii:
                continue
            name = norm.get(pg["title"], pg["title"])[5:]
            md = ii.get("extmetadata", {})
            lic = strip_html((md.get("LicenseShortName") or {}).get("value", ""))
            if BAD_LIC.search(lic) or not OK_LIC.search(lic):
                continue
            if min(ii.get("width", 0), ii.get("height", 0)) < 220 or not re.match(r"image/(jpeg|png|svg|gif|webp)", ii.get("mime", "")):
                continue
            desc = strip_html((md.get("ImageDescription") or {}).get("value", ""))
            out[name.replace(" ", "_")] = {"thumb": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"), "license": lic,
                                           "artist": strip_html((md.get("Artist") or {}).get("value", ""))[:160], "desc": desc}
    return out


def ru_caption(desc, fallback):
    d = re.sub(r"\s+", " ", desc or "").strip()
    cyr = len(re.findall(r"[а-яё]", d.lower())); lat = len(re.findall(r"[a-z]", d.lower()))
    if d and cyr > 8 and cyr > 2 * lat:
        d = re.split(r"(?<=[.!?])\s", d)[0]
        return d[:140].rstrip(" ,;:") + ("…" if len(d) > 140 else "")
    return fallback


def load_people():
    try:
        return json.loads(re.search(r"=\s*(\{.*\})\s*;?\s*$", open(PEOPLE_JS, encoding="utf-8").read(), re.S).group(1)).get("people", {})
    except Exception:
        return {}


def person_for(topic, people, group):
    low = topic.lower()
    for k, p in people.items():
        if p.get("group") != group:
            continue
        for f in p.get("forms") or []:
            if f and re.search(r"(?<![а-яё])" + re.escape(f.lower()) + r"(?![а-яё])", low):
                return k
    return None


def main():
    from PIL import Image
    os.makedirs(IMG, exist_ok=True)
    own_meta = json.load(open(os.path.join(SRC, "own.json"), encoding="utf-8")) if os.path.exists(os.path.join(SRC, "own.json")) else {}
    people = load_people()
    subj_only = set(sys.argv[1:])
    files = [(TASKS, fn) for fn in sorted(os.listdir(TASKS)) if fn.endswith(".json")]
    files += [(FRP_TASKS, fn) for fn in sorted(os.listdir(FRP_TASKS)) if fn[:-5] in FRP_SUBJ] if os.path.isdir(FRP_TASKS) else []
    plan = []  # (subj, lesson, rule_titles)
    for base, fn in files:
        subj = fn[:-5]
        if subj_only and subj not in subj_only:
            continue
        rules = read_rules(subj)
        for x in json.load(open(os.path.join(base, fn), encoding="utf-8")).get("lessons", []):
            topic, probe = x["topic"], x["topic"] + " " + (x.get("section") or "")
            rg = [(rx, ts) for rx, ts, g in rules if g[0] <= int(x["grade"]) <= g[1]]
            titles = next((ts for rx, ts in rg if rx.search(topic)), None)
            if titles is None:
                titles = next((ts for rx, ts in rg if rx.search(probe)), None)
            elif subj in OWN_FIRST:  # точные чертежи: кандидаты из всех подходящих правил по порядку
                titles = [t for rx, ts in rg if rx.search(topic) for t in ts]
            plan.append((subj, x, titles))

    # 1. кандидаты: статьи по теме (параллельно)
    def gather(item):
        subj, x, titles = item
        found = [] if titles == [] else search_articles(x["topic"])
        own_first = subj in OWN_FIRST or "!own-first" in (titles or [])
        rule_wiki = [t for t in (titles or []) if not t.startswith(("own:", "!"))]
        own = [t for t in (titles or []) if t.startswith("own:")]
        order = (own + found + rule_wiki) if own_first else (found + rule_wiki + own)
        seen, arts = set(), []
        for t in order:
            if t in seen:
                continue
            seen.add(t)
            if t.startswith("own:"):
                name = t[4:]
                if name.endswith("*"):
                    arts += [{"own": k} for k in sorted(own_meta) if k.startswith(name[:-1])]
                else:
                    arts.append({"own": name})
            else:
                a = article_files(t)
                if a and a["files"]:
                    a["via"] = "поиск" if t in found else "правило"
                    arts.append(a)
        return arts

    with cf.ThreadPoolExecutor(8) as ex:
        cand_arts = list(ex.map(gather, plan))
    all_files = sorted({f for arts in cand_arts for a in arts for f in a.get("files", [])})
    info = {}
    with cf.ThreadPoolExecutor(6) as ex:
        for part in ex.map(commons_batch, [all_files[i:i + 40] for i in range(0, len(all_files), 40)]):
            info.update(part)

    # 2. назначение: своя картинка для каждой темы внутри предмета
    images, lessons, log, stat = {}, {}, [], {}
    used, core_keys, prev = {}, {}, {}
    need = {}
    for (subj, x, titles), arts in zip(plan, cand_arts):
        st = stat.setdefault(subj, [0, 0, 0]); st[1] += 1
        u = used.setdefault(subj, set())
        core = topic_core(x["topic"])
        review = bool(REVIEW.search(x["topic"].strip()))
        cands = []
        for a in arts:
            if "own" in a:
                m = own_meta.get(a["own"])
                if m and os.path.exists(os.path.join(IMG, "own", a["own"] + ".webp")):
                    cands.append((a["own"], m["title"], m["caption"], "собственная схема", None))
                continue
            for f in a["files"]:
                inf = info.get(f.replace(" ", "_"))
                if inf:
                    key = hashlib.md5(f.encode("utf-8")).hexdigest()[:12]
                    cands.append((key, a["title"], ru_caption(inf["desc"], a["title"]), a.get("via", ""), (f, inf, a)))
        keys, caps, via = [], [], ""
        if (subj, core) in core_keys:  # та же тема уже была – та же картинка
            keys, caps = core_keys[(subj, core)]; via = "та же тема"
        else:
            fresh = [c for c in cands if c[0] not in u]
            # картинки не повторяются: уже занятая другой темой картинка не берётся;
            # если своей нет – урок остаётся без картинки базы, и сайт ищет её в Википедии при сборке
            pick = (fresh[:1] if fresh[0][3] == "собственная схема" else fresh[:2]) if fresh else ([] if not review else cands[:1])
            for key, title, cap, v, src in pick:
                keys.append(key); caps.append(cap if cap != title else title); via = via or v
                if not review:
                    u.add(key)
                if src:
                    f, inf, a = src
                    need[key] = (f, inf, a)
                    images[key] = {"img": f"img/lessons/{key}.webp", "title": a["title"], "desc": inf["desc"][:300], "caption": cap,
                                   "author": inf["artist"], "license": inf["license"], "source": inf["page"], "wiki": a.get("url", "")}
                else:
                    m = own_meta[key]
                    images[key] = {"img": f"img/lessons/own/{key}.webp", "title": m["title"], "desc": m["caption"], "caption": m["caption"],
                                   "author": "Учу по ФРП", "license": "собственный чертёж", "source": "", "wiki": ""}
            if keys and not review:
                core_keys[(subj, core)] = (keys, caps)
        entry = {"keys": keys, "caps": caps, "topic": x["topic"], "grade": x["grade"], "subject": subj}
        if subj in ("lit", "hist"):
            pk = person_for(x["topic"] + " " + (x.get("section") or ""), people, subj)
            if pk:
                entry["person"] = pk
        if not keys and not entry.get("person"):
            lessons[x["lesson_id"]] = None
            log.append(f"– {x['lesson_id']} {x['topic'][:90]}: нет")
            continue
        st[0] += 1
        if via in ("повтор", "соседний урок", "та же тема"):
            st[2] += 1
        lessons[x["lesson_id"]] = entry
        if keys:
            prev[subj] = entry
        arts_txt = "; ".join(f"{images[k]['title']} [{need[k][0] if k in need else 'own:' + k}]" for k in keys)
        log.append(f"+ {x['lesson_id']} [{via}] {x['topic'][:80]} → {arts_txt}" + (f" (+портрет {entry['person']})" if entry.get("person") else ""))

    # 3. скачивание (параллельно), уменьшенная копия webp
    def down(item):
        key, (f, inf, a) = item
        path = os.path.join(IMG, key + ".webp")
        if os.path.exists(path):
            return key, True
        data = raw(inf["thumb"])
        if not data:
            return key, False
        try:
            im = Image.open(io.BytesIO(data))
            im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
            if im.mode == "RGBA":
                bg = Image.new("RGB", im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[3]); im = bg
            im.thumbnail((960, 720)); im.save(path, "WEBP", quality=80, method=6)
            return key, True
        except Exception:
            return key, False

    with cf.ThreadPoolExecutor(8) as ex:
        bad = {k for k, ok in ex.map(down, list(need.items())) if not ok}
    for e in lessons.values():
        if e and bad & set(e["keys"]):
            idx = [i for i, k in enumerate(e["keys"]) if k not in bad]
            e["keys"] = [e["keys"][i] for i in idx]; e["caps"] = [e["caps"][i] for i in idx]
    usedk = {k for e in lessons.values() if e for k in e["keys"]}
    images = {k: v for k, v in images.items() if k in usedk}
    if subj_only and os.path.exists(OUT_JS):  # частичный прогон: остальные предметы сохраняем
        old = json.loads(re.search(r"=\s*(\{.*\})\s*;?\s*$", open(OUT_JS, encoding="utf-8").read(), re.S).group(1))
        for lid, e in old.get("lessons", {}).items():
            if lid not in lessons and (not e or e.get("subject") not in subj_only):
                lessons[lid] = e
                for k in (e or {}).get("keys", []):
                    if k in old.get("images", {}):
                        images[k] = old["images"][k]
    for fn in os.listdir(IMG):
        if fn.endswith(".webp") and fn[:-5] not in images:
            os.remove(os.path.join(IMG, fn))
    js = "/* База иллюстраций к урокам «Учу по ФРП» – собрано tools/lessonimg/fetch.py из Википедии и Викисклада (только свободные лицензии) и собственных схем. Не редактировать вручную. */\n"
    js += "window.UCHU_LESSON_IMAGES = " + json.dumps({"images": images, "lessons": lessons}, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(OUT_JS, "w", encoding="utf-8").write(js)
    head = "Покрытие уроков иллюстрациями (уроков с картинкой / всего; из них с повтором картинки):\n" + "\n".join(f"  {s}: {a} из {b}; повтор {r}" for s, (a, b, r) in stat.items()) + f"\nКартинок: {len(images)}\n"
    open(OUT_LOG, "w", encoding="utf-8").write(head + "\n".join(log) + "\n")
    print(head)


if __name__ == "__main__":
    main()
