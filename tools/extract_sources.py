#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把用户提供的七份资料抽成结构化 JSON，供 build 阶段生成 App 数据文件。

输入（放在项目根目录）：
  普通心理学名词解释.pdf           -> build/src_pu_term.json
  实验心理学名词解释.pdf           -> build/src_exp_term.json
  普通心理学100个重要理论.pdf       -> build/src_theories.json
  背诵资料.docx                   -> build/src_beisong.json
  实验心理学简答题.docx            -> build/src_exp_short.json
  实验心理学简答和论述汇总.doc      -> build/src_exp_summary.json
  普心第六版思维导图.pdf           -> build/src_mindmap.json

用法：python tools/extract_sources.py
"""
import json
import os
import re
import subprocess
import sys
import zipfile

import pypdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'build')
os.makedirs(OUT, exist_ok=True)


def pdf_text(name):
    path = os.path.join(ROOT, name)
    return '\n'.join((p.extract_text() or '') for p in pypdf.PdfReader(path).pages)


def docx_text(name):
    path = os.path.join(ROOT, name)
    z = zipfile.ZipFile(path)
    xml = z.read('word/document.xml').decode('utf-8', 'ignore')
    xml = xml.replace('</w:p>', '\n')
    return re.sub(r'<[^>]+>', '', xml)


def doc_text(name):
    """老版 .doc 用 Word COM 转换（Windows + Office）"""
    txt = os.path.join(OUT, '_' + os.path.splitext(name)[0] + '.txt')
    if os.path.exists(txt):
        return open(txt, encoding='utf-8').read()
    ps = (
        "$w=New-Object -ComObject Word.Application;$w.Visible=$false;$w.DisplayAlerts=0;"
        "$d=$w.Documents.Open('%s',$false,$true);$t=$d.Content.Text;"
        "$d.Close(0);$w.Quit();"
        "[System.IO.File]::WriteAllText('%s',$t,[System.Text.Encoding]::UTF8)"
        % (os.path.join(ROOT, name), txt)
    )
    subprocess.run(['powershell', '-NoProfile', '-Command', ps], check=True)
    return open(txt, encoding='utf-8').read()


def clean(s):
    s = re.sub(r'（公众号：晴天心理学考研）', '', s)
    s = re.sub(r'耐嚼的干货公众号：晴天心理学考研\s*~\s*\d+\s*~', '', s)
    s = re.sub(r'晴天心\s*\n\s*心理学\s*\n', '', s)
    s = re.sub(r'[ \t\u3000]+', ' ', s)
    s = re.sub(r'\n\s*\n+', '\n', s)
    return s.strip()


CJK = r'\u4e00-\u9fff'


def tidy(s):
    """清掉 PDF 排版噪声：中文词内空格、标点旁空格、错位的等号。"""
    s = s.replace('\u3000', ' ')
    # 中文与中文之间的空格是 PDF 折行造成的
    s = re.sub(r'(?<=[%s])\s+(?=[%s])' % (CJK, CJK), '', s)
    s = re.sub(r'(?<=[%s])\s+(?=[（(])' % CJK, '', s)
    s = re.sub(r'(?<=[）)])\s+(?=[%s])' % CJK, '', s)
    s = re.sub(r'([，。；：、！？]) +', r'\1', s)
    s = re.sub(r' +([，。；：、！？])', r'\1', s)
    # 实验那份里被渲染成「=」的破折号（夹在中文之间才算）
    s = re.sub(r'(?<=[%s])\s*=\s*(?=[%s])' % (CJK, CJK), '：', s)
    # 资料水印（在 PDF 里常被折成两行，所以要在拼回一行之后再清一次）
    s = re.sub(r'[（(]\s*公众号\s*[:：]?\s*晴天\s*心理学考研\s*[)）]\s*[。.]?', '', s)
    s = re.sub(r'耐嚼的干货公众号\s*[:：]?\s*晴天\s*心理学考研', '', s)
    s = re.sub(r'晴天\s*心理学考研', '', s)
    # 被跨页截断的水印残片，例如结尾只剩「（公众号：」
    s = re.sub(r'[（(]\s*公众号\s*[:：]?', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def write(name, data):
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('  写入 %-28s %s 条' % (name, len(data) if isinstance(data, list) else '-'))


# ---------------------------------------------------------------- 名词解释

def parse_pu_term():
    """普通心理学名词解释：1—120 连续编号。"""
    t = clean(pdf_text('普通心理学名词解释.pdf'))
    # 注意：第 6、7、8 条在 PDF 里排在正文最前面，不能按「从 1 开始」切片
    marks = list(re.finditer(r'(?m)^\s*(\d{1,3})\s*[.．、]\s*', t))
    best = {}
    for i, mk in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(t)
        body = t[mk.end():end].strip()
        body = tidy(re.sub(r'\s*\n\s*', ' ', body))
        n = int(mk.group(1))
        if not (1 <= n <= 120) or len(body) < 30:
            continue
        head = re.split(r'[：:]', body, maxsplit=1)
        if len(head) == 2 and len(head[0]) <= 20:
            title, text = head[0].strip(), head[1].strip()
        else:
            title, text = body[:12], body
        title = tidy(title)
        text = tidy(text)
        if n not in best or len(text) > len(best[n]['body']):
            best[n] = {'n': n, 'title': title, 'body': text}
    return [best[n] for n in sorted(best)]


def parse_exp_term():
    """实验心理学名词解释：N．【名词】释义"""
    t = clean(pdf_text('实验心理学名词解释.pdf'))
    marks = list(re.finditer(r'(?m)^\s*(\d{1,3})\s*[.．、]\s*', t))
    items = []
    for i, mk in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(t)
        body = tidy(re.sub(r'\s*\n\s*', ' ', t[mk.end():end]))
        if len(body) < 8:
            continue
        m = re.match(r'^\s*[【\[]([^】\]]+)[】\]]\s*(.*)$', body, re.S)
        if m:
            title, text = m.group(1).strip(), m.group(2).strip()
        else:
            head = re.split(r'[：:]', body, maxsplit=1)
            title, text = (head[0].strip(), head[1].strip()) if len(head) == 2 else (body[:12], body)
        # 去掉「的概念：」「：」「是指」「是」这类连接词，让释义能独立成句
        text = re.sub(r'^\s*(?:的)?(?:概念)?\s*[：:]?\s*', '', text, count=1)
        text = re.sub(r'^(?:是指|是)\s*', '', text, count=1)
        title = tidy(title).replace('得含义', '的含义')
        text = tidy(text)
        items.append({'n': int(mk.group(1)), 'title': title, 'body': text})
    return items


def main():
    print('抽取资料 ->', OUT)
    write('src_pu_term.json', parse_pu_term())
    write('src_exp_term.json', parse_exp_term())
    write('src_exp_short.json', parse_exp_short())
    write('src_exp_summary.json', parse_exp_summary())
    write('src_beisong.json', parse_beisong())
    write('src_theories.json', parse_theories())
    write('src_mindmap.json', parse_mindmap())


# ---------------------------------------------------------------- 实验·简答题

def parse_exp_short():
    """实验心理学简答题.docx：前半是题号清单，'答案：' 之后是题+答。"""
    t = docx_text('实验心理学简答题.docx')
    i = t.find('答案：')
    t = t[i:] if i >= 0 else t
    marks = list(re.finditer(r'(?m)^\s*(\d{1,3})\s*[、．.]\s*', t))
    items = []
    for k, mk in enumerate(marks):
        end = marks[k + 1].start() if k + 1 < len(marks) else len(t)
        seg = re.sub(r'\s*\n\s*', ' ', t[mk.end():end])
        # 题干以问号/句号结束，后面是答案
        m = re.match(r'^(.*?[？?])\s*(.+)$', seg, re.S)
        if not m:
            m = re.match(r'^(.*?。)\s*(.+)$', seg, re.S)
        if not m:
            continue
        q, a = tidy(m.group(1)), tidy(m.group(2))
        if len(q) < 6 or len(a) < 20:
            continue
        items.append({'n': int(mk.group(1)), 'q': q, 'a': a})
    return items


def parse_exp_summary():
    """实验心理学简答和论述汇总.doc：N.题目 答：参考答案"""
    t = doc_text('实验心理学简答和论述汇总.doc')
    marks = list(re.finditer(r'(?m)^\s*(\d{1,3})\s*[、．.]\s*', t))
    items = []
    for k, mk in enumerate(marks):
        end = marks[k + 1].start() if k + 1 < len(marks) else len(t)
        seg = t[mk.end():end]
        m = re.match(r'\s*(.*?)\s*答[：:]\s*(.*)$', seg, re.S)
        if not m:
            continue
        q = tidy(re.sub(r'\s*\n\s*', ' ', m.group(1)))
        a = tidy(re.sub(r'\s*\n\s*', ' ', m.group(2)))
        if len(q) < 6 or len(a) < 30:
            continue
        items.append({'n': int(mk.group(1)), 'q': q, 'a': a})
    return items


# ---------------------------------------------------------------- 背诵资料（普心）

HEAD_CHAP = re.compile(r'(?m)^\s*第[一二三四五六七八九十]+章[^\n]{0,40}$')
HEAD_SEC = re.compile(r'(?m)^\s*[一二三四五六七八九十]+、[^\n]{0,40}$')
HEAD_SUB = re.compile(r'(?m)^\s*[（(][一二三四五六七八九十]+[)）][^\n]{0,60}$')


def _clean_head(s):
    s = re.sub(r'P?\d{3,}', '', s)          # 页码与串进来的图片编号
    s = re.sub(r'[（(]第[六五]版[^）)]*[)）]', '', s)
    s = s.replace('®', '').replace('从学简快', '').replace('（高频考点）', '')
    s = tidy(s)
    # 章标题统一成「第X章 名字」
    m = re.match(r'^第\s*([一二三四五六七八九十]+)\s*章\s*([^0-9A-Za-z]{2,20})', s)
    if m:
        return '第%s章 %s' % (m.group(1), m.group(2).strip())
    return s


def parse_beisong():
    """背诵资料.docx：分层抽出「章 / 节 / 小标题 / 正文」，作为普心简答素材。"""
    t = docx_text('背诵资料.docx')
    lines = [l.strip() for l in t.split('\n')]
    items = []
    chap = sec = sub = ''
    buf = []

    def flush():
        body = tidy(' '.join(buf))
        buf.clear()
        if sub and len(body) >= 40:
            items.append({'chapter': chap, 'section': sec, 'title': sub, 'body': body})

    for ln in lines:
        if not ln:
            continue
        if HEAD_CHAP.match(ln):
            flush(); chap = _clean_head(ln); sec = sub = ''
            continue
        if HEAD_SEC.match(ln):
            flush(); sec = _clean_head(ln); sub = ''
            continue
        if HEAD_SUB.match(ln):
            flush(); sub = _clean_head(ln)
            continue
        buf.append(ln)
    flush()
    return items


# ---------------------------------------------------------------- 100 个重要理论

def parse_theories():
    """100 个重要理论.pdf：表格，抽「理论名 + 提出者」清单（顺序即教材顺序）。"""
    t = clean(pdf_text('普通心理学100个重要理论.pdf'))
    lines = [tidy(l) for l in t.split('\n')]
    out = []
    for ln in lines:
        if len(ln) < 4 or len(ln) > 40:
            continue
        if re.search(r'[A-Za-z0-9]{6,}', ln):
            continue
        if re.fullmatch(r'[第\d一二三四五六七八九十]+章', ln):
            out.append({'type': 'chapter', 'text': ln})
            continue
        out.append({'type': 'row', 'text': ln})
    return out


# ---------------------------------------------------------------- 思维导图

def _page_fragments(page):
    """取出页面上的文字片段及其坐标（思维导图靠坐标才能还原层级）。"""
    out = []

    def visit(text, cm, tm, font, size):
        t = text.strip()
        if not t:
            return
        if re.fullmatch(r'[\d\s.]+', t):              # 页码
            return
        if not re.search(r'[\u4e00-\u9fff⭐]', t):    # 水印乱码
            return
        out.append({'x': round(tm[4], 1), 'y': round(tm[5], 1), 't': t})

    page.extract_text(visitor_text=visit)
    return out


def _cluster_x(frags, tol=12):
    """把 x 坐标聚成若干「层」，返回 (层列表, x->层号)。"""
    xs = sorted({f['x'] for f in frags})
    levels, cur = [], [xs[0]]
    for x in xs[1:]:
        if x - cur[-1] <= tol:
            cur.append(x)
        else:
            levels.append(cur)
            cur = [x]
    levels.append(cur)
    idx = {}
    for i, grp in enumerate(levels):
        for x in grp:
            idx[x] = i
    return levels, idx


def _parse_page(page):
    """一页 = 一章。返回 {'chapter':…, 'sections':[{title, stars, children:[…]}]}"""
    frags = _page_fragments(page)
    if not frags:
        return None
    levels, lv = _cluster_x(frags)

    # 最左一列是章标题（竖排单字）
    head = sorted([f for f in frags if lv[f['x']] == 0], key=lambda f: -f['y'])
    chapter = ''.join(f['t'] for f in head)
    body = [f for f in frags if lv[f['x']] > 0]
    if not body:
        return None

    # 星号片段单独拎出来，按 y 吸附到最近的标题上
    stars = [f for f in body if '⭐' in f['t']]
    nodes = [f for f in body if '⭐' not in f['t']]
    secs = [f for f in nodes if re.match(r'^第[一二三四五六七八九十]+节', f['t'])]

    def star_of(f):
        n = 0
        for s in stars:
            if abs(s['y'] - f['y']) < 14 and 0 < s['x'] - f['x'] < 260:
                n = max(n, s['t'].count('⭐'))
        return n

    # 每一节一条「横向带」，带内按 x（层级）再按 y（顺序）排
    secs.sort(key=lambda f: -f['y'])
    bands = []
    for i, s in enumerate(secs):
        top = 1e9 if i == 0 else (secs[i - 1]['y'] + s['y']) / 2
        bot = -1e9 if i == len(secs) - 1 else (s['y'] + secs[i + 1]['y']) / 2
        bands.append({'sec': s, 'top': top, 'bot': bot, 'kids': []})

    for f in nodes:
        if f is None or f in secs:
            continue
        best, dist = None, 1e9
        for b in bands:
            if b['bot'] < f['y'] < b['top']:
                d = abs(b['sec']['y'] - f['y'])
                if d < dist:
                    best, dist = b, d
        if best is None and bands:
            best = min(bands, key=lambda b: abs(b['sec']['y'] - f['y']))
        if best is not None:
            best['kids'].append(f)

    out = []
    for b in bands:
        out.append({'title': b['sec']['t'], 'stars': star_of(b['sec']),
                    'tree': _build_tree(b['kids'], star_of)})
    return {'chapter': chapter, 'sections': out}


def _band_levels(nodes, gap=60):
    """在「一节」内部按 x 的大间隔切层。

    同一层的节点 x 会因文字长短而不同（相邻层之间才是一个明显的大间隔），
    所以用「间隔 > gap 就切一刀」的办法分层，比固定容差稳。
    """
    xs = sorted({f['x'] for f in nodes})
    groups, cur = [], [xs[0]]
    for x in xs[1:]:
        if x - cur[-1] > gap:
            groups.append(cur)
            cur = [x]
        else:
            cur.append(x)
    groups.append(cur)
    lv = {}
    for i, g in enumerate(groups):
        for x in g:
            lv[x] = i
    return lv


def _build_tree(nodes, star_of):
    """同一节内的节点按 x 分层还原父子关系。

    思维导图是「扇形展开」：一个父节点的子节点在垂直方向大致以父节点为中心
    均匀铺开，而且同一父节点的子节点在 y 方向上是连续的。所以按层做一次
    「连续分段 + 均值最接近」的动态规划，比单纯就近匹配准得多。
    """
    if not nodes:
        return []
    lv = _band_levels(nodes)
    by_level = {}
    for f in nodes:
        by_level.setdefault(lv[f['x']], []).append(f)
    levels = sorted(by_level)
    wrapped = {}
    for L in levels:
        for f in sorted(by_level[L], key=lambda f: -f['y']):
            wrapped[id(f)] = {'t': f['t'], 'stars': star_of(f), 'children': [], 'y': f['y']}

    for i in range(1, len(levels)):
        parents = wrapped_ordered(by_level[levels[i - 1]], wrapped)
        kids = wrapped_ordered(by_level[levels[i]], wrapped)
        for pi, block in enumerate(_partition(parents, kids)):
            parents[pi]['children'].extend(block)
    return [wrapped[id(f)] for f in sorted(by_level[levels[0]], key=lambda f: -f['y'])]


def wrapped_ordered(frags, wrapped):
    return [wrapped[id(f)] for f in sorted(frags, key=lambda f: -f['y'])]


def _partition(parents, kids):
    """把 kids（已按 y 降序）连续分段，每段分给一个 parent，段内 y 均值最接近父节点。"""
    import math
    m, n = len(parents), len(kids)
    if n == 0:
        return [[] for _ in range(m)]
    if m == 1:
        return [kids]
    prefix = [0.0]
    for k in kids:
        prefix.append(prefix[-1] + k['y'])

    def mean(a, b):          # kids[a:b] 的 y 均值
        return (prefix[b] - prefix[a]) / (b - a)

    INF = float('inf')
    dp = [[INF] * (n + 1) for _ in range(m + 1)]
    back = [[0] * (n + 1) for _ in range(m + 1)]
    dp[0][0] = 0
    for i in range(1, m + 1):
        for j in range(0, n + 1):
            # 允许某个父节点一个子节点都没有（k == j 时这一段为空）
            for k in range(0, j + 1):
                if dp[i - 1][k] == INF:
                    continue
                cost = 0.0 if k == j else abs(mean(k, j) - parents[i - 1]['y'])
                if dp[i - 1][k] + cost < dp[i][j]:
                    dp[i][j] = dp[i - 1][k] + cost
                    back[i][j] = k
    out = [[] for _ in range(m)]
    j = n
    for i in range(m, 0, -1):
        k = back[i][j]
        out[i - 1] = kids[k:j]
        j = k
    return out


def parse_mindmap():
    r = pypdf.PdfReader(os.path.join(ROOT, '普心第六版思维导图.pdf'))
    pages = []
    for i, p in enumerate(r.pages):
        if i == 0:            # 第 1 页是总目录
            continue
        d = _parse_page(p)
        if d:
            pages.append(d)
    return pages


# ------------------------------------------------ 直接解析连线，确定父子关系

def _mat_mul(a, b):
    return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5])


def _mat_pt(m, x, y):
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def page_curves(page):
    """取出页面里所有「一笔画成的曲线」的起终点（思维导图的连线）。"""
    data = page.get_contents().get_data().decode('latin-1')
    toks = re.findall(r'[-+]?[\d.]+|[A-Za-z*\'"]{1,3}', data)
    ctm, stack = (1, 0, 0, 1, 0, 0), []
    args, pts, segs, out = [], [], [], []
    for tk in toks:
        if re.fullmatch(r'[-+]?[\d.]+', tk):
            args.append(float(tk))
            continue
        if tk == 'q':
            stack.append(ctm)
        elif tk == 'Q':
            ctm = stack.pop() if stack else ctm
        elif tk == 'cm' and len(args) >= 6:
            ctm = _mat_mul(tuple(args[-6:]), ctm)
        elif tk == 'm' and len(args) >= 2:
            pts = [_mat_pt(ctm, args[-2], args[-1])]
        elif tk == 'c' and len(args) >= 6:
            if pts:
                segs.append(_mat_pt(ctm, args[-2], args[-1]))
        elif tk == 'l' and len(args) >= 2:
            if pts:
                segs.append(_mat_pt(ctm, args[-2], args[-1]))
        elif tk in ('S', 's', 'f', 'F', 'f*', 'B', 'b', 'n'):
            if pts and segs:
                out.append((pts[0], segs[-1], len(segs)))
            pts, segs = [], []
        args = []
    return out


def page_polylines(page):
    """取出页面上所有折线（每条 = 一串点），连线就是「先竖后横」的折线。"""
    data = page.get_contents().get_data().decode('latin-1')
    toks = re.findall(r'[-+]?[\d.]+|[A-Za-z*\'"]{1,3}', data)
    ctm, stack = (1, 0, 0, 1, 0, 0), []
    args, pts, out = [], [], []
    for tk in toks:
        if re.fullmatch(r'[-+]?[\d.]+', tk):
            args.append(float(tk))
            continue
        if tk == 'q':
            stack.append(ctm)
        elif tk == 'Q':
            ctm = stack.pop() if stack else ctm
        elif tk == 'cm' and len(args) >= 6:
            ctm = _mat_mul(tuple(args[-6:]), ctm)
        elif tk == 'm' and len(args) >= 2:
            pts = [_mat_pt(ctm, args[-2], args[-1])]
        elif tk in ('l', 'c') and len(args) >= 2:
            if pts:
                pts.append(_mat_pt(ctm, args[-2], args[-1]))
        elif tk in ('S', 's', 'f', 'F', 'f*', 'B', 'b', 'n'):
            if len(pts) >= 2:
                out.append(pts)
            pts = []
        args = []
    return out


def _nearest(frags, x, y, right_side, tol_y=14):
    """在文字片段里找连线的另一端：right_side=True 表示找父节点（在连线左侧）。"""
    best, score = None, 1e9
    for f in frags:
        if abs(f['y'] - y) > tol_y:
            continue
        if right_side and f['x'] >= x - 1:
            continue
        if not right_side and f['x'] <= x + 1:
            continue
        s = abs(f['y'] - y) * 2 + abs(f['x'] - x) * 0.05
        if s < score:
            best, score = f, s
    return best


def mindmap_tree(page):
    """用连线确定父子关系，返回 (章标题, 根节点列表, 节点字典)。

    导图的连线是分两段画的：
      「父节点右边缘 →（竖线）→ 拐点」 + 「拐点 →（横线）→ 子节点左边缘」
    所以要先把两段按共享的拐点拼起来，才能还原父子。
    """
    frags = _page_fragments(page)
    if not frags:
        return '', [], {}
    min_x = min(f['x'] for f in frags)
    chapter = ''.join(f['t'] for f in sorted(
        [f for f in frags if f['x'] == min_x], key=lambda f: -f['y']))
    nodes = [f for f in frags if f['x'] != min_x and '⭐' not in f['t']]
    stars = [f for f in frags if '⭐' in f['t']]

    def star_of(f):
        n = 0
        for s in stars:
            if abs(s['y'] - f['y']) < 14 and s['x'] > f['x']:
                n = max(n, s['t'].count('⭐'))
        return n

    # 拆成单段线段
    verts, horis = [], []
    for pl in page_polylines(page):
        for a, b in zip(pl, pl[1:]):
            if abs(a[0] - b[0]) < 1.5 and abs(a[1] - b[1]) > 3:
                verts.append((a, b))
            elif abs(a[1] - b[1]) < 1.5 and abs(a[0] - b[0]) > 3:
                horis.append((a, b))

    parent_of = {}
    for a, b in horis:
        x1, y1, x2, y2 = a[0], a[1], b[0], b[1]
        if x2 < x1:                       # 统一成「从左往右」
            x1, y1, x2, y2 = x2, y2, x1, y1
        c = _nearest(nodes, x2, y2, right_side=False)
        if c is None:
            continue
        # 找与拐点 (x1,y1) 相连的竖线，向上找父节点
        py = None
        for va, vb in verts:
            if abs(va[0] - x1) > 3:
                continue
            if abs(va[1] - y1) < 3:
                py = vb[1]
            elif abs(vb[1] - y1) < 3:
                py = va[1]
            if py is not None:
                break
        p = _nearest(nodes, x1, py if py is not None else y1, right_side=True)
        if p is None or p is c:
            continue
        parent_of.setdefault(id(c), p)

    wrapped = {id(f): {'t': f['t'], 'stars': star_of(f), 'children': [],
                       'x': f['x'], 'y': f['y']} for f in nodes}
    roots = []
    for f in nodes:
        p = parent_of.get(id(f))
        if p is None:
            roots.append(wrapped[id(f)])
        else:
            wrapped[id(p)]['children'].append(wrapped[id(f)])
    for w in wrapped.values():
        w['children'].sort(key=lambda c: -c['y'])
    roots.sort(key=lambda n: -n['y'])
    return chapter, roots, wrapped


if __name__ == '__main__':
    sys.exit(main())
