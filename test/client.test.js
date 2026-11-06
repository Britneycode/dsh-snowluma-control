import test from 'node:test';
import assert from 'node:assert/strict';

// 宿主槽契约：ctx.slots.register(options, SlotComponent) 的第二个参数必须是
// **函数组件**，传 React 元素会让宿主渲染树在挂载时炸掉。
// 参考实现 dsh-fish-soul/lib/client.js:1019-1025 传的是 createSection()（工厂返回组件）。
const reactShim = {
  createElement: (...args) => ({ $$el: args }),
  useState: (v) => [v, () => {}],
  useRef: (v) => ({ current: v }),
  useEffect: () => {},
};

let cached = null;
async function bundle() {
  if (cached) return cached;
  let loaded = null;
  globalThis.window = { __ModuleLoader__: { load: (m) => { loaded = m; } } };
  await import(new URL('../lib/client.js', import.meta.url).href);
  assert.ok(loaded, 'bundle did not call __ModuleLoader__.load');
  cached = loaded.factory((id) => (id === 'react' ? reactShim : undefined));
  return cached;
}

test('client bundle: settings.section 注册的是组件函数而不是元素', async () => {
  const mod = await bundle();
  const registered = [];
  const ctx = {
    effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {}; },
    slots: {
      inject: (name, fn) => fn(),
      register: (opts, comp) => { registered.push({ opts, comp }); return () => {}; },
    },
  };

  mod.apply(ctx);
  assert.equal(registered.length, 1, 'expected exactly one slot registration');
  const { opts, comp } = registered[0];
  assert.equal(opts.name, 'settings.section');
  assert.equal(opts.id, 'snowluma-control');
  assert.equal(typeof comp, 'function', `slot component must be a function, got ${typeof comp}`);
  assert.deepEqual(mod.inject, ['slots']);
});

// —— WebUI 内嵌：宿主右栏 Browser tab ——

test('webuiUrl: 只在 WebUI 就绪且拿到端口时才给地址', async () => {
  const mod = await bundle();
  assert.equal(mod.webuiUrl({ state: 'running', webui: { ready: true, port: 5099 } }), 'http://127.0.0.1:5099');
  assert.equal(mod.webuiUrl({ state: 'running', webui: { ready: true, port: 5100 } }), 'http://127.0.0.1:5100');
  assert.equal(mod.webuiUrl({ state: 'running', webui: { ready: false, port: null } }), null);
  assert.equal(mod.webuiUrl({ state: 'starting', webui: { ready: true, port: null } }), null);
  assert.equal(mod.webuiUrl(null), null);
});

test('openWebui: 优先用宿主 sidebarRight.openTab 开 browser tab', async () => {
  const mod = await bundle();
  const calls = [];
  const ctx = {
    get: (id) => (id === 'sidebarRight' ? { openTab: (kind, opts) => calls.push({ kind, opts }) } : undefined),
  };
  globalThis.window = { open: () => { throw new Error('should not fall back'); } };
  assert.equal(mod.openWebui('http://127.0.0.1:5099', ctx), 'sidebar');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'browser');
  assert.equal(calls[0].opts.params.url, 'http://127.0.0.1:5099');
});

test('openWebui: 宿主没给 sidebarRight 时退回 window.open', async () => {
  const mod = await bundle();
  const opened = [];
  globalThis.window = { open: (url, target) => opened.push({ url, target }) };
  assert.equal(mod.openWebui('http://127.0.0.1:5099', { get: () => undefined }), 'external');
  assert.deepEqual(opened, [{ url: 'http://127.0.0.1:5099', target: '_blank' }]);
});

test('openWebui: openTab 抛错也不硬崩，退回 window.open', async () => {
  const mod = await bundle();
  const opened = [];
  globalThis.window = { open: (url) => opened.push(url) };
  const ctx = { get: () => ({ openTab: () => { throw new Error('no such tab kind'); } }) };
  assert.equal(mod.openWebui('http://127.0.0.1:5099', ctx), 'external');
  assert.deepEqual(opened, ['http://127.0.0.1:5099']);
});

test('openWebui: 两条路都不可用返回 false', async () => {
  const mod = await bundle();
  globalThis.window = {};
  assert.equal(mod.openWebui('http://127.0.0.1:5099', null), false);
});