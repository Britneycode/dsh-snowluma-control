import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { SnowLumaController } from '../lib/controller.js';

let pidSeq = 1000;
function fakeProc() {
  const proc = new EventEmitter();
  proc.pid = ++pidSeq;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => {};
  return proc;
}

// 自带一个含 index.mjs 的临时安装目录。
// 不依赖开发机上任何真实路径 —— 那是 store 默认值里被去掉的硬编码，
// 测试也不该耦合它，否则换台机器就全挂。
const fakeRoot = mkdtempSync(join(tmpdir(), 'sc-root-'));
writeFileSync(join(fakeRoot, 'index.mjs'), '');

function makeCtl(overrides = {}) {
  const ctl = new SnowLumaController({
    storeFile: join(tmpdir(), `sc-ctl-${Date.now()}-${Math.random()}.json`),
    spawnImpl: overrides.spawnImpl ?? (() => fakeProc()),
    killSingleImpl: overrides.killSingleImpl ?? (() => ({ status: 0, stderr: '' })),
    killTreeImpl: overrides.killTreeImpl ?? (() => ({ status: 0, stderr: '' })),
    pidAliveImpl: overrides.pidAliveImpl ?? (() => true),
    processStartMsImpl: overrides.processStartMsImpl ?? (() => null),
    resolveNodeImpl: overrides.resolveNodeImpl ?? (async () => ({ path: 'node', version: 'v24.22.1', ok: true })),
    sleepImpl: overrides.sleepImpl,
    findChildImpl: overrides.findChildImpl,
    pushLog: () => {},
  });
  ctl._store.root = overrides.root ?? fakeRoot;
  return ctl;
}

test('orphan stop: uses /T, polls pidAlive, ends stopped', async () => {
  const calls = [];
  let alive = 2;
  const ctl = makeCtl({
    killTreeImpl: (pid) => { calls.push(pid); return { status: 0, stderr: '' }; },
    pidAliveImpl: () => alive-- > 0,
  });
  ctl._applyOrphan({ pid: 99999, startedAt: Date.now() });
  assert.equal(ctl.getState().state, 'orphan');
  await ctl.stop();
  assert.equal(ctl.getState().state, 'stopped');
  assert.deepEqual(calls, [99999]);
});

test('orphan stop failure stays orphan with lastError', async () => {
  const ctl = makeCtl({
    killTreeImpl: () => ({ status: 1, stderr: 'Access is denied.' }),
    pidAliveImpl: () => true,
  });
  ctl._applyOrphan({ pid: 99999, startedAt: Date.now() });
  let err = null;
  try { await ctl.stop(); } catch (e) { err = e; }
  assert.equal(err.status, 500);
  assert.equal(ctl.getState().state, 'orphan');
  assert.match(ctl.getState().lastError, /Access is denied/);
});

test('double start: second concurrent call is 409 busy', async () => {
  const ctl = makeCtl();
  const p1 = ctl.start();
  let err = null;
  try { await ctl.start(); } catch (e) { err = e; }
  await p1;
  assert.equal(err.status, 409);
});

test('app-starting while running resets readiness (exit 75 重拉)', async () => {
  const ctl = makeCtl();
  await ctl.start();
  ctl._handleLine({ type: 'webui-listening', payload: { port: 5099 } });
  ctl._handleLine({ type: 'onebot-listening', payload: { kind: 'http', port: 3000 } });
  assert.equal(ctl.getState().onebot.ready, true);
  ctl._handleLine({ type: 'app-starting' });
  const s = ctl.getState();
  assert.equal(s.state, 'starting');
  assert.equal(s.onebot.ready, false);
  assert.equal(s.webui.port, null);
});

test('session-closed degrades onebot but keeps state running', async () => {
  const ctl = makeCtl();
  await ctl.start();
  ctl._handleLine({ type: 'webui-listening', payload: { port: 5099 } });
  ctl._handleLine({ type: 'onebot-listening', payload: { kind: 'ws', port: 3001 } });
  assert.equal(ctl.getState().onebot.ready, true);
  ctl._handleLine({ type: 'session-closed' });
  assert.equal(ctl.getState().onebot.ready, false);
  assert.equal(ctl.getState().state, 'running');
});

test('logs ring: keeps 200, cursor monotonic, reset when ahead', () => {
  const ctl = makeCtl();
  let t = 0;
  for (let i = 0; i < 205; i++) ctl.pushLog({ t: ++t, stream: 'stdout', text: `line-${i}` });
  const r1 = ctl.readLogs(0);
  assert.equal(r1.lines.length, 200);
  assert.equal(r1.lines[0].text, 'line-5');   // 前 5 条被挤出
  assert.equal(r1.truncated, false);          // cursor=0 不算截断
  const r2 = ctl.readLogs(1);                 // 缓冲里最早是 seq=6
  assert.equal(r2.truncated, true);
  const r3 = ctl.readLogs(r1.cursor + 1);     // 超过最新
  assert.equal(r3.reset, true);
});

test('reconcile: mismatched startMs is treated as pid reuse', async () => {
  const ctl = makeCtl({
    pidAliveImpl: () => true,
    processStartMsImpl: () => ({ name: 'node', startMs: 123 }),
  });
  ctl._store.pid = 999; ctl._store.startedAt = 1761792000000; ctl._save();
  await ctl.reconcile();
  assert.equal(ctl.getState().state, 'stopped');
  assert.equal(ctl._store.pid, null);
});

test('reconcile: AccessDenied (null start info) keeps orphan', async () => {
  const ctl = makeCtl({
    pidAliveImpl: () => true,
    processStartMsImpl: () => null,
  });
  ctl._store.pid = 999; ctl._store.startedAt = Date.now(); ctl._save();
  await ctl.reconcile();
  assert.equal(ctl.getState().state, 'orphan');
});

// 回归：pidAlive 说活着、但 Get-Process 说进程已死（ObjectNotFound）。
// 原实现把两者都归成 null → 一律 orphan → 面板显示「残留进程」且禁用启动，
// 用户只能手删 JSON 才能恢复。已死应当直接清记录置 stopped。
test('reconcile: 进程确认已死时置 stopped，不误判 orphan', async () => {
  const ctl = makeCtl({
    pidAliveImpl: () => true,
    processStartMsImpl: () => ({ dead: true }),
  });
  ctl._store.pid = 999; ctl._store.startedAt = Date.now(); ctl._save();
  await ctl.reconcile();
  assert.equal(ctl.getState().state, 'stopped');
  assert.equal(ctl._store.pid, null, '已死进程的 pid 记录必须清掉');
});

// root 为空（用户还没填安装目录）时必须明确报错。
// join('', 'index.mjs') 会退化成相对路径，可能撞上宿主 cwd 里的同名文件。
test('start: root 为空时明确报错，不误判目录有效', async () => {
  const ctl = makeCtl({ root: '' });
  await assert.rejects(() => ctl.start(), /安装目录/);
});

// —— 复审修复：每条对应一个已确认缺陷 ——

test('stop: childPid 在 launcher 退出前捕获，③ 段仍能强杀', async () => {
  let proc;
  let childAlive = true;
  const trees = [];
  const ctl = makeCtl({
    spawnImpl: () => (proc = fakeProc()),
    killSingleImpl: () => { proc.emit('exit', 0); return { status: 0, stderr: '' }; },
    killTreeImpl: (pid) => { trees.push(pid); childAlive = false; return { status: 0, stderr: '' }; },
    pidAliveImpl: (pid) => (pid === 4001 ? childAlive : true),
    sleepImpl: async () => {},
  });
  await ctl.start();
  ctl._store.childPid = 4001; ctl._save();
  await ctl.stop();
  assert.deepEqual(trees, [4001]);
  assert.equal(ctl.getState().state, 'stopped');
});

test('stop: taskkill 失败且 launcher 仍活着 → 500 且保持 running（spec §9）', async () => {
  const ctl = makeCtl({
    killSingleImpl: () => ({ status: 1, stderr: 'Access is denied.' }),
    pidAliveImpl: () => true,
    sleepImpl: async () => {},
  });
  await ctl.start();
  ctl._handleLine({ type: 'webui-listening', payload: { port: 5099 } });
  let err = null;
  try { await ctl.stop(); } catch (e) { err = e; }
  assert.equal(err.status, 500);
  assert.equal(ctl.getState().state, 'running');
  assert.match(ctl.getState().lastError, /Access is denied/);
});

test('stop: childPid 缺失时退化为进程树匹配（spec §6.2）', async () => {
  let proc;
  let childAlive = true;
  const trees = [];
  const ctl = makeCtl({
    spawnImpl: () => (proc = fakeProc()),
    killSingleImpl: () => { proc.emit('exit', 0); return { status: 0, stderr: '' }; },
    killTreeImpl: (pid) => { trees.push(pid); childAlive = false; return { status: 0, stderr: '' }; },
    pidAliveImpl: (pid) => (pid === 5555 ? childAlive : true),
    sleepImpl: async () => {},
    findChildImpl: () => 5555,
  });
  await ctl.start();
  await ctl.stop();
  assert.deepEqual(trees, [5555]);
});

test('stop: 强杀后 child 仍存活 → 500 且不回 stopped', async () => {
  const ctl = makeCtl({
    killTreeImpl: () => ({ status: 0, stderr: '' }),
    pidAliveImpl: () => true,
    sleepImpl: async () => {},
  });
  await ctl.start();
  ctl._handleLine({ type: 'webui-listening', payload: { port: 5099 } });
  ctl._store.childPid = 4001; ctl._save();
  let err = null;
  try { await ctl.stop(); } catch (e) { err = e; }
  assert.equal(err.status, 500);
  assert.equal(ctl.getState().state, 'running');
});

test('restart: stopped 状态等价于 start（spec §7）', async () => {
  const ctl = makeCtl();
  const s = await ctl.restart();
  assert.equal(s.state, 'starting');
});

test('start: orphan 状态的 409 提示「残留进程」（spec §7）', async () => {
  const ctl = makeCtl();
  ctl._applyOrphan({ pid: 999, startedAt: Date.now() });
  let err = null;
  try { await ctl.start(); } catch (e) { err = e; }
  assert.equal(err.status, 409);
  assert.match(err.message, /残留/);
});

test('updateConfig: path.resolve 规范化并重新解析 node（spec §7.1）', async () => {
  const calls = [];
  const ctl = makeCtl({
    resolveNodeImpl: async (a) => { calls.push(a); return { path: 'node', version: 'v24.22.1', ok: true }; },
  });
  const r = await ctl.updateConfig({ root: join(fakeRoot, '.') + '/' });
  assert.equal(r.root, resolve(fakeRoot));
  assert.equal(r.node.ok, true);
  assert.equal(calls.length, 1);
});

test('start: node 版本闸门失败时列出每个候选版本（spec §9）', async () => {
  const ctl = makeCtl({
    resolveNodeImpl: async () => ({
      ok: false, path: 'P1', version: 'v25.0.0',
      candidates: [{ path: 'P1', version: 'v25.0.0' }, { path: 'P2', version: 'v22.11.0' }],
    }),
  });
  let err = null;
  try { await ctl.start(); } catch (e) { err = e; }
  assert.equal(err.status, 400);
  assert.match(err.message, /P1.*v25\.0\.0/);
  assert.match(err.message, /P2.*v22\.11\.0/);
});

test('spawn error 事件后状态回到 stopped，不卡在 starting', async () => {
  let proc;
  const ctl = makeCtl({ spawnImpl: () => (proc = fakeProc()) });
  await ctl.start();
  proc.emit('error', new Error('spawn ENOENT'));
  assert.equal(ctl.getState().state, 'stopped');
  assert.match(ctl.getState().lastError, /ENOENT/);
});

test('强制停止成功后清空 lastError（spec §8）', async () => {
  const ctl = makeCtl({
    killTreeImpl: () => ({ status: 0, stderr: '' }),
    pidAliveImpl: () => false,
    sleepImpl: async () => {},
  });
  ctl._applyOrphan({ pid: 999, startedAt: Date.now() });
  ctl._lastError = 'Access is denied.';
  await ctl.stop();
  assert.equal(ctl.getState().state, 'stopped');
  assert.equal(ctl.getState().lastError, null);
});

test('日志行跨 chunk 拆开也能解析出 childPid', async () => {
  let proc;
  const ctl = makeCtl({ spawnImpl: () => (proc = fakeProc()) });
  await ctl.start();
  proc.stdout.emit('data', Buffer.from('22:20:55 INFO  [App] Node integ'));
  proc.stdout.emit('data', Buffer.from('rity: pid=4242, process=x\n'));
  assert.equal(ctl.getState().childPid, 4242);
});
test('stop: 停止后就绪位归零，面板不会再指向已关闭的 WebUI', async () => {
  const ctl = makeCtl({ pidAliveImpl: () => false, sleepImpl: async () => {}, findChildImpl: () => null });
  await ctl.start();
  ctl._handleLine({ type: 'webui-listening', payload: { port: 5099 } });
  ctl._handleLine({ type: 'onebot-listening', payload: { kind: 'http', port: 3000 } });
  assert.equal(ctl.getState().webui.ready, true);
  await ctl.stop();
  const s = ctl.getState();
  assert.equal(s.state, 'stopped');
  assert.equal(s.webui.ready, false, 'webui.ready 必须归零');
  assert.equal(s.webui.port, null, 'webui.port 必须归零');
  assert.equal(s.onebot.ready, false, 'onebot.ready 必须归零');
});

test('stop: 主动停止后迟到的 exit 事件不把 lastExit 改写为异常退出', async () => {
  let proc;
  const ctl = makeCtl({
    spawnImpl: () => (proc = fakeProc()),
    killSingleImpl: () => ({ status: 0, stderr: '' }),
    pidAliveImpl: () => false, sleepImpl: async () => {}, findChildImpl: () => null,
  });
  await ctl.start();
  ctl._handleLine({ type: 'webui-listening', payload: { port: 5099 } });
  await ctl.stop();
  // 真实时序：taskkill 之后 exit 事件在 /stop 响应之后才落到事件循环
  proc.emit('exit', 1);
  const s = ctl.getState();
  assert.equal(s.state, 'stopped');
  assert.equal(s.lastExit.code, null, '主动停止不该被记成异常退出');
});

test('运行中 launcher 自然退出仍保留真实退出码', async () => {
  let proc;
  const ctl = makeCtl({ spawnImpl: () => (proc = fakeProc()) });
  await ctl.start();
  proc.emit('exit', 3);
  assert.equal(ctl.getState().state, 'stopped');
  assert.equal(ctl.getState().lastExit.code, 3);
});

// 回归：stop() 返回后立刻 start()，旧 proc 的 exit 才落到事件循环。
// 无身份校验时它会把新进程判成 stopped、抹掉 pid 记录 —— 进程还在跑却再也杀不掉。
test('旧进程的迟到 exit 不污染新进程状态', async () => {
  const procs = [];
  const ctl = makeCtl({
    spawnImpl: () => (procs.push(fakeProc()), procs[procs.length - 1]),
    killSingleImpl: () => ({ status: 0, stderr: '' }),
    killTreeImpl: () => ({ status: 0, stderr: '' }),
    pidAliveImpl: () => false, sleepImpl: async () => {}, findChildImpl: () => null,
  });
  await ctl.start();
  const oldProc = procs[0];
  await ctl.stop();
  await ctl.start();                       // 新进程已接管
  const newPid = ctl.getState().pid;
  oldProc.emit('exit', 1);                 // 迟到的旧 exit
  const s = ctl.getState();
  assert.equal(s.state, 'starting', '新进程仍在运行，状态不能被旧 exit 改写');
  assert.equal(s.pid, newPid, '新进程的 pid 记录不能被旧 exit 抹掉');
});

// 同上，但走 error 通道（spawn 失败的 error 事件同样可能迟到）
test('旧进程的迟到 error 不污染新进程状态', async () => {
  const procs = [];
  const ctl = makeCtl({
    spawnImpl: () => (procs.push(fakeProc()), procs[procs.length - 1]),
    killSingleImpl: () => ({ status: 0, stderr: '' }),
    killTreeImpl: () => ({ status: 0, stderr: '' }),
    pidAliveImpl: () => false, sleepImpl: async () => {}, findChildImpl: () => null,
  });
  await ctl.start();
  const oldProc = procs[0];
  await ctl.stop();
  await ctl.start();
  const newPid = ctl.getState().pid;
  oldProc.emit('error', new Error('late error'));
  const s = ctl.getState();
  assert.equal(s.state, 'starting');
  assert.equal(s.pid, newPid);
});
