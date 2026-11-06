import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { loadStore, saveStore, clearRunRecord } from './store.js';
import { parseLine } from './logparse.js';
import { resolveNode } from './node-resolve.js';
import { pidAlive, killSingle, killTree, processStartMs, findIndexChild } from './procs.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SnowLumaController {
  constructor(opts = {}) {
    this._storeFile = opts.storeFile ?? join(homedir(), '.dsh', 'snowluma-control.json');
    this._spawnImpl = opts.spawnImpl ?? spawn;
    this._killSingle = opts.killSingleImpl ?? killSingle;
    this._killTree = opts.killTreeImpl ?? killTree;
    this._pidAlive = opts.pidAliveImpl ?? pidAlive;
    this._processStartMs = opts.processStartMsImpl ?? processStartMs;
    this._resolveNodeImpl = opts.resolveNodeImpl ?? resolveNode;
    this._sleep = opts.sleepImpl ?? sleep;
    this._findChild = opts.findChildImpl ?? findIndexChild;
    this._pushLog = opts.pushLog ?? (() => {});
    this._nodePath = null; this._nodeVersion = null; this._nodeOk = false;

    this._store = loadStore(this._storeFile);
    this._proc = null;
    this._state = 'stopped';
    this._lastError = null;
    this._lastExit = { code: null, at: null };
    this._busy = false;
    this._logSeq = 0;
    this._logBuffer = [];
    this._webui = { port: null, ready: false, timedOut: false };
    this._onebot = { http: null, ws: null, ready: false };
    this._startTimer = null;
  }

  _save() { saveStore(this._storeFile, this._store); }
  _setState(s) {
    // 进程已不在，就绪位必须一起归零：否则面板会一直显示「WebUI 5099 / OneBot 就绪」，
    // 且「打开 WebUI」按钮仍可点，点开就是死端口。
    if (s === 'stopped') {
      this._webui = { port: null, ready: false, timedOut: false };
      this._onebot = { http: null, ws: null, ready: false };
    }
    this._state = s; this._pushLog({ sys: true, text: `[state] ${s}` });
  }

  async _withLock(fn) {
    if (this._busy) { const e = new Error('操作进行中，请稍候'); e.status = 409; throw e; }
    this._busy = true;
    try { return await fn(); } finally { this._busy = false; }
  }

  getState() {
    const node = { path: this._nodePath ?? null, version: this._nodeVersion ?? null, ok: Boolean(this._nodeOk) };
    return {
      state: this._state, pid: this._store.pid, childPid: this._store.childPid,
      startedAt: this._store.startedAt, webui: this._webui, onebot: this._onebot,
      root: this._store.root, node, lastExit: this._lastExit, lastError: this._lastError, busy: this._busy,
    };
  }

  pushLog({ t, stream, text }) {
    const entry = { seq: ++this._logSeq, t: t ?? Date.now(), stream: stream ?? 'stdout', text: String(text) };
    this._logBuffer.push(entry);
    if (this._logBuffer.length > 200) this._logBuffer.shift();
    this._pushLog(entry);
  }

  readLogs(cursor = 0) {
    const req = Number(cursor) || 0;
    if (req > this._logSeq) return { cursor: this._logSeq, reset: true, truncated: false, lines: this._logBuffer };
    const minSeq = this._logBuffer.length ? this._logBuffer[0].seq : this._logSeq;
    const truncated = req > 0 && req < minSeq - 1;
    const lines = this._logBuffer.filter((l) => l.seq > req);
    return { cursor: this._logSeq, reset: false, truncated, lines };
  }

  _handleLine(evt) {
    switch (evt.type) {
      case 'app-starting':
        if (this._state === 'starting' || this._state === 'running') {
          this._webui = { port: null, ready: false, timedOut: false };
          this._onebot = { http: null, ws: null, ready: false };
          this._store.childPid = null; this._save();
          this._setState('starting');
          this._armStartTimer();
        }
        break;
      case 'child-pid':
        this._store.childPid = evt.payload.pid; this._save();
        break;
      case 'webui-listening':
        this._webui = { port: evt.payload.port, ready: true, timedOut: false };
        if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
        if (this._state === 'starting') this._setState('running');
        break;
      case 'onebot-listening':
        if (evt.payload.kind === 'http') this._onebot.http = evt.payload.port;
        else this._onebot.ws = evt.payload.port;
        this._onebot.ready = this._onebot.http !== null || this._onebot.ws !== null;
        break;
      case 'session-closed':
        this._onebot = { http: null, ws: null, ready: false };
        break;
    }
  }

  _armStartTimer() {
    if (this._startTimer) clearTimeout(this._startTimer);
    this._startTimer = setTimeout(() => {
      if (this._state === 'starting') { this._webui.timedOut = true; this._setState('running'); }
    }, 20000);
    if (this._startTimer.unref) this._startTimer.unref();
  }

  _bindProc(proc) {
    // 逐流缓冲：一行可能被拆到多个 chunk 里，按 chunk 直接 split 会漏掉标记
    const wire = (stream) => {
      let buf = '';
      return (chunk) => {
        buf += String(chunk);
        const parts = buf.split(/\r?\n/);
        buf = parts.pop();
        for (const line of parts) {
          if (!line) continue;
          this.pushLog({ t: Date.now(), stream, text: line });
          this._handleLine(parseLine(line) ?? { type: 'none' });
        }
        if (buf.length > 8192) buf = buf.slice(-8192); // 无换行的超长行防膨胀
      };
    };
    proc.stdout?.on('data', wire('stdout'));
    proc.stderr?.on('data', wire('stderr'));
    proc.once?.('error', (err) => {
      // 迟到的旧进程事件：此刻 this._proc 已是新进程，改它等于把新进程的状态抹掉
      if (this._proc !== proc) return;
      // spawn 失败时不会再有 exit 事件，状态必须自己落回 stopped
      this._lastError = String(err?.message ?? err);
      if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
      this._proc = null;
      clearRunRecord(this._storeFile);
      this._store = loadStore(this._storeFile);
      this._setState('stopped');
    });
    proc.once?.('exit', (code) => {
      // 迟到的旧进程事件：stop() 返回后立刻 start() 时，旧 proc 的 exit 才落到事件循环，
      // 此时 this._proc 已是新进程。无条件写状态会把新进程判成 stopped 并抹掉它的 pid 记录，
      // 造成「进程还在跑、面板说已停止、再也杀不掉」。
      if (this._proc !== proc) return;
      if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
      // 主动停止时 exit 事件是「迟到的」：taskkill 后它常在 /stop 响应之后才落到事件循环，
      // 若照实记 code 会把用户点的停止渲染成「异常退出」。
      this._lastExit = { code: this._stopRequested ? null : (code ?? null), at: Date.now() };
      this._proc = null;
      clearRunRecord(this._storeFile);
      this._store = loadStore(this._storeFile);
      this._setState('stopped');
    });
  }

  async start() {
    return this._withLock(async () => this._startInternal());
  }

  async _startInternal() {
    if (this._state === 'orphan') {
      const e = new Error('存在未清理的残留进程，请先强制停止'); e.status = 409; throw e;
    }
    if (this._state !== 'stopped') { const e = new Error('已在运行或启动中'); e.status = 409; throw e; }
    const root = this._store.root;
    // root 为空 = 用户还没填安装目录。必须显式拦下：join('', 'index.mjs') 会退化成
    // 相对路径 'index.mjs'，可能撞上宿主 cwd 里的同名文件而误判为「目录有效」。
    if (!root) { const e = new Error('请先在设置里填写 SnowLuma 安装目录'); e.status = 400; throw e; }
    if (!existsSync(join(root, 'index.mjs'))) { const e = new Error(`目录里找不到 index.mjs：${root}`); e.status = 400; throw e; }
    const node = await this._resolveNodeImpl({ configuredPath: this._store.nodePath });
    this._nodePath = node.path; this._nodeVersion = node.version; this._nodeOk = node.ok;
    if (!node.ok) {
      // spec §9：报错要列出每个候选的实测版本，否则用户不知道哪条 node 该换
      const list = (node.candidates ?? [{ path: node.path, version: node.version }])
        .map((c) => `${c.path ?? '?'} → ${c.version ?? '无法执行'}`).join('；');
      const e = new Error(`需要 Node ^24.22.1 || >=26.12.1，实测：${node.version ?? '未找到'}（候选：${list}）`);
      e.status = 400; throw e;
    }

    const env = { ...process.env };
    for (const k of ['NODE_OPTIONS','SNOWLUMA_UPDATE_ROOT','SNOWLUMA_WEBUI_PORT','SNOWLUMA_WEBUI_HOST','SNOWLUMA_ONEBOT_HTTP_PORT','SNOWLUMA_ONEBOT_WS_PORT']) delete env[k];

    const proc = this._spawnImpl(node.path, ['index.mjs'], { cwd: root, env, stdio: ['ignore','pipe','pipe'], windowsHide: true });
    this._proc = proc;
    this._store.pid = proc.pid; this._store.childPid = null; this._store.startedAt = Date.now();
    this._save();
    this._lastError = null; this._lastExit = { code: null, at: null };
    this._stopRequested = false;
    this._webui = { port: null, ready: false, timedOut: false };
    this._onebot = { http: null, ws: null, ready: false };
    this._setState('starting');
    this._bindProc(proc);   // 内部已含 exit / error 处理
    this._armStartTimer();
    return this.getState();
  }

  async stop() { return this._withLock(async () => this._stopInternal()); }

  async _stopInternal() {
    const s = this._state;
    if (s === 'stopped' || s === 'stopping') { const e = new Error('当前状态不可停止'); e.status = 409; throw e; }
    this._stopRequested = true;
    this._setState('stopping');

    if (s === 'orphan') {
      const pid = this._store.pid;
      const r = await this._killTree(pid);
      if (r.status !== 0 && this._pidAlive(pid)) {
        this._lastError = (r.stderr || 'taskkill failed').trim();
        this._setState('orphan'); // 绝不回 stopped
        const e = new Error(this._lastError); e.status = 500; throw e;
      }
      for (let i = 0; i < 25; i++) { if (!this._pidAlive(pid)) break; await this._sleep(200); }
      if (this._pidAlive(pid)) {
        this._lastError = '进程在 5s 内未退出';
        this._setState('orphan');
        const e = new Error(this._lastError); e.status = 500; throw e;
      }
      clearRunRecord(this._storeFile);
      this._store = loadStore(this._storeFile);
      this._lastExit = { code: null, at: Date.now() };
      this._lastError = null; // 强杀成功即清空错误（spec §8）
      this._setState('stopped');
      return this.getState();
    }

    // 常规三段式：① 杀 launcher（不带 /T）→ ② 等 child 自退 → ③ 超时强杀
    const pid = this._store.pid;
    let childPid = this._store.childPid; // 必须抢在 exit 处理器清记录之前取
    let exited = false;
    this._proc?.once?.('exit', () => { exited = true; });

    const rr = await this._killSingle(pid);
    if (rr && rr.status !== 0 && this._pidAlive(pid)) {
      this._lastError = (rr.stderr || 'taskkill failed').trim();
      this._setState(s); // 进程还在，状态不能往下走
      const e = new Error(this._lastError); e.status = 500; throw e;
    }

    // ① launcher 退出（≤5s）
    for (let i = 0; i < 25 && !exited; i++) {
      if (!this._pidAlive(pid)) break;
      await this._sleep(200);
    }

    if (childPid) {
      // ② 等 child 优雅退出（≤15s）
      for (let i = 0; i < 75; i++) { if (!this._pidAlive(childPid)) break; await this._sleep(200); }
    } else {
      // childPid 缺失：② 退化为等 launcher，③ 退化为按进程树匹配 index.mjs
      for (let i = 0; i < 25; i++) { if (!this._pidAlive(pid)) break; await this._sleep(200); }
      childPid = await this._findChild(pid, this._store.root);
    }

    if (childPid && this._pidAlive(childPid)) {
      // ③ 强杀兜底（/T /F）
      const kr = await this._killTree(childPid);
      if (kr && kr.status !== 0 && this._pidAlive(childPid)) {
        this._lastError = (kr.stderr || 'taskkill failed').trim();
        this._setState(s);
        const e = new Error(this._lastError); e.status = 500; throw e;
      }
      for (let i = 0; i < 15; i++) { if (!this._pidAlive(childPid)) break; await this._sleep(200); } // 3s
      if (this._pidAlive(childPid)) {
        this._lastError = `子进程 ${childPid} 在强制结束后仍存活`;
        this._setState(s);
        const e = new Error(this._lastError); e.status = 500; throw e;
      }
    }

    this._proc = null;
    clearRunRecord(this._storeFile);
    this._store = loadStore(this._storeFile);
    this._lastExit = { code: null, at: Date.now() };
    this._setState('stopped');
    return this.getState();
  }

  async restart() {
    return this._withLock(async () => {
      if (this._state === 'stopped') return this._startInternal(); // spec §7：stopped 时等价于 start
      await this._stopInternal();
      return this._startInternal();
    });
  }

  async updateConfig({ root }) {
    return this._withLock(async () => {
      if (this._state !== 'stopped' && this._state !== 'orphan') { const e = new Error('仅在停止或残留状态下可修改'); e.status = 409; throw e; }
      const raw = String(root ?? '').trim();
      const resolved = raw ? resolve(raw) : '';
      if (!resolved || !existsSync(join(resolved, 'index.mjs'))) { const e = new Error(`目录里找不到 index.mjs：${raw}`); e.status = 400; throw e; }
      this._store.root = resolved;
      this._save(); // saveStore 内部 tmp + rename 原子写
      // 换了目录后 node 解析结果要跟着刷新，否则 /state 显示的还是旧结论
      const node = await this._resolveNodeImpl({ configuredPath: this._store.nodePath });
      this._nodePath = node.path; this._nodeVersion = node.version; this._nodeOk = node.ok;
      return this.getState();
    });
  }

  async reconcile() {
    const { pid, startedAt } = this._store;
    if (!pid) { this._setState('stopped'); return; }
    if (!this._pidAlive(pid)) { clearRunRecord(this._storeFile); this._store = loadStore(this._storeFile); this._setState('stopped'); return; }
    const info = await this._processStartMs(pid);
    // 进程确定已死 → 清记录置 stopped。
    // 之前这里把「读不到」和「已死」都归成 null，落到 orphan 分支，
    // 于是面板显示「残留进程」并禁用启动按钮，用户只能手删 JSON 才能恢复。
    if (info && info.dead) { clearRunRecord(this._storeFile); this._store = loadStore(this._storeFile); this._setState('stopped'); return; }
    const looksSame = info && info.name.toLowerCase() === 'node' && Math.abs(info.startMs - startedAt) <= 10000;
    if (looksSame || info === null) this._applyOrphan({ pid, startedAt }); // 读不到（AccessDenied）也按 orphan
    else { clearRunRecord(this._storeFile); this._store = loadStore(this._storeFile); this._setState('stopped'); }
  }

  _applyOrphan({ pid, startedAt }) { this._store.pid = pid; this._store.startedAt = startedAt; this._setState('orphan'); }

  dispose() {
    if (this._startTimer) clearTimeout(this._startTimer);
    const pid = this._store.pid;
    // 宿主不保证 await 异步 disposer，这里 fire-and-forget：taskkill 自身很快返回，
    // 要保的是「别把进程留在后台」，不是等它结束。
    if (pid && this._pidAlive(pid)) { try { Promise.resolve(this._killSingle(pid)).catch(() => {}); } catch {} }
    clearRunRecord(this._storeFile);
  }
}