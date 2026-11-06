import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerRoutes } from '../lib/routes.js';

function makeCtx() {
  const bag = {};
  const ctx = {
    webServer: { register: (opts) => { bag.opts = opts; return () => {}; } },
    effect: (fn) => fn(),
  };
  return { ctx, bag };
}

function fakeReq(method, url, body, headers = {}) {
  const req = new EventEmitter();
  req.method = method; req.url = url; req.headers = headers;
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

function fakeRes() {
  return {
    status: 0, body: '', headers: {},
    writeHead(code, h) { this.status = code; this.headers = h || {}; },
    end(s) { this.body = s; },
  };
}

async function call(handler, method, url, body, headers) {
  const res = fakeRes();
  await handler(fakeReq(method, url, body, headers), res);
  return { status: res.status, json: JSON.parse(res.body || '{}') };
}

const stub = {
  getState: () => ({ state: 'stopped', pid: null }),
  readLogs: () => ({ cursor: 0, lines: [], truncated: false, reset: false }),
  start: async () => { throw Object.assign(new Error('已在运行或启动中'), { status: 409 }); },
  stop: async () => ({ state: 'stopped' }),
  restart: async () => ({ state: 'stopped' }),
  updateConfig: async () => ({ state: 'stopped' }),
};

function handlerOf() {
  const { ctx, bag } = makeCtx();
  registerRoutes(ctx, { controller: stub, log: () => {} });
  return bag.opts.handler;
}

test('GET /state returns 200 + state', async () => {
  const r = await call(handlerOf(), 'GET', '/api/plugins/snowluma-control/state');
  assert.equal(r.status, 200);
  assert.equal(r.json.state, 'stopped');
});

test('GET /logs passes cursor through', async () => {
  const r = await call(handlerOf(), 'GET', '/api/plugins/snowluma-control/logs?cursor=7');
  assert.equal(r.status, 200);
  assert.equal(r.json.cursor, 0);
});

test('POST /start rejects cross-site (sec-fetch-site)', async () => {
  const r = await call(handlerOf(), 'POST', '/api/plugins/snowluma-control/start', {}, { 'sec-fetch-site': 'cross-site' });
  assert.equal(r.status, 403);
});

test('POST /start maps controller 409 to 409', async () => {
  const r = await call(handlerOf(), 'POST', '/api/plugins/snowluma-control/start', {}, { 'sec-fetch-site': 'same-origin' });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /已在运行/);
});

test('unknown route is 404', async () => {
  const r = await call(handlerOf(), 'GET', '/api/plugins/snowluma-control/nope');
  assert.equal(r.status, 404);
});

// 自动识别安装目录：面板靠这个接口填路径
test('GET /detect returns 200 + candidates', async () => {
  const r = await call(handlerOf(), 'GET', '/api/plugins/snowluma-control/detect');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.ok(Array.isArray(r.json.candidates), 'candidates 必须是数组');
  for (const c of r.json.candidates) {
    assert.ok(c.dir, '候选必须有 dir');
    assert.ok(['strong', 'medium', 'weak'].includes(c.confidence), `confidence 非法: ${c.confidence}`);
  }
});