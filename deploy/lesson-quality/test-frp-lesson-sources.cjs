'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../..');
const fixtureOrigin = 'https://lesson.test';
const mime = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const poem = 'Чёрный вечер.\nБелый снег.\nВетер, ветер!\nНа ногах не стоит человек.\n\nВетер, ветер —\nНа всём божьем свете!\nЗавивает ветер\nБелый снежок.';
const translated = 'Быть или не быть — вот в чём вопрос. Достойно ль смиряться под ударами судьбы или нужно оказать сопротивление?';
const english = 'To be, or not to be, that is the question. Whether it is nobler for the mind to suffer the slings and arrows of outrageous fortune.';
const sourcePage = (title, author, text, verse = false) => ({ parse: { title, text: { '*': `<div class="mw-parser-output"><span class="ws-author">${author}</span>${verse ? '<div class="poem">' : ''}<p>${text.replace(/\n/g, '<br>')}</p>${verse ? '</div>' : ''}</div>` } } });
const fixture = (name, fallback) => process.env.WIKISOURCE_FIXTURES
  ? JSON.parse(fs.readFileSync(path.join(process.env.WIKISOURCE_FIXTURES, `${name}.json`), 'utf8')) : fallback;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'ru.wikisource.org') {
        const name = url.searchParams.get('page');
        const lookup = url.searchParams.get('srsearch') || '';
        let json = {};
        if (name === 'Двенадцать (Блок)') json = fixture('blok', sourcePage(name, 'Александр Александрович Блок', poem, true));
        else if (name === 'Двенадцать') json = sourcePage(name, 'Владимир Соловьёв', 'Автор рассуждает о поэме и её значении. '.repeat(6));
        else if (name === 'Гамлет (Шекспир; Кронеберг)') json = fixture('hamlet', sourcePage(name, 'Вильям Шекспир', translated));
        else if (name === 'Гамлет (Шекспир; Кронеберг)/ПСС 1902 (ВТ:Ё)' && process.env.WIKISOURCE_FIXTURES) json = fixture('hamlet-edition');
        else if (name?.startsWith('Гамлет (Шекспир; Кронеберг)/ПСС 1902 (ВТ:Ё)/Действие ') && process.env.WIKISOURCE_FIXTURES) json = fixture(`hamlet-act-${name.split(' ').at(-1)}`);
        else if (name?.startsWith('Гамлет')) json = sourcePage(name, 'Вильям Шекспир', english);
        else if (lookup.includes('Гамлет')) json = { query: { search: [{ title: 'Гамлет (Шекспир; Кронеберг)' }] } };
        else if (lookup.includes('Двенадцать')) json = { query: { search: [{ title: 'Двенадцать (статья)' }] } };
        return route.fulfill({ json });
      }
      if (url.origin !== fixtureOrigin) return route.fulfill({ status: 404, body: '' });
      const file = path.resolve(root, decodeURIComponent(url.pathname).slice(1) || 'index.html');
      if (!file.startsWith(root + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: mime[path.extname(file)], body: fs.readFileSync(file) });
    });
    await page.goto(fixtureOrigin);
    await page.waitForFunction(() => window.Layout && window.LessonNotes && window.SlideEditor && window.marked);
    const result = await page.evaluate(async pdfSmoke => {
      await Base.ready();
      await FRP.load();
      await Promise.all(['eng', 'inf', 'chem', 'orkse'].map(subject => Plans.ensure(subject)));
      const topics = [
        ['eng', 9, 'Монологическая речь'], ['bio', 9, 'Кровообращение'],
        ['hist', 5, 'Работа с исторической картой'], ['math', 10, 'График функции'], ['vis', 9, 'Вероятность случайного события'],
        ['mus', 6, 'Народные музыкальные инструменты'], ['obzh', 8, 'Безопасность на транспорте'],
        ['tech', 5, 'Робототехника'], ['pe', 10, 'Баскетбол'], ['any', 5, 'Нравственные ценности']
      ];
      const programs = topics.map(([subject, grade, topic]) => frpTechResults({ subject, grade, topic, anyName: 'Духовно-нравственная культура России' }));
      const gradePrograms = [
        ['eng', 9, 'Взаимоотношения в семье и с друзьями: чтение'], ['eng', 5, 'Моя семья: лексика'],
        ['chem', 8, 'Воздух – смесь газов. Состав воздуха. Загрязнение воздуха'], ['inf', 7, 'Информация и информационные процессы'], ['orkse', 4, 'Ислам']
      ].map(([subject, grade, topic]) => {
        const result = frpTechResults({ subject, grade, topic });
        return { subject, grade, result, source: FRP.pick(subject, grade)?.name };
      });
      const literary = [[11, 'А. А. Блок. Поэма «Двенадцать». Анализ'], [10, 'Л. Н. Толстой. Роман-эпопея «Война и мир»'], [7, 'А. С. Пушкин. Поэма «Полтава»']];
      const literatureResults = literary.map(([grade, topic]) => {
        const picked = frpTechResults({ subject: 'lit', grade, topic });
        const program = FRP.pick('lit', grade);
        const official = key => (key === 'subject' ? program.subject[grade] : program[key]).flatMap(({ items }) => items);
        const exact = key => official(key).some(text => picked[key] === text || official(key).some(next => picked[key] === `${text}; ${next}`));
        return { picked, matchesProgram: ['personal', 'meta', 'subject'].every(exact) && picked.source === program.name };
      });
      const unknownWork = frpTechResults({ subject: 'lit', grade: 11, topic: 'Несуществующий автор. «Несуществующее произведение»' });
      const misplacedWork = frpTechResults({ subject: 'lit', grade: 7, topic: literary[0][1] });
      const byTitle = frpTechResults({ subject: 'lit', grade: 11, topic: 'Двенадцать' });
      const badGrade = frpTechResults({ subject: 'bio', grade: 8, topic: 'Кровеносная система человека' });
      const savedMaterials = state.materials;
      state.materials = [
        { name: 'Нужная глава', subject: 'bio', gradeRange: [8, 9], fromArchive: true, kind: 'textbook', text: 'Кровообращение переносит вещества по организму.\n\nСловарь минералов и горных пород.' },
        { name: 'Другой класс', subject: 'bio', grade: 7, fromArchive: true, pinned: true, text: 'Кровообращение изучают в этом разделе.' },
        { name: 'Другой предмет', subject: 'chem', grade: 9, fromArchive: true, text: 'Кровообращение упоминается в другом предмете.' }
      ];
      const excerpts = relevantMaterials('Кровообращение', 9, 'bio');
      state.materials = savedMaterials;
      const technical = `| Этап | Учитель | Ученики | УУД |\n|---|---|---|---|\n| 1. Анализ или чтение (10 мин) | Читаем строки | Сравнивают | Выдуманный результат |\n| 2. Итог (5 мин) | Формулируем вывод | Отвечают | |`;
      const draft = `# Пример\n\n${technical}\n\n| УЧИТЕЛЬ | «Слайд 6. Рассмотрите карту» |\n\nОшибка: Был на уроке.\nИсправление: Была на уроке.\nОшибка: Они идет.\nИсправление: Они идут.\n\n~~~js\n| a | b |\n~~~`;
      const repaired = Layout.repair(draft);
      const body = new DOMParser().parseFromString(mdToHtml(repaired), 'text/html').body;
      const headers = [...body.querySelectorAll('table:last-of-type th')].map(node => node.textContent);
      const original = await Base.wikisourceText('Двенадцать Блок', 400000, { title: 'Двенадцать', author: 'А. А. Блок' });
      const wrongAuthor = await Base.wikisourceText('Двенадцать Блок', 400000, { title: 'Двенадцать', author: 'А. С. Пушкин' });
      const hamlet = await Base.wikisourceText('Гамлет Шекспир', 400000, { title: 'Гамлет', author: 'У. Шекспир' });
      const p = { subject: 'lit', topic: 'А. А. Блок. Поэма «Двенадцать»', grade: 11, duration: 45, lessonNo: 1, formats: [] };
      const type = p.type = Engine.detectType(p);
      pendingPlan = { key: planKey(p), plan: await Variety.prepare(p, type) };
      const found = await checkWorkText(p, type);
      p.topic += '. Анализ';
      const lesson = { built: 'noai' };
      await preparePlan(lesson, p, type);
      const map = normalizeTechmap(draft, p);
      const notes = LessonNotes.build(map, p);
      const mapHtml = techmapHtml(map);
      const savedMap = map.replace(/^\| (Личностные|Метапредметные|Предметные) \| .*$/gm, '| $1 | Формулировка для этой темы в доступной ФРП не найдена |');
      const deckMarkdown = Deck.toMarkdown(Deck.outline(map, p, type));
      const verseHtml = mdToHtml(cleanDeck(deckMarkdown));
      const strict = normalizeTechmap(technical, { subject: 'bio', grade: 9, topic: 'Кровообращение', duration: 45, type });
      const doc = { title: p.topic, params: p, docs: { conspect: map, lesson: notes } };
      await loadScript('jszip');
      const documentXml = async key => {
        const [, blob] = (await docxBlobs(doc, key))[0];
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        return zip.file('word/document.xml').async('text');
      };
      const mapXml = await documentXml('conspect'), notesXml = await documentXml('lesson');
      const pdf = pdfSmoke ? await docToPdfBlob({ params: p, docs: { conspect: strict } }, 'conspect') : null;
      const parsed = splitSlides('## Словарь терминов\n\n- Повтор.\n\n## 🧪 Проверка знаний: тест по теме\n\n![QR](idb:qr)\n\n- Наведите камеру.\n- Впишите имя.\n- Решите тест.\n\n<!--@ {"kind":"qr"} -->');
      return {
        programs, gradePrograms, literatureResults, unknownWork, misplacedWork, byTitle, repairedSavedMap: normalizeTechmap(savedMap, p) === map, badGrade, excerpts, headers, tables: body.querySelectorAll('table').length, code: body.querySelector('pre').textContent,
        idempotent: Layout.repair(repaired) === repaired, original, wrongAuthor, hamlet: hamlet?.title, translated: Base.russianWorkText(hamlet?.text),
        sameText: p.plan.text === original.text, found, plan: lesson.plan.textSource, mapHtml, notes, verseHtml: /Черн|Чёрн/.test(verseHtml) && /<br>Белый снег\./.test(verseHtml), strict,
        mapTables: (mapXml.match(/<w:tbl>/g) || []).length, mapBreaks: (mapXml.match(/<w:br\/>/g) || []).length,
        originalInExport: mapXml.includes('Белый снег') && notesXml.includes('Белый снег'), twoSlides: parsed.length,
        literatureRowsInExport: ['personal', 'subject'].every(key => new DOMParser().parseFromString(mapXml, 'application/xml').documentElement.textContent.includes(literatureResults[0].picked[key])),
        pdfSignature: pdf ? await pdf.slice(0, 4).text() : null
      };
    }, !!process.env.PDF_SMOKE);
    for (const p of result.programs) assert.ok(p?.source?.includes('.pdf') && p.goal && p.subject, JSON.stringify(p));
    for (const { result: row, source } of result.gradePrograms) assert.ok(row?.source === source && row.goal && row.personal && row.meta && row.subject, JSON.stringify(row));
    assert.match(result.gradePrograms[0].result.subject, /^смысловое чтение:/i);
    assert.match(result.gradePrograms[1].result.subject, /лексическ.*единиц/i);
    assert.ok(result.literatureResults.every(x => x.matchesProgram), JSON.stringify(result.literatureResults));
    assert.match(result.literatureResults[0].picked.meta, /развёрнуто и логично излагать.*анализа литературного произведения/i);
    assert.doesNotMatch(result.literatureResults[0].picked.meta, /нематериальных ресурсов/i);
    for (const p of [result.unknownWork, result.misplacedWork]) assert.ok(['goal', 'personal', 'meta', 'subject'].every(key => !p[key]), JSON.stringify(p));
    assert.doesNotMatch(result.mapHtml, /Формулировка для этой темы в доступной ФРП не найдена/);
    assert.ok(result.byTitle.goal && result.byTitle.subject && result.literatureRowsInExport && result.repairedSavedMap);
    assert.equal(result.badGrade.subject, '');
    assert.deepEqual(result.excerpts.map(x => [x.name, x.text]), [['Нужная глава', 'Кровообращение переносит вещества по организму.']]);
    assert.deepEqual(result.headers, ['Текст с ошибкой', 'Исправление']);
    assert.equal(result.tables, 3);
    assert.match(result.code, /\| a \| b \|/);
    assert.ok(result.idempotent);
    assert.match(result.original.text, /Ч[её]рный вечер\.\nБелый снег\./);
    assert.ok(result.original.verse && result.original.text.includes('\n\n'));
    assert.equal(result.wrongAuthor, null);
    assert.match(result.hamlet || '', /Кронеберг/);
    assert.ok(result.translated && result.sameText && result.found && result.plan.includes('Викитека'));
    assert.match(result.mapHtml, /Ч[её]рный вечер\.<br>Белый снег\./);
    assert.match(result.notes, /Ч[её]рный вечер\.<\/em><br><em>Белый снег\./);
    assert.ok(result.verseHtml && result.mapTables >= 2 && result.mapBreaks >= 2 && result.originalInExport);
    assert.doesNotMatch(result.strict, /Выдуманный результат/);
    assert.match(result.strict, /Источник ФРП\s*\|.+Биология.+\.pdf/);
    assert.equal(result.twoSlides, 2);
    if (process.env.PDF_SMOKE) assert.equal(result.pdfSignature, '%PDF');
    assert.deepEqual(errors, []);
    console.log('PASS: official FRP by subject and grade, table repair, Russian originals and translation, verse in HTML and DOCX, separate legacy QR slide.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
