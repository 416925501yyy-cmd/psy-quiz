/* 极简网页搜索助手（无第三方依赖）
   用法：node tools/search.mjs "关键词" [结果条数]
   用 Bing 取结果标题、链接和摘要，便于快速调研。 */
import { argv } from 'node:process';

const args = argv.slice(2);
const getArg = (n, d) => {
  const hit = args.find((a) => a.startsWith('--' + n + '='));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const query = args.find((a) => !a.startsWith('--'));
const limit = Number(getArg('n', 10));
const wantEngine = getArg('engine', 'ddg');
if (!query) {
  console.error('用法：node tools/search.mjs "关键词" [--engine=ddg|bing|sogou] [--n=10]');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const strip = (s) => String(s)
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

async function fetchHtml(url, extraHeaders) {
  const res = await fetch(url, {
    headers: Object.assign({
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }, extraHeaders || {}),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function bing(q) {
  const url = 'https://cn.bing.com/search?setlang=zh-CN&ensearch=0&q=' + encodeURIComponent(q);
  const html = await fetchHtml(url);
  const out = [];
  const blocks = html.split(/<li class="b_algo"/).slice(1);
  for (const b of blocks) {
    const link = b.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const cap = b.match(/<p[^>]*>([\s\S]*?)<\/p>/) || b.match(/<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/);
    out.push({ title: strip(link[2]), url: link[1], snippet: cap ? strip(cap[1]) : '' });
    if (out.length >= limit) break;
  }
  return out;
}

async function ddg(q) {
  const url = 'https://lite.duckduckgo.com/lite/?kl=cn-zh&q=' + encodeURIComponent(q);
  const html = await fetchHtml(url);
  const out = [];
  const rows = html.split(/<tr[\s>]/).slice(1);
  let pending = null;
  for (const r of rows) {
    const a = r.match(/<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (a) { pending = { title: strip(a[2]), url: a[1], snippet: '' }; out.push(pending); continue; }
    const sn = r.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/);
    if (sn && pending) pending.snippet = strip(sn[1]);
    if (out.length >= limit) break;
  }
  return out;
}

async function sogou(q) {
  const url = 'https://www.sogou.com/web?query=' + encodeURIComponent(q);
  const html = await fetchHtml(url);
  const out = [];
  const blocks = html.split(/<div class="vrwrap"/).slice(1);
  for (const b of blocks) {
    const a = b.match(/<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const sn = b.match(/<div class="(?:text-layout|fz-mid|star-wiki)[^"]*"[^>]*>([\s\S]*?)<\/div>/)
      || b.match(/<p[^>]*class="[^"]*str_info[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    out.push({ title: strip(a[2]), url: a[1], snippet: sn ? strip(sn[1]) : '' });
    if (out.length >= limit) break;
  }
  return out;
}

const ENGINES = { bing, ddg, sogou };

try {
  const fn = ENGINES[wantEngine];
  if (!fn) throw new Error('未知搜索引擎：' + wantEngine);
  const results = await fn(query);
  console.log('\n搜索：' + query + '　（共 ' + results.length + ' 条）\n' + '─'.repeat(70));
  if (!results.length) console.log('（没有解析到结果，可能需要换关键词或换搜索引擎）');
  results.forEach((r, i) => {
    console.log('\n' + (i + 1) + '. ' + r.title);
    console.log('   ' + r.url);
    if (r.snippet) console.log('   ' + r.snippet);
  });
  console.log('');
} catch (e) {
  console.error('搜索失败：' + e.message);
  process.exit(1);
}
