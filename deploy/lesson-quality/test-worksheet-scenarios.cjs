'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'work/worksheet-scenarios');
const kinds = { js:'application/javascript', html:'text/html; charset=utf-8', css:'text/css', json:'application/json', woff2:'font/woff2' };
const server = http.createServer((req,res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.statSync(file,{throwIfNoEntry:false})?.isFile()) {
    res.writeHead(404);res.end();return;
  }
  res.setHeader('Content-Type', kinds[path.extname(file).slice(1)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  fs.mkdirSync(out,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:' + server.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:980},acceptDownloads:true});
    await context.route('**/*', route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const page=await context.newPage(), errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    await page.goto(base+'/?go=builder&subject=math&grade=7');
    await page.waitForFunction(()=>window.state?.learnReady);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(()=>window.state?.learnReady);
    assert.equal(await page.locator('#btnCreateLocal').count(),0);
    assert.deepEqual(await page.evaluate(()=>[state.stage,state.subject,state.grade]),['middle','math',7]);
    await context.setOffline(false);
    const assembly=await page.evaluate(async()=>{
      await Promise.all([Plans.ensure('math'), Kits.ensure('math')]);
      const topic='Числа и вычисления. Рациональные числа';
      const modes=[
        {name:'default',worksheet:true}, {name:'notebook'},
        {name:'check-sheet',worksheet:true,ctrl:'check',keys:false}, {name:'test-notebook',ctrl:'test',variants:true,keys:true},
        {name:'self-variants',ctrl:'self',variants:true,keys:true}, {name:'outage',worksheet:true,ctrl:'check',keys:true,outage:true}
      ];
      const results=[];
      for(const mode of modes){
        const formats=['lesson','conspect',...(mode.worksheet?['worksheet']:[]),...(mode.ctrl?['control']:[])];
        const p={subject:'math',topic,grade:7,duration:45,level:'medium',mode:'school',control:'school',lessonNo:1,extra:{ctrl:mode.ctrl,variants:mode.variants,keys:mode.keys},formats,web:null};
        const plugin=Subjects.plugin('math');p.type=plugin.detectType(p);
        const record={id:'ws-test-'+mode.name,title:topic,status:{},docs:{},params:p,built:'ai'};
        const sample=caps.sample, configured=AI.configured;
        AI.configured=()=>true;
        caps.sample=async prompt=>{
          if(mode.outage)throw {code:'network',message:'fixture outage'};
          if(prompt.includes('МЕТОДИЧЕСКИЙ ЗАМЫСЕЛ урока'))return {text:'Сравнить дроби и проверить знаки.'};
          if(prompt.includes('"fixes"'))return {text:'{"fixes":[]}'};
          if(prompt.includes('Формат техкарты: две таблицы'))return {text:plugin.conspect(p,p.type)};
          if(prompt.includes('Составь рабочий лист ученика'))return {text:plugin.worksheet(p,p.type)};
          return {text:plugin.lesson(p,p.type)};
        };
        try { await runJob(record,p,p.type,['conspect',...formats.filter(doc=>doc!=='conspect')],formats,true,false); }
        finally { caps.sample=sample;AI.configured=configured; }
        const docs=record.docs;
        const minutes=(md,re)=>[...String(md||'').matchAll(re)].map(x=>+x[1]);
        const control=docs.control || '', map=docs.conspect || '', notes=docs.lesson || '';
        const prompt=mode.outage?'':record.prompts?.conspect || '';
        results.push({mode, built:record.built, files:Object.keys(docs).sort(),mapTimes:minutes(map,/^\| Блок \d+\..*?\((\d+)\s+мин\) \|$/gm),noteTimes:minutes(notes,/^## ЭТАП \d+\..*?· (\d+)\s+мин$/gm),
          mapForms:(map.match(/Форма работы/g)||[]).length,noteForms:(notes.match(/Форма работы/g)||[]).length,notebook: /С новой строки запишите дату и тему/.test(notes), sheetReference:/рабоч(?:ий|ем|его) лист/i.test(map+notes),
          control, map, notes, prompt, worksheet:docs.worksheet||''});
      }
      return results;
    });
    fs.writeFileSync(path.join(out,'assembly.json'),JSON.stringify(assembly,null,2));
    for(const result of assembly){
      const {mode,mapTimes,noteTimes,control,map,notes}=result;
      assert(result.files.includes('lesson') && result.files.includes('conspect'), mode.name);
      assert.equal(result.built, mode.outage?'noai':'ai');
      assert.equal(result.files.includes('worksheet'), !!mode.worksheet);
      if(!mode.worksheet || mode.ctrl){
        assert.equal(mapTimes.reduce((a,b)=>a+b,0),45,mode.name+' tech map');
        assert.equal(noteTimes.reduce((a,b)=>a+b,0),45,mode.name+' notes');
      }
      if(!mode.worksheet){
        assert.equal(result.sheetReference,false, mode.name);
        assert(result.notebook,mode.name);
        assert.equal(result.mapForms,mapTimes.length);assert.equal(result.noteForms,noteTimes.length);
        assert.match(result.prompt,/Работа в тетради/);
      }
      if(!mode.ctrl) continue;
      const minutes={self:10,check:15,test:20}[mode.ctrl];
      assert.match(control,new RegExp(`Время:\\*\\* ${minutes}\\s+мин`));
      const task=control.match(/### Задание 1\n\n([^\n]+)\n/)?.[1];
      assert(task,mode.name);assert(map.includes(task)&&notes.includes(task),mode.name);
      assert.equal(control.includes('## Вариант 2'),!!mode.variants);
      assert.equal(control.includes('Ключи и критерии для учителя'),!!mode.keys);
      if(mode.variants){
        const variants=control.split(/^## Вариант \d+/m).slice(1);
        assert.notEqual(variants[0].match(/Задание 1\n\n([^\n]+)/)?.[1],variants[1].match(/Задание 1\n\n([^\n]+)/)?.[1]);
      }
      if(!mode.outage)assert(result.prompt.includes(task));
      if(mode.worksheet)assert(!result.worksheet.includes('Вариант 2'));
    }
    const subjects=[['math',7,'Числа и вычисления. Рациональные числа'],['hist',7,'Великие географические открытия'],['eng',5,'Моя семья: лексика'],['bio',10,'Биология в системе наук'],['lit1',1,'Выделение предложения из речевого потока'],['obzh',8,'Роль безопасности'],['orkse',4,'Россия — наша Родина']];
    const golden=await page.evaluate(async subjects=>{
      const out=[];
      for(const [subject,grade,topic] of subjects){
        await Promise.all([Plans.ensure(subject),Kits.ensure(subject)]);
        const kit=Subjects.plugin(subject), p={subject,grade,topic,duration:45,mode:'school',control:'school',lessonNo:1,formats:['worksheet','lesson'],extra:{}};
        const type=kit.detectType(p), md=kit.worksheet(p,type), docs=wsDocuments(md);
        const prompt=pluginPrompt('worksheet',p,type,md,kit,'СОГЛАСОВАННЫЙ СЦЕНАРИЙ');
        const photoPrompt=pluginPrompt('worksheet',{...p,notes:{files:[{name:'Учебник.jpg',fromPhoto:true,text:'Страница 42. Упражнение 127. Приведите пример по теме «'+topic+'».'}]}},type,md,kit,'СОГЛАСОВАННЫЙ СЦЕНАРИЙ');
        const L={title:topic,params:p,docs:{worksheet:md}};
        const pages=await withPrintStage(async stage=>(await wsBuildPages(L,stage)).length);
        out.push({subject,grade,topic,pages,chars:docs.main.length,hasAnchor:prompt.includes('СОГЛАСОВАННЫЙ СЦЕНАРИЙ'),hasPolicy:/5–7 заданий/.test(prompt),hasPhotoRule:photoPrompt.includes('число страниц по объёму'),fixedTwo:/РОВНО 2 полностью|на две страницы|за пределами двух страниц/i.test(prompt+'\n'+photoPrompt)});
      }
      return out;
    },subjects);
    fs.writeFileSync(path.join(out,'golden.json'),JSON.stringify(golden,null,2));
    assert(golden.every(row=>row.chars>200 && row.pages>0 && row.hasAnchor && row.hasPolicy && row.hasPhotoRule && !row.fixedTwo));
    const variantChecks=await page.evaluate(async()=>{
      const checks=[];
      for(const [subject,grade,topic] of [['phys',7,'Плотность вещества'],['obzh',8,'Роль безопасности']]){
        await Promise.all([Plans.ensure(subject),Kits.ensure(subject)]);
        const kit=Subjects.plugin(subject);
        for(const variants of [false,true]){
          const p={subject,grade,topic,duration:45,formats:['lesson','control'],extra:{ctrl:'check',keys:true,variants}};
          const type=kit.detectType(p);
          prepareAssessment({id:'ws-variant-fixture'},p,type,kit);
          checks.push({subject,variants,document:p.assessment.md});
        }
      }
      return checks;
    });
    for(const {subject,variants,document} of variantChecks){
      assert.equal(/^#{2,3} Вариант 2$/m.test(document),variants,subject);
      assert.equal(/^Вариант 2:/m.test(document),subject==='phys' && variants,subject);
      assert.match(document,/Ключи и критерии для учителя/);
      assert.equal(document.includes('номер варианта'),variants,subject);
    }
    const arithmetic=await page.evaluate(async()=>{
      const p={subject:'math',grade:2,topic:'2.1 Сложение и вычитание',duration:45,formats:['worksheet','control'],extra:{ctrl:'check',keys:true,variants:true}};
      const kit=Subjects.plugin('math'),type=kit.detectType(p),L={id:'primary-arithmetic',title:p.topic,params:p,docs:{worksheet:kit.worksheet(p,type)}};
      prepareAssessment(L,p,type,kit);
      const pages=await withPrintStage(stage=>wsBuildPages(L,stage).then(result=>result.map(page=>page.querySelectorAll('.blank').length)));
      return {...wsDocuments(L.docs.worksheet),assessment:p.assessment.md,pages};
    });
    assert.doesNotMatch(arithmetic.main,/параграф|ключи|ответы для учителя/i);
    assert.equal(arithmetic.pages.reduce((total,fields)=>total+fields,0),5);
    const calculations=text=>[...text.matchAll(/(\d+) ([+−]) (\d+) = \?/g)].map(([,a,op,b])=>op==='+'?+a + +b:+a - +b);
    const keyNumbers=text=>[...text.matchAll(/\d+\) (\d+)/g)].map(m=>Number(m[1]));
    assert.deepEqual(calculations(arithmetic.main),keyNumbers(arithmetic.appendix));
    assert(calculations(arithmetic.main).every(n=>n>=0 && n<=100));
    const [arithmeticQuestions,arithmeticKeys]=arithmetic.assessment.split(/^# Ключи и критерии для учителя/m);
    assert.deepEqual(calculations(arithmeticQuestions),keyNumbers(arithmeticKeys));
    assert.equal(calculations(arithmeticQuestions).length,6);
    const writing=await page.evaluate(()=>notebookText('Раздаёт рабочие листы. В рабочих листах ученики записывают ответ.\n> Рабочие листы — цитата.'));
    assert.equal(writing,'Просит открыть тетради. В тетрадях ученики записывают ответ.\n> Рабочие листы — цитата.');
    const fromBuilder=await page.evaluate(async()=>{
      const before={gate:Access.canBuildAsync,tech:Access.techAllowed,can:AI.configured,model:caps.sample,web:Subjects.webFacts};
      try{
        Access.canBuildAsync=async()=>true;Access.techAllowed=()=>true;AI.configured=()=>true;
        caps.sample=async()=>{throw {code:'network',message:'fixture outage'};};
        Subjects.webFacts=async()=>null;
        for(const input of document.querySelectorAll('#formats > .check > input:not([id])'))input.checked=['lesson','conspect','worksheet'].includes(input.value);
        document.querySelector('#topic').value='Числа и вычисления. Рациональные числа';
        document.querySelector('#xCtrl').value='check';document.querySelector('#xVar').checked=true;document.querySelector('#xKeys').checked=true;
        const L=await createLesson();
        return {formats:Object.keys(L.docs).sort(),built:L.built,control:L.docs.control,stage:L.docs.lesson?.match(/Проверочная работа · 15\s+мин/)!==null};
      }finally{Access.canBuildAsync=before.gate;Access.techAllowed=before.tech;AI.configured=before.can;caps.sample=before.model;Subjects.webFacts=before.web;}
    });
    assert.equal(fromBuilder.built,'noai');
    assert.deepEqual(fromBuilder.formats,['conspect','control','lesson','worksheet']);
    assert.match(fromBuilder.control,/Вариант 2/);assert.match(fromBuilder.control,/Ключи и критерии/);assert(fromBuilder.stage);
    const legacy=await page.evaluate(()=>wsDocuments('# Рабочий лист\n\n### Задание 1\n\nСравните дроби.\n\n# Продолжение\n\n### Задание 2\n\nПроверьте результат.\n\n# Для учителя\n\nКритерии.'));
    assert.match(legacy.main,/Задание 2/);assert.doesNotMatch(legacy.main,/Критерии/);assert.match(legacy.appendix,/Критерии/);
    const picture=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=54;canvas.height=32;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#202632';ctx.fillRect(2,16,50,2);
      const url=canvas.toDataURL('image/png'), L={title:'Сравнение чисел',params:{subject:'math',grade:7},art:{banner:{url,w:54,h:32}},docs:{worksheet:'# Сравнение чисел\n\n### Задание 1\n\nОтметьте числа −2 и 1 на прямой.\n\n[ _______ ]'}};
      await loadScript('jszip');
      const [,blob]=(await docxBlobs(L,'worksheet'))[0];
      const zip=await JSZip.loadAsync(await blob.arrayBuffer());
      return Object.keys(zip.files).some(file=>/^word\/media\/.+\.png$/.test(file));
    });
    assert(picture,'A worksheet illustration stays embedded in Word');
    const sizes=[{name:'small',n:6,parts:1,pages:1},{name:'medium',n:8,parts:4,pages:2},{name:'large',n:12,parts:4,pages:3}];
    for(const fixture of sizes){
      const result=await page.evaluate(async ({n,parts})=>{
        const check='[[Скрытые ключи для учителя]]';
        const item=i=>`### Задание ${i+1}. Сравните дроби\n\n`+Array.from({length:parts},(_,j)=>`**${j+1}.** Сравните −${(i%5)+2}/${j+7} и −1/${j+7}. Объясните, какое число расположено левее на координатной прямой.\n\n[ ________________________________________ ]`).join('\n\n');
        const content='# Числа и вычисления\n\n✍️ ФИО: _________ | 📅 Дата: _________\n\n'+Array.from({length:n},(_,i)=>item(i)).join('\n\n');
        const L={id:'ws-pages',title:'Числа и вычисления',params:{subject:'math',grade:7},docs:{worksheet:content+`\n\n### Ответы и критерии\n\n${check}`},status:{}};
        openLesson(L,'worksheet',false);await renderPreview();
        const metrics=$$('.ws-page',document.querySelector('#sheet')).map(el=>{
          const a=el.getBoundingClientRect(),g=el.querySelector('.ws-grid').getBoundingClientRect(),cs=getComputedStyle(el);
          const boxes=$$('.ws-grid-row',el).map(x=>x.getBoundingClientRect());
          const tag=el.querySelector('.ws-tag');
          return {tasks:$$('.ws-card',el).map(t=>t.querySelector('h3')?.textContent.trim()),font:parseFloat(getComputedStyle(el.querySelector('.ws-card p')).fontSize),padding:parseFloat(cs.paddingLeft),width:a.width,height:a.height,fill:g.height/(a.height-2*parseFloat(cs.paddingTop)),tagColor:tag?getComputedStyle(tag).color:null,
            paired:!!el.querySelector('.pair'),writing:!!el.querySelector('.blank, .ws-writing-line'),inside:boxes.every((b,i)=>b.left>=a.left+parseFloat(cs.paddingLeft)-1&&b.right<=a.right-parseFloat(cs.paddingRight)+1&&b.bottom<=a.bottom-parseFloat(cs.paddingBottom)+1&&(!i||b.top>=boxes[i-1].bottom)),answers:el.textContent.includes(check)};
        });
        const pdf=await docToPdfBlob(L,'worksheet');
        const canvases=await docToPngCanvases(L);
        const docs=await docxBlobs(L,'worksheet');
        const bytes=async blob=>Array.from(new Uint8Array(await blob.arrayBuffer()));
        let zip=[];
        if(n===6){
          const downloads=caps.downloads;
          caps.downloads={save:async({data})=>{zip=Object.keys((await JSZip.loadAsync(await data.arrayBuffer())).files);}};
          try{await exportZip(L);}finally{caps.downloads=downloads;}
        }
        return {metrics,zip,pdf:await bytes(pdf),png:await Promise.all(canvases.map(c=>new Promise(r=>c.toBlob(b=>r(bytes(b)))))),docx:await Promise.all(docs.map(async ([name,blob])=>[name,await bytes(blob)]))};
      },fixture);
      const {metrics}=result;
      assert.equal(metrics.length,fixture.pages,JSON.stringify(metrics));
      assert.equal(metrics.flatMap(p=>p.tasks).length,fixture.n);
      assert.equal(result.png.length,metrics.length);
      assert(metrics.every(p=>p.font>=16 && p.padding>=37.79 && p.padding<=45.36 && p.fill>=0.80 && p.inside && p.writing && !p.answers),JSON.stringify(metrics));
      assert(metrics.some(p=>p.paired));
      assert.equal(metrics[0].tagColor,'rgb(25, 21, 34)');
      assert.equal(result.docx.length,2);
      if(fixture.name==='small')assert.equal(result.zip.filter(name=>name.endsWith('.docx')).length,2);
      const prefix=path.join(out,fixture.name);
      fs.writeFileSync(prefix+'.pdf',Buffer.from(result.pdf));
      result.png.forEach((data,i)=>fs.writeFileSync(`${prefix}-${i+1}.png`,Buffer.from(data)));
      result.docx.forEach(([,data],i)=>fs.writeFileSync(prefix+(i?'-keys':'')+'.docx',Buffer.from(data)));
      fs.writeFileSync(prefix+'.json',JSON.stringify(metrics,null,2));
      await page.emulateMedia({media:'print'});
      await page.pdf({path:prefix+'-print.pdf',preferCSSPageSize:true,printBackground:true});
      await page.emulateMedia({media:'screen'});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: worksheet layouts, separation of answers, teacher scenarios, automatic fallback and offline launch.');
  } finally { await browser.close();server.close(); }
})().catch(error=>{console.error(error.stack);server.close();process.exitCode=1;});
