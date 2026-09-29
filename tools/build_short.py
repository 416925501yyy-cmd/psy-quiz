#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
从素材里精选简答题，生成 data/m-short-*.js。

普心素材：背诵资料.docx（按章分层的小标题 + 正文）
实验素材：实验心理学简答题.docx + 实验心理学简答和论述汇总.doc（都带参考答案）

筛选思路：没有真题频次数据，所以按「考点特征词」打分 + 按章节配额，
保证高频考法（理论、定律、类型、特点、影响因素、关系、规律、阶段）优先，
同时每一章都有覆盖、不会全挤在某一章。

用法：python tools/build_short.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
DATA = os.path.join(ROOT, 'data')

PU_QUOTA = 85          # 普心选多少题
EXP_QUOTA = 50         # 实验选多少题

# 考点特征词（越像简答常考法，分越高）
STRONG = ['理论', '定律', '模型', '曲线', '范式', '流派', '学说']
MEDIUM = ['特点', '特征', '种类', '分类', '功能', '作用', '影响因素', '关系',
          '规律', '阶段', '条件', '方法', '策略', '意义', '步骤', '类型', '种类']


def load(name):
    with open(os.path.join(BUILD, name), encoding='utf-8') as f:
        return json.load(f)


def save_js(path, payload, header):
    with open(os.path.join(DATA, path), 'w', encoding='utf-8') as f:
        f.write('/* %s */\n' % header)
        f.write('window.__MODULES = window.__MODULES || [];\n')
        f.write('window.__MODULES.push(%s);\n' %
                json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
    n = sum(len(c['items']) for c in payload['chapters'])
    print('  -> %-20s %d 章 / %d 题' % (path, len(payload['chapters']), n))


def clean_title(t):
    t = re.sub(r'^[（(][一二三四五六七八九十]+[)）]\s*', '', t)
    t = re.sub(r'^[一二三四五六七八九十]+、\s*', '', t)
    t = re.sub(r'[（(][^）)]*P\d+[^）)]*[)）]', '', t)   # （第六版P7）
    t = re.sub(r'P\d+', '', t)
    t = re.sub(r'^第[一二三四五六七八九十]+节\s*', '', t)
    return t.strip(' 　·、：:，。')


def clean_body(b):
    b = re.sub(r'\d{8,}', '', b)                       # docx 里串进来的图片编号
    b = re.sub(r'[ \t]{2,}', ' ', b)
    b = re.sub(r'\s*\n\s*', ' ', b)
    return b.strip()


def title_ok(t):
    """标题里混进正文的一律丢掉，宁可少几题也不要脏标题。"""
    if len(t) < 3 or len(t) > 20:
        return False
    if '从' in t or '是' in t:        # 混进正文片段的典型特征
        return False
    return not any(c in t for c in '。，；')


def merged_title(title, body):
    """标题末尾和正文开头重合 = 原文里标题和正文连在一起了。"""
    for n in range(min(len(title), 14), 5, -1):
        if body.startswith(title[-n:]):
            return True
    return False


def score(title, body):
    s = 0.0
    for w in STRONG:
        if w in title:
            s += 3
    for w in MEDIUM:
        if w in title:
            s += 1.6
    n = len(body)
    if 100 <= n <= 500:
        s += 1.2
    elif n < 90:
        s -= 1.5
    elif n > 700:
        s -= 0.8          # 太长的多半是整节内容，不像一道简答
    if 6 <= len(title) <= 18:
        s += 0.8
    return s


def build_pu():
    raw = load('src_beisong.json')
    # 只保留彭聃龄那一段（官方指定教材），导论那一段书名不同
    chs = {}
    order = []
    for it in raw:
        title = clean_title(it['title'])
        body = clean_body(it['body'])
        if not title_ok(title) or len(body) < 80:
            continue
        if merged_title(title, body):
            continue
        if re.match(r'^第[一二三四五六七八九十]+章', title):
            continue
        if it['chapter'] not in chs:
            chs[it['chapter']] = []
            order.append(it['chapter'])
        chs[it['chapter']].append({
            'q': title, 'a': body,
            'score': score(title, body),
        })
    order = order[:13]                     # 只取彭聃龄 13 章
    total = sum(len(chs[c]) for c in order)
    picked = []
    for c in order:
        items = sorted(chs[c], key=lambda x: -x['score'])
        quota = max(3, round(PU_QUOTA * len(chs[c]) / total))
        picked.append((c, items[:quota]))
    # 配额总和可能有出入，按分数补齐/削减到目标
    have = sum(len(v) for _, v in picked)
    if have < PU_QUOTA:
        for c, _ in picked:
            pool = sorted(chs[c], key=lambda x: -x['score'])[len([v for k, v in picked if k == c][0]):]
            for x in pool:
                if have >= PU_QUOTA:
                    break
                [v for k, v in picked if k == c][0].append(x)
                have += 1
    return [{
        'name': c, 'items': [{'q': x['q'], 'a': x['a']} for x in v],
    } for c, v in picked]


def normalize_q(q):
    return re.sub(r'[^\u4e00-\u9fff]', '', q)[:14]


def build_exp():
    short = load('src_exp_short.json')
    summ = load('src_exp_summary.json')
    seen = set()
    out = []
    # 汇总那份带分值标注，多半来自真题，优先
    for it in summ + short:
        k = normalize_q(it['q'])
        if k in seen:
            continue
        seen.add(k)
        q = it['q'].strip()
        if not q.endswith(('？', '?', '。')):
            q += ''
        out.append({'q': q, 'a': clean_body(it['a']),
                    'score': score(q, it['a']) + (2 if it in summ else 0)})
    out.sort(key=lambda x: -x['score'])
    out = out[:EXP_QUOTA]
    # 分两类：实验设计/材料分析类归到「实验设计题」，其余归「简答题」
    design = re.compile(r'设计|方案|材料|研究者|步骤|请根据|某')
    jd = [x for x in out if not (design.search(x['q']) or len(x['a']) >= 400)]
    ld = [x for x in out if design.search(x['q']) or len(x['a']) >= 400]
    # 有些题干和答案开头挤在一行（「自变量的类型。心理学实验……」），切开
    for x in jd + ld:
        if '。' in x['q']:
            head, rest = x['q'].split('。', 1)
            # 材料题的题干里有逗号和数字，不能切；只切「短标题。答案开头」这种
            plain_title = ('，' not in head and '？' not in head and
                           not re.search(r'\d', head) and len(head) <= 24)
            if len(head) >= 4 and len(rest) >= 12 and plain_title:
                x['q'], x['a'] = head, (rest + ' ' + x['a'])
        # 「……优缺点？建构认知模型作为……优点主要表现在：」→ 问号后面那句是答案
        if '？' in x['q']:
            head, rest = x['q'].rsplit('？', 1)
            if len(rest) >= 12 and '？' not in rest:
                x['q'], x['a'] = head + '？', (rest + ' ' + x['a'])
    chapters = []
    if jd:
        chapters.append({'name': '简答题', 'items': [{'q': x['q'], 'a': x['a']} for x in jd]})
    if ld:
        chapters.append({'name': '论述题', 'items': [{'q': x['q'], 'a': x['a']} for x in ld]})
    return chapters


def main():
    print('生成简答数据 ->', DATA)
    save_js('m-short-1.js', {
        'module': 'short', 'subject': '普通心理学', 'icon': '🧠',
        'desc': '彭聃龄《普通心理学》· 精选高频简答',
        'chapters': build_pu(),
    }, '简答 · 普通心理学')
    save_js('m-short-2.js', {
        'module': 'short', 'subject': '实验心理学', 'icon': '🔬',
        'desc': '郭秀艳《实验心理学》· 精选高频简答与论述',
        'chapters': build_exp(),
    }, '简答 · 实验心理学')


if __name__ == '__main__':
    main()
