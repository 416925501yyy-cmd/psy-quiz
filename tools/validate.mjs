/* 题库自检：检查每道题的答案是否合法、选项是否够、题干是否重复 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.js')).sort()) {
  vm.runInContext(readFileSync(join(DIR, f), 'utf8'), sandbox, { filename: f });
}

const LETTER = 'ABCDEFGH';
const problems = [];
const warnings = [];
const seen = new Map();
const typeCount = {};
let total = 0;

const TYPES = ['single', 'multiple', 'judge', 'term', 'short', 'essay'];

for (const bank of sandbox.window.__BANKS || []) {
  for (const ch of bank.chapters) {
    for (const it of ch.items) {
      total++;
      const where = `[${bank.subject} / ${ch.name}] ${String(it.q).slice(0, 26)}…`;
      typeCount[it.t] = (typeCount[it.t] || 0) + 1;

      if (!it.q || !String(it.q).trim()) problems.push(`${where} 题干为空`);
      if (!TYPES.includes(it.t)) problems.push(`${where} 未知题型 ${it.t}`);

      const opts = (it.o || []).map((x) => String(x).trim());
      if (it.t === 'single' || it.t === 'multiple') {
        if (opts.length < 2) problems.push(`${where} 选项少于 2 个`);
        if (opts.some((x) => x === '')) problems.push(`${where} 存在空选项（会导致答案错位）`);
        if (new Set(opts).size !== opts.length) problems.push(`${where} 存在完全相同的重复选项`);
      }
      if (it.t === 'single') {
        if (!Number.isInteger(it.a)) problems.push(`${where} 单选答案不是整数（${JSON.stringify(it.a)}）`);
        else if (it.a < 0 || it.a >= opts.length) problems.push(`${where} 单选答案 ${it.a} 超出选项范围 0-${opts.length - 1}`);
      }
      if (it.t === 'multiple') {
        if (!Array.isArray(it.a) || !it.a.length) problems.push(`${where} 多选答案不是非空数组`);
        else {
          for (const v of it.a) {
            if (!Number.isInteger(v) || v < 0 || v >= opts.length) problems.push(`${where} 多选答案 ${v} 超出选项范围`);
          }
          if (new Set(it.a).size !== it.a.length) problems.push(`${where} 多选答案有重复项`);
          if (it.a.length === 1) problems.push(`${where} 多选只有 1 个正确答案，建议改成单选`);
          if (it.a.length === opts.length) warnings.push(`${where} 全部选项都是正确答案，考查价值偏低`);
        }
      }
      if (it.t === 'judge' && typeof it.a !== 'boolean') {
        problems.push(`${where} 判断题答案不是 true/false`);
      }
      if (['term', 'short', 'essay'].includes(it.t)) {
        if (typeof it.a !== 'string' || it.a.trim().length < 8) problems.push(`${where} 主观题参考答案过短或缺失`);
      }

      const key = String(it.q).replace(/\s/g, '');
      if (seen.has(key)) problems.push(`${where} 题干重复，与「${seen.get(key)}」相同`);
      else seen.set(key, where);
    }
  }
}

console.log('题量统计：', typeCount, '总计', total);

/* ---------------- 背诵手册卡片自检 ---------------- */
const CARD_TYPES = ['term', 'short', 'essay', 'table', 'exp'];
const cardSeen = new Map();
const cardTypes = {};
let cardTotal = 0;

for (const bank of sandbox.window.__RECITE || []) {
  for (const ch of bank.chapters) {
    for (const it of ch.cards) {
      cardTotal++;
      const where = `[背诵 ${bank.subject} / ${ch.name}] ${String(it.k).slice(0, 24)}…`;
      cardTypes[it.t] = (cardTypes[it.t] || 0) + 1;

      if (!it.k || !String(it.k).trim()) problems.push(`${where} 卡片正面为空`);
      if (!it.a || String(it.a).trim().length < 8) problems.push(`${where} 卡片背面过短或缺失`);
      if (!CARD_TYPES.includes(it.t)) problems.push(`${where} 未知卡片类型 ${it.t}`);
      if (!Number.isInteger(it.f) || it.f < 1 || it.f > 3) problems.push(`${where} 考频 f 应为 1-3（${it.f}）`);
      if (String(it.a).includes('\\n') && !String(it.a).includes('\n')) {
        problems.push(`${where} 换行写成了字面 \\n，要注意转义`);
      }

      const key = bank.subject + '|' + String(it.k).replace(/\s/g, '');
      if (cardSeen.has(key)) problems.push(`${where} 卡片标题重复，与「${cardSeen.get(key)}」相同`);
      else cardSeen.set(key, where);
    }
  }
}
console.log('背诵卡片：', cardTypes, '总计', cardTotal);

if (warnings.length) {
  console.log(`\n${warnings.length} 条建议（不算错误）：`);
  for (const w of warnings) console.log('  ! ' + w);
}
if (problems.length) {
  console.log(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.log('  ✗ ' + p);
  process.exitCode = 1;
} else {
  console.log('\n✓ 题库自检通过，没有发现问题');
}
