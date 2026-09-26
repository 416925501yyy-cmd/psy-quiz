/* ==========================================================================
   一键把 dist/site 发布到 GitHub Pages
   自己完成：创建仓库 → 上传全部文件 → 开启 Pages → 等构建完成 → 打印网址

   用法：
     node tools/publish.mjs                       # 交互式粘贴 Token（推荐，Token 不经过任何人）
     node tools/publish.mjs --repo=psy-quiz       # 指定仓库名（默认 psych-quiz）
     node tools/publish.mjs --dry-run             # 只列出要上传的文件，不联网

   需要一个 GitHub 令牌（Token）：
     头像 → Settings → Developer settings → Personal access tokens
     → Tokens (classic) → Generate new token (classic)
     → 勾选 repo（以及 workflow 可选）→ 有效期选 7 天即可 → 生成后复制
   ========================================================================== */
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin, stdout, argv } from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'dist', 'site');
const API = 'https://api.github.com';

const args = argv.slice(2);
const getArg = (name, dft) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : dft;
};
const REPO = getArg('repo', 'psych-quiz');
const DRY = args.includes('--dry-run');

/* ---------------- 小工具 ---------------- */
const c = {
  dim: (s) => '\x1b[2m' + s + '\x1b[0m',
  green: (s) => '\x1b[32m' + s + '\x1b[0m',
  red: (s) => '\x1b[31m' + s + '\x1b[0m',
  bold: (s) => '\x1b[1m' + s + '\x1b[0m'
};
const die = (msg) => { console.error('\n' + c.red('✗ ' + msg)); process.exit(1); };

/** 隐藏回显的输入（用于粘贴 Token） */
function askHidden(question) {
  return new Promise((res) => {
    stdout.write(question);
    const onData = (chunk) => {
      const s = chunk.toString('utf8');
      if (s.includes('\n') || s.includes('\r')) {
        stdin.removeListener('data', onData);
        stdin.pause();
        stdout.write('\n');
        res(buffer.trim());
      } else if (s === '\u0003') {
        process.exit(130);
      } else {
        buffer += s;
      }
    };
    let buffer = '';
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

async function walk(dir, base = dir, out = []) {
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) await walk(full, base, out);
    else out.push({ full, path: relative(base, full).split(sep).join('/') });
  }
  return out;
}

/* ---------------- GitHub API ---------------- */
let TOKEN = '';
async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'psych-quiz-publisher',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    return { ok: false, status: 0, data: { message: '连不上 GitHub（' + e.message + '）' } };
  }
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { ok: res.ok, status: res.status, data };
}

/* ---------------- 主流程 ---------------- */
console.log(c.bold('\n心理学刷题 · 一键发布到 GitHub Pages\n'));

const s = await stat(SITE).catch(() => null);
if (!s || !s.isDirectory()) die('找不到 ' + SITE + '，请先执行：npm run build');

const files = await walk(SITE);
console.log('待上传 ' + c.bold(String(files.length)) + ' 个文件：');
for (const f of files) console.log('  ' + c.dim('·') + ' ' + f.path);

if (DRY) {
  console.log('\n' + c.dim('（--dry-run 模式，没有联网、没有上传）'));
  process.exit(0);
}

TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
if (!TOKEN) {
  console.log('\n需要 GitHub 令牌（只会存在你本机，不会发给任何人）：');
  console.log(c.dim('  头像 → Settings → Developer settings → Personal access tokens →'));
  console.log(c.dim('  Tokens (classic) → Generate new token (classic) → 勾选 repo → 生成并复制'));
  TOKEN = (await askHidden('\n粘贴 Token 后回车（输入时不显示）：')).trim();
}
if (!TOKEN) die('没有拿到 Token');

/* 1. 我是谁 */
const me = await api('/user');
if (!me.ok) {
  if (me.status === 0) die(me.data.message);
  die('Token 无效或没有权限（HTTP ' + me.status + '）' +
    (me.data && me.data.message ? '：' + me.data.message : ''));
}
const login = me.data.login;
console.log('\n✓ 已登录：' + c.bold(login));

/* 2. 建仓库（已存在就跳过） */
const created = await api('/user/repos', {
  method: 'POST',
  body: {
    name: REPO,
    description: '心理学考研刷题（普通心理学 / 实验心理学）· 手机离线可用',
    private: false,
    auto_init: true,
    has_issues: false,
    has_wiki: false
  }
});
if (created.ok) {
  console.log('✓ 已创建仓库：' + login + '/' + REPO + c.dim('（公开）'));
  await new Promise((r) => setTimeout(r, 1500));   // 等 auto_init 建出 main 分支
} else if (created.status === 422) {
  console.log('· 仓库已存在，直接更新内容：' + login + '/' + REPO);
} else {
  die('创建仓库失败（HTTP ' + created.status + '）' +
    (created.data && created.data.message ? '：' + created.data.message : ''));
}

/* 3. 逐个上传（Contents API，二进制安全） */
let okCount = 0, failCount = 0;
for (const f of files) {
  const buf = await readFile(f.full);
  const encoded = buf.length ? buf.toString('base64') : Buffer.from('\n').toString('base64');
  const apiPath = '/repos/' + login + '/' + REPO + '/contents/' +
    f.path.split('/').map(encodeURIComponent).join('/');

  let sha;
  const head = await api(apiPath + '?ref=main');
  if (head.ok && head.data && head.data.sha) sha = head.data.sha;

  const put = await api(apiPath, {
    method: 'PUT',
    body: { message: '更新 ' + f.path, content: encoded, branch: 'main', ...(sha ? { sha } : {}) }
  });
  if (put.ok) { okCount++; console.log('  ✓ ' + f.path); }
  else {
    failCount++;
    console.log('  ' + c.red('✗ ' + f.path) + c.dim('  HTTP ' + put.status +
      (put.data && put.data.message ? '：' + put.data.message : '')));
  }
}
if (failCount) console.log(c.dim('\n（失败的可以重跑一次，脚本会覆盖已有文件）'));

/* 4. 开启 Pages */
const pagesBody = { source: { branch: 'main', path: '/' } };
let pages = await api('/repos/' + login + '/' + REPO + '/pages', { method: 'POST', body: pagesBody });
if (!pages.ok && (pages.status === 409 || pages.status === 422)) {
  pages = await api('/repos/' + login + '/' + REPO + '/pages', { method: 'PUT', body: pagesBody });
}
if (pages.ok) console.log('✓ 已开启 GitHub Pages（从 main 分支发布）');
else console.log('· 未能自动开启 Pages（HTTP ' + pages.status + '）' +
  c.dim('，可手动：仓库 → Settings → Pages → Source 选 main / (root)'));

/* 5. 等构建完成 */
const url = 'https://' + login + '.github.io/' + REPO + '/';
console.log('\n' + c.dim('等待 Pages 构建…'));
let status = '';
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const st = await api('/repos/' + login + '/' + REPO + '/pages');
  if (st.ok && st.data) {
    status = st.data.status || '';
    if (status === 'built') break;
    if (i % 3 === 0) process.stdout.write(c.dim('.'));
  }
}

console.log('\n' + '─'.repeat(56));
console.log('上传成功 ' + c.green(String(okCount)) + ' 个文件' +
  (failCount ? '，失败 ' + c.red(String(failCount)) + ' 个' : ''));
console.log('Pages 状态：' + (status === 'built' ? c.green('已构建完成') : c.dim(status || '构建中，稍等一会儿')));
console.log('\n' + c.bold('她的访问网址：'));
console.log('  ' + c.green(c.bold(url)));
console.log('\n把上面这个网址发给她 → 手机浏览器打开 → 「添加到主屏幕」。');
console.log(c.dim('之后换任何网络都能用，断网也能用，跟你的电脑没关系了。'));
console.log(c.dim('如果现在打开是 404，等 1~2 分钟再刷新（Pages 首次构建比较慢）。\n'));
