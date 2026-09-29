/* ==========================================================================
   心理学专业课背诵 · 应用主程序
   广东外语外贸大学 应用心理（347）· 实验心理学 + 普通心理学
   四个模块：名词解释 / 简答 / 综合 / 快速回忆
   ========================================================================== */
(function () {
'use strict';

/* ------------------------------ 1. 基础工具 ------------------------------ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.prototype.slice.call(r.querySelectorAll(s));

const SVG_TAGS = new Set(['svg', 'circle', 'path', 'g', 'rect', 'line', 'polyline',
  'polygon', 'ellipse', 'defs', 'linearGradient', 'stop']);

function createEl(tag) {
  if (SVG_TAGS.has(tag)) {
    try { return document.createElementNS('http://www.w3.org/2000/svg', tag); } catch (e) {}
  }
  return document.createElement(tag);
}

function h(tag, props, ...kids) {
  const el = createEl(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}
function append(parent, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false || k === true) continue;
    if (Array.isArray(k)) { append(parent, k); continue; }
    parent.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
function hash(str) {
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 31) ^ c;
  }
  return ((h1 >>> 0) * 4096 + (h2 >>> 0) % 4096).toString(36);
}
function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function todayKey(d) {
  d = d || new Date();
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function vibrate(ms) {
  if (!SET.haptic) return;
  try { navigator.vibrate && navigator.vibrate(ms || 8); } catch (e) {}
}

/* ------------------------------ 2. 存储与设置 ------------------------------ */

const LS = {
  get(k, dft) {
    try {
      const v = localStorage.getItem(k);
      if (v === null || v === undefined) return dft;
      const p = JSON.parse(v);
      return p === null || p === undefined ? dft : p;
    } catch (e) { return dft; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { toast('存储空间不足'); return false; }
  }
};

const K = { study: 'psy.study.v2', open: 'psy.open.v2', set: 'psy.set.v2', days: 'psy.days.v2' };
const DEFAULT_SET = { theme: 'auto', fs: 16, haptic: true, onlyWeak: false };
let SET = Object.assign({}, DEFAULT_SET, LS.get(K.set, {}));
let STUDY = LS.get(K.study, {});
let OPEN = LS.get(K.open, {});
let DAYS = LS.get(K.days, {});
const saveSet = () => LS.set(K.set, SET);
const saveStudy = () => LS.set(K.study, STUDY);

/* ------------------------------ 3. 模块与内容 ------------------------------ */

const MODULES = [
  { id: 'term',   name: '名词解释', icon: '📘', desc: '考试第一题，直接背原文' },
  { id: 'short',  name: '简答',     icon: '📝', desc: '6 题 × 15 分，按点作答' },
  { id: 'comp',   name: '综合',     icon: '🧩', desc: '4 题 × 30 分，论述 + 材料分析' },
  { id: 'recall', name: '快速回忆', icon: '⚡', desc: '思维导图框架，先想再看' }
];
const MODULE_BY_ID = {};
MODULES.forEach(m => { MODULE_BY_ID[m.id] = m; });

const ITEMS = [];
const BY_ID = {};
const TREE = {};
MODULES.forEach(m => { TREE[m.id] = []; });

function loadModules() {
  for (const bank of (window.__MODULES || [])) {
    const mod = bank.module;
    if (!MODULE_BY_ID[mod]) continue;
    let subj = TREE[mod].find(s => s.name === bank.subject);
    if (!subj) {
      subj = { name: bank.subject, icon: bank.icon || '📗', desc: bank.desc || '',
               chapters: [], ids: [] };
      TREE[mod].push(subj);
    }
    for (const ch of (bank.chapters || [])) {
      const chap = { name: ch.name || '未分类', ids: [] };
      for (const it of (ch.items || [])) {
        const q = String(it.q || '').trim();
        const a = String(it.a || '').trim();
        if (!q || !a) continue;
        const item = {
          id: hash(mod + '|' + bank.subject + '|' + chap.name + '|' + q),
          module: mod, subject: bank.subject, chapter: chap.name,
          q, a, src: it.src || '', stars: it.stars || 0
        };
        ITEMS.push(item);
        BY_ID[item.id] = item;
        chap.ids.push(item.id);
        subj.ids.push(item.id);
      }
      if (chap.ids.length) subj.chapters.push(chap);
    }
  }
}

function stateOf(id) { return STUDY[id] || ''; }
function setState(id, s) {
  if (STUDY[id] === s) delete STUDY[id];
  else {
    STUDY[id] = s;
    const d = todayKey();
    DAYS[d] = (DAYS[d] || 0) + 1;
    LS.set(K.days, DAYS);
  }
  saveStudy();
}
function countOf(ids) {
  let ok = 0, weak = 0;
  for (const id of ids) {
    const s = STUDY[id];
    if (s === 'ok') ok++;
    else if (s === 'no' || s === 'vague') weak++;
  }
  return { total: ids.length, ok, weak, done: ok + weak };
}
function filterIds(ids, weakOnly) {
  return weakOnly ? ids.filter(id => stateOf(id) === 'no' || stateOf(id) === 'vague') : ids;
}

/* ------------------------------ 4. 主题 / toast / 弹层 ------------------------------ */

function applyTheme() {
  let t = SET.theme;
  if (t === 'auto') {
    t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
  const meta = $('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#161822' : '#6c5ce7');
}
function applyFont() { document.documentElement.style.setProperty('--fs', SET.fs + 'px'); }
if (window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (SET.theme === 'auto') applyTheme();
    });
  } catch (e) {}
}

let toastTimer = null;
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || 1800);
}
function openSheet(title, nodes) {
  $('#sheetTitle').textContent = title;
  const bd = $('#sheetBody');
  bd.textContent = '';
  append(bd, [nodes]);
  $('#sheetMask').hidden = false;
  bd.scrollTop = 0;
}
function closeSheet() { $('#sheetMask').hidden = true; }
function confirmSheet(title, msg, okLabel, onOk) {
  openSheet(title, [
    h('p', { class: 'muted', style: { fontSize: '14.5px', lineHeight: '1.7', marginBottom: '18px' } }, msg),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onClick: closeSheet }, '取消'),
      h('button', { class: 'btn primary', onClick: () => { closeSheet(); onOk(); } }, okLabel || '确定'))
  ]);
}

/* ------------------------------ 5. 路由 ------------------------------ */

const nav = [];
let current = null;
let RC = null;
const TAB_OF = { term: 'term', short: 'short', comp: 'comp', recall: 'recall', me: 'me' };
const TITLES = { home: '背诵手册', chapters: '选择章节', list: '背诵', cards: '快速回忆', me: '我的' };
const VIEWS = {};
const homeRoute = () => ({ name: 'home', module: 'term' });

function go(route) { if (current) nav.push(current); render(route); }
function back() { const r = nav.pop(); render(r || homeRoute()); }
function reset(route) { nav.length = 0; render(route); }

function render(route) {
  current = route;
  const v = $('#view');
  v.scrollTop = 0;
  const tabId = route.name === 'home' ? route.module : TAB_OF[route.name];
  const showTab = !!tabId;
  $('#tabbar').hidden = !showTab;
  v.classList.toggle('no-tab', !showTab);
  if (showTab) {
    $$('.tab').forEach(b => b.classList.toggle('is-on', b.dataset.tab === tabId));
  }
  $('#tbTitle').textContent = route.title || TITLES[route.name] || '背诵手册';
  $('#tbBack').hidden = !(nav.length > 0 && !showTab);
  $('#tbMore').hidden = !(route.name === 'cards' && RC && !RC.finished);
  v.textContent = '';
  const view = VIEWS[route.name];
  if (view) append(v, [view(route)]);
}

/* ------------------------------ 6. 模块首页 ------------------------------ */

VIEWS.home = function (route) {
  const mod = MODULE_BY_ID[route.module] || MODULES[0];
  const subjects = TREE[mod.id] || [];
  const allIds = subjects.reduce((a, s) => a.concat(s.ids), []);
  const st = countOf(allIds);
  const today = DAYS[todayKey()] || 0;

  const head = h('div', { class: 'hero' },
    h('h1', null, mod.icon + ' ' + mod.name),
    h('p', null, mod.desc),
    h('div', { class: 'hero-stats' },
      h('div', null, h('b', null, st.total), h('span', null, '总条数')),
      h('div', null, h('b', null, st.ok), h('span', null, '已记住')),
      h('div', null, h('b', null, st.weak), h('span', null, '待巩固'))
    )
  );
  if (!subjects.length) {
    return h('div', null, head,
      h('div', { class: 'empty' },
        h('div', { class: 'ic' }, '🚧'),
        h('b', null, '这部分内容还在制作中'),
        h('p', null, '名词解释和快速回忆已经做好，简答和综合正在整理资料。')));
  }
  return h('div', null, head,
    h('div', { class: 'sec mt16' },
      h('div', { class: 'sec-hd' }, h('h2', null, '选科目'),
        h('span', { class: 'more' }, '今天已学 ' + today + ' 条'))),
    ...subjects.map(s => subjectCard(mod, s))
  );
};

function subjectCard(mod, subj) {
  const st = countOf(subj.ids);
  return h('button', { class: 'subj', style: { marginBottom: '10px' },
    onClick: () => go({ name: 'chapters', module: mod.id, subject: subj.name }) },
    h('div', { class: 'subj-top' },
      h('div', { class: 'subj-icon' }, subj.icon),
      h('div', { class: 'grow' },
        h('b', { class: 'ellipsis' }, subj.name),
        h('div', { class: 'meta' }, subj.chapters.length + ' 章 · ' + st.total +
          ' 条 · 已学 ' + st.done + ' 条')),
      h('div', { class: 'subj-ring' },
        h('em', null, pct(st.done, st.total) + '%'),
        h('span', null, '进度'))),
    h('div', { class: 'bar' }, h('i', { style: { width: pct(st.done, st.total) + '%' } }))
  );
}

/* ------------------------------ 7. 章节列表 ------------------------------ */

VIEWS.chapters = function (route) {
  const mod = MODULE_BY_ID[route.module];
  const subj = (TREE[mod.id] || []).find(s => s.name === route.subject);
  if (!subj) return h('div', { class: 'empty' }, '没有内容');
  const st = countOf(subj.ids);

  return h('div', null,
    h('div', { class: 'card', style: { padding: '15px', marginBottom: '14px' } },
      h('div', { class: 'row' },
        h('div', { class: 'subj-icon' }, subj.icon),
        h('div', { class: 'grow' },
          h('b', { style: { fontSize: '16.5px', fontWeight: '650' } }, subj.name),
          h('div', { class: 'meta tiny muted' }, subj.desc || (st.total + ' 条')))),
      h('div', { class: 'bar', style: { marginTop: '13px' } },
        h('i', { style: { width: pct(st.done, st.total) + '%' } })),
      h('div', { class: 'row tiny muted', style: { marginTop: '7px', justifyContent: 'space-between' } },
        h('span', null, '已学 ' + st.done + ' / ' + st.total),
        h('span', null, '待巩固 ' + st.weak + ' 条'))),
    h('button', { class: 'btn primary big', style: { marginBottom: '14px' },
      onClick: () => startItems(mod.id, subj.name, subj.ids) },
      '从头过一遍这一科 · ' + st.total + ' 条'),
    ...subj.chapters.map(ch => {
      const c = countOf(ch.ids);
      const cls = c.done === 0 ? '' : (c.weak === 0 ? 'done' : 'mid');
      return h('div', { class: 'list', style: { marginBottom: '9px' } },
        h('button', { class: 'li',
          onClick: () => startItems(mod.id, subj.name, ch.ids, ch.name) },
          h('div', { class: 'chap-dot ' + cls }),
          h('div', { class: 'grow' },
            h('b', { class: 'ellipsis' }, ch.name),
            h('span', null, ch.ids.length + ' 条 · 已学 ' + c.done +
              (c.weak ? ' · 待巩固 ' + c.weak : ''))),
          h('div', { class: 'chev' }, '›')));
    })
  );
};

function startItems(module, subject, ids, chapter) {
  if (!ids.length) { toast('这里还没有内容'); return; }
  if (module === 'recall') {
    go({ name: 'cards', module, title: chapter || subject, ids });
  } else {
    SET.onlyWeak = false;          // 每次进新章节都从「显示全部」开始
    saveSet();
    go({ name: 'list', module, subject, chapter: chapter || subject, ids });
  }
}

/* ------------------------------ 8. 列表背诵 ------------------------------ */

VIEWS.list = function (route) {
  const ids = route.ids || [];
  const weakOnly = !!SET.onlyWeak;
  const shown = filterIds(ids, weakOnly);
  const st = countOf(ids);

  return h('div', null,
    h('div', { class: 'row tiny muted', style: { justifyContent: 'space-between', marginBottom: '10px' } },
      h('span', { id: 'listHead' }, listHeadText(ids)),
      h('span', { id: 'listPct' }, pct(st.done, ids.length) + '%')),
    h('div', { class: 'row', style: { gap: '9px', marginBottom: '12px' } },
      h('button', { class: 'chip' + (weakOnly ? ' on' : ''), style: { flex: '1', textAlign: 'center' },
        onClick: () => { SET.onlyWeak = !SET.onlyWeak; saveSet(); render(current); } },
        weakOnly ? '只看没记住 · ' + st.weak : '只看没记住的'),
      h('button', { class: 'btn sm', style: { flex: '1' }, onClick: () => {
          const anyClosed = shown.some(id => !OPEN[id]);
          shown.forEach(id => { OPEN[id] = anyClosed; });
          LS.set(K.open, OPEN);
          render(current);
        } }, '全部展开 / 收起')),
    shown.length
      ? h('div', null, ...shown.map(id => itemCard(id)))
      : h('div', { class: 'empty' },
          h('div', { class: 'ic' }, '🌿'),
          h('b', null, '这里没有待巩固的内容'),
          h('p', null, '要么都记住了，要么还没开始标记。'),
          h('button', { class: 'btn', style: { marginTop: '16px' },
            onClick: () => { SET.onlyWeak = false; saveSet(); render(current); } },
            '显示全部 ' + ids.length + ' 条'))
  );
};

function itemCard(id) {
  const it = BY_ID[id];
  if (!it) return null;
  const open = !!OPEN[id];
  const ans = h('div', { class: 'ans' }, it.a);
  ans.hidden = !open;
  const chev = h('span', { class: 'chev' }, open ? '⌄' : '›');
  const s = stateOf(id);
  return h('div', { class: 'item' + (s ? ' st-' + s : '') },
    h('div', { class: 'item-q', onClick: () => {
        OPEN[id] = !OPEN[id];
        LS.set(K.open, OPEN);
        ans.hidden = !OPEN[id];
        chev.textContent = OPEN[id] ? '⌄' : '›';
        const row = $('.mark-row', ans.parentNode);
        if (row) row.hidden = !OPEN[id];
      } },
      h('span', { class: 'item-dot' }),
      h('span', { class: 'item-txt' }, it.q),
      chev),
    ans,
    markRow(it)
  );
}

function markRow(it) {
  const row = h('div', { class: 'mark-row' });
  if (!OPEN[it.id]) row.hidden = true;
  [['no', '没记住'], ['vague', '有点模糊'], ['ok', '记住了']].forEach(([v, label]) => {
    row.appendChild(h('button', {
      class: 'mark' + (stateOf(it.id) === v ? ' on ' + v : ''),
      onClick: (e) => {
        e.stopPropagation();
        setState(it.id, v);
        vibrate(8);
        const chosen = stateOf(it.id) === v;
        $$('.mark', e.currentTarget.parentNode).forEach(b => { b.className = 'mark'; });
        if (chosen) e.currentTarget.className = 'mark on ' + v;
        const card = e.currentTarget.parentNode.parentNode;
        if (card && card.className.indexOf('item') === 0) {
          card.className = 'item' + (STUDY[it.id] ? ' st-' + STUDY[it.id] : '');
        }
        const head = $('#listHead'), pctEl = $('#listPct');
        if (head && current && current.ids) {
          head.textContent = listHeadText(current.ids);
          if (pctEl) pctEl.textContent = pct(countOf(current.ids).done, current.ids.length) + '%';
        }
      }
    }, label));
  });
  return row;
}

function listHeadText(ids) {
  const st = countOf(ids);
  return '共 ' + ids.length + ' 条 · 已学 ' + st.done + ' · 待巩固 ' + st.weak;
}

/* ------------------------------ 9. 快速回忆（翻面卡片） ------------------------------ */

VIEWS.cards = function (route) {
  if (route && route.ids) {
    RC = { ids: route.ids.slice(), idx: 0, flip: false,
           title: route.title || '快速回忆', ok: 0, weak: 0, wrong: 0,
           finished: false, last: null };
  }
  if (!RC || !RC.ids.length) {
    return h('div', { class: 'empty' },
      h('div', { class: 'ic' }, '⚡'),
      h('b', null, '快速回忆还没有内容'),
      h('p', null, '这部分正在整理思维导图，很快补上。'));
  }
  if (RC.finished) return recallSummary();
  const it = BY_ID[RC.ids[RC.idx]];
  if (!it) return h('div', { class: 'empty' }, '内容不存在');
  const s = stateOf(it.id);

  return h('div', null,
    h('div', { class: 'qprog' }, h('i', { style: { width: pct(RC.idx + 1, RC.ids.length) + '%' } })),
    h('div', { class: 'q-head' },
      h('span', { class: 'pill ellipsis', style: { maxWidth: '46vw' } },
        it.chapter.replace(/^第(\d+)章\s*/, '第$1章 · ')),
      it.stars ? h('span', { class: 'pill gray' }, '★'.repeat(it.stars)) : null,
      h('span', { class: 'q-count' }, (RC.idx + 1) + ' / ' + RC.ids.length)),
    h('div', { class: 'rcard' + (RC.flip ? ' flipped' : ''), onClick: flipRecall },
      h('div', { class: 'rcard-title' }, it.q),
      RC.flip
        ? h('div', { class: 'rcard-body' }, h('div', { class: 'ans' }, it.a))
        : h('div', { class: 'rcard-hint' },
            h('div', { class: 'rcard-hint-ic' }, '🧠'),
            '先在心里回忆一遍这一节的框架',
            h('br'), '想好了点这张卡看原文'),
      s ? h('div', { class: 'rcard-state ' + s },
            s === 'no' ? '上次：没记住' : (s === 'vague' ? '上次：有点模糊' : '上次：记住了')) : null),
    recallUndoBar(),
    RC.flip
      ? h('div', { class: 'q-actions' },
          h('button', { class: 'btn ghost sm', style: { flex: '0 0 auto', padding: '13px 13px' },
            onClick: recallPrev }, '‹'),
          h('button', { class: 'btn rc-no', onClick: () => gradeRecall('no') }, '没记住'),
          h('button', { class: 'btn rc-vague', onClick: () => gradeRecall('vague') }, '有点模糊'),
          h('button', { class: 'btn rc-ok', onClick: () => gradeRecall('ok') }, '记住了'))
      : h('div', { class: 'q-actions' },
          RC.idx > 0
            ? h('button', { class: 'btn ghost sm', style: { flex: '0 0 auto', padding: '13px 15px' },
                onClick: recallPrev }, '上一张')
            : null,
          h('button', { class: 'btn primary', onClick: flipRecall }, '看原文'),
          h('button', { class: 'btn ghost sm', style: { flex: '0 0 auto', padding: '13px 15px' },
            onClick: recallNext }, '跳过'))
  );
};

function flipRecall() { RC.flip = !RC.flip; refreshRecall(); }
function refreshRecall() {
  const v = $('#view');
  v.textContent = '';
  append(v, [VIEWS.cards({ name: 'cards' })]);
}
function gradeRecall(g) {
  const id = RC.ids[RC.idx];
  RC.last = { id, prev: STUDY[id] || '', grade: g, idx: RC.idx };
  setState(id, g);
  if (g === 'ok') RC.ok++; else if (g === 'vague') RC.weak++; else RC.wrong++;
  RC.flip = false;
  if (RC.idx >= RC.ids.length - 1) RC.finished = true; else RC.idx++;
  $('#tbMore').hidden = RC.finished;
  refreshRecall();
}
function recallNext() {
  if (RC.idx >= RC.ids.length - 1) {
    RC.finished = true; $('#tbMore').hidden = true; refreshRecall(); return;
  }
  RC.idx++; RC.flip = false; refreshRecall();
}
function recallPrev() { if (RC.idx > 0) { RC.idx--; RC.flip = false; refreshRecall(); } }

function recallUndoBar() {
  if (!RC || !RC.last) return null;
  const label = { ok: '记住了', vague: '有点模糊', no: '没记住' }[RC.last.grade] || '';
  return h('button', { class: 'undo-bar', onClick: () => {
      const { id, prev, grade, idx } = RC.last;
      if (prev) STUDY[id] = prev; else delete STUDY[id];
      saveStudy();
      if (grade === 'ok') RC.ok--; else if (grade === 'vague') RC.weak--; else RC.wrong--;
      RC.idx = idx; RC.flip = true; RC.finished = false; RC.last = null;
      $('#tbMore').hidden = false;
      refreshRecall();
    } },
    h('span', { class: 'ellipsis' }, '上一张标了「' + label + '」'),
    h('b', null, '↩ 撤销'));
}

function recallSummary() {
  const total = RC.ok + RC.weak + RC.wrong;
  const rate = pct(RC.ok, total);
  const C = 2 * Math.PI * 56;
  return h('div', { class: 'result' },
    h('div', { class: 'ring' },
      h('svg', { viewBox: '0 0 132 132',
        style: { position: 'absolute', inset: '0', width: '100%', height: '100%',
                 transform: 'rotate(-90deg)' } },
        h('circle', { cx: '66', cy: '66', r: '56',
          style: { fill: 'none', stroke: 'var(--line)', strokeWidth: '10' } }),
        h('circle', { cx: '66', cy: '66', r: '56',
          style: { fill: 'none', stroke: 'var(--accent)', strokeWidth: '10',
                   strokeLinecap: 'round', strokeDasharray: String(C),
                   strokeDashoffset: String(C * (1 - rate / 100)) } })),
      h('div', { class: 'inner' }, h('b', null, total), h('span', null, '张卡片'))),
    h('h2', null, rate >= 80 ? '框架记得很牢 👏' : '不错，明天再过一遍'),
    h('p', { class: 'muted tiny' }, RC.title),
    h('div', { class: 'res-grid' },
      h('div', null, h('b', { style: { color: 'var(--ok)' } }, RC.ok), h('span', null, '记住了')),
      h('div', null, h('b', { style: { color: 'var(--warn)' } }, RC.weak), h('span', null, '模糊')),
      h('div', null, h('b', { style: { color: 'var(--bad)' } }, RC.wrong), h('span', null, '没记住'))),
    recallUndoBar(),
    h('div', { class: 'sec', style: { textAlign: 'left', marginTop: '20px' } },
      h('div', { class: 'list' },
        (RC.wrong + RC.weak) > 0
          ? liRow('🔁', '马上再过一遍没记住的', (RC.wrong + RC.weak) + ' 张', () => {
              const ids = RC.ids.filter(id => STUDY[id] === 'no' || STUDY[id] === 'vague');
              go({ name: 'cards', module: 'recall', title: RC.title, ids });
            })
          : null,
        liRow('📚', '这一科再滚一轮', RC.ids.length + ' 张', () => {
          go({ name: 'cards', module: 'recall', title: RC.title, ids: RC.ids.slice() });
        }))),
    h('button', { class: 'btn primary', style: { marginTop: '16px' },
      onClick: () => { RC = null; reset({ name: 'home', module: 'recall' }); } },
      '回到快速回忆首页')
  );
}

/* ------------------------------ 10. 我的 ------------------------------ */

function liRow(icon, title, sub, onClick) {
  return h('button', { class: 'li', onClick },
    h('div', { class: 'ic' }, icon),
    h('div', { class: 'grow' }, h('b', null, title), sub ? h('span', null, sub) : null),
    h('div', { class: 'chev' }, '›'));
}

VIEWS.me = function () {
  const ids = ITEMS.map(i => i.id);
  const st = countOf(ids);
  return h('div', null,
    h('div', { class: 'card', style: { padding: '16px', marginBottom: '14px' } },
      h('div', { class: 'row' },
        h('div', { class: 'subj-icon', style: { width: '48px', height: '48px', fontSize: '23px' } }, '📚'),
        h('div', { class: 'grow' },
          h('b', { style: { fontSize: '17px' } }, '心理学专业课背诵'),
          h('div', { class: 'tiny muted' }, ITEMS.length + ' 条内容 · 已学 ' + st.done +
            ' 条 · 待巩固 ' + st.weak + ' 条')))),

    h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '外观')),
      h('div', { class: 'list' },
        h('div', { class: 'sw' },
          h('div', { class: 'grow' }, h('b', null, '深色模式'),
            h('span', null, '跟随系统或手动切换')),
          h('div', { class: 'seg', style: { width: '170px' } },
            [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, t]) =>
              h('button', { class: SET.theme === v ? 'on' : '', onClick: (e) => {
                  SET.theme = v; saveSet(); applyTheme();
                  $$('button', e.currentTarget.parentNode).forEach(b => b.classList.remove('on'));
                  e.currentTarget.classList.add('on');
                } }, t)))),
        h('div', { class: 'sw' },
          h('div', { class: 'grow' }, h('b', null, '字号'), h('span', null, '感觉字小就调大')),
          h('div', { class: 'seg', style: { width: '170px' } },
            [['15', '小'], ['16', '标准'], ['18', '大'], ['20', '特大']].map(([v, t]) =>
              h('button', { class: String(SET.fs) === v ? 'on' : '', onClick: (e) => {
                  SET.fs = +v; saveSet(); applyFont();
                  $$('button', e.currentTarget.parentNode).forEach(b => b.classList.remove('on'));
                  e.currentTarget.classList.add('on');
                } }, t)))),
        h('div', { class: 'sw' },
          h('div', { class: 'grow' }, h('b', null, '震动反馈'), h('span', null, '标记时轻轻震一下')),
          h('button', { class: 'toggle' + (SET.haptic ? ' on' : ''), onClick: (e) => {
              SET.haptic = !SET.haptic; saveSet();
              e.currentTarget.classList.toggle('on', SET.haptic);
            } })))),

    h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '数据')),
      h('div', { class: 'list' },
        liRow('📥', '导出备份', '记录 + 设置，换手机用', openExportSheet),
        liRow('❓', '使用说明', '每个模块怎么用', openHelpSheet),
        liRow('🧹', '清空学习记录', '内容不受影响', () => confirmSheet(
          '清空学习记录', '会清掉所有「记住了 / 有点模糊 / 没记住」的标记。确定吗？', '清空', () => {
            STUDY = {}; DAYS = {}; OPEN = {};
            saveStudy(); LS.set(K.days, DAYS); LS.set(K.open, OPEN);
            toast('已清空'); render({ name: 'me' });
          })))),

    h('p', { class: 'tiny muted center', style: { marginTop: '18px', lineHeight: '1.9' } },
      '广东外语外贸大学 应用心理（347）',
      h('br'),
      '记录只存在这台手机上，不上传、不联网也能用')
  );
};

function openExportSheet() {
  const dump = JSON.stringify({
    app: 'psy-recite', version: 2, exportedAt: new Date().toISOString(),
    set: SET, study: STUDY, days: DAYS
  });
  openSheet('导出备份', [
    h('p', { class: 'muted tiny', style: { marginBottom: '12px', lineHeight: '1.8' } },
      '包含所有学习标记和设置，约 ' + (dump.length / 1024).toFixed(1) + ' KB。'),
    h('div', { class: 'field' },
      h('label', null, '备份内容'),
      h('textarea', { id: 'exportText', readonly: true, style: { minHeight: '110px' } }, dump)),
    h('div', { class: 'row', style: { gap: '9px' } },
      h('button', { class: 'btn primary', onClick: () => {
          const blob = new Blob([dump], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = '背诵备份-' + todayKey() + '.json';
          document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
          toast('已保存');
        } }, '保存为文件'),
      h('button', { class: 'btn ghost', onClick: () => {
          const ta = $('#exportText'); ta.select();
          if (navigator.clipboard) {
            navigator.clipboard.writeText(dump).then(() => toast('已复制'), () => toast('请长按文本框复制'));
          } else toast('请长按文本框复制');
        } }, '复制')),
    h('div', { class: 'sec mt16' },
      h('div', { class: 'sec-hd' }, h('h2', null, '从备份恢复')),
      h('div', { class: 'field' },
        h('textarea', { id: 'restoreText', placeholder: '粘贴之前导出的 JSON',
          style: { minHeight: '80px' } })),
      h('button', { class: 'btn', onClick: () => {
          const txt = ($('#restoreText').value || '').trim();
          let d;
          try { d = JSON.parse(txt); } catch (e) { toast('不是有效的备份文件'); return; }
          if (!d || d.app !== 'psy-recite') { toast('这不是本应用的备份'); return; }
          confirmSheet('恢复备份', '会覆盖当前的标记，确定吗？', '恢复', () => {
            if (d.study) STUDY = d.study;
            if (d.days) DAYS = d.days;
            if (d.set) SET = Object.assign({}, DEFAULT_SET, d.set);
            saveStudy(); saveSet(); LS.set(K.days, DAYS);
            applyTheme(); applyFont(); closeSheet();
            toast('已恢复'); render(current);
          });
        } }, '恢复'))
  ]);
}

function openHelpSheet() {
  openSheet('使用说明', [
    h('div', { class: 'expl', style: { borderTop: 'none', paddingTop: '0' } },
      h('span', { class: 'lbl' }, '四个模块'),
      '名词解释（普心 120 条 + 实验 66 条）、简答、综合、快速回忆，全部出自你的备考资料。',
      '底部导航切换模块，进去先选科目、再选章节，就能一条条往下过。',
      h('span', { class: 'lbl', style: { marginTop: '12px' } }, '名词解释 / 简答 / 综合'),
      '点标题展开答案，看完在下面点一下「没记住 / 有点模糊 / 记住了」。',
      h('span', { class: 'lbl', style: { marginTop: '12px' } }, '快速回忆'),
      '正面是考点标题，先在脑子里回忆一遍这一节的框架，点一下翻面看思维导图原文。',
      h('span', { class: 'lbl', style: { marginTop: '12px' } }, '只看没记住的'),
      '列表页顶部有开关，考前突击就靠它。',
      h('span', { class: 'lbl', style: { marginTop: '12px' } }, '数据'),
      '所有标记只存在本机浏览器，不上传。偶尔到「我的 → 导出备份」存一份。')
  ]);
}

/* ------------------------------ 11. 启动 ------------------------------ */

function init() {
  applyTheme();
  applyFont();
  loadModules();

  $('#tbBack').addEventListener('click', back);
  $('#tbMore').addEventListener('click', () => {
    if (current && current.name === 'cards' && RC) openRecallSheet();
  });
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheetMask').addEventListener('click', (e) => { if (e.target === $('#sheetMask')) closeSheet(); });
  $$('.tab').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.tab;
    RC = null;
    if (id === 'me') reset({ name: 'me' });
    else reset({ name: 'home', module: id });
  }));
  window.addEventListener('popstate', () => {
    if (!$('#sheetMask').hidden) closeSheet();
    else if (nav.length) back();
    keepHistory();
  });
  keepHistory();
  reset(homeRoute());

  if (!window.__NO_SW && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
function keepHistory() { try { history.pushState(null, ''); } catch (e) {} }

function openRecallSheet() {
  const left = RC.ids.length - RC.idx - 1;
  openSheet('本轮设置', [
    h('p', { class: 'muted tiny', style: { marginBottom: '14px' } },
      RC.title + ' · 还剩 ' + left + ' 张 · 已评 ' + (RC.ok + RC.weak + RC.wrong) + ' 张'),
    h('div', { class: 'list', style: { boxShadow: 'none', border: '1px solid var(--line)' } },
      liRow('🏁', '结束本轮，看小结', '不想背完就能先结算', () => {
        closeSheet(); RC.finished = true; $('#tbMore').hidden = true; refreshRecall();
      }),
      liRow('🔁', '只背这轮没记住的', '把队列换成待巩固的', () => {
        const ids = RC.ids.filter(id => STUDY[id] === 'no' || STUDY[id] === 'vague');
        if (!ids.length) { toast('这轮都记住了 👍'); return; }
        closeSheet();
        go({ name: 'cards', module: 'recall', title: '待巩固', ids });
      }),
      liRow('🎲', '打乱剩下没背的', '已评过的顺序不动', () => {
        const head = RC.ids.slice(0, RC.idx + 1);
        const tail = RC.ids.slice(RC.idx + 1).sort(() => Math.random() - 0.5);
        RC.ids = head.concat(tail);
        RC.last = null;
        closeSheet(); refreshRecall(); toast('已打乱');
      }),
      liRow('🚪', '先退出（进度已保存）', '回快速回忆首页', () => {
        closeSheet(); RC = null; reset({ name: 'home', module: 'recall' });
        toast('已评过的都保存了');
      }))
  ]);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
