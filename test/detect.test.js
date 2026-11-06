import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classifyDir, detectInstallDirs } from '../lib/detect.js';

function makeDir(name, { pkgName = null, index = true, extra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `sc-detect-${name}-`));
  if (index) writeFileSync(join(dir, 'index.mjs'), '');
  if (pkgName) writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: pkgName }));
  for (const [f, c] of Object.entries(extra)) writeFileSync(join(dir, f), c);
  return dir;
}

test('classifyDir: package.json name 命中 → strong', () => {
  const dir = makeDir('strong', { pkgName: '@snowluma/runtime' });
  try {
    const c = classifyDir(dir);
    assert.equal(c.confidence, 'strong');
    assert.equal(c.dir, dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('classifyDir: check-node-version.cjs → strong', () => {
  const dir = makeDir('cver', { extra: { 'check-node-version.cjs': '' } });
  try {
    assert.equal(classifyDir(dir).confidence, 'strong');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('classifyDir: launcher.bat → medium', () => {
  const dir = makeDir('bat', { extra: { 'launcher.bat': '' } });
  try {
    assert.equal(classifyDir(dir).confidence, 'medium');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('classifyDir: 只有 index.mjs → weak', () => {
  const dir = makeDir('weak');
  try {
    assert.equal(classifyDir(dir).confidence, 'weak');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('classifyDir: 没有 index.mjs → null（非安装目录）', () => {
  const dir = makeDir('noindex', { index: false });
  try {
    assert.equal(classifyDir(dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('classifyDir: 不存在的路径 → null', () => {
  assert.equal(classifyDir(join(tmpdir(), 'sc-does-not-exist-xyz')), null);
});

// 回归：正则若从 node.exe 的盘符起吞，会把 "D:\02\node\node.exe D:\path\index.mjs"
// 整体当成路径 → dirname 取到上层目录 → 认错。
test('detectInstallDirs: 结果里的路径都真实存在且含 index.mjs', async () => {
  const list = await detectInstallDirs();
  for (const c of list) {
    assert.ok(c.dir, '候选必须有路径');
    assert.ok(['strong', 'medium', 'weak'].includes(c.confidence), `confidence 非法: ${c.confidence}`);
  }
  // 同一目录不应重复出现
  const dirs = list.map((c) => c.dir.toLowerCase());
  assert.equal(new Set(dirs).size, dirs.length, '候选目录不能重复');
});

// 真实环境里的 SnowLuma 目录应当被认出来（本机装在插件同级）。
// 环境没有 SnowLuma 时跳过，不让测试依赖开发机安装布局。
test('detectInstallDirs: 能认出真实的 SnowLuma 安装目录', async (t) => {
  const list = await detectInstallDirs();
  const strong = list.filter((c) => c.confidence === 'strong');
  if (!strong.length) {
    t.skip('本机没有可识别的 SnowLuma 安装目录');
    return;
  }
  for (const c of strong) {
    const c2 = classifyDir(c.dir);
    assert.ok(c2, `候选 ${c.dir} 应能再次分类成功`);
  }
});
