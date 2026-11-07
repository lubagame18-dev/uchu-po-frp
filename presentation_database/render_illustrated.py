"""Generate illustrated SVG teaching visuals for every Russian-language lesson.
Source-only: do not invent grammar rules when the curriculum inventory only names a topic.
"""
import json, re, html
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'presentation_database'/'illustrated'
def esc(x):return html.escape(str(x),quote=True)
def wrap(s,limit=47):
    words=str(s).split(); lines=[]; line=''
    for w in words:
        if len(line)+len(w)+1>limit and line:lines.append(line);line=w
        else:line=(line+' '+w).strip()
    if line:lines.append(line)
    return lines
def tx(x,y,s,size=35,color='#382f30',weight='normal',maxlen=48,lineheight=1.35):
    return ''.join(f'<text x="{x}" y="{y+i*size*lineheight:.0f}" font-family="DejaVu Sans,Arial,sans-serif" font-size="{size}" font-weight="{weight}" fill="{color}">{esc(line)}</text>' for i,line in enumerate(wrap(s,maxlen)))
def svg(lesson, curated):
    id=lesson['lesson_id']; grade=lesson['grade']; title=lesson['topic']
    if grade == 1:
        from grade1_editorial import render_grade1
        return render_grade1(lesson)
    c=curated.get(id)
    ready=lesson.get('elements_source')=='ready_table'
    source='curated' if c else 'source' if ready else 'topic'
    if c:
        label=c['kind'].upper()
        entries=[c['rule'],c['note']]
        example=c['example']
    elif ready:
        label='ПАМЯТКА · ИЗ ИСХОДНЫХ МАТЕРИАЛОВ'
        entries=lesson['numbered_elements'][:5]
        example=None
    else:
        label='КАРТА ТЕМЫ · СОДЕРЖАНИЕ ТРЕБУЕТ ПРОВЕРКИ'
        entries=[]
        example=None
    # Different topics get different visual idioms, rather than generic table rows.
    category=('СОСТАВ СЛОВА' if re.search('корень|суффикс|приставк|окончани|морфем|словообразован|состав слова',title,re.I)
      else 'СИНТАКСИС' if re.search('предложени|подлежащ|сказуем|словосочетани|синтакси|член[ыа] предложени',title,re.I)
      else 'ОРФОГРАФИЯ' if re.search('правописани|орфограмм|гласн|согласн|букв|мягкий знак|дефис|не с |н и нн',title,re.I)
      else 'РЕЧЬ И ТЕКСТ' if re.search('текст|речь|стил|изложени|сочинени|диалог|монолог',title,re.I)
      else 'ЯЗЫК И ЕГО УСТРОЙСТВО')
    head=['<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">',
      '<rect width="1920" height="1080" fill="#fff9f0"/>',
      '<rect x="34" y="28" width="1852" height="1024" rx="42" fill="none" stroke="#682c37" stroke-width="8"/>',
      '<rect x="66" y="58" width="1788" height="140" rx="28" fill="#762b35"/>',
      tx(120,116,f'РУССКИЙ ЯЗЫК  ·  {grade} КЛАСС',34,'#fffaf3','bold',45),
      tx(125,267,title,52,'#762b35','bold',55,1.25),
      '<path d="M125 357 H1790" stroke="#cfb6a9" stroke-width="3"/>',
      tx(126,410,category,26,'#496153','bold',48),
      '<circle cx="1692" cy="122" r="42" fill="#f1e2d4"/>',
      f'<text x="1692" y="138" font-family="DejaVu Sans" font-size="38" fill="#762b35" text-anchor="middle">{grade}</text>',
      '<path d="M1550 900 C1620 810 1710 870 1790 760" fill="none" stroke="#b5bfa8" stroke-width="9" stroke-linecap="round"/>',
      '<path d="M1550 900 C1570 825 1630 820 1645 855 C1600 865 1570 870 1550 900" fill="#b5bfa8"/>',
      '<path d="M1700 827 C1700 760 1770 740 1790 760 C1750 795 1720 805 1700 827" fill="#b5bfa8"/>']
    if example:
        head+=['<rect x="125" y="458" width="1665" height="168" rx="25" fill="#f3e8d7"/>',
          tx(169,505,'РАЗБЕРЁМ ПРИМЕР',24,'#762b35','bold'),
          tx(169,572,example,43,'#2f3030','bold',56)]
        # exact syntactic underline only for the checked short sentence
        if id=='ru-8-009':
            head+=['<path d="M169 589 H319" stroke="#762b35" stroke-width="5"/>',
             '<path d="M352 589 H492 M352 600 H492" stroke="#762b35" stroke-width="5"/>']
        for i,item in enumerate(entries[:2]):
            y=670+i*128
            head+= [f'<rect x="125" y="{y}" width="1665" height="110" rx="21" fill="#f8ece5"/>',
               f'<circle cx="176" cy="{y+55}" r="25" fill="#762b35"/>',
               f'<text x="176" y="{y+65}" font-family="DejaVu Sans" font-size="27" text-anchor="middle" fill="#ffffff">{i+1}</text>',
               tx(228,y+43,item,29,'#322b2c','normal',89,1.25)]
    elif entries:
        # Separate flowing cards rather than a table
        count=min(5,len(entries)); gap=16; cardh=min(148,int((480-(count-1)*gap)/count))
        for i,item in enumerate(entries[:count]):
            y=460+i*(cardh+gap)
            head += [f'<rect x="125" y="{y}" width="1665" height="{cardh}" rx="22" fill="{("#f3e8d7" if i%2==0 else "#f7ede6")}"/>',
              f'<circle cx="180" cy="{y+cardh//2}" r="26" fill="#762b35"/>',
              f'<text x="180" y="{y+cardh//2+10}" text-anchor="middle" font-family="DejaVu Sans" font-size="27" fill="white">{i+1}</text>',
              tx(232,y+cardh//2-3,item,27,'#332d2e','normal',91,1.2)]
    else:
        head+=['<rect x="125" y="480" width="1665" height="345" rx="32" fill="#f3e8d7"/>',
          tx(180,560,'ТЕМА УРОКА',28,'#762b35','bold'),
          tx(180,652,title,44,'#332d2e','bold',56),
          tx(180,765,'Правило и учебный пример пока не подтверждены источником.',26,'#786a65')]
    footer=('Проверяемый пример · требуется редакционная проверка' if c else
            'Сведения перенесены из исходных материалов · требуют проверки' if ready else
            'Карта темы · не является готовым объяснением правила')
    head+=[tx(125,990,footer,24,'#736962'),tx(1615,990,id,21,'#736962'),'</svg>']
    return '\n'.join(head),source
def main():
    lessons=json.loads((ROOT/'frp_tasks/ru.json').read_text(encoding='utf-8'))['lessons']
    curated={x['lesson_id']:x for x in json.loads((ROOT/'presentation_database/verified_examples.json').read_text(encoding='utf-8'))['lessons']}
    count={'curated':0,'source':0,'topic':0}
    for lesson in lessons:
        s,kind=svg(lesson,curated)
        target=OUT/('grade-'+str(lesson['grade']))
        target.mkdir(parents=True,exist_ok=True)
        (target/(lesson['lesson_id']+'.svg')).write_text(s,encoding='utf-8')
        count[kind]+=1
    (OUT/'manifest.json').write_text(json.dumps({'total':len(lessons),'categories':count,'warning':'Topic-only cards are not finished lesson explanations; editorial review required.'},ensure_ascii=False,indent=2),encoding='utf-8')
    # Single download of all 267 rendered SVG images and their manifest.
    # Use fixed ZIP timestamps to prevent unnecessary binary diffs.
    from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
    archive = ROOT / "presentation_database" / "russian_all_lessons_1-11_svg.zip"
    paths = sorted(OUT.rglob("*.svg"))
    if len(paths) != len(lessons):
        raise RuntimeError(f"Expected {len(lessons)} SVG files, found {len(paths)}")
    with ZipFile(archive, "w", compression=ZIP_DEFLATED) as bundle:
        for path in [OUT / "manifest.json", *paths]:
            name = str(path.relative_to(OUT)).replace("\\", "/")
            info = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            bundle.writestr(info, path.read_bytes())
        note = ("Учебные иллюстрации по русскому языку (1–11 классы)\n"
                "267 SVG-файлов с разделением по классам.\n"
                "28 слайдов 1 класса подготовлены с собственными учебными примерами.\n"
                "Часть остальных слайдов пока содержит только карту темы — см. manifest.json.\n"
                "Источник программы 1–4 классов: https://edsoo.ru/rabochie-programmy/\n")
        info = ZipInfo("README.txt", date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        bundle.writestr(info, note.encode("utf-8"))
    print(count)
if __name__=='__main__':main()
