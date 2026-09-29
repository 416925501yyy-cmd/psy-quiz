/* 功能冒烟测试：用极简 DOM 模拟把 app.js 真正跑起来，逐页渲染、答题、导入，确认没有运行时报错。
   运行：node tools/smoke-test.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* ============================ 极简 DOM ============================ */

class Style {
  constructor() { this._props = {}; }
  setProperty(k, v) { this._props[k] = v; this[k] = v; }
  getPropertyValue(k) { return this._props[k] || ''; }
}
class NodeBase {}
class TextNode extends NodeBase {
  constructor(text) { super(); this.nodeType = 3; this.data = String(text); this.parentNode = null; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  get children() { return []; }
}
class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(...c) { c.forEach((x) => x && this.set.add(x)); return this; }
  remove(...c) { c.forEach((x) => this.set.delete(x)); return this; }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    return on;
  }
}
class Element extends NodeBase {
  constructor(tag, doc) {
    super();
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.style = new Style();
    this.dataset = {};
    this._attrs = {};
    this._listeners = {};
    this._text = '';
    this._value = undefined;
    this.classList = new ClassList(this);
    this.scrollTop = 0;
    this.offsetWidth = 100;
    this.hidden = false;
  }
  get className() { return [...this.classList.set].join(' '); }
  set className(v) { this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get id() { return this._attrs.id || ''; }
  set id(v) { this._attrs.id = String(v); }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'TEXTAREA') return this.textContent;
    const opt = this.children.find((c) => c.tagName === 'OPTION');
    return opt ? opt.value : '';
  }
  set value(v) { this._value = String(v); }
  get textContent() {
    if (this._text) return this._text;
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) { this.children = []; this._text = String(v); }
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.children.push(c);
    if (c.tagName === 'OPTION' && this.tagName === 'SELECT' && this._value === undefined) {
      this._value = c.value;
    }
    return c;
  }
  insertBefore(c, ref) {
    if (!ref) return this.appendChild(c);
    if (c.parentNode) c.parentNode.removeChild(c);
    const i = this.children.indexOf(ref);
    c.parentNode = this;
    this.children.splice(i < 0 ? this.children.length : i, 0, c);
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; }
    return c;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  addEventListener(type, fn) { (this._listeners[type] || (this._listeners[type] = [])).push(fn); }
  setAttribute(k, v) {
    this._attrs[k] = String(v);
    if (k === 'class') this.className = String(v);
    if (k === 'value' && this.tagName !== 'OPTION') this._value = String(v);
    if (k.startsWith('data-')) {
      this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    }
  }
  getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; }
  click() {
    const ev = { type: 'click', target: this, currentTarget: this,
                 preventDefault() {}, stopPropagation() {} };
    for (const fn of this._listeners.click || []) fn(ev);
  }
  descendants() {
    const out = [];
    const walk = (n) => {
      for (const c of n.children) { if (c.nodeType === 1) out.push(c); walk(c); }
    };
    walk(this);
    return out;
  }
  matches(sel) {
    sel = sel.trim();
    if (sel[0] === '#') return this.id === sel.slice(1);
    if (sel[0] === '.') return this.classList.contains(sel.slice(1));
    const m = sel.match(/^([a-zA-Z]+)(\[[^\]]+\])?$/);
    if (m) {
      if (this.tagName !== m[1].toUpperCase()) return false;
      if (m[2]) {
        const am = m[2].match(/^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
        if (am) return am[2] === undefined ? this.getAttribute(am[1]) !== null
                                           : this.getAttribute(am[1]) === am[2];
      }
      return true;
    }
    return false;
  }
  querySelector(sel) {
    const parts = sel.trim().split(/\s+/);
    for (const d of this.descendants()) {
      if (!d.matches(parts[parts.length - 1])) continue;
      if (parts.length === 1) return d;
      let p = d.parentNode, hit = false;
      while (p) { if (p.matches(parts[0])) { hit = true; break; } p = p.parentNode; }
      if (hit) return d;
    }
    return null;
  }
  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+/);
    return this.descendants().filter((d) => {
      if (!d.matches(parts[parts.length - 1])) return false;
      if (parts.length === 1) return true;
      let p = d.parentNode;
      while (p) { if (p.matches(parts[0])) return true; p = p.parentNode; }
      return false;
    });
  }
}
class Document extends Element {
  constructor() {
    super('#document', null);
    this.ownerDocument = this;
    this.readyState = 'complete';
    this.documentElement = new Element('html', this);
    this.body = new Element('body', this);
    this.appendChild(this.documentElement);
    this.appendChild(this.body);
  }
  createElement(tag) { return new Element(tag, this); }
  createElementNS(ns, tag) { const el = new Element(tag, this); el._ns = ns; return el; }
  createTextNode(text) { return new TextNode(text); }
}

function buildSkeleton(document, html) {
  const SKIP = new Set(['html', 'head', 'meta', 'link', 'title', 'script', 'style', 'body', 'svg']);
  const tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\/?>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    if (SKIP.has(tag) || !/(id|class)=/.test(attrs)) continue;
    const el = document.createElement(tag);
    const attrRe = /([\w:-]+)(?:\s*=\s*"([^"]*)")?/g;
    let a;
    while ((a = attrRe.exec(attrs))) el.setAttribute(a[1], a[2] === undefined ? '' : a[2]);
    document.body.appendChild(el);
  }
}

function makeEnv(html) {
  const document = new Document();
  buildSkeleton(document, html);
  const store = new Map();
  const win = {
    __MODULES: [],
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
    location: { protocol: 'file:', href: 'file:///index.html' },
    history: { pushState() {}, replaceState() {} },
    navigator: { vibrate() {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear()
    },
    setTimeout, clearTimeout, console,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class { constructor(p) { this.parts = p; } }
  };
  win.window = win;
  win.document = document;
  win.Node = NodeBase;
  win.self = win;
  return { win, document, store };
}

/* ============================ 断言 ============================ */

let pass = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fails.push(label); console.log('  ✗ ' + label); }
}
const all = (root, sel) => root.querySelectorAll(sel);
function byText(root, text, tag) {
  const cands = root.descendants().filter((e) =>
    (!tag || e.tagName === tag.toUpperCase()) && e.textContent.includes(text));
  cands.sort((a, b) => a.textContent.length - b.textContent.length);
  return cands[0] || null;
}
function clickText(root, text, tag) {
  const el = byText(root, text, tag || 'button');
  if (!el) throw new Error('找不到可点元素：' + text);
  el.click();
  return el;
}

/* ============================ 跑 ============================ */

const env = makeEnv(read('index.html'));
const ctx = vm.createContext(env.win);
try {
  for (const f of readdirSync(resolve(ROOT, 'data')).filter((n) => n.endsWith('.js')).sort()) {
    vm.runInContext(read('data/' + f), ctx, { filename: f });
  }
  vm.runInContext(read('app.js'), ctx, { filename: 'app.js' });
} catch (e) {
  console.error('加载就报错了：', e);
  process.exit(1);
}

const D = env.win.document;
const view = D.querySelector('#view');
const tabbar = D.querySelector('#tabbar');
const q = (sel) => view.querySelector(sel);

console.log('\n【1】首屏');
ok(view.children.length > 0, '首屏有内容');
ok(view.textContent.includes('名词解释'), '默认进名词解释模块');
ok(tabbar.hidden === false, '模块首页显示底部导航');
ok(all(D, '.tab').length === 5, '底部 5 个 tab');
const total = env.win.__MODULES.reduce((n, b) =>
  n + b.chapters.reduce((m, c) => m + c.items.length, 0), 0);
const termTotal = env.win.__MODULES.filter((b) => b.module === 'term')
  .reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.items.length, 0), 0);
ok(view.textContent.includes(String(termTotal)), '名词解释首页显示本模块条数 ' + termTotal);
ok(total === 447, '四个模块合计 ' + total + ' 条');

console.log('\n【2】四个模块');
for (const [id, name] of [['short', '简答'], ['comp', '综合'], ['recall', '快速回忆'], ['term', '名词解释']]) {
  all(D, '.tab').find((t) => t.dataset.tab === id).click();
  ok(view.textContent.includes(name), name + ' 模块能打开');
}

console.log('\n【3】进章节 → 出卡片');
const subj = all(view, '.subj')[0];
ok(!!subj, '有科目入口');
subj.click();
ok(view.textContent.includes('章'), '进入章节列表');
ok(all(view, '.li').length > 0, '列出 ' + all(view, '.li').length + ' 个章节');
all(view, '.li')[2].click();
ok(!!q('.rcard'), '进入一题一卡界面');
ok(!!q('.rcard-title'), '卡片正面显示题目');
ok(!q('.ans'), '未翻面时不显示答案');
const c1 = q('.q-count').textContent.trim();
ok(/^1 \/ \d+/.test(c1), '计数器从 1 开始：' + c1);

console.log('\n【4】翻面 → 标记 → 自动跳下一题');
q('.rcard').click();
ok(!!q('.ans'), '点卡片翻面后显示答案');
ok(!!byText(view, '记住了', 'button'), '出现三档标记按钮');
clickText(view, '记住了', 'button');
const c2 = q('.q-count').textContent.trim();
ok(c2 !== c1, '打标记后自动跳到下一题（' + c1 + ' → ' + c2 + '）');
ok(!q('.ans'), '新的一题默认不显示答案');
ok(Object.keys(JSON.parse(env.win.localStorage.getItem('psy.study.v2') || '{}')).length === 1,
  '掌握度写入本地存储');

console.log('\n【5】卡片导航');
q('.q-count').click();
ok(D.querySelector('#sheetMask').hidden === false, '打开卡片导航');
const cells = all(D.querySelector('#sheetBody'), '.qn');
ok(cells.length === Number(c1.split('/')[1].trim()), '导航格子数 = 本轮卡片数（' + cells.length + '）');
ok(!!byText(D.querySelector('#sheetBody'), '跳到没记住的', 'button'), '有「跳到没记住的」');
ok(!!byText(D.querySelector('#sheetBody'), '最后一张', 'button'), '有「最后一张」');
cells[cells.length - 1].click();
ok(q('.q-count').textContent.trim().startsWith(String(cells.length)), '点最后一格能跳过去');
ok(D.querySelector('#sheetMask').hidden === true, '跳转后弹层收起');
q('.q-count').click();
clickText(D.querySelector('#sheetBody'), '回到第 1 张', 'button');
ok(q('.q-count').textContent.trim().startsWith('1 /'), '一键回到第 1 张');

console.log('\n【6】撤销与中途结算');
q('.rcard').click();
clickText(view, '没记住', 'button');
ok(!!q('.undo-bar'), '打分后出现撤销条');
q('.undo-bar').click();
ok(!q('.undo-bar'), '撤销后撤销条消失');
ok(!!q('.ans'), '撤销后回到那张卡并保持翻面');
D.querySelector('#tbMore').click();
ok(D.querySelector('#sheetMask').hidden === false, '卡片页 ⋯ 能打开本轮设置');
ok(!!byText(D.querySelector('#sheetBody'), '结束本轮，看小结', 'button'), '有「结束本轮，看小结」');
clickText(D.querySelector('#sheetBody'), '结束本轮，看小结', 'button');
ok(view.textContent.includes('记住了') && view.textContent.includes('没记住'), '小结显示三档统计');

console.log('\n【7】我的页与导出');
all(D, '.tab').find((t) => t.dataset.tab === 'me').click();
ok(view.textContent.includes('导入题目'), '我的页有导入入口');
ok(view.textContent.includes('导出备份'), '我的页有导出入口');
clickText(view, '导出备份', 'button');
let parsed = null;
try { parsed = JSON.parse(D.querySelector('#exportText').value); } catch (e) {}
ok(parsed && parsed.app === 'psy-recite', '导出的 JSON 结构正确');
ok(parsed && parsed.study && Object.keys(parsed.study).length > 0, '备份里包含学习记录');
D.querySelector('#sheetClose').click();

console.log('\n【8】导入题目');
clickText(view, '导入题目', 'button');
ok(D.querySelector('#sheetMask').hidden === false, '导入弹层打开');
D.querySelector('#importText').value = [
  '# 模块: 名词解释',
  '# 科目: 广外真题',
  '# 章节: 2023 回忆版',
  '',
  '1. 朝向反射',
  '答案：由新异刺激引起的一种复杂而又特殊的反射。',
  '',
  '2. 简述注意的分配及其条件',
  '答案：1）同时进行的活动至少有一种是熟练的；',
  '2）活动之间有内在联系；',
  '3）可通过训练提高。'
].join('\n');
clickText(D.querySelector('#sheetBody'), '开始导入', 'button');
const custom = JSON.parse(env.win.localStorage.getItem('psy.custom.v3') || '[]');
ok(custom.length === 1, '自建题库已写入本地存储');
const items = custom[0] && custom[0].chapters[0].items;
ok(items && items.length === 2, '解析出 2 道题（实际 ' + (items ? items.length : 0) + '）');
ok(items && items[0].q === '朝向反射', '第一题题干正确');
ok(items && items[0].a.includes('新异刺激'), '第一题答案正确');
ok(items && items[1].a.includes('熟练'), '多行答案正确合并');

console.log('\n【9】导入的题能用');
all(D, '.tab').find((t) => t.dataset.tab === 'term').click();
const customSubj = all(view, '.subj').find((s) => s.textContent.includes('广外真题'));
ok(!!customSubj, '导入的科目出现在名词解释模块里');
customSubj.click();
ok(view.textContent.includes('2023 回忆版'), '导入的章节出现在列表里');
all(view, '.li')[0].click();
ok(q('.rcard-title').textContent.includes('朝向反射'), '能进入导入题目的卡片');

console.log('\n【10】数据完整性');
const MOD = { term: 0, short: 0, comp: 0, recall: 0 };
let bad = 0;
for (const b of env.win.__MODULES) {
  for (const c of b.chapters) {
    for (const it of c.items) {
      MOD[b.module] = (MOD[b.module] || 0) + 1;
      if (!it.q || !it.a) bad++;
    }
  }
}
ok(bad === 0, '全部内容都有题目和答案');
ok(MOD.term === 186, '名词解释 186 条（实际 ' + MOD.term + '）');
ok(MOD.short === 136, '简答 136 题（实际 ' + MOD.short + '）');
ok(MOD.comp === 31, '综合 31 题（实际 ' + MOD.comp + '）');
ok(MOD.recall === 94, '快速回忆 94 张（实际 ' + MOD.recall + '）');

console.log('\n' + '─'.repeat(52));
if (fails.length) {
  console.log(`失败 ${fails.length} 项：`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exitCode = 1;
} else {
  console.log(`✓ 全部 ${pass} 项检查通过`);
}
