/* Проверка, что сайт больше не просит «расставить уже перечисленные даты по порядку»,
   а требует соотнести события и даты (история).
   Запуск: node test/history-chronology.mjs
   Проверяем:
   1) правило есть в LessonQuality.SUBJECTS.hist и попадает в промпт истории (слайды, рабочий лист);
   2) для других предметов правило не добавляется;
   3) в промпте слайдов и листа есть отдельный пункт для истории;
   4) в проверке «независимый проверяющий» есть пункт про механическое задание на хронологию. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = f => fs.readFileSync(path.join(root, f), "utf8");
let failed = 0;
const ok = (cond, name, extra = "") => { if (cond) console.log(`  ok   ${name}`); else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); } };

const quality = (() => {
  const ctx = { window: {}, console: { log() { }, warn() { }, error() { } } };
  vm.createContext(ctx);
  vm.runInContext(read("js/lesson-quality.js"), ctx, { filename: "js/lesson-quality.js" });
  return ctx.window.LessonQuality;
})();

const histRule = quality?.SUBJECTS?.hist || "";
ok(/расставьте перечисленные даты по порядку/i.test(histRule), "правило про даты есть в требованиях к истории");
ok(/соотнесение|соотнести/i.test(histRule), "правило требует соотнесения событий и дат");

const pHist = { subject: "hist", grade: 6, topic: "Монгольское нашествие", duration: 45 };
const pMath = { subject: "math", grade: 6, topic: "Дроби", duration: 45 };
const histSlides = quality.prompt(pHist, "slides");
const histSheet = quality.prompt(pHist, "worksheet");
const mathSlides = quality.prompt(pMath, "slides");
ok(/расставьте перечисленные даты по порядку/i.test(histSlides), "промпт слайдов по истории содержит правило");
ok(/расставьте перечисленные даты по порядку/i.test(histSheet), "промпт рабочего листа по истории содержит правило");
ok(!/расставьте перечисленные даты по порядку/i.test(mathSlides), "в математике правила про даты нет");

const app = read("js/app-part2.js");
ok(app.includes("**Хронологические задания — на понимание.**"), "отдельный пункт в промпте слайдов");
ok(/p\.subject === "hist" \? `?- \*\*Хронологические задания/.test(app) || app.includes('${p.subject === "hist" ? `- **Хронологические задания'), "пункт промпта слайдов включается только для истории");
ok(app.includes('"- Задания по хронологии — на понимание'), "пункт про хронологию в логике заданий рабочего листа");
ok(/11\. Задания, которые проверяю механику/.test(app), "пункт 11 у независимого проверяющего");
ok(/расставьте данные даты в хронологическом порядке/i.test(app), "проверяющий знает про конкретный случай с датами");

const slidesCatches = [...app.matchAll(/\*\*Хронологические задания — на понимание\.\*\*/g)].length;
ok(slidesCatches === 1, "пункт про хронологию в слайдах ровно один", `найдено: ${slidesCatches}`);

if (failed) { console.log(`\nПРОВАЛ: ${failed}`); process.exit(1); }
console.log("\nВсе проверки пройдены.");
