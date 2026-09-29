#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 build/src_*.json 转成 App 直接加载的数据文件（data/*.js）。

用法：python tools/build_data.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
DATA = os.path.join(ROOT, 'data')


def load(name):
    with open(os.path.join(BUILD, name), encoding='utf-8') as f:
        return json.load(f)


def js(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def write_js(path, payload, header):
    with open(os.path.join(DATA, path), 'w', encoding='utf-8') as f:
        f.write('/* %s */\n' % header)
        f.write('window.__MODULES = window.__MODULES || [];\n')
        f.write('window.__MODULES.push(%s);\n' % js(payload))
    n = sum(len(c['items']) for c in payload.get('chapters', []))
    print('  -> %-22s %d 章 / %d 条' % (path, len(payload.get('chapters', [])), n))


# ---------------------------------------------------------------- 名词解释

# 普心 120 条本来就按彭聃龄第六版章节顺序排列
PU_CH = [
    (1, 6, '第1章 心理学的研究对象和方法'),
    (7, 12, '第2章 心理与行为的脑神经基础'),
    (13, 28, '第3章 感觉'),
    (29, 39, '第4章 知觉'),
    (40, 48, '第5章 意识和注意'),
    (49, 61, '第6章 记忆'),
    (62, 74, '第7章 思维'),
    (75, 78, '第8章 语言'),
    (79, 85, '第9章 动机'),
    (86, 91, '第10章 情绪'),
    (92, 98, '第11章 能力'),
    (99, 108, '第12章 人格'),
    (109, 116, '第13章 学习'),
    (117, 120, '第14章 人生全程发展'),
]

# 实验 66 条按主题归类
EXP_CH = [
    (1, 5, '第1章 实验心理学概述'),
    (6, 16, '第2章 变量与额外变量'),
    (17, 40, '第3章 实验设计与效度'),
    (41, 44, '第4章 实验效度'),
    (45, 48, '第5章 反应时法'),
    (49, 56, '第6章 心理物理学方法'),
    (57, 58, '第7章 典型实验与效应'),
    (59, 60, '第8章 变量控制与统计方法'),
]
EXP_FIX = {
    61: '第5章 反应时法',
    62: '第6章 心理物理学方法',
    63: '第3章 实验设计与效度',
    64: '第3章 实验设计与效度',
    65: '第6章 心理物理学方法',
    66: '第6章 心理物理学方法',
}


def chapter_of(n, ranges, fixes=None):
    if fixes and n in fixes:
        return fixes[n]
    for a, b, name in ranges:
        if a <= n <= b:
            return name
    return '其他'


def build_term():
    out = []
    plan = (
        ('普通心理学', '🧠', '彭聃龄《普通心理学》第 5/6 版', 'src_pu_term.json', PU_CH, None),
        ('实验心理学', '🔬', '郭秀艳《实验心理学》（人民教育出版社 2019）',
         'src_exp_term.json', EXP_CH, EXP_FIX),
    )
    for subj, icon, desc, src, ranges, fixes in plan:
        chs, order = {}, []
        for it in load(src):
            name = chapter_of(it['n'], ranges, fixes)
            if name not in chs:
                chs[name] = []
                order.append(name)
            chs[name].append({'q': it['title'], 'a': it['body']})
        out.append({
            'module': 'term', 'subject': subj, 'icon': icon, 'desc': desc,
            'chapters': [{'name': n, 'items': chs[n]} for n in order],
        })
    return out


def main():
    print('生成 App 数据 ->', DATA)
    terms = build_term()
    for i, b in enumerate(terms):
        write_js('m-term-%d.js' % (i + 1), b, '名词解释 · %s' % b['subject'])
    total = sum(len(c['items']) for b in terms for c in b['chapters'])
    print('名词解释合计 %d 条' % total)


if __name__ == '__main__':
    main()
