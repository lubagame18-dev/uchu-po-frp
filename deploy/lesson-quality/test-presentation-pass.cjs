'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../..');
const out = process.env.PRESENTATION_OUTPUT || path.join(root, 'work/presentation-pass');
const origin = process.env.PRESENTATION_ORIGIN || 'https://lesson.test';
const remote = origin !== 'https://lesson.test';
const curl = promisify(execFile);
const media = {
  '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'
};
const cache = new Map();

async function fixturePage(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width <= 768, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/^(?:Failed to load resource|Access to fetch at )/.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.recognitions = [];
    window.SpeechRecognition = class {
      constructor() { window.recognitions.push(this); }
      start() { this.starts = (this.starts || 0) + 1; this.onstart?.(); }
      stop() { this.onend?.(); }
    };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.fulfill({ status: 404, body: '' });
    if (url.pathname === '/manifest.json' && remote) return route.fulfill({ body: '{}' });
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.resolve(root, decodeURIComponent(pathname).slice(1));
    if (!file.startsWith(root + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return route.fulfill({ status: 404, body: '' });
    if (!cache.has(pathname)) cache.set(pathname, remote
      ? curl('curl', ['-fsSL', '--retry', '1', '--max-time', '15', origin + pathname], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 }).then(r => r.stdout).catch(() => null)
      : Promise.resolve(fs.readFileSync(file)));
    const body = await cache.get(pathname);
    return body ? route.fulfill({ contentType: media[path.extname(file)], body }) : route.fulfill({ status: 404, body: '' });
  });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SlideEditor && window.marked && window.Dictation && window.Notes && window.Deck);
  await page.evaluate(() => { Media.yandexSearch = Media.search = async () => []; });
  return { page, errors };
}

async function loadDeck(page) {
  return page.evaluate(async () => {
    async function picture(id, width, height, color) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const g = canvas.getContext('2d');
      g.fillStyle = color; g.fillRect(0, 0, width, height);
      g.fillStyle = '#B5CC8F'; g.fillRect(0, 0, width * 0.38, height);
      g.fillStyle = '#284547'; g.beginPath(); g.ellipse(width * .48, height * .58, width * .16, height * .32, .2, 0, Math.PI * 2); g.fill();
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      await Store.put('images', id, blob);
      return 'idb:' + id;
    }
    const cover = await picture('presentation-pass-cover', 900, 1300, '#467577');
    const detail = await picture('presentation-pass-detail', 1200, 650, '#85A284');
    const slide = (title, body, set = {}, notes = '') => SlideEditor.build({ title, body, set, notes, level: 2 });
    const withPic = (title, src) => Media.mdImage(title, src, {});
    const rule = slide('Правило наблюдения', 'Начинайте с общего вида и переходите к деталям.', {}, 'Тезис для учителя.\n\n- Проверить ход наблюдения.');
    const compare = slide('Сравнение образцов', 'Признак | Первый вид | Второй вид\n--- | --- | ---\nЛист | Простой | Сложный\nКрай листа | Гладкий | Зубчатый', {}, 'Спросите, какой признак помог сравнить образцы.');
    const sides = [['right','frosted'],['left','paper'],['bottom','dark'],['center','clear']];
    const manual = sides.map(([pos, style], i) => slide(['Наблюдение справа','Наблюдение слева','Плашка снизу','Плашка по центру'][i],
      (i === 0 ? withPic('Деталь крупным планом', detail) + '\n\n' : withPic('Общий вид', cover) + '\n\n') + 'Сначала найдите главный объект.',
      { full: pos, fullStyle: style, ...(i === 0 ? { bgimg: cover } : {}) }, `Заметки к кадру ${i + 1}`));
    const deck = [slide('Наблюдение и сравнение', 'Биология · 6 класс'), ...manual, rule, compare,
      slide('Сравнение по строению', 'Признак | Вид А | Вид Б\nФорма | Овальная | Круглая', { layout: 'compare' }),
      slide('Проверка результата', '- Что наблюдаем? || Форму листовой пластинки.', { qa: 1 }, 'Ответ открывается по нажатию.'),
      slide('Найдите признак', '- [+] Листовая пластинка | Верный признак | назовите форму\n- [-] Цвет горшка | Другой объект', { choice: 1 }),
      slide('Лента наблюдений', '- 10 апреля | Первые листья | Начало наблюдений', { tl: 1 }),
      slide('Самопроверка', 'Отметьте, сможете ли вы объяснить выбор признака.', { selfcheck: 1, timer: 30 }),
      slide('Задание на карточках', Array.from({ length: 23 }, (_, i) => `- Пункт ${i + 1}. Сравните данный образец с соседним.`).join('\n') + '\n- Покажите последний образец.', { layout: 'cards' }),
      slide('Запись в журнале', 'Проверьте `a || b`.\n\n~~~js\nif (a || b) mark();\n~~~'),
      slide('Фото в ожидании', 'Краткий вывод.\n\n![Ожидается](search:нет)', { full: 'right' })];
    const lesson = { id: 'presentation-pass-fixture', title: 'Наблюдение и сравнение', params: { subject: 'bio', grade: 6, topic: 'Наблюдение и сравнение' }, docs: { slides: deck.join('\n\n---\n\n') }, status: { slides: 'ok' }, slideTheme: 'bordo', slideFonts: 'classic', slideAnim: { mode: 'none', deco: false },
      quiz: { id: 'presentation-pass', url: 'https://lesson.test/test/index.html?q=fixture', title: 'Тест по наблюдениям' } };
    await finishPresentationOptions(lesson, lesson.params);
    SlideEditor.reset(); openLesson(lesson, 'slides', false);
    return { md: lesson.docs.slides, cover, detail, rule, compare };
  });
}

async function testFlows(page, fixture) {
  const info = await page.evaluate(async ({ md, cover, detail }) => {
    const rows = (src, i) => splitSlides(src).map(SlideEditor.parse)[i];
    const build = (title, body, set = {}) => SlideEditor.build({ title, body, set, level: 2 });
    const image = (title, src = cover) => Media.mdImage(title, src, {});
    const sep = '\n\n---\n\n';
    const p = { subject: 'bio', grade: 6, topic: 'Строение цветкового растения', plan: {}, duration: 45 };
    const theory = Array.from({ length: 9 }, (_, i) => build(`Строение растения ${i}`, 'Определите части.\n\n' + image('Схема', 'img/fixture-' + i + '.png')));
    const skipped = [build('Заготовка', 'Объяснение\n\n' + image('Заготовка', 'search:будет')),
      build('Выбор', '[-] Лист | Объясните\n\n' + image('Деталь'), { choice: 1 }),
      build('Время', 'Сравните\n\n' + image('Деталь'), { timer: 45 }),
      build('Проверка итога', 'Сравните\n\n' + image('Деталь')),
      build('Длинный', 'Пояснение '.repeat(120) + '\n\n' + image('Деталь')),
      build('Два изображения', 'Сравните\n\n' + image('Портрет') + '\n\n' + image('Герб', detail))];
    const base = '---\nmarp: true\n---\n\n' + [build('Титульный', 'Первый слайд\n\n' + image('Деталь')), ...skipped, ...theory].join(sep);
    const once = SlideEditor.autoFullFrame(base, p);
    const twice = SlideEditor.autoFullFrame(once, p);
    const autoFrames = splitSlides(twice).map(SlideEditor.parse).map(s => s.set.full || null);
    const templates = [
      ['Правило наблюдения', 'Сначала рассмотрите общий вид.'],
      ['Проверка результата', 'Назовите существенный признак.'],
      ['Сравнение образцов', 'Признак | Вид А | Вид Б\nФорма | Овальная | Круглая'],
      ['Задание на повторение', 'Опишите главное отличие.']
    ].map(([title, body]) => SlideEditor.autoLayout(SlideEditor.parse(build(title, body)), 1));
    const code = document.createElement('div');
    code.innerHTML = SlideEditor.slideHtml(rows(md, 13), 13);
    const old = { autoFill: Media.autoFill, commons: Media.commons, toBlob: Media.toBlob, lessonImages: Deck.lessonImages };
    Media.autoFill = async text => text;
    Media.commons = async q => [{ title: 'Горшок с посторонним растением', url: 'img/wrong.png', src: 'Викисклад' },
      { title: q, cap: q, url: 'img/' + encodeURIComponent(q) + '.png', src: 'Викисклад' }];
    Media.toBlob = async url => url.endsWith('wrong.png') ? null : Store.get('images', detail.slice(4));
    Deck.lessonImages = () => [];
    const good = ['Строение пыльцевого зерна', 'Развитие семязачатка', 'Сосуды ксилемы', 'Листовая пластинка', 'Апикальная меристема', 'Корневые волоски'];
    const needs = [build('Титул', p.topic), ...good.map(t => build(t, 'Рассмотрите форму и строение.')), skipped[1], build('Домашнее задание', 'Повторите сравнение.')].join(sep);
    const quotas = {};
    const mockQuiz = window.QuizLink;
    const mockImage = { configured: ImageGen.configured, image: ImageGen.image };
    const original = { access: window.Access, web: Subjects.webFacts, build: Deck.build, outline: Deck.outline, verify: window.Verify, variety: window.Variety };
    let pluginPost = false, plugins, local, ai, aiPictures;
    try {
      for (const subject of ['bio', 'geo', 'chem', 'phys', 'hist', 'mhk']) {
        const titles = {
          geo: ['Карта Анд', 'Озеро Титикака', 'Пустыня Атакама'],
          chem: ['Кристаллы сульфата меди', 'Раствор хлорида натрия', 'Колба Эрленмейера'],
          phys: ['Маятник Фуко', 'Динамометр пружинный', 'Электроскоп школьный'],
          hist: ['Кремль Московский', 'Медный всадник', 'Князь Пожарский'],
          mhk: ['Фреска Джотто', 'Пейзаж Левитана', 'Портрет Боровиковского']
        }[subject];
        const input = titles ? [build('Титул', '6 класс'), ...titles.map(t => build(t, 'Выделите детали изображения.')), skipped[1]].join(sep) : needs;
        const filled = await SlideEditor.fillImages(input, { ...p, subject });
        const urls = [...filled.matchAll(/!\[[^\]]*\]\((idb:[^ )]+)/g)].map(m => m[1]);
        quotas[subject] = [urls.length, new Set(urls).size, !filled.includes('wrong.png')];
      }
      const newLesson = id => ({ id, title: p.topic, params: p, docs: {}, tech: '# Наблюдение образца', status: { slides: 'wait' }, slideFonts: 'classic' });
      window.QuizLink = { wanted: () => true, createTest: async () => ({ id: 'presentation-pass-plugin', url: 'https://lesson.test/test/index.html?q=fixture', title: 'Тест по наблюдению' }), slideFor: QuizLink.slideFor };
      window.Verify = undefined; window.Variety = undefined;
      Subjects.webFacts = async () => null;
      const cards = [{ kind: 'title', title: p.topic, points: ['6 класс'] }, ...good.map(t => ({ kind: 'list', title: t, points: ['Рассмотрите объект.'] })),
        { kind: 'choice', title: 'Проверка выбора', q: 'Назовите объект', options: [{ text: 'Тестовый ответ', ok: true }] }];
      const plug = newLesson('presentation-pass-plugin');
      plug._after = async ({ slidesOnly }) => { pluginPost = slidesOnly; };
      const layoutOf = lesson => /"full":/.test(lesson.docs.slides);
      await runPlugin(plug, p, {}, ['slides'], ['slides'], false, false, { cards: () => cards });
      const pluginSlides = splitSlides(plug.docs.slides).map(SlideEditor.parse);
      plugins = [layoutOf(plug), pluginSlides.some(s => s.set.choice && !s.set.kind?.includes('qr')), pluginPost,
        pluginSlides.at(-1).title.includes('Проверка знаний') && pluginSlides.at(-1).set.kind === 'qr' &&
          pluginSlides.at(-1).body.includes('idb:img-qr-') && !/https?:/.test(pluginSlides.at(-1).body)];
      window.QuizLink = { wanted: () => false };
      const makeCards = () => cards.map(({ points, ...c }) => ({ ...c, points }));
      Deck.outline = makeCards;
      const noai = newLesson('presentation-pass-local');
      state.lesson = noai;
      await buildWithoutAi(noai, p, {}, ['slides']);
      local = layoutOf(noai);
      const online = newLesson('presentation-pass-ai');
      state.lesson = online;
      Deck.build = async () => ({ md: needs, cards: makeCards() });
      await buildWithAi(online, p, {}, ['slides']);
      ai = layoutOf(online);
      window.Access = undefined;
      const prompts = [];
      const b = await Store.get('images', cover.slice(4));
      const urls = [];
      ImageGen.configured = () => true;
      ImageGen.image = async prompt => { prompts.push(prompt); const url = URL.createObjectURL(b); urls.push(url); return { url }; };
      const drawn = newLesson('presentation-pass-ai-pictures');
      drawn.docs.slides = needs;
      await aiDeckPics(drawn);
      urls.forEach(url => URL.revokeObjectURL(url));
      aiPictures = [prompts.length, layoutOf(drawn), prompts.every(x => x.includes('16:9') && x.includes(p.topic)) && prompts.some(x => x.includes('Рассмотрите форму и строение.')),
        splitSlides(drawn.docs.slides).map(SlideEditor.parse).filter(s => s.set.choice).every(s => !s.set.full)];
    } finally {
      Object.assign(Media, { autoFill: old.autoFill, commons: old.commons, toBlob: old.toBlob });
      Deck.lessonImages = old.lessonImages;
      window.Access = original.access; window.QuizLink = mockQuiz; Object.assign(ImageGen, mockImage); window.Verify = original.verify; window.Variety = original.variety;
      Subjects.webFacts = original.web; Deck.build = original.build; Deck.outline = original.outline;
    }
    return { autoFrames, same: once === twice, head: twice.startsWith('---\nmarp: true'), templates, code: [...code.querySelectorAll('code')].map(c => c.textContent.trim()), quotas, plugins, local, ai, aiPictures };
  }, fixture);
  assert.deepEqual(info.autoFrames.slice(0, 7), Array(7).fill(null));
  assert.deepEqual(info.autoFrames.filter(Boolean), ['right', 'left', 'right', 'left', 'right']);
  assert.ok(info.same && info.head);
  assert.deepEqual(info.templates, ['rule', 'check', 'compare', 'task']);
  assert.deepEqual(info.code, ['a || b', 'if (a || b) mark();']);
  for (const [subject, qty] of Object.entries(info.quotas)) {
    const target = subject === 'bio' ? 5 : 3;
    assert.deepEqual(qty, [target, target, true], subject);
  }
  assert.deepEqual(info.plugins, [true, true, true, true]);
  assert.ok(info.local && info.ai);
  assert.deepEqual(info.aiPictures, [3, true, true, true]);
}

async function testDictationAndLiterature(page) {
  const dictation = await page.evaluate(async () => {
    const textarea = document.createElement('textarea'), button = document.createElement('button'), status = document.createElement('span');
    document.body.append(textarea, button, status);
    textarea.value = 'Начало конец'; textarea.setSelectionRange(6, 7);
    const control = Dictation.attach({ textarea, button, status });
    const say = (r, words, final = true, index = 0) => r.onresult({ resultIndex: index, results: [...Array(index), Object.assign([{ transcript: words }], { isFinal: final })] });
    control.start();
    say(recognitions[0], 'черновой текст', false);
    const interim = textarea.value;
    say(recognitions[0], 'важная фраза'); say(recognitions[0], 'важная фраза');
    const first = textarea.value;
    control.stop(); control.start();
    say(recognitions[0], 'поздний старый результат');
    say(recognitions[1], 'важная фраза'); say(recognitions[1], 'и вывод', true, 1);
    recognitions[1].onend(); await new Promise(r => setTimeout(r, 330));
    say(recognitions[1], 'и вывод');
    recognitions[1].onerror({ error: 'not-allowed' });
    const result = { interim, first, ended: textarea.value, restarted: recognitions[1].starts, error: status.textContent, pressed: button.getAttribute('aria-pressed') };
    textarea.remove(); button.remove(); status.remove();
    return result;
  });
  assert.equal(dictation.interim, 'Начало конец');
  assert.equal(dictation.first, 'Начало важная фраза конец');
  assert.equal(dictation.ended, 'Начало важная фраза и вывод конец');
  assert.equal(dictation.restarted, 2);
  assert.match(dictation.error, /Нет доступа к микрофону/);
  assert.equal(dictation.pressed, 'false');
  const blocked = await page.evaluate(async () => {
    const topic = { subject: 'lit', grade: 7, topic: 'Н. В. Гоголь. «Произведение для проверки»', lessonNo: 2 };
    const old = { prepare: Variety.prepare, commercial: Access.commercial, isDev: Access.isDev, snapshot: Notes.snapshot, choice: state.textChoice, text: state.textOverride };
    try {
      Access.commercial = () => true; Access.isDev = () => false;
      Notes.snapshot = () => ({ text: '' }); Variety.prepare = async () => ({ text: '' });
      state.textOverride = { text: 'Чужой фрагмент'.repeat(10) };
      state.textChoice = { key: planKey({ ...topic, lessonNo: 1 }), mode: 'text' };
      const result = checkWorkText(topic, {});
      await new Promise(r => setTimeout(r, 20));
      const modal = !!document.querySelector('#awGo');
      const noBypass = document.querySelector('#awSkipGo')?.parentElement.hidden;
      document.querySelector('#awText').value = 'Короткий фрагмент';
      document.querySelector('#awGo').click();
      const short = !!document.querySelector('#awGo');
      closeModal();
      const didBlock = (await result) === null;
      return [modal, noBypass, short, didBlock];
    } finally {
      Variety.prepare = old.prepare; Access.commercial = old.commercial; Access.isDev = old.isDev; Notes.snapshot = old.snapshot;
      state.textChoice = old.choice; state.textOverride = old.text;
    }
  });
  assert.deepEqual(blocked, [true, true, true, true]);
}

async function editorGeometry(page) {
  return page.evaluate(() => {
    const slide = document.querySelector('#sxFrame .sx');
    const inner = slide.querySelector('.sx-inner'), bg = slide.querySelector('.sx-bgimg');
    const table = slide.querySelector('table');
    const sb = slide.getBoundingClientRect(), ib = inner.getBoundingClientRect();
    const dots = document.querySelector('#sxDots').getBoundingClientRect();
    const toolbar = [...document.querySelectorAll('.sx-topbar button, .sx-slidebar button')].every(el => {
      const b = el.getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1;
    });
    const body = slide.querySelector('.sx-body'), title = slide.querySelector('.sx-title');
    return { width: sb.width, half: (ib.left + ib.width / 2 - sb.left) / sb.width,
      aspect: sb.width / sb.height, background: bg ? { w: bg.getBoundingClientRect().width / sb.width, h: bg.getBoundingClientRect().height / sb.height,
        fit: getComputedStyle(bg).objectFit, ok: bg.complete && bg.naturalWidth > 0 } : null,
      table: table ? { columns: table.tHead?.rows[0].cells.length, fits: table.getBoundingClientRect().right <= ib.right + 2 } : null,
      contentFits: title.getBoundingClientRect().bottom <= body.getBoundingClientRect().top + 2 && inner.scrollHeight <= inner.clientHeight + 2 && inner.scrollWidth <= inner.clientWidth + 2,
      overflow: document.documentElement.scrollWidth - innerWidth, toolbar, dotsOutside: dots.bottom <= sb.top + 1,
      handles: [...slide.querySelectorAll('.acc-edge,.inner-move,.sx-resize,.sx-grip')].filter(el => getComputedStyle(el).display !== 'none' && +getComputedStyle(el).opacity > 0).length
    };
  });
}

async function testEditor(page, width) {
  await loadDeck(page);
  await page.locator('.sx-th[data-i="1"]').click();
  await page.waitForFunction(() => document.querySelector('#sxFrame img.sx-bgimg')?.naturalWidth > 0);
  const frame = await editorGeometry(page);
  assert.ok(Math.abs(frame.aspect - 16 / 9) < .03 && frame.half > .64 && frame.contentFits, JSON.stringify({ width, frame }));
  assert.ok(frame.background.ok && frame.background.fit === 'cover' && frame.background.w === 1 && frame.background.h === 1);
  assert.ok(frame.overflow <= 1 && frame.toolbar && frame.dotsOutside, JSON.stringify({ width, frame }));
  if (width <= 768) assert.equal(frame.handles, 0);
  if ([390, 1440].includes(width)) {
    await page.waitForFunction(() => document.querySelector('#toast')?.hidden);
    await page.locator('#sxFrame').scrollIntoViewIfNeeded();
    const top = await page.locator('#sxFrame').evaluate(el => window.scrollY + el.getBoundingClientRect().top);
    await page.evaluate(y => window.scrollTo(0, Math.max(0, y - 265)), top);
    await page.screenshot({ path: path.join(out, `editor-${width}.png`), animations: 'disabled' });
  }
  await page.locator('#sxMoreBtn').click();
  await page.locator('#sxFull').click();
  await page.waitForFunction(() => !document.querySelector('#sxFrame .full-frame'));
  await page.locator('#sxFull').click();
  for (const [pos, style] of [['left', 'paper'], ['bottom', 'dark'], ['center', 'clear'], ['right', 'frosted']]) {
    await page.locator('#sxFullPos').selectOption(pos);
    await page.locator(`#sxFrame .full-${pos}`).waitFor();
    await page.locator('#sxFullStyle').selectOption(style);
    await page.locator(`#sxFrame .full-style-${style}`).waitFor();
  }
  await page.locator('.sx-th[data-i="6"]').click();
  assert.deepEqual((await editorGeometry(page)).table, { columns: 3, fits: true });
  await page.locator('#sxLayPick').click();
  const menu = page.locator('.sx-pop');
  await menu.waitFor();
  const bounds = await menu.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= -1 && bounds.y + bounds.height <= 901, JSON.stringify({ width, bounds }));
  await page.keyboard.press('Escape');
  await page.locator('#sxLay').selectOption('one');
  await page.locator('#sxFrame .lay-one').waitFor();
  await page.locator('#sxLay').selectOption('compare');
  await page.locator('#sxFrame .lay-compare table').waitFor();
  if (width === 1440) {
    await page.locator('.slide-notes summary').click();
    await page.locator('#sxNotes').fill('Первая строка заметок.\nВторая строка заметок.');
    await page.waitForFunction(() => state.lesson.docs.slides.includes('Первая строка заметок.\nВторая строка заметок.'));
    const original = await page.evaluate(() => state.lesson.docs.slides);
    await page.evaluate(() => {
      const original = Media.autoFill;
      Media.autoFill = async md => md.replace('search:нет', 'idb:presentation-pass-detail');
      window.restorePresentationMock = () => Media.autoFill = original;
    });
    await page.locator('#sxPickPics').click();
    await page.waitForFunction(old => state.lesson.docs.slides !== old && !state.lesson.docs.slides.includes('search:нет'), original);
    await page.evaluate(() => window.restorePresentationMock());
  }
  await page.locator('#sxMoreBtn').click();
}

async function exportsFrom(page, fixture, browser) {
  const output = await page.evaluate(async ({ md }) => {
    const fitted = SlideEditor.fitAll({ source: md, omitMissingImages: true });
    const fileData = {};
    const keepDownloads = caps.downloads;
    const base64 = blob => new Promise(r => { const reader = new FileReader(); reader.onload = () => r(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
    caps.downloads = { save: async ({ filename, data }) => { fileData[filename] = await data.text(); } };
    try { await exportOne(state.lesson, 'slides', 'html'); } finally { caps.downloads = keepDownloads; }
    const pptx = await slidesToPptxBlob(md, 'Наблюдение и сравнение');
    await loadScript('jszip');
    const zipped = await JSZip.loadAsync(await pptx.arrayBuffer());
    const slides = await Promise.all(Object.values(zipped.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f.name)).map(f => f.async('text')));
    const notes = await Promise.all(Object.values(zipped.files).filter(f => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f.name)).map(f => f.async('text')));
    const table = slides.find(x => x.includes('Признак') && x.includes('<a:tbl>'));
    const full = slides.filter(x => /Наблюдение справа|Наблюдение слева|Плашка снизу|Плашка по центру/.test(x));
    const countArt = full.map(x => (x.match(/<p:pic>/g) || []).length);
    const fits = fitted.filter(s => s.title === 'Задание на карточках').length;
    const html = Object.values(fileData)[0];
    return { html, pptx: await base64(pptx), slides: slides.length, frames: full.length, countArt, fits,
      lastTask: fitted.some(s => s.body.includes('Покажите последний образец.')), retainedTable: !!table && table.includes('Первый вид') && /<a:lnL/.test(table),
      dark: full.some(x => x.includes('FFF8EC') && x.includes('90000')), fonts: full.some(x => x.includes('typeface="Georgia"') && x.includes('typeface="Arial"')),
      notes: notes.some(x => x.includes('Проверить ход наблюдения')) };
  }, fixture);
  assert.equal(output.frames, 4);
  assert.deepEqual(output.countArt, [2, 1, 1, 1]);
  assert.ok(output.fits > 1 && output.lastTask && output.retainedTable && output.dark && output.fonts && output.notes, JSON.stringify({ ...output, html: !!output.html, pptx: !!output.pptx }));
  fs.writeFileSync(path.join(out, 'presentation-check.pptx'), Buffer.from(output.pptx, 'base64'));
  fs.writeFileSync(path.join(out, 'presentation-check.html'), output.html);
  const show = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true });
  const errors = [];
  show.on('pageerror', err => errors.push(err.message));
  try {
    await show.setContent(output.html);
    assert.equal(await show.locator('.deck-s .full-frame').count(), 4);
    assert.equal(await show.locator('.deck-s figure.empty').count(), 0);
    await show.keyboard.press('n');
    assert.ok(await show.locator('#sxNotes').isVisible());
    await show.keyboard.press('ArrowRight');
    assert.match(await show.locator('#sxNotesBody').textContent(), /кадру 1/);
    await show.keyboard.press('ArrowRight');
    assert.match(await show.locator('#sxNotesBody').textContent(), /кадру 2/);
    await show.keyboard.press('n');
    assert.equal(await show.locator('#sxNotes').isVisible(), false);
    for (let i = 0; i < 7; i++) await show.keyboard.press('ArrowRight');
    const choice = show.locator('.deck-s.on .ch[data-ok="1"]');
    await choice.click();
    assert.match(await show.locator('.deck-s.on .ch-ex').textContent(), /Верный признак \| назовите форму/);
    await show.keyboard.press('ArrowRight');
    await show.locator('.deck-s.on .tl-i').click();
    assert.match(await show.locator('.deck-s.on .tl-p').textContent(), /Начало наблюдений/);
    const end = show.locator('.deck-s').last();
    const qr = end.locator('.k-qr img');
    assert.equal(await qr.count(), 1);
    assert.match(await qr.getAttribute('src'), /^data:image\/png/);
    assert.equal(await end.locator('.k-qr a').count(), 0);
    await show.keyboard.press('ArrowLeft');
    await show.keyboard.press('ArrowLeft');
    const question = show.locator('.deck-s.on .qa-i');
    const dimensions = await question.boundingBox();
    assert.ok(dimensions?.height >= 44);
    await question.focus();
    await show.keyboard.press('Space');
    await show.locator('.deck-s.on .qa-answer').waitFor();
    assert.match(await show.locator('.deck-s.on .qa-answer').textContent(), /Форму листовой пластинки/);
    await show.locator('.deck-s.on .sx-back').click();
    await question.waitFor();
    const sizing = await show.locator('.deck-s.on').boundingBox();
    assert.ok(Math.abs(sizing.width / sizing.height - 16 / 9) < 0.04);
    const contrast = await show.evaluate(() => {
      const color = s => (s.match(/[\d.]+/g) || []).map(Number);
      const lum = rgb => rgb.slice(0, 3).map(v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
      return [...document.querySelectorAll('.deck-s .full-frame')].map(slide => {
        const frame = slide.querySelector('.sx-inner');
        const node = slide.querySelector('.sx-title');
        const f = lum(color(getComputedStyle(node).color));
        const bg = getComputedStyle(frame).getPropertyValue('--frame-ink').trim();
        return { f, bg };
      });
    });
    assert.ok(contrast.every(({ f, bg }, i) => bg && (i < 2 ? f < .07 : f > .8)));
    assert.deepEqual(errors, []);
  } finally { await show.close(); }
  return output.slides;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const desktop = await fixturePage(browser, 1440);
    const fixture = await loadDeck(desktop.page);
    await testFlows(desktop.page, fixture);
    await testDictationAndLiterature(desktop.page);
    await loadDeck(desktop.page);
    const count = await exportsFrom(desktop.page, fixture, browser);
    const pages = [];
    await testEditor(desktop.page, 1440);
    pages.push(desktop);
    for (const width of [1024, 768, 390]) {
      const context = await fixturePage(browser, width);
      await testEditor(context.page, width);
      pages.push(context);
    }
    for (const { page, errors } of pages) {
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`PASS: ${origin}, ${count} PPTX slides, editor 1440/1024/768/390, image selection, notes, widgets, source gate, speech.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
