/* ==========================================================================
   心理学刷题 · 应用主程序
   普通心理学 / 实验心理学   —— 广东外语外贸大学心理学硕士备考
   纯前端、零依赖、离线可用
   ========================================================================== */
(function () {
'use strict';

/* ==========================================================================
   1. 基础工具
   ========================================================================== */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.prototype.slice.call(r.querySelectorAll(s));

/** 轻量 DOM 构造器：h('div', {class:'x', onClick:fn}, '文本', childEl) */
const SVG_TAGS = new Set(['svg', 'circle', 'path', 'g', 'rect', 'line', 'polyline',
  'polygon', 'ellipse', 'defs', 'linearGradient', 'radialGradient', 'stop',
  'text', 'tspan', 'use', 'clipPath', 'mask', 'pattern', 'filter']);

/** 创建元素：SVG 标签必须用 SVG 命名空间，否则浏览器不会当图形渲染 */
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

/** 字符串稳定哈希（用于生成题目的持久 id，插入新题不会打乱旧记录） */
function hash(str) {
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 31) ^ c;
  }
  return ((h1 >>> 0) * 4096 + (h2 >>> 0) % 4096).toString(36);
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function todayKey(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function dayOffset(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}
function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function haptic(ms) {
  if (!SET.haptic) return;
  try { navigator.vibrate && navigator.vibrate(ms || 8); } catch (e) {}
}
function fmtTime(sec) {
  if (sec < 60) return sec + ' 秒';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return m + ' 分' + (s ? s + ' 秒' : '');
  return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
}
const LETTER = 'ABCDEFGH';
const TYPE_NAME = {
  single:   '单选',
  multiple: '多选',
  judge:    '判断',
  term:     '名词解释',
  short:    '简答',
  essay:    '论述'
};
const TYPE_COLOR = {
  single: 'gray', multiple: 'gray', judge: 'gray',
  term: '', short: '', essay: ''
};

/* ==========================================================================
   2. 本地存储
   ========================================================================== */

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
    catch (e) { toast('存储空间不足，请到「我的」清理数据'); return false; }
  },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const K = {
  prog:   'psy.prog.v1',    // 每题作答记录
  fav:    'psy.fav.v1',     // 收藏 id 数组
  set:    'psy.set.v1',     // 设置
  sess:   'psy.sess.v1',    // 上次未完成的练习（用于「继续上次」）
  custom: 'psy.custom.v1',  // 用户导入的题目
  days:   'psy.days.v1',    // 每日刷题量 { '2026-09-26': 42 }
  meta:   'psy.meta.v1'     // 首次使用等
};

const DEFAULT_SET = {
  theme: 'auto',        // auto | light | dark
  fs: 16,               // 正文字号
  instant: true,        // 选完立刻判对错
  shuffleOpt: false,    // 选项乱序
  autoNext: false,      // 答对后自动跳下一题
  autoRemoveWrong: true,// 答对后自动移出错题本
  haptic: true,         // 触感反馈
  daily: 15,            // 每日一练题量
  reciteAll: false      // 背题模式：直接显示答案
};

let SET = Object.assign({}, DEFAULT_SET, LS.get(K.set, {}));
let PROG = LS.get(K.prog, {});
let FAV = LS.get(K.fav, []);
let DAYS = LS.get(K.days, {});
let FAVSET = null;

function saveSet()  { LS.set(K.set, SET); }
function saveProg() { LS.set(K.prog, PROG); }
function saveFav()  { LS.set(K.fav, FAV); }
function saveDays() { LS.set(K.days, DAYS); }

/* ==========================================================================
   3. 题库装载与规范化
   ========================================================================== */

const QUESTIONS = [];      // 所有题目（顺序即默认顺序）
const BY_ID = new Map();   // id -> question
const SUBJECTS = [];       // [{name, icon, desc, count, chapters:[{name, ids:[], count}]}]

function normType(t) {
  const s = String(t || 'single').trim().toLowerCase();
  if (s === 's' || s === 'single' || s === '单选' || s === '单选题' || s === '单项选择') return 'single';
  if (s === 'm' || s === 'multiple' || s === 'multi' || s === '多选' || s === '多选题' || s === '多项选择') return 'multiple';
  if (s === 'j' || s === 'judge' || s === 'tf' || s === '判断' || s === '判断题') return 'judge';
  if (s === 't' || s === 'term' || s === '名词解释') return 'term';
  if (s === 'q' || s === 'short' || s === '简答' || s === '简答题') return 'short';
  if (s === 'e' || s === 'essay' || s === '论述' || s === '论述题') return 'essay';
  return 'single';
}

/** 把原始答案统一成：单选->数字，多选->升序数组，判断->布尔，主观题->字符串 */
function normAnswer(type, a, options) {
  if (type === 'judge') {
    if (typeof a === 'boolean') return a;
    const s = String(a == null ? '' : a).trim();
    if (/^(对|正确|是|true|t|√|✓|yes|y|1)$/i.test(s)) return true;
    if (/^(错|错误|否|false|f|×|x|no|n|0)$/i.test(s)) return false;
    return true;
  }
  if (type === 'multiple') {
    if (Array.isArray(a)) {
      const idx = a.map(x => typeof x === 'number' ? x : LETTER.indexOf(String(x).trim().toUpperCase()))
                   .filter(x => x >= 0);
      return idx.sort((x, y) => x - y);
    }
    const s = String(a == null ? '' : a);
    const idx = [];
    for (const ch of s.toUpperCase()) {
      const i = LETTER.indexOf(ch);
      if (i >= 0 && idx.indexOf(i) < 0) idx.push(i);
    }
    return idx.sort((x, y) => x - y);
  }
  if (type === 'single') {
    if (typeof a === 'number') return a;
    const s = String(a == null ? '' : a).trim().toUpperCase();
    const m = s.match(/[A-H]/);
    if (m) return LETTER.indexOf(m[0]);
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n - 1;
  }
  return String(a == null ? '' : a);
}

function makeQuestion(raw, subjectName, chapterName) {
  const stem = String(raw.q || raw.stem || raw.question || '').trim();
  if (!stem) return null;
  let type = normType(raw.t || raw.type);
  let options = raw.o || raw.options || raw.opts || [];
  if (typeof options === 'string') options = options.split(/\s*[|｜]\s*/);
  options = (options || []).map(x => String(x).trim()).filter(x => x !== '');

  // 自动纠偏：没有选项的单选/多选 -> 判断或主观题
  if (!options.length) {
    if (type === 'single' || type === 'multiple') {
      const s = String(raw.a === undefined ? '' : raw.a);
      type = /^(对|错|正确|错误|√|×|true|false|t|f)$/i.test(s.trim()) ? 'judge' : 'short';
    }
  } else if (type === 'single' && Array.isArray(raw.a) && raw.a.length > 1) {
    type = 'multiple';
  }

  const id = (raw.id ? String(raw.id) : '') || hash(subjectName + '|' + chapterName + '|' + stem);
  const item = {
    id,
    subject: subjectName,
    chapter: chapterName,
    type,
    stem,
    options,
    answer: normAnswer(type, raw.a !== undefined ? raw.a : raw.answer, options),
    expl: String(raw.e || raw.expl || raw.analysis || raw.exp || '').trim(),
    tags: [].concat(raw.tag || raw.tags || []).map(x => String(x)).filter(Boolean),
    custom: !!raw.custom
  };
  if (type === 'single' && (item.answer < 0 || item.answer >= options.length)) item.answer = 0;
  if (type === 'multiple' && (!item.answer.length)) item.answer = [0];
  return item;
}

function loadBank(bank) {
  if (!bank || !bank.subject || !Array.isArray(bank.chapters)) return;
  // 同名科目合并（方便把自建题目挂到内置科目下面）
  let subj = SUBJECTS.find(s => s.name === bank.subject);
  if (!subj) {
    subj = { name: bank.subject, icon: bank.icon || '📘', desc: bank.desc || '',
             chapters: [], count: 0, questionIds: [] };
    SUBJECTS.push(subj);
  } else if (subj.chapters.some(c => c.name === (bank.chapters[0] || {}).name)) {
    // 同一章节重复导入时加后缀，避免两个同名章节
    const stamp = new Date();
    bank = Object.assign({}, bank, {
      chapters: bank.chapters.map(c => Object.assign({}, c, {
        name: c.name + '（' + pad2(stamp.getMonth() + 1) + pad2(stamp.getDate()) + '导入）'
      }))
    });
  }
  for (const ch of bank.chapters) {
    const chap = { name: ch.name || '未分类', ids: [], count: 0 };
    for (const raw of (ch.items || [])) {
      const q = makeQuestion(raw, bank.subject, chap.name);
      if (!q) continue;
      QUESTIONS.push(q);
      BY_ID.set(q.id, q);
      chap.ids.push(q.id);
      subj.questionIds.push(q.id);
    }
    chap.count = chap.ids.length;
    subj.count += chap.count;
    if (chap.count) subj.chapters.push(chap);
  }
}

function loadCustom() {
  const raw = LS.get(K.custom, []);
  for (const b of raw) loadBank(Object.assign({}, b, { custom: true }));
}

/* ==========================================================================
   4. 作答记录
   ========================================================================== */

function rec(id) {
  let r = PROG[id];
  if (!r) r = PROG[id] = { n: 0, ok: 0, last: null, ts: 0, streak: 0 };
  return r;
}
/** 记录一次作答。correct: 是否正确 */
function recordAnswer(id, correct) {
  const r = rec(id);
  r.n++;
  if (correct) { r.ok++; r.streak = (r.streak || 0) + 1; }
  else r.streak = 0;
  r.last = !!correct;
  r.ts = Date.now();
  const dk = todayKey();
  DAYS[dk] = (DAYS[dk] || 0) + 1;
  saveProg(); saveDays();
  touchStreak();
}
function isDone(id)  { const r = PROG[id]; return !!(r && r.n > 0); }
function isRight(id) { const r = PROG[id]; return !!(r && r.last === true); }
function isWrong(id) { const r = PROG[id]; return !!(r && r.last === false); }
function wrongIds()  { return QUESTIONS.filter(q => isWrong(q.id)).map(q => q.id); }
function favIds()    { return FAV.filter(id => BY_ID.has(id)); }
function doneCount(ids) { return ids.filter(isDone).length; }
function rightCount(ids) { return ids.filter(isRight).length; }

/* 连续打卡 */
function touchStreak() { /* 由 calcStreak 实时计算，无需存 */
}
function calcStreak() {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const k = todayKey(dayOffset(-i));
    if ((DAYS[k] || 0) > 0) n++;
    else if (i === 0) continue;   // 今天还没刷不算断
    else break;
  }
  return n;
}

/* ==========================================================================
   5. 主题与外观
   ========================================================================== */

function applyTheme() {
  let t = SET.theme;
  if (t === 'auto') {
    t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#161822' : '#6c5ce7');
}
if (window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (SET.theme === 'auto') applyTheme();
    });
  } catch (e) {}
}

function applyFont() { document.documentElement.style.setProperty('--fs', SET.fs + 'px'); }

/* ==========================================================================
   6. Toast / 底部弹层
   ========================================================================== */

let toastTimer = null;
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || 1800);
}

function openSheet(title, bodyNodes) {
  $('#sheetTitle').textContent = title;
  const bd = $('#sheetBody');
  bd.textContent = '';
  append(bd, [bodyNodes]);
  $('#sheetMask').hidden = false;
  bd.scrollTop = 0;
}
function closeSheet() { $('#sheetMask').hidden = true; }

/* 通用确认框 */
function confirmSheet(title, msg, okLabel, onOk) {
  openSheet(title, [
    h('p', { class: 'muted', style: { fontSize: '14.5px', lineHeight: '1.7', marginBottom: '18px' } }, msg),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onClick: closeSheet }, '取消'),
      h('button', { class: 'btn primary', onClick: () => { closeSheet(); onOk(); } }, okLabel || '确定')
    )
  ]);
}

/* ==========================================================================
   7. 路由
   ========================================================================== */

const nav = [];
let current = null;

const TAB_OF = { home: 'home', wrong: 'wrong', stats: 'stats', me: 'me' };

function go(route) {           // 压栈跳转
  if (current) nav.push(current);
  render(route);
}
function back() {              // 返回上一页
  const r = nav.pop();
  if (r) render(r);
  else render({ name: 'home' });
}
function reset(route) {        // 清栈跳转（底部 tab）
  nav.length = 0;
  render(route);
}

const TITLES = {
  home: '心理学刷题',
  subject: '选择章节',
  practice: '刷题',
  result: '练习结果',
  wrong: '错题本',
  stats: '学习统计',
  me: '我的'
};

function render(route) {
  current = route;
  const v = $('#view');
  v.scrollTop = 0;

  const showTab = !!TAB_OF[route.name];
  $('#tabbar').hidden = !showTab;
  v.classList.toggle('no-tab', !showTab);
  if (showTab) {
    $$('.tab').forEach(b => b.classList.toggle('is-on', b.dataset.tab === TAB_OF[route.name]));
  }
  $('#tbTitle').textContent = route.title || TITLES[route.name] || '心理学刷题';
  $('#tbBack').hidden = !(nav.length > 0 && !showTab);
  $('#tbMore').hidden = route.name !== 'practice';

  v.textContent = '';
  const view = VIEWS[route.name];
  if (view) append(v, [view(route)]);
}

const VIEWS = {};

/* ==========================================================================
   8. 首页
   ========================================================================== */

function allIds() { return QUESTIONS.map(q => q.id); }

function overallStats() {
  const ids = allIds();
  const done = doneCount(ids);
  const right = rightCount(ids);
  return { total: ids.length, done, right, acc: pct(right, done), wrong: wrongIds().length };
}

VIEWS.home = function () {
  const today = DAYS[todayKey()] || 0;
  const st = overallStats();
  const streak = calcStreak();

  const node = h('div', null,
    /* 顶部卡片 */
    h('div', { class: 'hero' },
      h('h1', null, '今天也要加油呀'),
      h('p', null, '普通心理学 · 实验心理学'),
      h('div', { class: 'hero-stats' },
        h('div', null, h('b', null, today), h('span', null, '今日刷题')),
        h('div', null, h('b', null, streak), h('span', null, '连续打卡')),
        h('div', null, h('b', null, st.acc + '%'), h('span', null, '累计正确率'))
      )
    ),

    /* 科目 */
    h('div', { class: 'sec mt16' },
      h('div', { class: 'sec-hd' }, h('h2', null, '按科目刷题')),
      ...SUBJECTS.map(subjCard)
    ),

    /* 快速开始 */
    h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '快速开始')),
      h('div', { class: 'grid' },
        tile('📅', '每日一练', '每天 ' + SET.daily + ' 题', () => startDaily()),
        tile('🎲', '随机测试', '全部科目 · ' + Math.min(30, QUESTIONS.length) + ' 题', () => startRandom()),
        tile('🔄', '继续上次', lastSessionLabel(), resumeSession),
        tile('📖', '背题模式', '直接看答案背诵', () => startRecite())
      )
    ),

    /* 其他入口 */
    h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '强化训练')),
      h('div', { class: 'list' },
        liRow('❌', '错题本', wrongIds().length + ' 题待攻克', () => reset({ name: 'wrong' })),
        liRow('⭐', '我的收藏', favIds().length + ' 题', () => startFav()),
        liRow('🆕', '还没做过', (QUESTIONS.length - st.done) + ' 题', () => startNew()),
        liRow('📤', '导入题库', '支持粘贴文本 / JSON', () => openImportSheet())
      )
    ),

    h('p', { class: 'tiny muted center', style: { marginTop: '18px', lineHeight: '1.8' } },
      '共 ' + QUESTIONS.length + ' 道题 · 数据保存在本机，不会上传',
      h('br'),
      '做题时左右滑动可以切换上一题 / 下一题'
    )
  );
  return node;
};

function subjCard(subj) {
  const st = statsOf(subj.questionIds);
  return h('button', { class: 'subj', style: { marginBottom: '10px' }, onClick: () => go({ name: 'subject', subject: subj.name }) },
    h('div', { class: 'subj-top' },
      h('div', { class: 'subj-icon' }, subj.icon),
      h('div', { class: 'grow' },
        h('b', { class: 'ellipsis' }, subj.name),
        h('div', { class: 'meta' }, subj.chapters.length + ' 章 · ' + subj.count + ' 题 · 已做 ' + st.done + ' 题')
      ),
      h('div', { class: 'subj-ring' },
        h('em', null, st.acc + '%'),
        h('span', null, '正确率')
      )
    ),
    h('div', { class: 'bar' }, h('i', { style: { width: pct(st.done, subj.count) + '%' } }))
  );
}

function tile(icon, title, sub, onClick) {
  return h('button', { class: 'tile', onClick },
    h('div', { class: 'ic' }, icon),
    h('b', null, title),
    h('span', null, sub)
  );
}
function liRow(icon, title, sub, onClick, right) {
  return h('button', { class: 'li', onClick, disabled: onClick ? null : true },
    h('div', { class: 'ic' }, icon),
    h('div', { class: 'grow' },
      h('b', null, title),
      sub ? h('span', null, sub) : null
    ),
    right ? h('div', { class: 'val' }, right) : null,
    h('div', { class: 'chev' }, '›')
  );
}

function statsOf(ids) {
  const done = doneCount(ids), right = rightCount(ids);
  return { total: ids.length, done, right, acc: pct(right, done) };
}

/* ==========================================================================
   9. 章节选择
   ========================================================================== */

VIEWS.subject = function (route) {
  const subj = SUBJECTS.find(s => s.name === route.subject) || SUBJECTS[0];
  if (!subj) return h('div', { class: 'empty' }, '题库为空');
  const st = statsOf(subj.questionIds);

  const node = h('div', null,
    h('div', { class: 'card', style: { padding: '15px', marginBottom: '14px' } },
      h('div', { class: 'row' },
        h('div', { class: 'subj-icon' }, subj.icon),
        h('div', { class: 'grow' },
          h('b', { style: { fontSize: '16.5px', fontWeight: '650' } }, subj.name),
          h('div', { class: 'meta tiny muted' }, subj.desc || (subj.count + ' 题'))
        )
      ),
      h('div', { class: 'bar', style: { marginTop: '13px' } },
        h('i', { style: { width: pct(st.done, subj.count) + '%' } })),
      h('div', { class: 'row tiny muted', style: { marginTop: '7px', justifyContent: 'space-between' } },
        h('span', null, '已做 ' + st.done + ' / ' + st.total),
        h('span', null, '正确率 ' + st.acc + '%')
      )
    ),

    h('div', { class: 'grid', style: { marginBottom: '16px' } },
      h('button', { class: 'btn primary', style: { flex: '1' },
        onClick: () => startSession({
          title: subj.name + ' · 顺序练习', ids: subj.questionIds, shuffle: false }) }, '顺序刷完这一科'),
      h('button', { class: 'btn', style: { flex: '1' },
        onClick: () => startSession({
          title: subj.name + ' · 随机练习', ids: subj.questionIds, shuffle: true }) }, '随机抽题')
    ),

    ...subj.chapters.map(ch => {
      const cst = statsOf(ch.ids);
      const cls = cst.done === 0 ? '' : (cst.acc >= 80 ? 'done' : (cst.acc >= 60 ? 'mid' : ''));
      return h('div', { class: 'list', style: { marginBottom: '9px' } },
        h('button', { class: 'li', onClick: () => startSession({
            title: ch.name, ids: ch.ids, shuffle: false }) },
          h('div', { class: 'chap-dot ' + cls }),
          h('div', { class: 'grow' },
            h('b', { class: 'ellipsis' }, ch.name),
            h('span', null, ch.count + ' 题 · 已做 ' + cst.done + (cst.done ? ' · 正确率 ' + cst.acc + '%' : ''))
          ),
          h('div', { class: 'chev' }, '›')
        )
      );
    })
  );
  return node;
};

/* ==========================================================================
   10. 练习会话
   ========================================================================== */

let S = null;   // 当前会话

function newSession(opts) {
  let ids = opts.ids.slice();
  ids = ids.filter(id => BY_ID.has(id));
  if (opts.shuffle) ids = shuffle(ids);
  if (opts.limit && ids.length > opts.limit) ids = ids.slice(0, opts.limit);
  return {
    title: opts.title || '练习',
    ids,
    idx: 0,
    picks: {},       // id -> 已选（单选:number 多选:array 判断:bool）
    judged: {},      // id -> true 已判题
    results: {},     // id -> true/false 主观题自评
    order: {},       // id -> 选项展示顺序（选项乱序时使用）
    instant: opts.instant !== undefined ? opts.instant : SET.instant,
    recite: !!opts.recite,
    startedAt: Date.now(),
    finished: false
  };
}

function saveSession() {
  if (!S || S.finished) { LS.del(K.sess); return; }
  LS.set(K.sess, { title: S.title, ids: S.ids, idx: S.idx, picks: S.picks,
                   judged: S.judged, results: S.results, order: S.order, instant: S.instant,
                   recite: S.recite, startedAt: S.startedAt });
}
function lastSession() {
  const s = LS.get(K.sess, null);
  if (!s || !Array.isArray(s.ids) || !s.ids.length) return null;
  if (!s.ids.some(id => BY_ID.has(id))) return null;
  return s;
}
function lastSessionLabel() {
  const s = lastSession();
  if (!s) return '还没有未完成的练习';
  return s.title + ' · 第 ' + (Math.min(s.idx + 1, s.ids.length)) + '/' + s.ids.length + ' 题';
}
function resumeSession() {
  const s = lastSession();
  if (!s) { toast('还没有未完成的练习'); return; }
  S = s;
  S.order = S.order || {};
  S.finished = false;
  go({ name: 'practice', title: S.title });
}

function startSession(opts) {
  if (!opts.ids || !opts.ids.length) { toast('这里还没有题目'); return; }
  S = newSession(opts);
  saveSession();
  go({ name: 'practice', title: S.title });
}
function startDaily() {
  const ids = pickSmart(SET.daily);
  startSession({ title: '每日一练', ids, shuffle: true, instant: true });
}
function startRandom() {
  const n = Math.min(30, QUESTIONS.length);
  startSession({ title: '随机测试 · ' + n + ' 题', ids: allIds(), shuffle: true, limit: n });
}
function startRecite() {
  startSession({ title: '背题模式', ids: allIds(), shuffle: true, recite: true, instant: false });
}
function startFav() {
  const ids = favIds();
  if (!ids.length) { toast('还没有收藏题目，点题目下方的 ☆ 收藏'); return; }
  startSession({ title: '我的收藏', ids, shuffle: true });
}
function startNew() {
  const ids = QUESTIONS.filter(q => !isDone(q.id)).map(q => q.id);
  if (!ids.length) { toast('所有题目都做过了！'); return; }
  startSession({ title: '还没做过的题', ids, shuffle: true });
}
function startWrong() {
  const ids = wrongIds();
  if (!ids.length) { toast('错题本是空的，很棒'); return; }
  startSession({ title: '错题重做', ids, shuffle: true });
}

/** 智能抽题：优先未做过的和做错的，兼顾各章节均衡 */
function pickSmart(n) {
  const byChapter = new Map();
  for (const q of QUESTIONS) {
    if (!byChapter.has(q.chapter)) byChapter.set(q.chapter, []);
    byChapter.get(q.chapter).push(q.id);
  }
  const score = id => {
    const r = PROG[id];
    if (!r || r.n === 0) return 3;          // 没做过
    if (r.last === false) return 2;         // 上次做错
    if (r.streak >= 2) return 0;            // 已掌握
    return 1;                               // 做过但不稳
  };
  const buckets = [[], [], [], []];
  for (const q of QUESTIONS) buckets[score(q.id)].push(q.id);
  const out = [];
  const groups = [shuffle(buckets[3]), shuffle(buckets[2]), shuffle(buckets[1]), shuffle(buckets[0])];
  const chapterSeen = new Map();
  while (out.length < n) {
    let added = false;
    for (const g of groups) {
      // 在每个优先级桶里，尽量先取本章节出现次数少的
      let best = -1, bestC = 1e9;
      for (let i = 0; i < g.length; i++) {
        const c = chapterSeen.get(BY_ID.get(g[i]).chapter) || 0;
        if (c < bestC) { bestC = c; best = i; }
        if (bestC === 0) break;
      }
      if (best >= 0) {
        const id = g.splice(best, 1)[0];
        const ch = BY_ID.get(id).chapter;
        chapterSeen.set(ch, (chapterSeen.get(ch) || 0) + 1);
        out.push(id);
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  // 不够就整体随机补
  if (out.length < n) {
    for (const id of shuffle(allIds())) {
      if (out.length >= n) break;
      if (out.indexOf(id) < 0) out.push(id);
    }
  }
  return shuffle(out);
}

/* ---------------- 练习视图 ---------------- */

VIEWS.practice = function () {
  if (!S || !S.ids.length) return h('div', { class: 'empty' }, '没有题目');
  if (S.idx >= S.ids.length) S.idx = S.ids.length - 1;
  if (S.idx < 0) S.idx = 0;

  const wrap = h('div', { class: 'practice' });
  wrap.appendChild(qProgressBar());
  const body = h('div', { id: 'qbody' });
  body.appendChild(questionBody());
  wrap.appendChild(body);
  wrap.appendChild(questionActions());
  return wrap;
};

function qProgressBar() {
  const answered = Object.keys(S.judged).length;
  return h('div', null,
    h('div', { class: 'qprog' },
      h('i', { style: { width: pct(S.idx + 1, S.ids.length) + '%' } })),
    h('div', { class: 'q-head' },
      h('span', { class: 'pill ellipsis', style: { maxWidth: '42vw' } },
        curQ().chapter.replace(/^第\d+章\s*/, '')),
      h('span', { class: 'pill ' + (TYPE_COLOR[curQ().type] || '') }, TYPE_NAME[curQ().type]),
      h('button', { class: 'q-count', onClick: openNavigatorSheet, title: '展开题目导航' },
        (S.idx + 1) + ' / ' + S.ids.length + (answered ? ' · 已答' + answered : ''),
        iconGrid())
    )
  );
}

/** 小宫格图标（题目导航） */
function iconGrid() {
  const sq = (x, y) => h('rect', { x: String(x), y: String(y), width: '7', height: '7', rx: '2' });
  return h('svg', { viewBox: '0 0 24 24', width: '15', height: '15',
    style: { fill: 'none', stroke: 'currentColor', strokeWidth: '2' } },
    sq(3.5, 3.5), sq(13.5, 3.5), sq(3.5, 13.5), sq(13.5, 13.5));
}

function curQ() { return BY_ID.get(S.ids[S.idx]) || QUESTIONS[0]; }

function questionBody() {
  const q = curQ();
  const judged = !!S.judged[q.id];
  const nodes = [];

  nodes.push(h('div', { class: 'q-stem' },
    h('span', { class: 'idx' }, (S.idx + 1) + '.'),
    q.stem,
    q.tags.length ? h('div', { class: 'q-meta' },
      q.tags.map(t => h('span', { class: 'tag' + (/高频|必考|重点/.test(t) ? ' hot' : '') }, t))) : null
  ));

  if (q.type === 'term' || q.type === 'short' || q.type === 'essay') {
    nodes.push(reciteBlock(q, judged));
    return h('div', null, nodes);
  }

  if (q.type === 'judge') {
    nodes.push(optionList(q, judged, [
      { label: '正确', key: '√', value: true },
      { label: '错误', key: '×', value: false }
    ]));
  } else {
    nodes.push(optionList(q, judged, q.options.map((t, i) => ({
      label: t, key: LETTER[i], value: i
    }))));
  }

  if (judged || S.recite) nodes.push(answerBox(q));
  return h('div', null, nodes);
}

function optionList(q, judged, entries) {
  const pick = S.picks[q.id];
  const correct = q.answer;
  const multi = q.type === 'multiple';
  const order = displayOrder(q, entries);

  return h('div', { class: 'opts' }, order.map((en, di) => {
    let cls = 'opt';
    let isPicked;
    if (multi) isPicked = Array.isArray(pick) && pick.indexOf(en.value) >= 0;
    else isPicked = pick === en.value;

    const isAns = multi ? (Array.isArray(correct) && correct.indexOf(en.value) >= 0) : correct === en.value;
    if (judged) {
      if (isAns) cls += ' right';
      else if (isPicked) cls += ' wrong';
    } else if (isPicked) cls += ' picked';

    return h('button', {
      class: cls, disabled: judged,
      onClick: () => onPick(q, en.value, judged)
    },
      h('span', { class: 'key' }, multi ? en.key : LETTER[di]),
      h('span', { class: 'txt' }, en.label)
    );
  }));
}

/** 选项展示顺序。开启「选项乱序」时对单选题做稳定乱序（同一题每次顺序一致） */
function displayOrder(q, entries) {
  if (!(SET.shuffleOpt && q.type === 'single') || entries.length < 2) return entries;
  if (!S.order) S.order = {};
  if (!S.order[q.id] || S.order[q.id].length !== entries.length) {
    const idx = entries.map((_, i) => i);
    S.order[q.id] = idx.sort((a, b) =>
      (hash(q.id + '#' + a) % 9973) - (hash(q.id + '#' + b) % 9973) || a - b);
  }
  return S.order[q.id].map(i => entries[i]);
}

/** 某个原始选项索引在当前展示顺序里的字母 */
function displayLetter(q, value) {
  if (q.type !== 'single') return '';
  const order = displayOrder(q, q.options.map((t, i) => ({ label: t, key: LETTER[i], value: i })));
  const pos = order.findIndex(e => e.value === value);
  return LETTER[pos >= 0 ? pos : value];
}

function reciteBlock(q, judged) {
  const show = judged || S.recite || SET.reciteAll;
  const res = S.results[q.id];
  return h('div', null,
    show
      ? h('div', { class: 'answer-box' },
          h('div', { class: 'expl' },
            h('span', { class: 'lbl' }, '参考答案'),
            h('div', { class: 'ref-ans' }, q.answer || '（暂无参考答案）')
          ),
          q.expl ? h('div', { class: 'expl', style: { marginTop: '12px', borderTop: 'none', paddingTop: '0' } },
            h('span', { class: 'lbl' }, '知识点'),
            q.expl) : null,
          h('div', { class: 'self-eval' },
            h('button', { class: 'btn ' + (res === true ? 'primary' : 'ghost'),
              onClick: () => selfEval(q, true) }, '✓ 背下来了'),
            h('button', { class: 'btn ' + (res === false ? 'primary' : 'ghost'),
              onClick: () => selfEval(q, false) }, '✗ 还没记住')
          )
        )
      : h('div', { class: 'recite-hint' },
          h('div', { style: { fontSize: '26px', marginBottom: '6px' } }, '🧠'),
          '先在心里默背一遍，',
          h('br'),
          '想好了再点下面的「看答案」'
        )
  );
}

function selfEval(q, ok) {
  S.results[q.id] = ok;
  S.judged[q.id] = true;
  recordAnswer(q.id, ok);
  haptic(ok ? 10 : 20);
  saveSession();
  refreshBody();
  if (ok && SET.autoNext) setTimeout(nextQuestion, 320);
}

function onPick(q, value, judged) {
  if (judged) return;
  if (q.type === 'multiple') {
    let arr = Array.isArray(S.picks[q.id]) ? S.picks[q.id].slice() : [];
    const i = arr.indexOf(value);
    if (i >= 0) arr.splice(i, 1); else arr.push(value);
    arr.sort((a, b) => a - b);
    S.picks[q.id] = arr;
    refreshBody();
    refreshActions();
    return;
  }
  S.picks[q.id] = value;
  if (S.instant) judge(q);
  else { refreshBody(); refreshActions(); }
}

function sameSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function judge(q) {
  const pick = S.picks[q.id];
  let ok;
  if (q.type === 'multiple') ok = sameSet(pick, q.answer);
  else ok = pick === q.answer;
  S.judged[q.id] = true;
  S.results[q.id] = ok;
  recordAnswer(q.id, ok);
  haptic(ok ? 10 : [12, 40, 12]);
  saveSession();
  refreshBody();
  refreshActions();
  if (ok && SET.autoNext) setTimeout(nextQuestion, 520);
}

function refreshActions() {
  const acts = $('#qactions');
  if (!acts) return;
  acts.textContent = '';
  append(acts, [questionActions()]);
}

function answerBox(q) {
  const ok = S.results[q.id];
  if (S.recite && ok === undefined) {
    return h('div', { class: 'answer-box' },
      h('div', { class: 'ans-line' },
        '正确答案：', h('b', null, answerText(q))),
      q.expl ? h('div', { class: 'expl' },
        h('span', { class: 'lbl' }, '知识点'),
        q.expl) : null
    );
  }
  return h('div', { class: 'answer-box' },
    h('div', { class: 'verdict ' + (ok ? 'ok' : 'bad') },
      ok ? '✓ 答对了' : '✕ 答错了'),
    h('div', { class: 'ans-line' },
      '正确答案：', h('b', null, answerText(q))
    ),
    q.expl ? h('div', { class: 'expl' },
      h('span', { class: 'lbl' }, '解析'),
      q.expl) : null
  );
}

function answerText(q) {
  if (q.type === 'judge') return q.answer ? '正确' : '错误';
  if (q.type === 'multiple') return q.answer.map(i => LETTER[i]).join('');
  if (q.type === 'single') return displayLetter(q, q.answer) + '. ' + (q.options[q.answer] || '');
  return '';
}

function questionActions() {
  const q = curQ();
  const judged = !!S.judged[q.id];
  const fav = FAV.indexOf(q.id) >= 0;
  const pick = S.picks[q.id];
  const hasPick = Array.isArray(pick) ? pick.length > 0 : pick !== undefined;
  const needSubmit = !judged && !S.recite && (
    q.type === 'multiple'
      ? hasPick
      : ((q.type === 'single' || q.type === 'judge') && hasPick && !S.instant)
  );
  const isRecite = q.type === 'term' || q.type === 'short' || q.type === 'essay';

  return h('div', { class: 'q-actions', id: 'qactions' },
    h('button', {
      class: 'icon-btn' + (fav ? ' on' : ''),
      onClick: () => {
        const i = FAV.indexOf(q.id);
        if (i >= 0) { FAV.splice(i, 1); toast('已取消收藏'); }
        else { FAV.push(q.id); toast('已收藏 ⭐'); }
        saveFav(); refreshBody();
        refreshActions();
      }
    }, fav ? '⭐' : '☆'),
    h('button', { class: 'icon-btn', onClick: openNavigatorSheet, title: '题目导航' }, iconGrid()),
    S.idx > 0 ? h('button', { class: 'btn ghost sm', style: { flex: '0 0 auto', padding: '13px 15px' },
      onClick: prevQuestion }, '上一题') : null,
    needSubmit
      ? h('button', { class: 'btn primary', onClick: () => judge(q) }, '提交答案')
      : (isRecite && !judged && !S.recite
          ? h('button', { class: 'btn primary',
              onClick: () => { S.judged[q.id] = true; saveSession(); refreshBody(); refreshActions(); } }, '看答案')
          : h('button', {
              class: 'btn ' + (judged || S.recite || isRecite ? 'primary' : 'ghost'),
              onClick: nextQuestion
            }, S.idx >= S.ids.length - 1 ? '完成练习'
               : (judged || S.recite || isRecite ? '下一题' : '跳过'))
        )
  );
}

function refreshBody() {
  const body = $('#qbody');
  if (!body) return;
  body.textContent = '';
  body.appendChild(questionBody());
  const prog = $('.qprog i');
  if (prog) prog.style.width = pct(S.idx + 1, S.ids.length) + '%';
  const cnt = $('.q-count');
  if (cnt) cnt.textContent = (S.idx + 1) + ' / ' + S.ids.length +
    (Object.keys(S.judged).length ? ' · 已答' + Object.keys(S.judged).length : '');
}
function rerenderPractice() {
  const v = $('#view');
  v.textContent = '';
  append(v, [VIEWS.practice({ name: 'practice' })]);
}
function nextQuestion() {
  if (S.idx >= S.ids.length - 1) { finishSession(); return; }
  S.idx++;
  saveSession();
  rerenderPractice();
  const v = $('#view'); v.scrollTop = 0;
}
function prevQuestion() {
  if (S.idx <= 0) return;
  S.idx--;
  saveSession();
  rerenderPractice();
  const v = $('#view'); v.scrollTop = 0;
}
function gotoQuestion(i) {
  S.idx = clamp(i, 0, S.ids.length - 1);
  saveSession();
  rerenderPractice();
  const v = $('#view'); v.scrollTop = 0;
}

/* ---------------- 结算 ---------------- */

function finishSession() {
  S.finished = true;
  LS.del(K.sess);
  const ids = S.ids;
  const answered = ids.filter(id => S.judged[id]);
  const right = answered.filter(id => S.results[id] === true);
  const wrong = answered.filter(id => S.results[id] === false);
  const skipped = ids.filter(id => !S.judged[id]);
  const secs = Math.max(1, Math.round((Date.now() - S.startedAt) / 1000));
  S.summary = { ids, answered: answered.length, right: right.length,
                wrong: wrong.length, skipped: skipped.length, secs };
  reset({ name: 'result' });
}

VIEWS.result = function () {
  const s = (S && S.summary) || { ids: [], answered: 0, right: 0, wrong: 0, skipped: 0, secs: 0 };
  const acc = pct(s.right, s.answered);
  const total = s.ids.length;
  const wrongIdList = S ? s.ids.filter(id => S.results[id] === false) : [];
  const C = 2 * Math.PI * 56;
  const ringColor = acc >= 80 ? 'var(--ok)' : acc >= 60 ? 'var(--warn)' : 'var(--bad)';
  const ring = h('div', { class: 'ring' },
    h('svg', { viewBox: '0 0 132 132', style: { position: 'absolute', inset: '0', width: '100%', height: '100%', transform: 'rotate(-90deg)' } },
      h('circle', { cx: '66', cy: '66', r: '56',
        style: { fill: 'none', stroke: 'var(--line)', strokeWidth: '10' } }),
      h('circle', { cx: '66', cy: '66', r: '56',
        style: { fill: 'none', stroke: ringColor, strokeWidth: '10', strokeLinecap: 'round',
                 strokeDasharray: String(C), strokeDashoffset: String(C * (1 - acc / 100)),
                 transition: 'stroke-dashoffset .7s ease' } })
    ),
    h('div', { class: 'inner' },
      h('b', null, acc + '%'),
      h('span', null, '正确率')
    )
  );

  const praise = acc >= 90 ? '太强了！这套题基本拿下 🎉'
    : acc >= 75 ? '不错，再把错题过一遍就更稳了'
    : acc >= 50 ? '有基础，错题需要重点复习'
    : '这块还比较薄弱，建议先看一遍书再来';

  return h('div', null,
    h('div', { class: 'result' },
      ring,
      h('h2', null, praise),
      h('p', { class: 'muted tiny' }, (S && S.title ? S.title + ' · ' : '') + '用时 ' + fmtTime(s.secs)),
      h('div', { class: 'res-grid' },
        h('div', null, h('b', { style: { color: 'var(--ok)' } }, s.right), h('span', null, '答对')),
        h('div', null, h('b', { style: { color: 'var(--bad)' } }, s.wrong), h('span', null, '答错')),
        h('div', null, h('b', null, s.skipped), h('span', null, '未答'))
      )
    ),
    h('div', { class: 'sec' },
      h('div', { class: 'list' },
        liRow('🔁', '再做一遍这套题', total + ' 题', () => {
          startSession({ title: S.title, ids: S.ids, shuffle: true });
        }),
        wrongIdList.length
          ? liRow('❌', '只重做错题', wrongIdList.length + ' 题', () => {
              startSession({ title: '错题重做', ids: wrongIdList, shuffle: true });
            })
          : null,
        liRow('📖', '看错题解析', '进入错题本', () => reset({ name: 'wrong' }))
      )
    ),
    h('button', { class: 'btn primary', style: { marginTop: '6px' },
      onClick: () => { S = null; reset({ name: 'home' }); } }, '回到首页')
  );
};

/* ==========================================================================
   11. 错题本
   ========================================================================== */

VIEWS.wrong = function () {
  const ids = wrongIds();
  if (!ids.length) {
    return h('div', { class: 'empty' },
      h('div', { class: 'ic' }, '🌿'),
      h('b', null, '错题本是空的'),
      h('p', null, '做错的题会自动收到这里，', h('br'), '答对之后就会自动移出去。')
    );
  }

  const bySubject = new Map();
  for (const id of ids) {
    const q = BY_ID.get(id);
    if (!bySubject.has(q.subject)) bySubject.set(q.subject, new Map());
    const chMap = bySubject.get(q.subject);
    if (!chMap.has(q.chapter)) chMap.set(q.chapter, []);
    chMap.get(q.chapter).push(q);
  }

  const groups = [];
  for (const [subjName, chMap] of bySubject) {
    const subjIds = ids.filter(id => BY_ID.get(id).subject === subjName);
    groups.push(h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' },
        h('h2', null, subjName),
        h('span', { class: 'more' }, subjIds.length + ' 题')
      ),
      h('div', { class: 'list' },
        ...[...chMap.entries()].map(([chName, qs]) =>
          liRow('·', chName.replace(/^第\d+章\s*/, ''),
            qs.length + ' 道错题',
            () => startSession({ title: '错题 · ' + chName, ids: qs.map(q => q.id), shuffle: true }),
            '重做')
        )
      )
    ));
  }

  return h('div', null,
    h('div', { class: 'card', style: { padding: '16px', marginBottom: '14px' } },
      h('div', { class: 'row' },
        h('div', { class: 'subj-icon', style: { background: 'var(--bad-soft)', color: 'var(--bad)' } }, '❌'),
        h('div', { class: 'grow' },
          h('b', { style: { fontSize: '17px', fontWeight: '700' } }, ids.length + ' 道错题待攻克'),
          h('div', { class: 'tiny muted' }, '答对后自动移出（可在「我的」里关闭）')
        )
      ),
      h('div', { class: 'row', style: { marginTop: '14px', gap: '9px' } },
        h('button', { class: 'btn primary', onClick: startWrong }, '全部重做一遍'),
        h('button', { class: 'btn ghost', style: { flex: '0 0 auto' },
          onClick: () => confirmSheet('清空错题本',
            '会把所有错题从错题本里移除（作答记录和正确率统计会保留）。确定吗？',
            '清空', () => {
              for (const id of wrongIds()) {
                const r = PROG[id];
                if (r) { r.last = null; }
              }
              saveProg();
              toast('错题本已清空');
              render({ name: 'wrong' });
            }) }, '清空')
      )
    ),
    ...groups
  );
};

/* ==========================================================================
   12. 统计
   ========================================================================== */

VIEWS.stats = function () {
  const st = overallStats();
  const today = DAYS[todayKey()] || 0;
  const days7 = sumDays(7), days30 = sumDays(30);
  const streak = calcStreak();

  return h('div', null,
    h('div', { class: 'stat-cards' },
      statCard('今日刷题', today + ' 题', '目标 ' + SET.daily + ' 题'),
      statCard('连续打卡', streak + ' 天', '别断了呀'),
      statCard('累计正确率', st.acc + '%', st.right + ' / ' + st.done + ' 题'),
      statCard('错题', st.wrong + ' 题', '错题本里')
    ),

    h('div', { class: 'sec mt16' },
      h('div', { class: 'sec-hd' }, h('h2', null, '刷题量')),
      h('div', { class: 'card', style: { padding: '15px' } },
        h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '12px' } },
          h('div', null, h('b', { style: { fontSize: '20px' } }, days7), h('span', { class: 'tiny muted' }, ' 题 / 近 7 天')),
          h('div', null, h('b', { style: { fontSize: '20px' } }, days30), h('span', { class: 'tiny muted' }, ' 题 / 近 30 天'))
        ),
        heatmap()
      )
    ),

    h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '总体进度')),
      h('div', { class: 'card', style: { padding: '15px' } },
        h('div', { class: 'row tiny muted', style: { justifyContent: 'space-between', marginBottom: '7px' } },
          h('span', null, '题库完成度'), h('span', null, st.done + ' / ' + st.total + ' 题')),
        h('div', { class: 'bar' }, h('i', { style: { width: pct(st.done, st.total) + '%' } }))
      )
    ),

    ...SUBJECTS.map(subj => {
      const sst = statsOf(subj.questionIds);
      return h('div', { class: 'sec' },
        h('div', { class: 'sec-hd' },
          h('h2', null, subj.icon + ' ' + subj.name),
          h('span', { class: 'more' }, sst.acc + '%')
        ),
        h('div', { class: 'card', style: { padding: '15px 15px 5px' } },
          ...subj.chapters.map(ch => {
            const cst = statsOf(ch.ids);
            const cls = cst.done === 0 ? '' : (cst.acc >= 80 ? 'high' : (cst.acc >= 60 ? 'mid' : 'low'));
            return h('div', { class: 'chapbar' },
              h('div', { class: 't' },
                h('span', { class: 'ellipsis' }, ch.name.replace(/^第(\d+)章\s*/, '第$1章 · ')),
                h('em', null, cst.done === 0 ? '未做' : cst.acc + '%')
              ),
              h('div', { class: 'bar' },
                h('i', { class: cls, style: { width: cst.done === 0 ? '0%' : Math.max(4, cst.acc) + '%' } }))
            );
          })
        )
      );
    })
  );
};

function statCard(label, big, sub) {
  return h('div', { class: 'stat-card' },
    h('span', null, label),
    h('b', null, big),
    h('span', { class: 'tiny' }, sub)
  );
}
function sumDays(n) {
  let s = 0;
  for (let i = 0; i < n; i++) s += DAYS[todayKey(dayOffset(-i))] || 0;
  return s;
}
function heatmap() {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const dow = (now.getDay() + 6) % 7;           // 周一 = 0
  const start = new Date(now);
  start.setDate(start.getDate() - dow - 12 * 7);  // 12 周前的周一
  const cells = [];
  const vals = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 13; c++) {
      const d = new Date(start);
      d.setDate(d.getDate() + c * 7 + r);
      const future = d > now;
      const v = future ? 0 : (DAYS[todayKey(d)] || 0);
      vals.push(v);
      cells.push({ d, v, future });
    }
  }
  const max = Math.max(SET.daily, ...vals) || 1;
  return h('div', null,
    h('div', { class: 'heat' }, cells.map(c => {
      if (c.future) return h('i', { style: { opacity: '.35' } });
      if (!c.v) return h('i');
      const lvl = clamp(Math.ceil((c.v / max) * 4), 1, 4);
      return h('i', { class: 'l' + lvl });
    })),
    h('div', { class: 'row tiny muted', style: { marginTop: '9px', justifyContent: 'space-between' } },
      h('span', null, '13 周前'),
      h('span', null, '今天'),
      h('span', { class: 'row', style: { gap: '3px' } },
        h('span', null, '少'),
        h('i', { style: { width: '11px', height: '11px', borderRadius: '3px', background: 'var(--heat0)', display: 'block' } }),
        h('i', { style: { width: '11px', height: '11px', borderRadius: '3px', background: '#a99bf7', display: 'block' } }),
        h('i', { style: { width: '11px', height: '11px', borderRadius: '3px', background: '#6c5ce7', display: 'block' } }),
        h('span', null, '多')
      )
    )
  );
}

/* ==========================================================================
   13. 我的 / 设置
   ========================================================================== */

VIEWS.me = function () {
  const st = overallStats();
  return h('div', null,
    h('div', { class: 'card', style: { padding: '16px', marginBottom: '14px' } },
      h('div', { class: 'row' },
        h('div', { class: 'subj-icon', style: { width: '48px', height: '48px', fontSize: '23px' } }, '📚'),
        h('div', { class: 'grow' },
          h('b', { style: { fontSize: '17px' } }, '心理学刷题'),
          h('div', { class: 'tiny muted' }, '题库 ' + st.total + ' 题 · 已做 ' + st.done + ' 题')
        )
      )
    ),

    /* 学习设置 */
    h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '刷题设置')),
      h('div', { class: 'list' },
        swRow('选完立刻判对错', '关掉之后要先点「提交答案」', 'instant'),
        swRow('答对后自动下一题', '节奏快一点', 'autoNext'),
        swRow('答对自动移出错题本', '错题本只留最近还错的题', 'autoRemoveWrong'),
        swRow('选项顺序打乱', '防止靠位置记答案', 'shuffleOpt'),
        swRow('背题模式默认展开答案', '名词解释 / 简答直接显示', 'reciteAll'),
        h('div', { class: 'sw' },
          h('div', { class: 'grow' },
            h('b', null, '每日一练题量'),
            h('span', null, '每天按掌握程度智能抽题')
          ),
          h('div', { class: 'seg', style: { width: '150px' } },
            [10, 15, 20, 30].map(n => h('button', {
              class: SET.daily === n ? 'on' : '',
              onClick: (e) => {
                SET.daily = n; saveSet();
                $$('button', e.target.parentNode).forEach(b => b.classList.remove('on'));
                e.target.classList.add('on');
              }
            }, n))
          )
        )
      )
    ),

    /* 外观 */
    h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '外观')),
      h('div', { class: 'list' },
        h('div', { class: 'sw' },
          h('div', { class: 'grow' }, h('b', null, '主题'), h('span', null, '深色模式更护眼')),
          h('div', { class: 'seg', style: { width: '170px' } },
            [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, t]) =>
              h('button', {
                class: SET.theme === v ? 'on' : '',
                onClick: (e) => {
                  SET.theme = v; saveSet(); applyTheme();
                  $$('button', e.target.parentNode).forEach(b => b.classList.remove('on'));
                  e.target.classList.add('on');
                }
              }, t))
          )
        ),
        h('div', { class: 'sw' },
          h('div', { class: 'grow' }, h('b', null, '字号'), h('span', null, '感觉字小就调大一点')),
          h('div', { class: 'seg', style: { width: '170px' } },
            [['15', '小'], ['16', '标准'], ['18', '大'], ['20', '特大']].map(([v, t]) =>
              h('button', {
                class: String(SET.fs) === v ? 'on' : '',
                onClick: (e) => {
                  SET.fs = +v; saveSet(); applyFont();
                  $$('button', e.target.parentNode).forEach(b => b.classList.remove('on'));
                  e.target.classList.add('on');
                }
              }, t))
          )
        ),
        swRow('震动反馈', '答题时轻微震动', 'haptic')
      )
    ),

    /* 题库 */
    h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '题库')),
      h('div', { class: 'list' },
        liRow('📤', '导入题目', '粘贴文本或 JSON，不用改代码', openImportSheet),
        liRow('📥', '导出备份', '包含进度、收藏和自建题库', openExportSheet),
        liRow('🗂', '查看题库结构', '各科目章节与题目数量', openBankSheet)
      )
    ),

    /* 数据 */
    h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '数据')),
      h('div', { class: 'list' },
        liRow('❓', '使用说明', '怎么刷、怎么加题、怎么放手机上', openHelpSheet),
        liRow('🧹', '清空所有做题记录', '题库和收藏不受影响', () => confirmSheet(
          '清空做题记录',
          '会清掉所有答题记录、错题本、打卡天数。收藏和自建题库保留。确定吗？',
          '清空',
          () => {
            PROG = {}; DAYS = {};
            saveProg(); saveDays();
            toast('已清空，重新开始');
            render({ name: 'me' });
          })),
        liRow('⚠️', '恢复出厂设置', '清空全部数据（含自建题库）', () => confirmSheet(
          '恢复出厂设置',
          '会清空所有本地数据，包括做题记录和导入的题目。这个操作不能撤销。',
          '确定清空',
          () => {
            [K.prog, K.fav, K.set, K.sess, K.custom, K.days].forEach(LS.del);
            PROG = {}; FAV = []; DAYS = {}; SET = Object.assign({}, DEFAULT_SET);
            applyTheme(); applyFont();
            toast('已恢复出厂设置');
            reset({ name: 'home' });
          }))
      )
    ),

    h('p', { class: 'tiny muted center', style: { marginTop: '18px', lineHeight: '1.9' } },
      '心理学刷题 v1.0',
      h('br'),
      '所有数据只存在这台手机上，不上传、不联网也能用'
    )
  );
};

function swRow(title, sub, key) {
  return h('div', { class: 'sw' },
    h('div', { class: 'grow' },
      h('b', null, title),
      sub ? h('span', null, sub) : null
    ),
    h('button', {
      class: 'toggle' + (SET[key] ? ' on' : ''),
      'aria-label': title,
      onClick: (e) => {
        SET[key] = !SET[key];
        saveSet();
        e.currentTarget.classList.toggle('on', SET[key]);
        haptic();
      }
    })
  );
}

/* ==========================================================================
   14. 弹层：练习菜单 / 导入 / 导出 / 题库结构 / 帮助
   ========================================================================== */

function openPracticeSheet() {
  if (!S) return;
  const answered = Object.keys(S.judged).length;
  openSheet('练习选项', [
    h('p', { class: 'muted tiny', style: { marginBottom: '14px' } },
      S.title + ' · ' + (S.idx + 1) + '/' + S.ids.length + ' 题 · 已答 ' + answered + ' 题'),
    h('div', { class: 'list', style: { boxShadow: 'none', border: '1px solid var(--line)' } },
      liRow('▦', '题目导航（答题卡）', '一眼看到全部题号，点哪去哪', () => {
        closeSheet(); openNavigatorSheet();
      }),
      liRow('⏭', '跳到指定题号', '输入数字直接过去', () => {
        closeSheet();
        openSheet('跳到第几题', [
          h('div', { class: 'field' },
            h('label', null, '题号（1 - ' + S.ids.length + '）'),
            h('input', { type: 'number', id: 'jumpInput', min: '1', max: String(S.ids.length),
                         value: String(S.idx + 1), inputmode: 'numeric' })),
          h('button', { class: 'btn primary',
            onClick: () => {
              const v = parseInt($('#jumpInput').value, 10);
              closeSheet();
              if (!isNaN(v)) gotoQuestion(v - 1);
            } }, '跳转')
        ]);
      }),
      liRow('🎲', '打乱剩余题序', '剩下的题重新洗牌', () => {
        const head = S.ids.slice(0, S.idx + 1);
        const tail = shuffle(S.ids.slice(S.idx + 1));
        S.ids = head.concat(tail);
        saveSession(); closeSheet(); rerenderPractice(); toast('已打乱剩余题目');
      }),
      liRow('🔁', '重做当前这一题', '清掉这题的选择', () => {
        const q = curQ();
        delete S.picks[q.id]; delete S.judged[q.id]; delete S.results[q.id];
        saveSession(); closeSheet(); rerenderPractice();
      }),
      liRow('💤', '先歇一会儿', '下次回来可以「继续上次」', () => {
        saveSession(); closeSheet(); reset({ name: 'home' });
        toast('进度已保存，首页点「继续上次」');
      }),
      liRow('🚪', '结束这次练习', '直接看成绩单', () => {
        closeSheet(); finishSession();
      })
    )
  ]);
}

/** 题目导航（答题卡）：一屏看到这一套题的全部题号，点哪去哪 */
function openNavigatorSheet() {
  if (!S || !S.ids.length) return;
  const n = S.ids.length;
  let right = 0, wrong = 0, answered = 0;
  for (const id of S.ids) {
    if (!S.judged[id]) continue;
    answered++;
    if (S.results[id] === true) right++;
    else if (S.results[id] === false) wrong++;
  }

  const cells = S.ids.map((id, i) => {
    const q = BY_ID.get(id) || {};
    const cls = ['qn'];
    if (S.judged[id]) cls.push(S.results[id] === true ? 'ok' : (S.results[id] === false ? 'bad' : 'done'));
    if (i === S.idx) cls.push('cur');
    if (FAV.indexOf(id) >= 0) cls.push('faved');
    return h('button', {
      class: cls.join(' '),
      title: (i + 1) + '. ' + (q.chapter || '') + (q.stem ? '\n' + q.stem.slice(0, 40) : ''),
      onClick: () => { closeSheet(); gotoQuestion(i); }
    }, String(i + 1));
  });
  const curChapter = curQ().chapter || '';

  openSheet('题目导航', [
    h('p', { class: 'muted tiny', style: { marginBottom: '12px' } },
      S.title + ' · 当前第 ' + (S.idx + 1) + ' 题' +
      (curChapter && curChapter !== S.title
        ? '（' + curChapter.replace(/^第(\d+)章\s*/, '第$1章 · ') + '）' : '')),
    h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginBottom: '12px' } },
      h('span', { class: 'pill gray' }, '共 ' + n + ' 题'),
      h('span', { class: 'pill ok' }, '答对 ' + right),
      h('span', { class: 'pill bad' }, '答错 ' + wrong),
      h('span', { class: 'pill' }, '未答 ' + (n - answered))
    ),
    h('div', { class: 'row', style: { gap: '9px', marginBottom: '14px' } },
      h('button', { class: 'btn sm', style: { flex: '1' },
        onClick: () => { closeSheet(); gotoQuestion(0); } }, '回到第 1 题'),
      h('button', { class: 'btn sm', style: { flex: '1' },
        onClick: jumpToNextUnanswered }, '跳到未做题'),
      h('button', { class: 'btn sm', style: { flex: '1' },
        onClick: () => { closeSheet(); gotoQuestion(n - 1); } }, '最后一题')
    ),
    h('div', { class: 'qgrid' }, cells),
    h('div', { class: 'qlegend' },
      h('span', null, h('i', null), '未做'),
      h('span', null, h('i', { class: 'b' }), '已选未判题'),
      h('span', null, h('i', { class: 'g' }), '答对'),
      h('span', null, h('i', { class: 'r' }), '答错'),
      h('span', null, h('i', { class: 'b', style: { boxShadow: '0 0 0 2px var(--accent)' } }), '当前题'),
      h('span', null, '右上角小圆点 = 已收藏')
    )
  ]);
}

/** 从当前题往后找第一道没答过的题 */
function jumpToNextUnanswered() {
  const n = S.ids.length;
  for (let k = 1; k <= n; k++) {
    const i = (S.idx + k) % n;
    if (!S.judged[S.ids[i]]) { closeSheet(); gotoQuestion(i); return; }
  }
  toast('这一套题全部做过了 🎉');
}

const IMPORT_TEMPLATE = [
  '# 科目: 普通心理学',
  '# 章节: 我的补充题',
  '',
  '1. 下面哪个选项是心理学成为独立学科的标志？',
  'A. 1879年冯特在莱比锡大学建立第一个心理学实验室',
  'B. 1900年弗洛伊德提出精神分析',
  'C. 1913年华生发表《行为主义者眼中的心理学》',
  'D. 1956年米勒发表《神奇的数字7±2》',
  '答案：A',
  '解析：1879 年冯特建立第一个心理学实验室，标志科学心理学的诞生。',
  '',
  '2. 短时记忆的容量约为 7±2 个组块。',
  '答案：对',
  '解析：米勒 1956 年提出，以组块为单位的短时记忆容量约 7±2。',
  '',
  '名词解释：感觉阈限',
  '答案：感觉阈限是指能可靠引起感觉的最小刺激量（绝对阈限）或能引起差别感觉的最小刺激差（差别阈限）。',
  '',
  '简答：简述注意的分配及其条件',
  '答案：注意分配是指同一时间内把注意指向不同对象。条件：1）同时进行的活动至少有一种是熟练的；',
  '2）活动之间要有内在联系；3）注意的分配是灵活的，可通过训练提高。'
].join('\n');

function openImportSheet() {
  openSheet('导入题目', [
    h('p', { class: 'muted tiny', style: { marginBottom: '12px', lineHeight: '1.8' } },
      '支持两种格式：① 下面这种文本格式（推荐，从 Word/PDF 复制后稍作整理即可）；',
      '② JSON 格式（数组或 {subject, chapters} 结构）。',
      '导入的题目会追加到题库末尾，随时可以在「查看题库结构」里删除。'),
    h('div', { class: 'field' },
      h('label', null, '粘贴内容'),
      h('textarea', { id: 'importText', placeholder: '在这里粘贴题目……', spellcheck: 'false' })),
    h('div', { class: 'field' },
      h('label', null, '默认归属（文本里没写 # 科目 / # 章节 时使用）'),
      h('div', { class: 'row' },
        h('select', { id: 'importSubject',
          style: { flex: '1', padding: '11px', borderRadius: '10px', border: '1.5px solid var(--line)',
                   background: 'var(--card)', color: 'var(--text)', fontSize: '16px' } },
          SUBJECTS.map(s => h('option', { value: s.name }, s.name)).concat([h('option', { value: '__new' }, '新建科目…')])
        ),
        h('input', { type: 'text', id: 'importChapter', value: '我的补充题',
          style: { flex: '1', width: 'auto' }, placeholder: '章节名' })
      )
    ),
    h('div', { class: 'row', style: { marginBottom: '12px', gap: '9px' } },
      h('button', { class: 'btn sm', onClick: () => {
        $('#importText').value = IMPORT_TEMPLATE;
      } }, '填入示例'),
      h('button', { class: 'btn sm', onClick: () => { $('#importText').value = ''; } }, '清空')
    ),
    h('button', { class: 'btn primary', onClick: doImport }, '开始导入')
  ]);
}

function doImport() {
  const text = ($('#importText').value || '').trim();
  if (!text) { toast('先粘贴内容再导入'); return; }
  const subjSel = $('#importSubject');
  let subjName = subjSel.value;
  if (subjName === '__new') {
    subjName = '我的题库';
    SUBJECTS.push({ name: subjName, icon: '📗', desc: '自己导入的题目',
                    chapters: [], count: 0, questionIds: [] });
    const opt = document.createElement('option');
    opt.value = opt.textContent = subjName;
    subjSel.insertBefore(opt, subjSel.lastChild);
    subjSel.value = subjName;
  }
  const chapName = ($('#importChapter').value || '').trim() || '我的补充题';

  let banks;
  try {
    banks = parseImport(text, subjName, chapName);
  } catch (e) {
    toast('解析失败：' + e.message);
    return;
  }
  const count = banks.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.items.length, 0), 0);
  if (!count) { toast('没有解析到题目，检查一下格式'); return; }

  const custom = LS.get(K.custom, []);
  custom.push(...banks.map(b => Object.assign({}, b, { custom: true })));
  if (!LS.set(K.custom, custom)) return;

  // 立刻加载进当前会话
  for (const b of banks) loadBank(Object.assign({}, b, { custom: true }));

  closeSheet();
  toast('成功导入 ' + count + ' 道题 🎉', 2600);
  render(current && current.name ? current : { name: 'home' });
}

function parseImport(text, defaultSubject, defaultChapter) {
  const t = text.trim();
  if (t[0] === '[' || t[0] === '{') return parseJsonImport(t, defaultSubject, defaultChapter);
  return parseTextImport(t, defaultSubject, defaultChapter);
}

function parseJsonImport(text, defaultSubject, defaultChapter) {
  let data = JSON.parse(text);
  if (Array.isArray(data) && data.length && (data[0].subject || data[0].chapters)) {
    // 已经是 bank 数组
    return data.map(b => normalizeBankShape(b, defaultSubject, defaultChapter));
  }
  if (!Array.isArray(data)) {
    if (data.subject || data.chapters) return [normalizeBankShape(data, defaultSubject, defaultChapter)];
    if (Array.isArray(data.questions)) data = data.questions;
    else throw new Error('JSON 结构不认识');
  }
  // 扁平题目数组
  const chapters = new Map();
  for (const raw of data) {
    const ch = raw.chapter || raw.ch || defaultChapter;
    if (!chapters.has(ch)) chapters.set(ch, []);
    chapters.get(ch).push(raw);
  }
  return [{
    subject: defaultSubject,
    chapters: [...chapters.entries()].map(([name, items]) => ({ name, items }))
  }];
}

function normalizeBankShape(b, defaultSubject, defaultChapter) {
  if (!b.chapters) {
    if (Array.isArray(b.questions)) {
      return { subject: b.subject || defaultSubject,
               chapters: [{ name: b.chapter || defaultChapter, items: b.questions }] };
    }
    throw new Error('缺少 chapters 字段');
  }
  return {
    subject: b.subject || defaultSubject,
    icon: b.icon,
    desc: b.desc,
    chapters: b.chapters.map(c => ({
      name: c.name || defaultChapter,
      items: c.items || c.questions || []
    }))
  };
}

/** 文本题库解析：兼容从 Word / PDF 复制出来的常见排版 */
function parseTextImport(text, defaultSubject, defaultChapter) {
  const lines = text.replace(/\r/g, '').split('\n');
  let subject = defaultSubject, chapter = defaultChapter;
  const chaptersMap = new Map();
  let cur = null;

  const push = () => {
    if (!cur) return;
    const stem = (cur.q || '').trim();
    if (stem && (cur.a !== undefined || cur.o.length)) {
      let chName = cur.chapter || chapter;
      if (!chaptersMap.has(chName)) chaptersMap.set(chName, []);
      chaptersMap.get(chName).push({
        t: cur.t, q: stem, o: cur.o, a: cur.a, e: cur.e, tag: cur.tag
      });
    }
    cur = null;
  };
  const start = (stem, type) => {
    cur = { q: stem, o: [], a: undefined, e: '', t: type, chapter: chapter, tag: [] };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // # 科目 / # 章节
    let m = line.match(/^#+\s*(?:科目|学科|subject)\s*[:：]\s*(.+)$/i);
    if (m) { push(); subject = m[1].trim(); continue; }
    m = line.match(/^#+\s*(?:章节|章节名|chapter)\s*[:：]\s*(.+)$/i);
    if (m) { push(); chapter = m[1].trim(); continue; }
    if (line[0] === '#') {
      m = line.match(/^#+\s*(.+)$/);
      if (m) { push(); chapter = m[1].trim(); }
      continue;
    }

    // 选项：A. xxx / A、xxx / A）xxx
    m = line.match(/^([A-Ha-h])\s*[.、)．）:：]\s*(.+)$/);
    if (m && cur) {
      const k = m[1].toUpperCase();
      const idx = LETTER.indexOf(k);
      while (cur.o.length < idx) cur.o.push('');
      cur.o[idx] = m[2].trim();
      continue;
    }

    // 答案
    m = line.match(/^(?:正确|参考)?(?:答案|answer)\s*[:：]?\s*(.*)$/i);
    if (m && cur) {
      const val = m[1].trim();
      if (val) cur.a = (cur.a === undefined || cur.a === '' ? '' : cur.a) + val;
      else {
        // 答案在下一行
        const nxt = (lines[i + 1] || '').trim();
        if (nxt && !/^(解析|分析|考点|知识点)/.test(nxt)) { cur.a = nxt; i++; }
      }
      continue;
    }

    // 解析
    m = line.match(/^(?:解析|分析|考点|知识点)\s*[:：]\s*(.*)$/);
    if (m && cur) {
      cur.e = (cur.e ? cur.e + '\n' : '') + m[1].trim();
      continue;
    }

    // 章节小标题（一、二、 / 第X章）
    m = line.match(/^第\s*[一二三四五六七八九十百零\d]+\s*章[\s:：·、]*(.+)$/);
    if (m && !cur) { chapter = line; continue; }

    // 题型前缀
    m = line.match(/^(名词解释|简答|简述|论述|判断题|判断|多选|单选)\s*[:：、.]?\s*(.+)$/);
    if (m) {
      push();
      const kw = m[1];
      const type = /名词解释/.test(kw) ? 'term'
        : /论述/.test(kw) ? 'essay'
        : /简答|简述/.test(kw) ? 'short'
        : /判断/.test(kw) ? 'judge'
        : /多选/.test(kw) ? 'multiple' : 'single';
      start(m[2].trim(), type);
      continue;
    }

    // 题号起始：1. xxx / 1、xxx / (1) xxx
    m = line.match(/^[（(]?(\d{1,3})\s*[.、)．）]\s*(.*)$/);
    if (m) {
      push();
      start(m[2].trim(), undefined);
      continue;
    }

    // 其他行
    if (!cur) { start(line, undefined); continue; }
    if (cur.a !== undefined || cur.o.length) { push(); start(line, undefined); }
    else cur.q = (cur.q ? cur.q + ' ' : '') + line;
  }
  push();

  if (!chaptersMap.size) throw new Error('没有解析到题目');
  return [{
    subject: subject,
    chapters: [...chaptersMap.entries()].map(([name, items]) => ({ name, items }))
  }];
}

function openExportSheet() {
  const dump = JSON.stringify({
    app: 'psych-quiz', version: 1, exportedAt: new Date().toISOString(),
    set: SET, prog: PROG, fav: FAV, days: DAYS, custom: LS.get(K.custom, [])
  });
  const size = (dump.length / 1024).toFixed(1);
  openSheet('导出备份', [
    h('p', { class: 'muted tiny', style: { marginBottom: '12px', lineHeight: '1.8' } },
      '包含做题记录、收藏、打卡和自建题库，共约 ' + size + ' KB。',
      '换手机或清理浏览器之前记得导出一份。'),
    h('div', { class: 'field' },
      h('label', null, '备份内容（点下面按钮保存成文件，或复制走）'),
      h('textarea', { id: 'exportText', readonly: true, style: { minHeight: '120px' } }, dump)),
    h('div', { class: 'row', style: { gap: '9px' } },
      h('button', { class: 'btn primary', onClick: () => {
        const blob = new Blob([dump], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '心理学刷题备份-' + todayKey() + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
        toast('已保存到下载目录');
      } }, '保存为文件'),
      h('button', { class: 'btn ghost', onClick: () => {
        const ta = $('#exportText');
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        if (navigator.clipboard) {
          navigator.clipboard.writeText(dump).then(() => toast('已复制')).catch(() => {
            toast(ok ? '已复制' : '复制失败，请长按文本框手动复制');
          });
        } else toast(ok ? '已复制' : '复制失败，请长按文本框手动复制');
      } }, '复制')
    ),
    h('div', { class: 'sec mt16' },
      h('div', { class: 'sec-hd' }, h('h2', null, '从备份恢复')),
      h('div', { class: 'field' },
        h('textarea', { id: 'restoreText', placeholder: '把之前导出的 JSON 粘贴到这里', style: { minHeight: '90px' } })),
      h('button', { class: 'btn', onClick: () => {
        const txt = ($('#restoreText').value || '').trim();
        let d;
        try { d = JSON.parse(txt); } catch (e) { toast('内容不是有效的备份文件'); return; }
        if (!d || d.app !== 'psych-quiz') { toast('这不是本应用的备份文件'); return; }
        confirmSheet('恢复备份', '会用备份里的内容覆盖当前记录，确定吗？', '恢复', () => {
          if (d.prog) PROG = d.prog;
          if (d.fav) FAV = d.fav;
          if (d.days) DAYS = d.days;
          if (d.set) SET = Object.assign({}, DEFAULT_SET, d.set);
          saveProg(); saveFav(); saveDays(); saveSet();
          if (Array.isArray(d.custom)) LS.set(K.custom, d.custom);
          applyTheme(); applyFont();
          closeSheet();
          toast('恢复完成，重开一下应用即可看到全部题目', 2600);
        });
      } }, '恢复')
    )
  ]);
}

function openBankSheet() {
  const custom = LS.get(K.custom, []);
  let customCount = 0;
  for (const b of custom) for (const c of (b.chapters || [])) customCount += (c.items || []).length;
  openSheet('题库结构', [
    h('p', { class: 'muted tiny', style: { marginBottom: '14px' } },
      '内置 ' + (QUESTIONS.length - customCount) + ' 题 · 自建 ' + customCount + ' 题'),
    ...SUBJECTS.map(subj => h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, subj.icon + ' ' + subj.name),
        h('span', { class: 'more' }, subj.count + ' 题')),
      h('div', { class: 'list' },
        subj.chapters.map(ch => h('div', { class: 'li' },
          h('div', { class: 'grow' },
            h('b', { class: 'ellipsis', style: { fontSize: '14px' } }, ch.name),
            h('span', null, ch.count + ' 题'))
        ))
      )
    )),
    custom.length ? h('div', { class: 'sec' },
      h('div', { class: 'sec-hd' }, h('h2', null, '我导入的题库')),
      h('div', { class: 'list' },
        custom.map((b, i) => h('div', { class: 'li' },
          h('div', { class: 'ic' }, '📗'),
          h('div', { class: 'grow' },
            h('b', null, b.subject || '未命名'),
            h('span', null, (b.chapters || []).map(c => c.name).join('、').slice(0, 30) +
              ' · ' + (b.chapters || []).reduce((n, c) => n + (c.items || []).length, 0) + ' 题')
          ),
          h('button', { class: 'chev', style: { padding: '6px 8px' },
            onClick: () => confirmSheet('删除导入的题库',
              '会删除这批导入的题目，它的做题记录会一起失效。确定吗？', '删除', () => {
                const arr = LS.get(K.custom, []);
                arr.splice(i, 1);
                LS.set(K.custom, arr);
                toast('已删除，正在重新加载…');
                setTimeout(() => location.reload(), 700);
              }) }, '🗑')
        ))
      )
    ) : null
  ]);
}

function openHelpSheet() {
  openSheet('使用说明', [
    h('div', { class: 'expl', style: { borderTop: 'none', paddingTop: '0' } },
      h('span', { class: 'lbl' }, '一、怎么刷题'),
      '首页点科目 → 选章节，就进入刷题。选完选项立刻出对错和解析；',
      '做错的题自动进错题本，答对后自动移出。',
      '名词解释和简答是「先默背、再看答案」，看完自己点「背下来了 / 还没记住」。',
      h('span', { class: 'lbl', style: { marginTop: '12px' } }, '二、快捷操作'),
      '左右滑动切换上一题 / 下一题；点 ☆ 收藏；右上角 ⋯ 有跳题号和保存退出。',
      '点答题页右上角的题号（或右下角的宫格按钮）会展开「题目导航」，',
      '一屏就能看到这一套题的全部题号，点任意数字直接跳过去，也可以一键回到第 1 题。',
      '电脑上还可以用 ← → 切题、数字键 1-8 选答案。',
      h('span', { class: 'lbl', style: { marginTop: '12px' } }, '三、怎么加题'),
      '「我的 → 导入题目」，把题目按示例格式粘贴进去即可，不用改代码。',
      '格式：题干一行，选项每行以 A. B. C. D. 开头，再写「答案：」和「解析：」。',
      '判断题直接写「答案：对 / 错」。名词解释用「名词解释：xxx」，简答用「简答：xxx」。',
      h('span', { class: 'lbl', style: { marginTop: '12px' } }, '四、怎么放到手机上'),
      '把这个文件夹用微信 / 邮件传到手机，用浏览器打开 index.html 即可；',
      '如果是放在网站上的版本，打开后点浏览器菜单里的「添加到主屏幕」，',
      '就会像 APP 一样有图标，而且断网也能用。',
      h('span', { class: 'lbl', style: { marginTop: '12px' } }, '五、数据安全'),
      '所有记录都存在本机浏览器里。清理浏览器数据会一起清掉，',
      '所以建议偶尔到「我的 → 导出备份」存一份。'
    )
  ]);
}

/* ==========================================================================
   15. 交互：手势 / 键盘 / 事件绑定
   ========================================================================== */

function bindSwipe() {
  const view = $('#view');
  let x0 = 0, y0 = 0, t0 = 0, tracking = false;
  view.addEventListener('touchstart', (e) => {
    if (!current || current.name !== 'practice') return;
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    t0 = Date.now(); tracking = true;
  }, { passive: true });
  view.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0, dt = Date.now() - t0;
    if (dt > 700) return;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    if (dx < 0) nextQuestion(); else prevQuestion();
  }, { passive: true });
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (!current) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (current.name === 'practice' && S && S.ids.length) {
      const q = curQ();
      if (e.key === 'ArrowRight') { nextQuestion(); e.preventDefault(); return; }
      if (e.key === 'ArrowLeft') { prevQuestion(); e.preventDefault(); return; }
      if (/^[1-8]$/.test(e.key) && !S.judged[q.id]) {
        const i = +e.key - 1;
        if (q.type === 'judge') { if (i === 0) onPick(q, true, false); else if (i === 1) onPick(q, false, false); }
        else if (q.options[i] !== undefined) onPick(q, i, false);
        e.preventDefault(); return;
      }
      if (e.key === 'Enter') {
        if (!S.judged[q.id] && (q.type === 'single' || q.type === 'multiple' || q.type === 'judge') && S.picks[q.id] !== undefined) {
          if (!S.instant) judge(q);
        } else nextQuestion();
        e.preventDefault();
      }
    }
  });
}

/* ==========================================================================
   16. 启动
   ========================================================================== */

function init() {
  applyTheme();
  applyFont();

  const banks = window.__BANKS || [];
  for (const b of banks) loadBank(b);
  loadCustom();

  if (!QUESTIONS.length) {
    $('#view').appendChild(h('div', { class: 'empty' },
      h('div', { class: 'ic' }, '📭'),
      h('b', null, '题库没有加载出来'),
      h('p', null, '请确认 data/ 文件夹里的题库文件和 index.html 在一起。')));
    return;
  }

  $('#tbBack').addEventListener('click', back);
  $('#tbMore').addEventListener('click', () => {
    if (current && current.name === 'practice') openPracticeSheet();
    else if (current && current.name === 'result') openPracticeSheet();
  });
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheetMask').addEventListener('click', (e) => {
    if (e.target === $('#sheetMask')) closeSheet();
  });
  $$('.tab').forEach(b => b.addEventListener('click', () => reset({ name: b.dataset.tab })));

  bindSwipe();
  bindKeys();

  // 支持返回键（部分浏览器 / 安卓）
  window.addEventListener('popstate', () => {
    if (!$('#sheetMask').hidden) { closeSheet(); keepHistory(); return; }
    if (nav.length) { back(); keepHistory(); }
  });
  keepHistory();

  reset({ name: 'home' });

  // 离线缓存（仅在通过网址访问、且不是单文件版时生效）
  if (!window.__NO_SW && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function keepHistory() {
  try { history.pushState(null, ''); } catch (e) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
