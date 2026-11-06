import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const defaultStore = () => ({
  configVersion: 1,
  root: '', // 空 = 未配置，由用户在面板里填。不写死某个机器的路径
  nodePath: null,
  pid: null,
  childPid: null,
  startedAt: null,
});

export function loadStore(file) {
  if (!existsSync(file)) return defaultStore();
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return { ...defaultStore(), ...raw, configVersion: 1 };
  } catch {
    // 解析失败：原文件改名留存，别让「读失败 → 回落默认值 → 下次 _save 写回磁盘」
    // 把用户配置悄悄换成默认路径（D-11）。留一份 .broken 供人工抢救。
    try { renameSync(file, `${file}.broken`); } catch { /* 改名失败也不能吞掉原逻辑 */ }
    return defaultStore();
  }
}

export function saveStore(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = join(dirname(file), `.${Date.now()}.tmp`);
  writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  renameSync(tmp, file);
}

export function clearRunRecord(file) {
  const s = loadStore(file);
  s.pid = null; s.childPid = null; s.startedAt = null;
  saveStore(file, s);
}