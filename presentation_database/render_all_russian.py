"""Генератор схем русского языка 1–11: исходные сведения не подменяются выдуманными правилами."""
import json, re, logging, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'presentation_database'/'russian_all_grades'
DEST.mkdir(parents=True,exist_ok=True)
logging.basicConfig(filename=str(DEST/'errors.log'),level=logging.ERROR,format='%(asctime)s %(message)s')
F='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
B='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(sz,bold=False):return ImageFont.truetype(B if bold else F,sz)
def wrap(draw,s,f,maxw):
    result=[]
    for p in s.split('\n'):
        current=''
        for word in p.split(' '):
            trial=(current+' '+word).strip()
            if draw.textbbox((0,0),trial,font=f)[2]<=maxw:current=trial
            else:
                if current:result.append(current)
                current=word
        result.append(current)
    return result
def textfit(draw,s,maxw,maxh,start=45,minimum=23):
    for size in range(start,minimum-1,-1):
        f=font(size)
        lines=wrap(draw,s,f,maxw)
        if len(lines)*int(size*1.45)<=maxh:return f,lines
    raise ValueError('Text will not fit without unreadable type')
def drawlines(d,lines,x,y,f,color='#252621',leading=1.45):
    for line in lines:
        d.text((x,y),line,font=f,fill=color)
        y+=int(f.size*leading)
    return y
def frame(lesson,kind):
    im=Image.new('RGB',(1920,1080),'#fffaf4');d=ImageDraw.Draw(im)
    d.rounded_rectangle((64,52,1856,1028),radius=24,fill='#fffefa',outline='#b7a999',width=4)
    d.rounded_rectangle((64,52,1856,210),radius=24,fill='#762b35')
    d.rectangle((64,172,1856,210),fill='#762b35')
    topic=lesson['topic']
    f,lines=textfit(d,topic,1620,112,start=53,minimum=25)
    drawlines(d,lines,116,79,f,'#ffffff',1.16)
    d.text((118,235),f"РУССКИЙ ЯЗЫК   ·   {lesson['grade']} КЛАСС",font=font(29,True),fill='#762b35')
    d.text((1490,236),kind.upper(),font=font(24,True),fill='#3e594b')
    d.text((116,974),lesson['lesson_id'],font=font(23),fill='#87796e')
    return im,d
def sections(topic):
    # Делим только по знакам препинания в исходном названии, не добавляя содержания.
    bits=[x.strip() for x in re.split(r'(?<=[.!?])\s+|\.\s*|;\s*',topic) if x.strip()]
    return bits
def layout(lesson):
    if lesson.get('elements_source')=='ready_table':
        return 'памятка',lesson['numbered_elements'],'original_table'
    bits=sections(lesson['topic'])
    if len(bits)>1:return 'карта темы',bits,'topic_only'
    return 'тема урока',[lesson['topic']],'topic_only'
def render(lesson):
    kind,parts,source=layout(lesson)
    if not parts or not all(isinstance(x,str) and x.strip() for x in parts):raise ValueError('Invalid source')
    im,d=frame(lesson,kind)
    if source=='topic_only' and len(parts)==1:
        # Единственная подтвержденная информация — тема: без псевдоправил и искусственных примеров.
        d.rounded_rectangle((205,370,1715,820),radius=30,fill='#f6f0e8',outline='#c8b7a7',width=3)
        f,lines=textfit(d,parts[0],1360,320,start=70,minimum=30)
        h=len(lines)*int(f.size*1.45)
        drawlines(d,lines,285,570-h//2,f,'#4d3332')
    else:
        # Карта темы / памятка. Никаких внутренних линий таблиц.
        count=len(parts)
        usable=625
        slot=usable/count
        if slot<57:raise ValueError('Too many elements for one legible slide')
        for i,p in enumerate(parts):
            y=int(330+i*slot)
            d.ellipse((120,y+9,165,y+54),fill='#762b35')
            nf=font(22,True);number=str(i+1)
            d.text((142-d.textbbox((0,0),number,font=nf)[2]/2,y+17),number,font=nf,fill='white')
            f,lines=textfit(d,p,1530,int(slot)-10,start=min(43,max(26,int(slot*.37))),minimum=22)
            drawlines(d,lines,195,y+3,f)
    d.text((118,930),'Источник: исходная таблица' if source=='original_table' else 'Схема тем урока · без добавления непроверенных правил',font=font(21),fill='#7b7067')
    target=DEST/('grade-'+str(lesson['grade']))
    target.mkdir(exist_ok=True)
    im.save(target/(lesson['lesson_id']+'.png'),optimize=True)
    return source
def main():
    lessons=json.loads((ROOT/'frp_tasks'/'ru.json').read_text(encoding='utf-8'))['lessons']
    counts={str(i):{'source_tables':0,'topic_maps':0,'errors':0} for i in range(1,12)}
    for lesson in lessons:
        g=str(lesson['grade'])
        try:
            source=render(lesson)
            counts[g]['source_tables' if source=='original_table' else 'topic_maps']+=1
        except Exception:
            counts[g]['errors']+=1
            logging.exception('lesson=%s',lesson.get('lesson_id'))
    summary={'total_lessons':len(lessons),'grades':counts,'limitations':['topic_maps reproduce only topic names, not validated rules','no automatic morphemic or syntactic markup without verified examples','source tables reproduced as supplied, not independently fact-checked']}
    (DEST/'manifest.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
