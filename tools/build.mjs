/* 一键打包
   1) dist/心理学刷题-单文件版.html   —— 全部内容打进一个文件，传到手机上直接打开
   2) dist/site/                      —— 完整站点目录，可放 GitHub Pages / 任意静态托管，支持「添加到主屏幕」 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

mkdirSync(DIST, { recursive: true });

const css = read('styles.css');
const appJs = read('app.js');
const bankGeneral = read('data/bank-general.js');
const bankExperimental = read('data/bank-experimental.js');
const icon180 = readFileSync(resolve(ROOT, 'icons/icon-180.png')).toString('base64');
const iconSvg = read('icons/icon.svg');

/* ---------------- 1. 单文件版 ---------------- */
let html = read('index.html');

html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/,
  `<link rel="apple-touch-icon" href="data:image/png;base64,${icon180}">`);
html = html.replace(/<link rel="icon"[^>]*>/,
  `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}">`);
html = html.replace(/\s*<link rel="stylesheet" href="styles\.css">/, `\n<style>\n${css}\n</style>`);
html = html.replace(/\s*<script src="data\/bank-general\.js"><\/script>/, '');
html = html.replace(/\s*<script src="data\/bank-experimental\.js"><\/script>/, '');
html = html.replace(/\s*<script src="app\.js"><\/script>/,
  `\n<script>\n/* ---------- 题库：普通心理学 ---------- */\n${bankGeneral}\n</script>` +
  `\n<script>\n/* ---------- 题库：实验心理学 ---------- */\n${bankExperimental}\n</script>` +
  `\n<script>\nwindow.__NO_SW = true;\n${appJs}\n</script>`);

if (/src="|href="styles\.css/.test(html)) {
  console.error('警告：单文件版里可能还有没内联的外部引用');
}
const outFile = resolve(DIST, '心理学刷题-单文件版.html');
writeFileSync(outFile, html, 'utf8');
console.log('✓ 单文件版：' + outFile + '  (' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB)');

/* ---------------- 2. 完整站点 ---------------- */
const SITE = resolve(DIST, 'site');
if (existsSync(SITE)) rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
for (const f of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js']) {
  writeFileSync(resolve(SITE, f), read(f), 'utf8');
}
for (const d of ['data', 'icons']) {
  cpSync(resolve(ROOT, d), resolve(SITE, d), { recursive: true });
}
writeFileSync(resolve(SITE, '.nojekyll'), '');   // 让 GitHub Pages 原样发布，不做 Jekyll 处理
console.log('✓ 站点目录：' + SITE);
