import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedNodeVersion, resolveNode } from '../lib/node-resolve.js';

test('version gate', () => {
  assert.equal(isSupportedNodeVersion('v24.22.1'), true);
  assert.equal(isSupportedNodeVersion('v24.22.0'), false);
  assert.equal(isSupportedNodeVersion('v24.23.0'), true);
  assert.equal(isSupportedNodeVersion('v25.0.0'), false); // 25.x 明确不支持
  assert.equal(isSupportedNodeVersion('v26.12.0'), false);
  assert.equal(isSupportedNodeVersion('v26.12.1'), true);
  assert.equal(isSupportedNodeVersion('v27.0.0'), true);
  assert.equal(isSupportedNodeVersion('not-a-version'), false);
});

test('resolveNode: 返回每个候选的探测结果（供报错列出全部版本）', async () => {
  const r = await resolveNode({ configuredPath: process.execPath });
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.candidates), 'missing candidates');
  assert.equal(r.candidates[0].path, process.execPath);
  assert.match(r.candidates[0].version, /^v/);
});