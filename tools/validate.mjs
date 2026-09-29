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

const problems = [];
const warnings = [];
const seen = new Map();
const perModule = {};
let total = 0;

const MODULE_NAMES = { term: '名词解释', short: '简答', comp: '综合', recall: '快速回忆' };

for (const bank of sandbox.window.__MODULES || []) {
  const modName = MODULE_NAMES[bank.module] || bank.module;
  perModule[modName] = (perModule[modName] || 0);
  for (const ch of (bank.chapters || [])) {
    for (const it of (ch.items || [])) {
      total++;
      perModule[modName]++;
      const where = `[${modName} · ${bank.subject} / ${ch.name}] ${String(it.q).slice(0, 22)}…`;

      if (!it.q || !String(it.q).trim()) problems.push(`${where} 标题为空`);
      // 快速回忆的答案就是导图上那几个分支名，本来就短
      const minLen = bank.module === 'recall' ? 2 : 8;
      if (typeof it.a !== 'string' || it.a.trim().length < minLen) problems.push(`${where} 答案过短或缺失`);
      // 排版噪声：中文词中间不该有空格；也不该残留页眉水印
      // 快速回忆的原文来自思维导图，标题和原文里本来就有空格，跳过空格检查
      if (bank.module !== 'recall') {
        if (/[\u4e00-\u9fff] [\u4e00-\u9fff]/.test(it.a)) warnings.push(`${where} 答案里可能有换行造成的空格`);
        if (/[\u4e00-\u9fff] [\u4e00-\u9fff]/.test(it.q)) problems.push(`${where} 标题里有空格`);
      }
      if (/公众号|晴天|耐嚼|盗版/.test(it.q + it.a)) problems.push(`${where} 残留资料水印文字`);

      const key = modName + '|' + bank.subject + '|' + String(it.q).replace(/\s/g, '');
      if (seen.has(key)) problems.push(`${where} 标题重复，与「${seen.get(key)}」相同`);
      else seen.set(key, where);
    }
  }
}

console.log('模块题量：', perModule, '总计', total);

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
