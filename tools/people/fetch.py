#!/usr/bin/env python3
"""База портретов «Учу по ФРП»: авторы (литература) и деятели (история).

Работает в GitHub Actions (там есть интернет). Для каждого человека из tools/people/*.txt:
1) ищет его в Викиданных по имени, сверяет год рождения (если указан) и что это человек;
2) берёт портрет (свойство P18) с Викисклада, проверяет лицензию — только общественное
   достояние и свободные лицензии CC0 / CC BY / CC BY-SA (без NC и ND);
3) сохраняет уменьшенную копию в img/people/<key>.webp;
4) пишет data/people.js: имя, годы жизни, роль, файл, автор снимка, лицензия, ссылка на источник.
Ничего не придумывает: годы и подпись берутся из Викиданных, лицензия и автор — с Викисклада.
Уже скачанные портреты повторно не качаются. Запуск: python3 tools/people/fetch.py
"""
import io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools", "people")
IMG = os.path.join(ROOT, "img", "people")
OUT_JS = os.path.join(ROOT, "data", "people.js")
OUT_LOG = os.path.join(SRC, "report.txt")
UA = "UchuPoFRP-portraits/1.0 (https://uchu-po-frp.ru; educational site)"
WD = "https://www.wikidata.org/w/api.php"
CM = "https://commons.wikimedia.org/w/api.php"
OK_LIC = re.compile(r"public domain|^pd|cc0|cc[- ]by(?:[- ]sa)?[- ]?\d|cc[- ]by(?:-sa)?$", re.I)
BAD_LIC = re.compile(r"\bnc\b|non-?commercial|\bnd\b|no-?deriv|fair use", re.I)


def get(url, params, tries=4):
    q = url + "?" + urllib.parse.urlencode(params)
    for k in range(tries):
        try:
            req = urllib.request.Request(q, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa
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


def year(claim):
    try:
        t = claim["mainsnak"]["datavalue"]["value"]["time"]  # +1799-06-06T00:00:00Z
        m = re.match(r"([+-])0*(\d+)-", t)
        y = int(m.group(2))
        return -y if m.group(1) == "-" else y
    except Exception:
        return None


def read_people():
    out = []
    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith(".txt") or fn == "report.txt":
            continue
        for line in open(os.path.join(SRC, fn), encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            p = [x.strip() for x in line.split("|")]
            if len(p) < 4:
                continue
            out.append({"key": p[0], "name": p[1], "born": int(p[2] or 0), "role": p[3],
                        "forms": [x.strip() for x in (p[4] if len(p) > 4 else "").split(";") if x.strip()],
                        "group": fn[:-4]})
    return out


def find_entity(person):
    s = get(WD, {"action": "wbsearchentities", "search": person["name"], "language": "ru", "uselang": "ru",
                 "type": "item", "limit": 10, "format": "json"})
    ids = [x["id"] for x in s.get("search", [])]
    if not ids:
        return None, "не найден в Викиданных"
    e = get(WD, {"action": "wbgetentities", "ids": "|".join(ids), "props": "claims|labels|descriptions|sitelinks",
                 "languages": "ru", "format": "json"}).get("entities", {})
    best, why = None, "нет подходящего человека с портретом"
    for qid in ids:
        it = e.get(qid) or {}
        cl = it.get("claims", {})
        if not any(c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id") == "Q5" for c in cl.get("P31", [])):
            continue
        b = year(cl["P569"][0]) if cl.get("P569") else None
        if person["born"] and (b is None or abs(b - person["born"]) > 1):
            why = f"год рождения не совпал ({b} ≠ {person['born']})"
            continue
        if not cl.get("P18"):
            why = "в Викиданных нет портрета"
            continue
        d = year(cl["P570"][0]) if cl.get("P570") else None
        best = {"qid": qid, "file": cl["P18"][0]["mainsnak"]["datavalue"]["value"], "born": b, "died": d,
                "label": (it.get("labels", {}).get("ru") or {}).get("value", ""),
                "desc": (it.get("descriptions", {}).get("ru") or {}).get("value", ""),
                "wiki": (it.get("sitelinks", {}).get("ruwiki") or {}).get("title", "")}
        break
    return best, (None if best else why)


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def commons_info(fname):
    j = get(CM, {"action": "query", "titles": "File:" + fname, "prop": "imageinfo",
                 "iiprop": "url|extmetadata|mime", "iiurlwidth": 600, "format": "json"})
    for p in j.get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [None])[0]
        if not ii:
            return None
        md = ii.get("extmetadata", {})
        lic = strip_html((md.get("LicenseShortName") or {}).get("value", ""))
        return {"thumb": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"),
                "license": lic, "license_url": strip_html((md.get("LicenseUrl") or {}).get("value", "")),
                "artist": strip_html((md.get("Artist") or {}).get("value", ""))[:160],
                "mime": ii.get("mime", "")}
    return None


def years_text(b, d):
    f = lambda y: (f"{-y} до н. э." if y < 0 else str(y)) if y is not None else "?"
    if b is None and d is None:
        return ""
    return f"{f(b)}–{f(d)}" if d is not None else f"род. {f(b)}"


def main():
    from PIL import Image
    os.makedirs(IMG, exist_ok=True)
    people = read_people()
    old = {}
    if os.path.exists(OUT_JS):
        try:
            old = json.loads(re.search(r"=\s*(\{.*\})\s*;?\s*$", open(OUT_JS, encoding="utf-8").read(), re.S).group(1)).get("people", {})
        except Exception:
            old = {}
    out, log = {}, []
    for i, person in enumerate(people):
        k = person["key"]
        path = os.path.join(IMG, k + ".webp")
        if k in old and os.path.exists(path):
            out[k] = {**old[k], "role": person["role"], "forms": person["forms"], "group": person["group"]}
            continue
        ent, why = find_entity(person)
        if not ent:
            log.append(f"– {k} ({person['name']}): {why}")
            continue
        info = commons_info(ent["file"])
        if not info or not info.get("thumb"):
            log.append(f"– {k}: нет файла на Викискладе")
            continue
        if BAD_LIC.search(info["license"]) or not OK_LIC.search(info["license"]):
            log.append(f"– {k}: лицензия не подходит ({info['license']})")
            continue
        data = raw(info["thumb"])
        if not data:
            log.append(f"– {k}: не скачался")
            continue
        try:
            im = Image.open(io.BytesIO(data)).convert("RGB")
            im.thumbnail((600, 750))
            im.save(path, "WEBP", quality=82, method=6)
        except Exception as e:
            log.append(f"– {k}: не открылся ({e})")
            continue
        out[k] = {"name": ent["label"] or person["name"], "years": years_text(ent["born"], ent["died"]),
                  "role": person["role"], "desc": ent["desc"], "img": f"img/people/{k}.webp",
                  "author": info["artist"], "license": info["license"], "source": info["page"],
                  "wikidata": ent["qid"], "forms": person["forms"], "group": person["group"]}
        log.append(f"+ {k}: {out[k]['name']} ({out[k]['years']}) · {info['license']}")
        time.sleep(0.3)
    # портреты, которых больше нет в списке, не удаляем — только не выводим
    js = "/* База портретов «Учу по ФРП» – собрано tools/people/fetch.py из Викиданных и Викисклада. Не редактировать вручную. */\n"
    js += "window.UCHU_PEOPLE = " + json.dumps({"people": out}, ensure_ascii=False, indent=0) + ";\n"
    open(OUT_JS, "w", encoding="utf-8").write(js)
    ok = len(out)
    open(OUT_LOG, "w", encoding="utf-8").write(f"Портретов: {ok} из {len(people)}\n" + "\n".join(log) + "\n")
    print(f"Портретов: {ok} из {len(people)}")
    print("\n".join(x for x in log if x.startswith("–")))


if __name__ == "__main__":
    main()
