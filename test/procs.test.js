import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pidAlive, processStartMs, pickIndexChild } from '../lib/procs.js';

test('pidAlive: self true, reaped child false', () => {
  assert.equal(pidAlive(process.pid), true);
  const dead = spawnSync(process.execPath, ['-e', '0'], { windowsHide: true }).pid;
  assert.equal(typeof dead, 'number');
  assert.equal(pidAlive(dead), false);
});

// 钉住 PowerShell 的 $(( )) 陷阱：写错时输出是字面量，Number() 会变 NaN
test('processStartMs: parses a real start time as epoch ms', async () => {
  const info = await processStartMs(process.pid);
  assert.ok(info, 'expected "<name>|<ms>"');
  assert.equal(typeof info.startMs, 'number');
  assert.ok(Number.isFinite(info.startMs));
  assert.ok(Math.abs(Date.now() - info.startMs) < 60000, `startMs=${info.startMs}`);
});

// 回归：原实现用 `r.status !== 0` 判失败，但死进程时 `if ($p)` 不成立、
// 退出码是 1 而非 0，于是「进程已死」和「读不到」被混成同一个 null。
// reconcile 收到 null 一律按 orphan 处理 → 面板显示「残留进程」且禁用启动。
test('processStartMs: 死进程返回 dead 标记，不与「读不到」混淆', async () => {
  const info = await processStartMs(999999);
  assert.ok(info, '死进程也要有明确结论');
  assert.equal(info.dead, true, '期望 {dead:true}');
  assert.equal(info.startMs, undefined);
});

test('pickIndexChild: 先认 launcher 子进程，再认目录匹配，都不中返回 null', () => {
  const rows = [
    { pid: 2, ppid: 1, cmd: 'node other.mjs' },
    { pid: 4001, ppid: 8892, cmd: '"node.exe" D:\\SnowLuma\\index.mjs' },
    { pid: 4002, ppid: 1, cmd: 'node C:\\x\\index.mjs' },
  ];
  assert.equal(pickIndexChild(rows, 8892, 'D:\\SnowLuma'), 4001);
  assert.equal(pickIndexChild(rows, 777, 'D:\\SnowLuma'), 4001); // ppid 失配 → 按目录
  assert.equal(pickIndexChild(rows, 777, 'D:\\nope'), null);
});

// 回归：root 是子串时会认错进程。该 pid 会被喂给 killTree（taskkill /T /F），
// 认错 = 杀掉另一个项目的整棵进程树。
test('pickIndexChild: 目录边界匹配，不认 root 的前缀目录', () => {
  const rows = [
    { pid: 111, ppid: 999, cmd: '"node.exe" D:\\SnowLuma-test\\index.mjs' }, // 别的项目
    { pid: 222, ppid: 999, cmd: '"node.exe" D:\\SnowLuma\\index.mjs' },      // 真正的目标
  ];
  assert.equal(pickIndexChild(rows, 777, 'D:\\SnowLuma'), 222);
  // 目标不存在时，宁可返回 null 也不能返回别的项目的 pid
  const onlyOther = [{ pid: 111, ppid: 999, cmd: '"node.exe" D:\\SnowLuma-test\\index.mjs' }];
  assert.equal(pickIndexChild(onlyOther, 777, 'D:\\SnowLuma'), null);
});

// 回归：同一目录下有多个 node 进程时认不准了。该 pid 会被喂给 killTree，
// 猜错就是杀掉别人的进程树 —— 宁可不杀，交给用户确认。
test('pickIndexChild: 同目录多候选时放弃强杀，返回 null', () => {
  const rows = [
    { pid: 331, ppid: 999, cmd: '"node.exe" D:\\SnowLuma\\index.mjs' },
    { pid: 332, ppid: 999, cmd: '"node.exe" D:\\SnowLuma\\index.mjs' },
  ];
  assert.equal(pickIndexChild(rows, 777, 'D:\\SnowLuma'), null);
  // ppid 能直接确定时不受影响（那是 launcher 的亲儿子，唯一确定）
  const direct = [
    { pid: 331, ppid: 777, cmd: '"node.exe" D:\\SnowLuma\\index.mjs' },
    { pid: 332, ppid: 999, cmd: '"node.exe" D:\\SnowLuma\\index.mjs' },
  ];
  assert.equal(pickIndexChild(direct, 777, 'D:\\SnowLuma'), 331);
});

// 回归：process.kill 对非法 PID 抛 ERR_INVALID_ARG_TYPE（不是 ESRCH），
// Number(null)===0 还会去探测进程组 —— 两者都会被误判成「进程还活着」。
test('pidAlive: 非法 PID 一律判死', () => {
  for (const bad of [null, undefined, NaN, 0, -1, 99999999999, 'abc', '']) {
    assert.equal(pidAlive(bad), false, `pidAlive(${String(bad)}) 应为 false`);
  }
});

// 回归：spawnSync 会同步阻塞宿主事件循环。DSH 宿主与插件同进程，
// 探测期间宿主的其它请求与定时器全部停摆。用定时器心跳量化。
test('processStartMs: 探测期间事件循环不被阻塞', async () => {
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  try {
    const before = ticks;
    await processStartMs(process.pid);
    const during = ticks - before;
    // 被阻塞的话 during 会是 0（整个探测期间定时器一次都没跑）
    assert.ok(during > 0, `探测期间定时器一次都没跑 → 事件循环被阻塞（ticks=${during}）`);
  } finally { clearInterval(timer); }
});