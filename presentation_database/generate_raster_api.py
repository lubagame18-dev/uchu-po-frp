"""Generate genuinely illustrated Russian-language posters as WEBP using paid API.
Only activates after explicit GitHub repository variable and API key are configured.
"""
from pathlib import Path
import os,sys,json,base64,io
from PIL import Image
from openai import OpenAI

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/"presentation_database"/"illustrated_raster"
def read(p):return json.loads(p.read_text(encoding="utf-8"))
def main():
    if os.getenv("ENABLE_PAID_IMAGE_GENERATION")!="true":
        sys.exit("Paid image generation is not enabled.")
    if not os.getenv("OPENAI_API_KEY"):
        sys.exit("No OPENAI_API_KEY secret. No paid generation attempted.")
    lessons=read(ROOT/"frp_tasks/ru.json")["lessons"]
    if len(lessons)!=267:sys.exit("Expected 267 lessons; check catalog.")
    grade1={x["lesson_id"]:x for x in read(ROOT/"presentation_database/grade1_editorial.json")["lessons"]}
    manifest_path=DEST/"manifest.json"
    manifest=read(manifest_path) if manifest_path.exists() else {"images":[]}
    entries={x["lesson_id"]:x for x in manifest.get("images",[])}
    api=OpenAI(api_key=os.environ["OPENAI_API_KEY"],timeout=300,max_retries=2)
    limit=min(20,max(1,int(os.getenv("IMAGE_BATCH_SIZE","12"))))
    done=[];failed=[]
    for lesson in lessons:
        if len(done)>=limit:break
        key=lesson["lesson_id"];folder=DEST/("grade-"+str(lesson["grade"]))
        if any((folder/(key+ext)).exists() for ext in (".webp",".png",".jpeg")):continue
        known=grade1.get(key)
        data=("\n".join([known["headline"]]+[a["title"]+": "+a["text"] for a in known["cards"]]+[known["note"]]) if known else "")
        prompt=f"""Одна красивая, ПОЛНОЦЕННАЯ учебная иллюстрация-плакат для урока русского языка, {lesson['grade']} класс. Тема «{lesson['topic']}».
Горизонтальный формат, кремовая бумага, благородный бордовый цвет, иллюстрации персонажей и предметов по теме, книги и лёгкие ботанические акценты. Не таблица, не SVG, не шаблонная текстовая карточка.
Размести ясное краткое правило, конкретный простой учебный пример, схему или алгоритм, памятку, маленькое задание. Крупный разборчивый русский текст без ошибок. Не используй ошибочные школьные морфемные или синтаксические обозначения. Для 1–4 классов — добрые детские рисунки; для 5–11 классов — более строгие схемы, иллюстрации и разборы.
Проверенный текст, если имеется: {data or "В каталоге указано только название темы. Не добавляй сомнительные утверждения и сложные правила."}
Без водяных знаков и логотипов."""
        try:
            result=api.images.generate(model=os.getenv("OPENAI_IMAGE_MODEL","gpt-image-2"),
                prompt=prompt,size="1536x1024",quality="medium",output_format="webp")
            image_data=base64.b64decode(result.data[0].b64_json)
            with Image.open(io.BytesIO(image_data)) as image:
                if image.format!="WEBP" or image.width<900 or image.height<500:
                    raise ValueError("Image is not the expected raster format")
                width,height=image.size
            folder.mkdir(parents=True,exist_ok=True)
            (folder/(key+".webp")).write_bytes(image_data)
            entries[key]={"lesson_id":key,"grade":lesson["grade"],"topic":lesson["topic"],
              "file":f"grade-{lesson['grade']}/{key}.webp","width":width,"height":height,
              "format":"image/webp","source":"generated_via_image_api",
              "editorial_review":"required_before_classroom_use"}
            done.append(key)
            print("SAVED",key,flush=True)
        except Exception as exc:
            failed.append({"lesson_id":key,"error":str(exc)[:220]})
            print("FAILED",key,exc,file=sys.stderr,flush=True)
            if len(failed)>=3:break
    manifest.update(images=sorted(entries.values(),key=lambda x:x["lesson_id"]),
       total_uploaded=len(entries),generated_image_count=len(entries),
       missing_genuine_illustrations=267-len(entries),not_full_course=len(entries)!=267,
       requires_editorial_review=True,last_batch={"created":done,"errors":failed})
    DEST.mkdir(parents=True,exist_ok=True)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("UPLOADED",len(entries),"OF 267",flush=True)
    if failed and not done:sys.exit("Generation failed; inspect logs")
if __name__=="__main__":main()
