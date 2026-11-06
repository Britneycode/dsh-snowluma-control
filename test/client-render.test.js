import test from 'node:test';
import assert from 'node:assert/strict';

// 渲染层面的回归：面板新增了「自动识别」按钮与候选 chip，
// 但 client.test.js 只验证槽注册契约，不渲染组件 —— 元素写错（如 children 位置
// 放错、className 拼错）不会被发现。这里真实渲染一次并遍历元素树。

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

function panelOf() {
  const registered = [];
  const ctx = {
    effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {}; },
    slots: {
      inject: (name, fn) => fn(),
      register: (opts, comp) => { registered.push({ opts, comp }); return () => {}; },
    },
  };
  return { ctx, registered };
}

// 遍历 React 元素树：{ $$el: [tag, props, ...children] }
function walk(node, out) {
  if (node === null || node === undefined || node === false) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.text.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const n of node) walk(n, out); return out; }
  if (node.$$el) {
    const [tag, props, ...children] = node.$$el;
    out.tags.push(String(tag));
    if (props) {
      if (props.className) out.classes.push(props.className);
      if (props.title) out.titles.push(props.title);
    }
    for (const c of children) walk(c, out);
  }
  return out;
}

function renderPanel() {
  const { ctx, registered } = panelOf();
  const mod = cached;
  mod.apply(ctx);
  const Panel = registered[0].comp;
  const out = { text: [], tags: [], classes: [], titles: [] };
  walk(Panel(), out);
  return { out, all: out.text.join('|') };
}

test('client 渲染: 面板包含安装目录与自动识别入口', async () => {
  await bundle();
  const { all } = renderPanel();
  assert.match(all, /安装目录/);
  assert.match(all, /自动识别/);
  assert.match(all, /保存/);
});

test('client 渲染: 目录未配置时提示必填', async () => {
  await bundle();
  const { all } = renderPanel();
  // s 为 null（未加载 state）时描述文案走「必填」分支
  assert.match(all, /必填/);
});
