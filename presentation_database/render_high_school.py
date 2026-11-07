import json, logging
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
out=root/'presentation_database'/'high_school'
out.mkdir(parents=True,exist_ok=True)
logging.basicConfig(filename=str(out/'errors.log'),level=logging.ERROR)
fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
boldfile='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(s,b=False): return ImageFont.truetype(boldfile if b else fontfile,s)
def wrap(draw,text,f,width):
    lines=[]
    for para in text.split('\n'):
        line=''
        for word in para.split(' '):
            candidate=(line+' '+word).strip() if line else word
            if draw.textbbox((0,0),candidate,font=f)[2]<=width:line=candidate
            else:
                if line:lines.append(line)
                line=word
        lines.append(line)
    return lines
def render(lesson):
    cells=lesson['numbered_elements']
    if not isinstance(cells,list) or not all(isinstance(s,str) for s in cells):raise ValueError('Invalid cells')
    im=Image.new('RGB',(1920,1080),'#fffaf3'); d=ImageDraw.Draw(im)
    for size in (43,40,37,34,31,28,25,22):
        f=font(size); groups=[wrap(d,s,f,1590) for s in cells]
        lh=int(size*1.47)
        if sum(len(g)*lh+18 for g in groups)<=715:break
    if sum(len(g)*lh+18 for g in groups)>715:raise ValueError('Text too long for legible single slide')
    d.rounded_rectangle((65,52,1855,1028),radius=17,fill='#fffefa',outline='#c8b6a4',width=4)
    d.rounded_rectangle((65,52,1855,202),radius=17,fill='#762b35')
    d.rectangle((65,170,1855,202),fill='#762b35')
    title=lesson['topic'];tf=font(57,True)
    while d.textbbox((0,0),title,font=tf)[2]>1620 and tf.size>30:tf=font(tf.size-2,True)
    d.text((112,90),title,font=tf,fill='white')
    d.text((116,234),f"РУССКИЙ ЯЗЫК  •  {lesson['grade']} КЛАСС",font=font(28,True),fill='#762b35')
    y=320
    for i,lines in enumerate(groups,1):
        d.text((115,y),f'{i:02d}',font=font(33,True),fill='#762b35')
        for line in lines:
            d.text((218,y),line,font=f,fill='#25251f')
            y+=lh
        y+=18
    d.text((116,971),lesson['lesson_id'],font=font(23),fill='#84786d')
    im.save(out/(lesson['lesson_id']+'.png'),optimize=True)
def main():
    data=json.loads((root/'frp_tasks'/'ru.json').read_text(encoding='utf-8'))
    supplement_path=root/'presentation_database'/'supplement_grade5.json'
    supplementary={x['lesson_id']:x for x in json.loads(supplement_path.read_text(encoding='utf-8'))['lessons']}
    stats={'rendered':0,'supplementary_rendered':0,'skipped':0,'errors':0,'by_grade':{}}
    for grade in range(5,12):
        g={'rendered':0,'skipped':0,'errors':0}
        for lesson in (l for l in data['lessons'] if l['grade']==grade):
            if lesson.get('elements_source')!='ready_table':
                if lesson['lesson_id'] not in supplementary:g['skipped']+=1;continue
                lesson=supplementary[lesson['lesson_id']]
                stats['supplementary_rendered']+=1
            try:render(lesson);g['rendered']+=1
            except Exception: g['errors']+=1;logging.exception('grade=%s lesson=%s',grade,lesson.get('lesson_id'))
        stats['by_grade'][str(grade)]=g
        for k in ('rendered','skipped','errors'):stats[k]+=g[k]
    (out/'manifest.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(stats,ensure_ascii=False))
if __name__=='__main__':main()
