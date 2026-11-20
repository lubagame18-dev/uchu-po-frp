'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'work/lesson-quality');fs.mkdirSync(out,{recursive:true});
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'cases.json')));
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const rulesFile=process.env.LESSON_RULES_JSON;if(rulesFile)await page.addInitScript(data=>localStorage.setItem('uchu:rules',JSON.stringify({data})),JSON.parse(fs.readFileSync(rulesFile)));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='https://lesson.test')return route.abort();const file=path.resolve(root,decodeURIComponent(u.pathname).slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();return route.fulfill({contentType:{'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json'}[path.extname(file)],body:fs.readFileSync(file)});});
 await page.goto('https://lesson.test/',{waitUntil:'load'});await page.waitForFunction(()=>window.LessonQuality&&window.Notes&&window.Kits&&window.Subjects);
 const loadOrder=await page.evaluate(async()=>{
  await Plans.ensure('mhk');
  await Plans.ensure('astr');
  await Plans.ensure('okr');
  const before=Subjects.planTopics('okr',4).length;
  await Plans.ensure('math');
  return {before, after:Subjects.planTopics('okr',4)?.length, primaryMath:Subjects.planTopics('math',1)?.length, mhk:Subjects.planTopics('mhk',7)?.length, astr:Subjects.planTopics('astr',11)?.length};
 });
 assert.ok(loadOrder.before>0);
 assert.equal(loadOrder.after,loadOrder.before);
 assert.ok(loadOrder.primaryMath>0 && loadOrder.mhk>0 && loadOrder.astr>0);
 const generated=[];
 for(const item of cases){
  const r=await page.evaluate(async c=>{
   await Plans.ensure(c.subject);await Kits.ensure(c.subject);state.anyName=c.anyName||'';
   const PL=Subjects.plugin(c.subject),p={...c,duration:40,mode:'school',lessonNo:1,lessonTotal:1,level:'medium',control:'school',plan:{},notes:{prompt:'',observe:'',links:[],checklist:[],files:[],text:c.text||''},extra:{},formats:['lesson','worksheet','slides']};
   p.type=PL?PL.detectType(p):Engine.detectType(p);p.type={...p.type,name:p.type?.name||'Изучение нового',reason:p.type?.reason||''};
   const draft=PL?PL.lesson(p,p.type):'';
   const lesson=PL?pluginPrompt('lesson',p,p.type,draft,PL):promptConspect(p);
   const worksheet=PL?pluginPrompt('worksheet',p,p.type,'',PL,'СОГЛАСОВАННАЯ ОСНОВА 12345'):promptWorksheet(p,'СОГЛАСОВАННАЯ ОСНОВА 12345');
   const design=PL?promptDesignAny(p):promptDesign(p);
   const photo={name:'Фото страницы.jpg',fromPhoto:true,text:c.photoText || 'Страница 42\nУпражнение 127. Рассмотрите два примера по теме «'+p.topic+'». Объясните сходство и различие. Сформулируйте вывод.'};
   const pp={...p,notes:{...p.notes,files:[photo]}};
   const withPhoto=PL?pluginPrompt('lesson',pp,pp.type,draft,PL):promptConspect(pp);
   const ref=promptRefine('lesson','# Полный документ с проверенной теорией','Исправь опечатку',{params:p,notes:pp.notes});
   return {subject:p.subject,params:p,photoParams:pp,lesson,worksheet,design,withPhoto,ref,hasPhotoContext:withPhoto.includes('Упражнение 127'),hasAnchor:worksheet.includes('СОГЛАСОВАННАЯ ОСНОВА 12345'),strategy:LessonQuality.SUBJECTS[p.subject],runtimeRules:window.Rules?.aiSuffix?.() || "",reviewTemplate:promptReview(p,'REVIEW_DOCUMENT_PLACEHOLDER','lesson')};
  },item);
  assert(r.lesson.includes(r.strategy),item.subject);assert(r.lesson.includes('НЕ ПРИЛОЖЕНО'),item.subject);assert(r.hasPhotoContext,item.subject);assert(r.hasAnchor,item.subject);assert(r.ref.includes('127'),item.subject);assert(r.ref.includes('только выбранную правку'),item.subject);assert(r.design.includes('НЕ ПРИЛОЖЕНО'),item.subject);
  generated.push(r);
 }
 // Conversion must keep all substantive content, not just the legacy table.
 assert.equal(await page.evaluate(()=>cleanMd('Приведите пример из жизни (не из учебника).')),'Приведите пример из жизни.');
 const conversion=await page.evaluate(()=>{
  const p={subject:'ru',grade:7,topic:'Причастие',duration:40,type:{name:'Изучение нового'}};
  const raw='# Технологическая карта\n\n**Цель:** Понять правило.\n\n## Объяснение\n\nПРИЗНАК ПРЕДМЕТА ПО ДЕЙСТВИЮ: читающий человек.\n\n| Этап | Учитель | Ученики | Задания |\n|---|---|---|---|\n| Практика (20 мин) | Разбираем образец. | Объясняют значение. | Запишите вывод. |\n| Итог (20 мин) | Проверяем правило. | Называют признаки. | Проверка. |\n\n## Примеры и решения\n\nПРОВЕРЕННЫЙ РАЗБОР: читающий — признак по действию.\n\n## Домашнее задание\n\nСоставьте два примера и объясните признаки.\n';
  const normalized=normalizeTechmap(raw,p),lesson=LessonNotes.build(normalized,p);
  return {normalized,lesson};
 });
 for(const text of [conversion.normalized,conversion.lesson]){assert(text.includes('ПРИЗНАК ПРЕДМЕТА ПО ДЕЙСТВИЮ'));assert(text.includes('ПРОВЕРЕННЫЙ РАЗБОР'));assert(!text.includes('Учебник'));}
 const regressions=await page.evaluate(async()=>{
  await Plans.ensure('okr');
  await Kits.ensure('okr');
  const kit=Subjects.plugin('okr');
  const civics=['Конституция России','Права и обязанности гражданина'].map(topic=>{
   const p={subject:'okr',grade:4,topic,duration:45};
   return [kit.lesson(p),kit.worksheet(p)];
  });
  const p={subject:'ru',grade:7,topic:'Причастие',duration:40,type:{name:'Изучение нового'}};
  await Plans.ensure('mhk');
  await Kits.ensure('mhk');
  await Plans.ensure('astr');
  await Kits.ensure('astr');
  const art={subject:'mhk',grade:7,topic:'Барокко',duration:45};
  const astronomy={subject:'astr',grade:11,topic:'Экзопланеты',duration:45};
  const artPlan=Subjects.frp('mhk',art);
  const artLesson=Subjects.plugin('mhk').lesson(art);
  const astronomySheet=Subjects.plugin('astr').worksheet(astronomy);
  const legacy='**Таблица 2. Блочно-модульное описание урока**\n\n| Блок 1. Практика |\n|---|\n| **Учитель:** Прочитайте пример. |\n\n## Примеры\n\n| Блок 2. Текст примера |\n|---|\n| **Учитель:** Название колонки примера |';
  return {civics, artPlan, artLesson, astronomySheet, nature:kit.worksheet({subject:'okr',grade:4,topic:'Природные зоны России'}), stages:LessonNotes.rows(legacy).length, legacy:LessonNotes.build(legacy,p)};
 });
 for(const documents of regressions.civics)for(const text of documents){
  assert.match(text,/\b43\b/);
  assert.match(text,/\b58\b/);
  assert.doesNotMatch(text,/Перечисли времена года|Имитируем движения животных|Нарисуй знак безопасного поведения/);
 }
 assert.match(regressions.nature,/Перечисли времена года/);
 assert.equal(regressions.artPlan.theme,'Барокко');
 assert.match(regressions.artLesson,/Караваджо/);
 assert.match(regressions.astronomySheet,/провал/);
 assert.equal(regressions.stages,1);
 assert.match(regressions.legacy,/Название колонки примера/);
 const modelDir=process.env.LESSON_MODEL_DIR,reviewDir=process.env.LESSON_REVIEW_DIR;
 if(modelDir){
  const results=[];
  for(const file of fs.readdirSync(modelDir).filter(x=>/-plain\.json$|-photo\.json$/.test(x))){
   const sample=JSON.parse(fs.readFileSync(path.join(modelDir,file))),c=generated.find(x=>x.subject===sample.subject);
   const reviewFile=reviewDir&&path.join(reviewDir,file),review=reviewFile&&fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile)):null;
   const validated=await page.evaluate(async({sample,c,review})=>{
    const p=sample.variant==='photo'?c.photoParams:c.params;let md=cleanMd(sample.text),applied=0;
    if(review){const old=caps.sample;caps.sample=async()=>({text:review.text});try{const r=await reviewConspect(md,p,null,sample.subject==='ru'||sample.subject==='lit'?'conspect':'lesson');md=r.md;applied=r.n;}finally{caps.sample=old;}}
    return {case:sample.case,finish_reason:sample.finish_reason,characters:md.length,applied,issues:LessonQuality.issues(md,p,'lesson'),md};
   },{sample,c,review});
   results.push(validated);
  }
  fs.writeFileSync(path.join(out,'validated-model.json'),JSON.stringify(results,null,2));
  assert.equal(results.filter(x=>x.case.endsWith('-plain')).length,24);
  assert(results.every(x=>x.finish_reason==='stop'&&x.characters>=2500),'Model returned an incomplete document');
  assert.deepEqual(results.filter(x=>x.issues.length).map(x=>({case:x.case,issues:x.issues})),[]);
 }
 const retained=await page.evaluate(async()=>{
  const old={state:{...state},read:readForm,type:updateType,allow:Access.canBuildAsync,configured:AI.configured,notes:{...Notes.draft,files:[...Notes.draft.files]}};
  try{
   state.subject='math';state.topic='Сложение дробей с одинаковыми знаменателями';state.grade=5;state.control='school';state.formats={lesson:true};state.extra={};state.gen=null;
   readForm=()=>{};updateType=()=>{state.type={id:'onz',name:'Изучение нового',reason:''}};Access.canBuildAsync=async()=>false;AI.configured=()=>true;
   Notes.draft.prompt='Сохранить мои страницы';Notes.draft.files=[{name:'page.jpg',fromPhoto:true,text:'Страница 42. Упражнение 127. Вычислите 2 + 3.'}];
   await createLesson();return Notes.draft.files.length===1&&Notes.draft.prompt==='Сохранить мои страницы';
  }finally{Object.assign(state,old.state);readForm=old.read;updateType=old.type;Access.canBuildAsync=old.allow;AI.configured=old.configured;Object.assign(Notes.draft,old.notes);}
 });assert(retained,'Denied access must preserve the teacher photo draft');
 await page.evaluate(()=>paintCosts());assert.equal(await page.locator('#btnCreate .btn-cost').count(),0,'Creation must not advertise refinement-point spending');
 const accounting=await page.evaluate(async()=>{
  const old={run:runJobContent,save:saveLesson,config:AccountsBackend.config,session:Object.getOwnPropertyDescriptor(Account,"session"),db:Account.db,refresh:Account.refreshPlan,count:Access.countLesson,commercial:Access.commercial,dev:Access.isDev,promo:Access.promoFree,set:AI.setCreationLesson};
  let context=[],count=0;
  try{
   AccountsBackend.config=()=>({provider:'pocketbase'});Object.defineProperty(Account,'session',{configurable:true,get:()=>({uid:'fixture'})});Account.db=async()=>[];Account.refreshPlan=async()=>{};Access.commercial=()=>true;Access.isDev=()=>false;Access.promoFree=()=>false;Access.countLesson=async()=>{count++};AI.setCreationLesson=id=>context.push(id);
   runJobContent=async L=>{L.docs.lesson='Прочитайте параграф учебника.';L.status.lesson='ok'};saveLesson=async()=>{};
   const L={id:'quality-fixture',docs:{},status:{}};
   await runJob(L,{subject:'math'},null,[],['lesson'],true,false);
   const flagged=L.status.lesson==='err'&&L.contentCheck.issues.lesson.length===1;
   saveLesson=async()=>{throw Error('storage fixture')};let rejected=false;
   try{await runJob({id:'quality-error-fixture',docs:{},status:{}},{subject:'math'},null,[],['lesson'],true,false)}catch(e){rejected=e.message==='storage fixture'}
   return {flagged,rejected,count,context};
  }finally{runJobContent=old.run;saveLesson=old.save;AccountsBackend.config=old.config;Object.defineProperty(Account,"session",old.session);Account.db=old.db;Account.refreshPlan=old.refresh;Access.countLesson=old.count;Access.commercial=old.commercial;Access.isDev=old.dev;Access.promoFree=old.promo;AI.setCreationLesson=old.set;}
 });
 assert(accounting.flagged);assert(accounting.rejected);assert.equal(accounting.count,2);assert.deepEqual(accounting.context,['quality-fixture','','quality-error-fixture','']);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'prompts.json'),JSON.stringify(generated,null,2));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({subjects:cases.length,photoAndNoPhoto:true,scopedEditsRetainPhotos:true,worksheetAnchor:true,conversionPreservesTheoryAndExamples:true,browserErrors:errors},null,2));
 console.log('PASS: actual browser prompt builders for all 24 subjects; page evidence, worksheet anchor, scoped edits, source-safe conversion.');
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
