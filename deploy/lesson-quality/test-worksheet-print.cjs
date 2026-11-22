'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../..'), output = process.env.WORKSHEET_PRINT_OUTPUT || path.join(root, 'work/worksheet-print');
const types = { js: 'application/javascript', html: 'text/html; charset=utf-8', css: 'text/css', json: 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader('Content-Type', types[path.extname(file).slice(1)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ serviceWorkers: 'block', viewport: { width: 1440, height: 980 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.text().startsWith('Печать:')) console.log(msg.text()); });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/?go=builder&subject=math&grade=7');
    await page.waitForFunction(() => window.state?.learnReady);
    const limitControl = page.locator('#wsPages');
    assert.equal(await limitControl.inputValue(), '2');
    assert.deepEqual(await limitControl.locator('option').evaluateAll(options => options.map(option => option.value)), ['1','2','3','4']);
    const worksheetCheck = page.locator('#formats input[value="worksheet"]');
    await worksheetCheck.uncheck(); assert.equal(await limitControl.isVisible(), false);
    await worksheetCheck.check(); assert.equal(await limitControl.isVisible(), true);
    await page.evaluate(async () => {
      await Promise.all([Plans.ensure('math'), Kits.ensure('math')]);
      const title = 'Числа и вычисления. Рациональные числа';
      const tasks = Array.from({ length: 12 }, (_, i) => '### Задание ' + (i + 1) + '\n\n' +
        'Сравните дроби −' + (i + 2) + '/17 и −1/17. Объясните, какая дробь расположена левее на числовой прямой.\n\n[ ________________________________________ ]');
      window.printFixture = { title, tasks };
      window.printLessons = {};
      Access.techAllowed = () => true;
      Access.canBuildAsync = async () => true;
      AI.configured = () => true;
      AI.sample = async () => ({ text: title });
      Subjects.webFacts = async () => null;
      caps.sample = async prompt => {
        const kit = Subjects.plugin('math'), p = { subject: 'math', topic: title, grade: 7, duration: 45, control: 'school' }, type = kit.detectType(p);
        if (prompt.includes('"fixes"')) return { text: '{"fixes":[]}' };
        if (prompt.includes('МЕТОДИЧЕСКИЙ ЗАМЫСЕЛ урока')) return { text: 'Сравнить дроби. Объяснить сравнение на числовой прямой.' };
        if (prompt.includes('Формат техкарты: две таблицы')) return { text: kit.conspect(p, type) };
        if (prompt.includes('## Рабочий лист ученика')) return { text: '# ' + title + '\n\n' + tasks.join('\n\n') + '\n\n# Ответы и критерии для учителя\n\nОтдельные ключи.' };
        return { text: kit.lesson(p, type) };
      };
      for (const input of document.querySelectorAll('#formats > .check > input:not([id])')) input.checked = ['lesson','conspect','worksheet'].includes(input.value);
    });
    const measures = [];
    for (const [limit, count] of [[1,3],[2,5],[3,7],[4,9]]) {
      await limitControl.selectOption(String(limit));
      const checked = await page.evaluate(async ({ limit, count }) => {
        document.querySelector('#topic').value = printFixture.title;
        const L = await createLesson();
        if (!L) throw new Error('Урок не сохранён');
        printLessons[limit] = L;
        const getTask = item => Conv.fix(item.split('\n\n')[1].split('. ')[0], 'math', 'lesson');
        const pupil = wsDocuments(L.docs.worksheet).main;
        const teacher = L.docs.lesson;
        const pages = await withPrintStage(async stage => (await wsBuildPages(L, stage)).map(p => p.querySelectorAll('.ws-card').length));
        const record = await Store.get('lessons', L.id);
        return { selected: L.params.wsPages, saved: record?.wsAllocated && record?.params.wsPages === limit,
          tasks: (pupil.match(/^### Задание /gm) || []).length, pages,
          moved: printFixture.tasks.slice(count).every(item => teacher.includes(getTask(item)) && L.docs.conspect.includes(getTask(item))),
          duplicates: printFixture.tasks.slice(count).some(item => pupil.includes(getTask(item))),
          keys: wsDocuments(L.docs.worksheet).appendix.includes('Отдельные ключи.'),
          plan: teacher.includes(limit <= 2 ? 'в обычных тетрадях' : 'Основная практика проходит на рабочем листе'),
          prompt: L.prompts.worksheet.includes('до ' + count + ' заданий') };
      }, { limit, count });
      measures.push(checked);
      console.log('Проверен лимит', limit, 'выгрузка на', checked.pages.length, 'стр.');
      assert.equal(checked.selected, limit);
      assert.equal(checked.tasks, count, JSON.stringify(checked));
      assert(checked.pages.length <= limit && checked.pages.length >= (limit >= 3 ? limit : 1), JSON.stringify(checked));
      assert(checked.pages.every(n => n > 0), JSON.stringify(checked));
      assert(checked.moved && checked.saved && checked.keys && checked.plan && checked.prompt && !checked.duplicates, JSON.stringify(checked));
    }
    const overflow = await page.evaluate(async () => {
      const p = { subject: 'math', grade: 7, wsPages: 1, formats: ['lesson','worksheet'] };
      const tooLong = 'Условие задачи не должно теряться. ' + 'Данные для чтения. '.repeat(600);
      const L = { title: 'Проверка диапазона', params: p, docs: {
        worksheet: '# Проверка диапазона\n\n### Задание 1\n\n' + tooLong + '\n\n' + printFixture.tasks[1],
        lesson: '# Конспект\n\n## ЭТАП 1. Практика · 45 мин\n\nРазбор решения.'
      } };
      await fitGeneratedWorksheet(L, p);
      return { moved: L.docs.lesson.includes(tooLong.trim()), hasSpace: L.docs.worksheet.includes('### Задание 2'),
        pages: await withPrintStage(async stage => (await wsBuildPages(L, stage)).length) };
    });
    assert.deepEqual(overflow, {moved:true,hasSpace:true,pages:1});
    await page.evaluate(() => openLesson(printLessons[3], 'worksheet', false));
    await page.waitForFunction(() => document.querySelectorAll('#sheet .ws-page').length === 3);
    assert.equal(await page.locator('#wsPrintMode').inputValue(), 'standard');
    await page.locator('#wsPrintMode').selectOption('two-up');
    assert.equal(await page.locator('#wsPrintHelp').isVisible(), true);
    const exports = await page.evaluate(async () => {
      const L = printLessons[3];
      const buffer = blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      console.log('Печать: PNG');
      const canvases = await docToPngCanvases(L);
      console.log('Печать: PDF');
      const pdf = await docToPdfBlob(L, 'worksheet');
      console.log('Печать: Word');
      const [[filename, word], [keys]] = await docxBlobs(L, 'worksheet');
      console.log('Печать: стандартный PDF');
      const standard = await docToPdfBlob(L, 'worksheet', 'standard');
      console.log('Печать: получение файлов');
      return { filename, keys, pdf: await buffer(pdf), word: await buffer(word), standard: await buffer(standard),
        png: await Promise.all(canvases.map(cv => new Promise(resolve => cv.toBlob(blob => resolve(buffer(blob)))))) };
    });
    assert.match(exports.filename, /2 копии/); assert.doesNotMatch(exports.keys, /2 копии/);
    assert.equal(exports.png.length, 3);
    fs.writeFileSync(path.join(output, 'economy.pdf'), Buffer.from(exports.pdf, 'base64'));
    fs.writeFileSync(path.join(output, 'economy.docx'), Buffer.from(exports.word, 'base64'));
    fs.writeFileSync(path.join(output, 'standard.pdf'), Buffer.from(exports.standard, 'base64'));
    for (const [i, png] of exports.png.entries()) fs.writeFileSync(path.join(output, 'side-' + (i + 1) + '.png'), Buffer.from(png, 'base64'));
    const marker = 'Добавленная строка для проверки отмены.';
    await page.evaluate(async marker => {
      await ensureTurndown();
      const sheet = document.querySelector('#sheet');
      sheet.querySelector('.ws-card p').append(' ' + marker);
      sheet.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    }, marker);
    await page.waitForFunction(marker => state.lesson.docs.worksheet.includes(marker), marker);
    await page.locator('#btnUndo').click();
    await page.waitForFunction(marker => !state.lesson.docs.worksheet.includes(marker), marker);
    await page.locator('#btnRedo').click();
    await page.waitForFunction(marker => state.lesson.docs.worksheet.includes(marker), marker);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 980 });
      await page.evaluate(() => window.scrollTo(0, document.querySelector('#sheet').getBoundingClientRect().top + scrollY + 550));
      const metrics = await page.locator('#docEditActions').evaluate(toolbar => {
        const rect = toolbar.getBoundingClientRect(), bar = document.querySelector('.topbar').getBoundingClientRect();
        return { x: rect.x, right: rect.right, top: rect.top, header: bar.bottom, sticky: getComputedStyle(toolbar).position };
      });
      assert(metrics.sticky === 'sticky' && metrics.x >= 0 && metrics.right <= width && metrics.top >= metrics.header - 2 && metrics.top < 600, JSON.stringify({width,metrics}));
    }
    await page.screenshot({path: path.join(output, 'toolbar.png')});
    fs.writeFileSync(path.join(output, 'layout.json'), JSON.stringify(measures, null, 2));
    assert.deepEqual(errors, []);
    console.log('PASS: page volume, practice transfer, two-copy downloads, keyboard-accessible controls and sticky undo/redo.');
  } finally {
    await browser.close(); server.close();
  }
})().catch(error => { console.error(error.stack); server.close(); process.exitCode = 1; });
