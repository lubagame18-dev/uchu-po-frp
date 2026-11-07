"""Аудит русскоязычных материалов 1–11 классов. Не изменяет исходные данные."""
import json, re, collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'frp_tasks'/'ru.json'
OUT=ROOT/'presentation_database'/'quality'
OUT.mkdir(parents=True,exist_ok=True)
data=json.loads(DATA.read_text(encoding='utf-8'))
lessons=data['lessons']
supp={x['lesson_id']:x for x in json.loads((ROOT/'presentation_database'/'supplement_grade5.json').read_text(encoding='utf-8'))['lessons']}
seen=set(); report=[]; grades=collections.defaultdict(lambda:collections.Counter())
for l in lessons:
    flags=[]
    ident=l['lesson_id']; grade=l['grade']; topic=l['topic']
    if ident in seen: flags.append('duplicate_lesson_id')
    seen.add(ident)
    if not 1<=grade<=11: flags.append('grade_out_of_range')
    if not isinstance(l.get('images'),list): flags.append('invalid_image_spec')
    if l.get('elements_source')=='topic_structure':
        flags.append('generic_placeholders_not_lesson_content')
    if l.get('elements_source')=='ready_table':
        if not all(isinstance(s,str) and s.strip() for s in l.get('numbered_elements',[])):
            flags.append('invalid_original_table_elements')
        if len(l.get('numbered_elements',[]))==0:flags.append('empty_table')
    if ident in supp:
        flags.append('supplement_requires_editorial_review')
        if supp[ident]['topic']!=topic:flags.append('supplement_topic_mismatch')
    # Наиболее очевидные предметные коллизии для обязательной ручной проверки.
    if grade==1 and topic=='Предложение' and any('сложноподчин' in s.lower() or 'придаточн' in s.lower() for s in l.get('numbered_elements',[])):
        flags.append('age_topic_mismatch_complex_sentence_in_grade_1')
    if topic=='Диалог' and any('«П' in s for s in l.get('numbered_elements',[])):
        flags.append('dialogue_topic_uses_direct_speech_schemes')
    if l.get('elements_source')=='ready_table' and any(re.search(r'подлежащ|сказуем|определени|дополнени|обстоятельств',s,re.I) for s in l.get('numbered_elements',[])):
        flags.append('syntactic_markup_review_needed')
    state='needs_review' if flags else 'source_ready'
    report.append(dict(lesson_id=ident,grade=grade,topic=topic,source=l.get('elements_source'),status=state,flags=flags,images_requested=len(l.get('images') or [])))
    grades[str(grade)]['lessons']+=1
    grades[str(grade)]['needs_review' if flags else 'source_ready']+=1
summary={'total_lessons':len(report),'grades':dict(grades),'notes':['ФРП и ФГОС — содержательные ориентиры; не являются единым ГОСТом для графического дизайна слайдов.','Файл ru.json не изменён.','Подчёркивания синтаксических членов, орфограммы и условные обозначения требуют семантической разметки; автоматическое подчёркивание наугад запрещено.','Готовность исходных данных не означает подтверждённую предметную проверку.']}
(OUT/'audit.json').write_text(json.dumps({'summary':summary,'lessons':report},ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'README.md').write_text("""# Контроль качества материалов русского языка

Проверяются все уроки 1–11 классов по `frp_tasks/ru.json`. Исходник не меняется.

## Основание
- ФРП русского языка для 1–4 классов: https://sudact.ru/law/prikaz-minprosveshcheniia-rossii-ot-18052023-n-372/federalnaia-obrazovatelnaia-programma-nachalnogo-obshchego/iii/20/
- ФРП русского языка для 5–9 классов: https://www.consultant.ru/document/cons_doc_LAW_452180/adbb1b485c8456abdaa2d405a5ccf2598a2ba1b9/
- ФРП русского языка для 10–11 классов: https://zivsosh1.ru/images/docum/edu/frp/soo/2025_rus.pdf

## Требования к макету
- 1920×1080, формат 16:9, крупный читаемый текст, без внутренней сетки, с единой внешней рамкой.
- Для примеров синтаксического разбора нужны различающиеся линии: подлежащее — одна, сказуемое — две, определение — волнистая, дополнение — пунктир, обстоятельство — штрихпунктир. Линия ставится только после проверки грамматической функции слова в конкретном примере.
- Для орфограмм выделение только проверяемой буквы/морфемы; для пунктуации — схема с указанием грамматических основ и границ частей.
- Сохраняются исходные примеры, пунктуация, знаки и порядок элементов.
- Примечания указывают на ограничения и исключения только при наличии подтверждённого источника.
- Не выдавать заглушки «Языковое явление / Признак / Правило / Пример» за учебные таблицы.
- `audit.json` — автоматическая предварительная проверка, **не** экспертное подтверждение соответствия ФРП и ГОСТ.

## Особые проверки
- Возрастная уместность тем и примеров.
- Совпадение заголовка с содержанием.
- Наличие достаточного объёма материала для иллюстрации.
- Читаемость и отсутствие обрезки.
- Нельзя утверждать, что существует единый ГОСТ на оформление всех учебных презентаций.
""",encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
