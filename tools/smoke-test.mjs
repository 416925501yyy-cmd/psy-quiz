/* 功能冒烟测试：用一个极简 DOM 模拟把 app.js 真正跑起来，
   逐页渲染、点击、答题、导入题库，确认没有运行时报错。
   运行：node tools/smoke-test.mjs */
import { readFileSync } from 'node:fs';
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
      for (const c of n.children) {
        if (c.nodeType === 1) out.push(c);
        walk(c);
      }
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
      let p = d.parentNode, ok = false;
      while (p) { if (p.matches(parts[0])) { ok = true; break; } p = p.parentNode; }
      if (ok) return d;
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
    this._listeners = {};
  }
  createElement(tag) { return new Element(tag, this); }
  createElementNS(ns, tag) { const el = new Element(tag, this); el._ns = ns; return el; }
  createTextNode(text) { return new TextNode(text); }
}

/** 从 index.html 里搭出应用需要的静态骨架（只取 id / class 元素，展平即可） */
function buildSkeleton(document, html) {
  const SKIP = new Set(['html', 'head', 'meta', 'link', 'title', 'script', 'style', 'body', 'svg']);
  const tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\/?>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    if (SKIP.has(tag)) continue;
    if (!/(id|class)=/.test(attrs)) continue;
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
    __BANKS: [],
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
    setTimeout, clearTimeout, console, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class { constructor(p) { this.parts = p; } }
  };
  win.window = win;
  win.document = document;
  win.Node = NodeBase;
  win.self = win;
  return { win, document, store };
}

/* ============================ 测试框架 ============================ */

let pass = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fails.push(label); console.log('  ✗ ' + label); }
}
function findByText(root, text, tag) {
  const cands = root.descendants().filter((e) =>
    (!tag || e.tagName === tag.toUpperCase()) && e.textContent.includes(text));
  cands.sort((a, b) => a.textContent.length - b.textContent.length);
  return cands[0] || null;
}
function clickByText(root, text, tag) {
  const el = findByText(root, text, tag || 'button');
  if (!el) throw new Error('找不到按钮：' + text);
  el.click();
  return el;
}

/* ============================ 跑起来 ============================ */

const env = makeEnv(read('index.html'));
const ctx = vm.createContext(env.win);
const errors = [];

try {
  vm.runInContext(read('data/bank-general.js'), ctx, { filename: 'bank-general.js' });
  vm.runInContext(read('data/bank-experimental.js'), ctx, { filename: 'bank-experimental.js' });
  vm.runInContext(read('app.js'), ctx, { filename: 'app.js' });
} catch (e) {
  console.error('加载 app.js 就报错了：', e);
  process.exit(1);
}

const D = env.win.document;
const view = D.querySelector('#view');

console.log('\n【1】首屏渲染');
ok(!!view, '找到 #view 容器');
ok(view.children.length > 0, '首屏有内容渲染出来');
const homeText = view.textContent;
ok(homeText.includes('普通心理学'), '首页出现「普通心理学」');
ok(homeText.includes('实验心理学'), '首页出现「实验心理学」');
ok(homeText.includes('432'), '首页显示题库总数 432');
ok(D.querySelector('#tbTitle').textContent === '心理学刷题', '顶栏标题正确');

console.log('\n【2】进入科目与章节');
const subjBtn = view.descendants().find((e) => e.classList.contains('subj'));
ok(!!subjBtn, '找到科目卡片');
subjBtn.click();
ok(view.textContent.includes('第1章 心理学研究什么'), '进入普通心理学章节列表');
const chapLi = view.descendants().find((e) =>
  e.tagName === 'BUTTON' && e.textContent.includes('第3章 感觉'));
ok(!!chapLi, '找到「第3章 感觉」章节');
chapLi.click();

console.log('\n【3】刷题：单选');
ok(view.textContent.includes('单选'), '进入答题页，显示题型「单选」');
ok(view.textContent.includes('感觉是人脑对直接作用于感觉器官'), '显示第一题题干');
let opts = view.querySelectorAll('.opt');
ok(opts.length === 4, '渲染出 4 个选项');
ok(!view.textContent.includes('正确答案'), '答题前不显示答案');
opts[0].click();   // 第 1 题正确答案就是 A
ok(view.textContent.includes('答对了'), '选对后立即显示「答对了」');
ok(view.textContent.includes('正确答案'), '显示正确答案与解析');

console.log('\n【4】刷题：切题与多选');
clickByText(view, '下一题');
ok(view.textContent.includes('2 / 20'), '切到第 2 题，进度显示 2 / 20');

/** 点当前页上可用的前进按钮（跳过 / 下一题 / 看答案 / 提交答案），返回点了哪个 */
function stepForward() {
  for (const label of ['跳过', '看答案', '下一题', '提交答案', '完成练习']) {
    const el = findByText(view, label, 'button');
    if (el && !el.getAttribute('disabled')) { el.click(); return label; }
  }
  return null;
}

let guard = 0, reached = '';
while (guard++ < 60) {
  if (view.textContent.includes('多选') && !view.textContent.includes('正确答案')) { reached = '多选'; break; }
  if (!stepForward()) break;
}
ok(reached === '多选', '能翻到多选题');
if (reached === '多选') {
  opts = view.querySelectorAll('.opt');
  ok(opts.length === 4, '多选题也是 4 个选项');
  ok(!findByText(view, '提交答案', 'button'), '未选择时不显示「提交答案」');
  opts.forEach((o) => o.click());
  ok(!!findByText(view, '提交答案', 'button'), '选了选项后出现「提交答案」按钮');
  clickByText(view, '提交答案');
  ok(view.textContent.includes('正确答案'), '多选提交后给出判定与答案');
  ok(view.textContent.includes('答对了') || view.textContent.includes('答错了'), '多选判定结果显示正常');
}

console.log('\n【5】主观题（名词解释）');
guard = 0;
while (guard++ < 80) {
  if (view.textContent.includes('名词解释') && findByText(view, '看答案', 'button')) break;
  if (view.textContent.includes('名词解释') && view.textContent.includes('参考答案')) break;
  if (!stepForward()) break;
}
ok(view.textContent.includes('名词解释'), '能翻到名词解释题');
ok(!!findByText(view, '看答案', 'button'), '主观题先显示「看答案」而不是直接给答案');
ok(!view.textContent.includes('参考答案'), '点开之前不显示参考答案');
clickByText(view, '看答案');
ok(view.textContent.includes('参考答案'), '点开后显示参考答案');
ok(!!findByText(view, '背下来了', 'button'), '出现自我评价按钮');
clickByText(view, '背下来了');
ok(view.textContent.includes('背下来了'), '自我评价点击成功');

console.log('\n【6】结束练习与成绩单');
D.querySelector('#tbMore').click();
ok(D.querySelector('#sheetMask').hidden === false, '点 ⋯ 弹出练习菜单');
clickByText(D.querySelector('#sheetBody'), '结束这次练习');
ok(view.textContent.includes('正确率'), '进入成绩单页');
ok(view.textContent.includes('答对') && view.textContent.includes('答错'), '成绩单显示答对 / 答错');
const ringCircles = view.querySelectorAll('circle');
ok(ringCircles.length === 2, '正确率环形图画出两个圆（实际 ' + ringCircles.length + '）');
ok(ringCircles.length === 2 && ringCircles.every((c) => c._ns === 'http://www.w3.org/2000/svg'),
  '环形图使用 SVG 命名空间（否则浏览器不渲染）');
ok(ringCircles.length === 2 && ringCircles[1].style.stroke && ringCircles[1].style.strokeWidth === '10',
  '环形图进度用内联样式设置描边');

console.log('\n【7】错题本与统计');
const tabs = D.querySelectorAll('.tab');
ok(tabs.length === 4, '底部有 4 个 tab');
tabs.find((t) => t.dataset.tab === 'wrong').click();
ok(view.textContent.includes('错题'), '错题本页面渲染正常');
tabs.find((t) => t.dataset.tab === 'stats').click();
ok(view.textContent.includes('累计正确率'), '统计页显示累计正确率');
ok(view.textContent.includes('近 7 天') || view.textContent.includes('连续打卡'), '统计页显示刷题量 / 打卡');
tabs.find((t) => t.dataset.tab === 'me').click();
ok(view.textContent.includes('刷题设置'), '我的页面渲染正常');

console.log('\n【8】导入题库（文本解析）');
clickByText(view, '导入题目');
ok(D.querySelector('#sheetMask').hidden === false, '导入弹层打开');
const ta = D.querySelector('#importText');
ok(!!ta, '找到粘贴框');
ta.value = [
  '# 科目: 实验心理学',
  '# 章节: 测试导入章',
  '',
  '1. 唐德斯的 A 反应时是指？',
  'A. 简单反应时',
  'B. 选择反应时',
  'C. 辨别反应时',
  'D. 复杂反应时',
  '答案：A',
  '解析：A 反应时即简单反应时。',
  '',
  '2. 减数法可以分离出心理加工的各个阶段。',
  '答案：对',
  '',
  '名词解释：加因素法',
  '答案：加因素法由斯滕伯格提出，通过考察因素间是否存在交互作用来确定心理加工的各个阶段。',
  '',
  '简答：简述反应时的影响因素',
  '答案：刺激强度、复杂程度、准备状态、练习、动机和个体差异等。'
].join('\n');
D.querySelector('#importChapter').value = '测试导入章';
clickByText(D.querySelector('#sheetBody'), '开始导入');
const customRaw = env.win.localStorage.getItem('psy.custom.v1');
ok(!!customRaw, '自建题库已写入本地存储');
if (customRaw) {
  const banks = JSON.parse(customRaw);
  const items = banks.flatMap((b) => b.chapters.flatMap((c) => c.items));
  ok(items.length === 4, '解析出 4 道题（实际 ' + items.length + '）');
  ok(items[0].o && items[0].o.length === 4, '单选题选项解析正确');
  ok(items[0].a === 'A', '单选题答案解析正确');
  ok(items[1].q.includes('减数法') && items[1].a === '对', '判断题解析正确');
  ok(items[2].q === '加因素法' && items[2].a.includes('斯滕伯格'), '名词解释解析正确');
  ok(items[3].q.includes('反应时的影响因素'), '简答解析正确');
}

console.log('\n【9】导出备份');
tabs.find((t) => t.dataset.tab === 'me').click();
clickByText(view, '导出备份');
const dump = D.querySelector('#exportText');
ok(!!dump, '导出弹层打开');
let parsed = null;
try { parsed = JSON.parse(dump.value); } catch (e) {}
ok(parsed && parsed.app === 'psych-quiz', '导出的 JSON 结构正确');
ok(parsed && parsed.prog && Object.keys(parsed.prog).length > 0, '备份里包含做题记录');

console.log('\n【10】题库结构');
D.querySelector('#sheetClose').click();
clickByText(view, '查看题库结构');
ok(D.querySelector('#sheetBody').textContent.includes('普通心理学'), '题库结构弹层能列出各科目');

console.log('\n【11】题库自检数据完整性');
const banks = env.win.__BANKS;
let bad = 0, total = 0;
for (const b of banks) {
  for (const c of b.chapters) {
    for (const it of c.items) {
      total++;
      const n = (it.o || []).length;
      if (it.t === 'single' && (!Number.isInteger(it.a) || it.a < 0 || it.a >= n)) bad++;
      if (it.t === 'multiple' && (!Array.isArray(it.a) || it.a.some((v) => v >= n))) bad++;
      if ((it.o || []).some((x) => String(x).trim() === '')) bad++;
    }
  }
}
ok(bad === 0, `全部 ${total} 道题答案与选项匹配（异常 ${bad} 处）`);

/* ============================ 汇总 ============================ */
console.log('\n' + '─'.repeat(52));
if (errors.length) {
  console.log('运行期捕获到异常：');
  for (const e of errors) console.log('  ' + e.message);
}
if (fails.length || errors.length) {
  console.log(`失败 ${fails.length} 项：`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exitCode = 1;
} else {
  console.log(`✓ 全部 ${pass} 项检查通过`);
}
