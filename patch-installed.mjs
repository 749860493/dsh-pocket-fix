#!/usr/bin/env node
// 把窄屏白屏修复直接打进已安装的 dsh-pocket（不重新构建）。
// 幂等：已打过则跳过。自动备份。遍历所有 profile。
//
// 用法（用 DSH 自带 node）：
//   node patch-installed.mjs check
//   node patch-installed.mjs apply
//   node patch-installed.mjs revert

import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const BAK = '.orig-layoutfix';

// 4 处：位置选择器 → 类名匹配
const REPLACEMENTS = [
  {
    id: 'DRAWER_SELECTOR',
    from: `var DRAWER_SELECTOR = '[data-mobile-nav="frame"] > :first-child';`,
    to: `var DRAWER_SELECTOR = '[data-mobile-nav="frame"] > [class*="sidebarCol"]';`,
  },
  {
    id: 'center-col',
    from: `  [data-mobile-nav="frame"] > :nth-child(2) {\n    grid-column: 1 !important;`,
    to: `  [data-mobile-nav="frame"] > [class*="centerCol"] {\n    grid-column: 1 !important;`,
  },
  {
    id: 'drawer-style',
    from: `  [data-mobile-nav="frame"] > :first-child {\n    position: absolute !important;`,
    to: `  [data-mobile-nav="frame"] > [class*="sidebarCol"] {\n    position: absolute !important;`,
  },
  {
    id: 'drawer-expanded',
    from: `  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) > :first-child {\n    transform: none !important;`,
    to: `  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) > [class*="sidebarCol"] {\n    transform: none !important;`,
  },
];

function targets() {
  const out = [];
  const profilesDir = join(DSH_HOME, 'profiles');
  if (!existsSync(profilesDir)) return out;
  for (const name of readdirSync(profilesDir)) {
    const f = join(profilesDir, name, 'node_modules', 'dsh-pocket', 'client', 'client.js');
    if (existsSync(f)) out.push({ profile: name, file: f });
  }
  return out;
}

function status(t) {
  const src = readFileSync(t.file, 'utf8');
  const applied = REPLACEMENTS.filter((r) => src.includes(r.to)).length;
  const pending = REPLACEMENTS.filter((r) => src.includes(r.from)).length;
  let state = 'host-changed';
  if (applied === REPLACEMENTS.length) state = 'applied';
  else if (pending === REPLACEMENTS.length) state = 'pending';
  else if (applied > 0) state = 'partial';
  return { ...t, state, applied, pending, size: src.length, bak: existsSync(t.file + BAK) };
}

function apply(t) {
  const src = readFileSync(t.file, 'utf8');
  if (REPLACEMENTS.every((r) => src.includes(r.to))) {
    return { ...t, changed: false, reason: '已是最新' };
  }
  let out = src;
  const hits = [];
  for (const r of REPLACEMENTS) {
    if (out.includes(r.to)) { hits.push(`${r.id}:已应用`); continue; }
    if (!out.includes(r.from)) { hits.push(`${r.id}:锚点缺失`); continue; }
    out = out.replace(r.from, r.to);
    hits.push(`${r.id}:已替换`);
  }
  const replaced = hits.filter((h) => h.includes('已替换')).length;
  if (replaced === 0) return { ...t, changed: false, reason: '锚点全丢，宿主可能已改版', hits };
  if (!existsSync(t.file + BAK)) copyFileSync(t.file, t.file + BAK);
  writeFileSync(t.file, out, 'utf8');
  return { ...t, changed: true, hits, size: out.length };
}

function revert(t) {
  if (!existsSync(t.file + BAK)) return { ...t, changed: false, reason: '无备份' };
  copyFileSync(t.file + BAK, t.file);
  return { ...t, changed: true, reason: '已回滚' };
}

const cmd = process.argv[2] ?? 'check';
const list = targets();
if (!list.length) {
  console.log(`未找到 dsh-pocket（DSH_HOME=${DSH_HOME}）`);
  process.exit(2);
}

console.log(`DSH_HOME = ${DSH_HOME}`);
console.log(`命令     = ${cmd}\n`);

let bad = 0;
for (const t of list) {
  if (cmd === 'apply') {
    const r = apply(t);
    console.log(`[${t.profile}] ${r.changed ? '已写入' : '跳过'}  ${r.reason ?? ''} ${r.hits ? r.hits.join(' ') : ''}`);
  } else if (cmd === 'revert') {
    const r = revert(t);
    console.log(`[${t.profile}] ${r.changed ? '已回滚' : '跳过'}  ${r.reason}`);
  } else {
    const s = status(t);
    console.log(`[${t.profile}] state=${s.state}  已应用 ${s.applied}/${REPLACEMENTS.length}  待应用 ${s.pending}  size=${s.size}  备份=${s.bak ? '有' : '无'}`);
    console.log(`          ${t.file}`);
    if (s.state !== 'applied') bad++;
  }
}

if (cmd === 'check' && bad) {
  console.log('\n有 profile 未打补丁：node patch-installed.mjs apply');
}
