import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadStore, saveStore, clearRunRecord, defaultStore } from '../lib/store.js';

test('roundtrip and clear', () => {
  const file = join(tmpdir(), `sc-test-${Date.now()}.json`);
  try {
    assert.deepEqual(loadStore(file), defaultStore());
    const s = loadStore(file);
    s.root = 'D:\\x'; s.pid = 123; s.childPid = 456; s.startedAt = 789;
    saveStore(file, s);
    assert.equal(existsSync(file), true);
    const s2 = loadStore(file);
    assert.equal(s2.pid, 123);
    clearRunRecord(file);
    const s3 = loadStore(file);
    assert.equal(s3.pid, null);
    assert.equal(s3.childPid, null);
    assert.equal(s3.startedAt, null);
    assert.equal(s3.root, 'D:\\x'); // root 不能被清掉
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});

// 默认 root 不能写死某台机器的绝对路径：那份文件损坏一次，
// 回落默认值就会把用户填的安装目录悄悄换掉并写回磁盘。
test('defaultStore: root 为空，不写死开发机路径', () => {
  assert.equal(defaultStore().root, '');
});

// 回归：文件损坏 → loadStore 回落默认值 → 控制器后续任一次 _save() 把默认值写回，
// 用户原本的 root 被永久固化成开发机路径。
test('loadStore: 文件损坏时保留原件，且不回落成写死的默认路径', () => {
  const file = join(tmpdir(), `sc-broken-${Date.now()}-${Math.random()}.json`);
  try {
    writeFileSync(file, '{ "root": "D:\\\\My\\\\SnowLuma", "pid": ', 'utf8'); // 半截 JSON
    const s = loadStore(file);
    assert.equal(s.root, '', '损坏文件不能回落成某个机器的绝对路径');
    assert.equal(existsSync(`${file}.broken`), true, '坏文件要留一份供人工抢救');
    // 回写后也不能把默认路径固化进主文件
    saveStore(file, s);
    assert.equal(loadStore(file).root, '');
  } finally {
    for (const f of [file, `${file}.broken`]) if (existsSync(f)) rmSync(f);
  }
});