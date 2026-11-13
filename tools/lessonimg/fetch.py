#!/usr/bin/env python3
"""База иллюстраций к урокам «Учу по ФРП».

Работает в GitHub Actions (там есть интернет). Для каждого урока из
integrations/chatgpt/claude_tasks/<предмет>.json:
1) по правилам tools/lessonimg/<предмет>.txt («регулярка | статья; статья») выбирает статьи
   русской Википедии по теме урока; если правила нет — живой поиск статьи по теме
   с проверкой, что заголовок статьи совпадает с темой по смыслу (общие значимые слова);
2) берёт главную иллюстрацию статьи, проверяет на Викискладе лицензию — только общественное
   достояние и CC0 / CC BY / CC BY-SA (без NC и ND); файлы, лежащие только в Википедии
   (добросовестное использование), не берутся;
3) сохраняет уменьшенную копию в img/lessons/<код>.webp (одна картинка на несколько уроков);
4) пишет data/lesson-images.js: подпись (название статьи и её краткое описание из Википедии),
   автор, лицензия, ссылка на источник. Ничего не придумывает; нет точного — null.
Литература: если правило не нашлось, а в теме есть автор из базы портретов — ставится портрет.
Запуск: python3 tools/lessonimg/fetch.py
"""
import hashlib, io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools", "lessonimg")
TASKS = os.path.join(ROOT, "integrations", "chatgpt", "claude_tasks")
FRP_TASKS = os.path.join(ROOT, "integrations", "chatgpt", "frp_tasks")
FRP_SUBJ = {"bio", "chem", "phys", "soc", "obzh"}  # реальные фото и схемы с Викисклада; задания ChatGPT не трогаем, только читаем темы
IMG = os.path.join(ROOT, "img", "lessons")
OUT_JS = os.path.join(ROOT, "data", "lesson-images.js")
PEOPLE_JS = os.path.join(ROOT, "data", "people.js")
OUT_LOG = os.path.join(SRC, "report.txt")
UA = "UchuPoFRP-lessonimages/1.0 (https://uchu-po-frp.ru; educational site)"
RW = "https://ru.wikipedia.org/w/api.php"
CM = "https://commons.wikimedia.org/w/api.php"
OK_LIC = re.compile(r"public domain|^pd|cc0|cc[- ]by(?:[- ]sa)?[- ]?\d|cc[- ]by(?:-sa)?$", re.I)
BAD_LIC = re.compile(r"\bnc\b|non-?commercial|\bnd\b|no-?deriv|fair use", re.I)
SEARCH_SUBJ = {"hist", "lit", "mhk", "geo", "bio", "chem", "phys", "soc", "obzh"}
STOP = set("урок уроки тема теме темы обобщение повторение контроль контроля введение курс курса как что это для или его их при над под без про также который которые между этапы этап основные основы роль место значение общая характеристика особенности развитие история истории россии мира века веке начало конец середина середине второй первой половине половина годы годов край наш".split())

GENERIC = {w[:5] for w in "запад восток государство революция культура общество человек религия искусство наука война политика экономика власть народ народы страна страны город природа право мораль семья реформа реформы империя".split()}

_cache = {}


def get(url, params, tries=4):
    q = url + "?" + urllib.parse.urlencode(params)
    if q in _cache:
        return _cache[q]
    for k in range(tries):
        try:
            req = urllib.request.Request(q, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                _cache[q] = json.loads(r.read().decode("utf-8"))
                return _cache[q]
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
    fn = os.path.join(SRC, subj + ".txt")
    out = []
    if not os.path.exists(fn):
        return out
    for line in open(fn, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#") or "|" not in line:
            continue
        rx, _, titles = line.rpartition(" | ")
        if not rx:
            continue
        titles = titles.strip()
        rx, g = rx.strip(), (1, 11)
        m = re.match(r"@(\d+)-(\d+)\s+", rx)  # «@1-4 регулярка» — правило только для этих классов
        if m:
            g, rx = (int(m.group(1)), int(m.group(2))), rx[m.end():]
        out.append((re.compile(rx), [] if titles == "-" else [t.strip() for t in titles.split(";") if t.strip()], g))
    return out


def article(title):
    """Главная иллюстрация и краткое описание статьи русской Википедии."""
    j = get(RW, {"action": "query", "titles": title, "prop": "pageimages|description|info", "piprop": "name",
                 "redirects": 1, "inprop": "url", "format": "json"})
    for p in (j.get("query", {}).get("pages", {}) or {}).values():
        if "missing" in p:
            return None
        return {"title": p.get("title", title), "file": p.get("pageimage"), "desc": p.get("description", ""),
                "url": p.get("fullurl") or "https://ru.wikipedia.org/wiki/" + urllib.parse.quote(p.get("title", title))}
    return None


def commons_info(fname):
    j = get(CM, {"action": "query", "titles": "File:" + fname, "prop": "imageinfo",
                 "iiprop": "url|extmetadata|mime", "iiurlwidth": 960, "format": "json"})
    for p in (j.get("query", {}).get("pages", {}) or {}).values():
        ii = (p.get("imageinfo") or [None])[0]
        if not ii:
            return None
        md = ii.get("extmetadata", {})
        lic = strip_html((md.get("LicenseShortName") or {}).get("value", ""))
        return {"thumb": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"), "license": lic,
                "artist": strip_html((md.get("Artist") or {}).get("value", ""))[:160], "mime": ii.get("mime", "")}
    return None


def words(s, n=4):
    return {w[:5] for w in re.findall(r"[а-яёa-z]{%d,}" % n, s.lower().replace("ё", "е")) if w not in STOP}


def clean_topic(t):
    m = re.search(r"«([^»]+)»", t)
    if m and re.search(r"контрол|повторен|обобщ|по теме|проект", t, re.I):
        t = m.group(1)
    t = re.sub(r"\(.*?\)", " ", t)
    return re.sub(r"\s+", " ", t).strip(" .:")


def search_titles(topic):
    q = clean_topic(topic)
    tw = words(q, 3)
    if not tw:
        return []
    j = get(RW, {"action": "query", "list": "search", "srsearch": q, "srlimit": 5, "srnamespace": 0, "format": "json"})
    # строго: каждое значимое слово заголовка статьи есть в теме урока; без годов, списков и уточнений в скобках, которых нет в теме
    for h in j.get("query", {}).get("search", []):
        t = h["title"]
        if re.search(r"\d", t) and not re.search(re.escape(re.sub(r"\D+", " ", t).strip().split(" ")[0]), q):
            continue
        if re.match(r"(Список|Категория|Шаблон)", t) or "(" in t:
            continue
        hw = words(re.sub(r"[—–-].*$", "", t), 3)
        if hw and hw <= tw and not (len(hw) == 1 and next(iter(hw)) in GENERIC):
            return [t]
    return []


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
                return k, p
    return None, None


def main():
    from PIL import Image
    os.makedirs(IMG, exist_ok=True)
    old = {}
    if os.path.exists(OUT_JS):
        try:
            old = json.loads(re.search(r"=\s*(\{.*\})\s*;?\s*$", open(OUT_JS, encoding="utf-8").read(), re.S).group(1))
        except Exception:
            old = {}
    images = dict(old.get("images", {}))
    by_title = {v.get("title"): k for k, v in images.items() if v.get("title")}
    bad_title = set()
    art_of = {}
    people = load_people()
    lessons, log, stat = {}, [], {}
    subj_only = set(sys.argv[1:])

    def fetch_title(title):
        if title in by_title and os.path.exists(os.path.join(ROOT, images[by_title[title]]["img"])):
            if title not in art_of:
                art_of[title] = article(title) or {"title": title, "desc": ""}
            return by_title[title]
        if title in bad_title:
            return None
        a = article(title)
        if not a or not a.get("file"):
            bad_title.add(title)
            log.append(f"   · «{title}»: {'нет статьи' if not a else 'в статье нет иллюстрации'}")
            return None
        info = commons_info(a["file"])
        if not info or not info.get("thumb"):
            bad_title.add(title)
            log.append(f"   · «{title}»: файл не на Викискладе (не свободный)")
            return None
        if BAD_LIC.search(info["license"]) or not OK_LIC.search(info["license"]):
            bad_title.add(title)
            log.append(f"   · «{title}»: лицензия не подходит ({info['license']})")
            return None
        key = hashlib.md5(a["file"].encode("utf-8")).hexdigest()[:12]
        path = os.path.join(IMG, key + ".webp")
        if not os.path.exists(path):
            data = raw(info["thumb"])
            if not data:
                log.append(f"   · «{title}»: не скачался")
                return None
            try:
                im = Image.open(io.BytesIO(data))
                im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
                if im.mode == "RGBA":
                    bg = Image.new("RGB", im.size, (255, 255, 255))
                    bg.paste(im, mask=im.split()[3])
                    im = bg
                im.thumbnail((960, 720))
                im.save(path, "WEBP", quality=80, method=6)
            except Exception as e:
                log.append(f"   · «{title}»: не открылся ({e})")
                return None
            time.sleep(0.2)
        images[key] = {"img": f"img/lessons/{key}.webp", "title": a["title"], "desc": a["desc"],
                       "caption": a["title"] + (f" — {a['desc']}" if a["desc"] else ""),
                       "author": info["artist"], "license": info["license"], "source": info["page"], "wiki": a["url"]}
        by_title[title] = key
        by_title[a["title"]] = key
        art_of[title] = a
        return key

    files = [(TASKS, fn) for fn in sorted(os.listdir(TASKS)) if fn.endswith(".json")]
    files += [(FRP_TASKS, fn) for fn in sorted(os.listdir(FRP_TASKS)) if fn[:-5] in FRP_SUBJ] if os.path.isdir(FRP_TASKS) else []
    for base, fn in files:
        subj = fn[:-5]
        if subj_only and subj not in subj_only:
            for x in json.load(open(os.path.join(base, fn), encoding="utf-8")).get("lessons", []):
                if x["lesson_id"] in old.get("lessons", {}):
                    lessons[x["lesson_id"]] = old["lessons"][x["lesson_id"]]
            continue
        rules = read_rules(subj)
        st = stat.setdefault(subj, [0, 0])
        log.append(f"\n== {subj} ==")
        for x in json.load(open(os.path.join(base, fn), encoding="utf-8")).get("lessons", []):
            st[1] += 1
            topic = x["topic"]
            probe = topic + " " + (x.get("section") or "")
            titles, via = None, "правило"
            rules_g = [(rx, ts) for rx, ts, g in rules if g[0] <= int(x["grade"]) <= g[1]]
            for rx, ts in rules_g:
                if rx.search(topic):
                    titles = ts
                    break
            if titles is None:
                for rx, ts in rules_g:
                    if rx.search(probe):
                        titles, via = ts, "раздел"
                        break
            keys, caps = [], []
            def take(t):
                k = fetch_title(t)
                if k and k not in keys:
                    a = art_of.get(t) or {"title": t, "desc": ""}
                    keys.append(k)
                    caps.append(a["title"] + (f" — {a['desc']}" if a.get("desc") else ""))
                    return True
                return False
            for t in titles or []:
                take(t)
                if len(keys) >= 2:
                    break
            if not keys and subj in SEARCH_SUBJ and titles != []:
                for t in search_titles(topic):
                    if take(t):
                        via = "поиск"
            entry = {"keys": keys, "caps": caps, "topic": topic, "grade": x["grade"], "subject": subj}
            if subj == "lit" or subj == "hist":
                pk, p = person_for(probe, people, subj)
                if pk:
                    entry["person"] = pk
            if not keys and not entry.get("person"):
                log.append(f"– {x['lesson_id']} {topic[:80]}: нет")
                lessons[x["lesson_id"]] = None
                continue
            st[0] += 1
            lessons[x["lesson_id"]] = entry
            log.append(f"+ {x['lesson_id']} [{via}] {topic[:60]} → " + "; ".join(caps) + (f" (+портрет {entry['person']})" if entry.get("person") else ""))
    used = {k for e in lessons.values() if e for k in e["keys"]}
    images = {k: v for k, v in images.items() if k in used}
    js = "/* База иллюстраций к урокам «Учу по ФРП» – собрано tools/lessonimg/fetch.py из Википедии и Викисклада (только свободные лицензии). Не редактировать вручную. */\n"
    js += "window.UCHU_LESSON_IMAGES = " + json.dumps({"images": images, "lessons": lessons}, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(OUT_JS, "w", encoding="utf-8").write(js)
    head = "Покрытие уроков иллюстрациями:\n" + "\n".join(f"  {s}: {a} из {b}" for s, (a, b) in stat.items()) + f"\nКартинок: {len(images)}\n"
    open(OUT_LOG, "w", encoding="utf-8").write(head + "\n".join(log) + "\n")
    print(head)


if __name__ == "__main__":
    main()
