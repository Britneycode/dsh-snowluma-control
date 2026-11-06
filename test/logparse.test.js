import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../lib/logparse.js';

test('app starting marker', () => {
  assert.deepEqual(parseLine('22:20:55 INFO               [App] SnowLuma starting'), { type: 'app-starting' });
});
test('webui listening', () => {
  assert.deepEqual(parseLine('22:20:55 INFO               [WebUI] listening http://127.0.0.1:5099'),
    { type: 'webui-listening', payload: { scheme: 'http', host: '127.0.0.1', port: 5099 } });
});
test('onebot http with uin segment', () => {
  assert.deepEqual(parseLine('22:26:18 OK    [1234567890] [OneBot.HTTP] [http-default] listening 127.0.0.1:3000/'),
    { type: 'onebot-listening', payload: { kind: 'http', port: 3000 } });
});
test('onebot ws with uin segment', () => {
  assert.deepEqual(parseLine('22:26:18 OK    [1234567890] [OneBot.WS-Server] [ws-default] listening 127.0.0.1:3001/'),
    { type: 'onebot-listening', payload: { kind: 'ws', port: 3001 } });
});
test('session closed degrade', () => {
  assert.deepEqual(parseLine('03:24:33 INFO               [OneBot] session closed: UIN=1234567890'), { type: 'session-closed' });
});
test('child pid from integrity line', () => {
  assert.deepEqual(parseLine('22:20:55 INFO               [App] Node integrity: pid=23456, process=...'),
    { type: 'child-pid', payload: { pid: 23456 } });
});
test('graceful shutdown marker', () => {
  assert.deepEqual(parseLine('23:01:02 WARN               [App] Shutting down (launcher disconnected)...'), { type: 'shutting-down' });
});
test('unrelated line returns null', () => {
  assert.equal(parseLine('22:00:00 INFO [Other] hello'), null);
});