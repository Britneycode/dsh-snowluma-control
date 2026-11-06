import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// 本插件所在的真实目录（软链已由 Node 解析）。SnowLuma 通常就装在同级。
const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// 目录像不像 SnowLuma 安装目录？
// 强标记：package.json 的 name 是 @snowluma/runtime。
// 弱标记：index.mjs + check-node-version.cjs（SnowLuma 独有的版本校验脚本）。
export function classifyDir(dir) {
  try {
    if (!statSync(dir).isDirectory()) return null;
  } catch { return null; }
  if (!existsSync(join(dir, 'index.mjs'))) return null;
  let pkgName = null;
  try {
    pkgName = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name ?? null;
  } catch { /* 没有或读不了 package.json */ }
  if (pkgName === '@snowluma/runtime') return { dir: resolve(dir), confidence: 'strong', reason: 'package.json name=@snowluma/runtime' };
  if (existsSync(join(dir, 'check-node-version.cjs'))) return { dir: resolve(dir), confidence: 'strong', reason: '含 check-node-version.cjs' };
  if (existsSync(join(dir, 'launcher.bat'))) return { dir: resolve(dir), confidence: 'medium', reason: '含 launcher.bat' };
  return { dir: resolve(dir), confidence: 'weak', reason: '仅含 index.mjs' };
}

// 从运行中的 node 进程命令行里捞 SnowLuma 的 index.mjs 路径。
// 已经在跑 → 路径必然正确，比任何目录猜测都可靠。
async function detectFromRunningProcess() {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { "$($_.CommandLine)" }`;
  let out = '';
  try {
    ({ stdout: out } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8', windowsHide: true, timeout: 8000,
    }));
  } catch { return []; }
  const found = [];
  for (const line of (out || '').split(/\r?\n/)) {
    // 命令行形如 `D:\02\node\node.exe D:\path\SnowLuma\index.mjs`。
    // 路径段不能跨空格（`[^\s"]*`），否则会从 node.exe 的盘符一路吞到 index.mjs，
    // 把 "D:\02\node\node.exe D:\path\..." 整体当成路径。
    const m = /"([A-Za-z]:\\[^"]*?index\.mjs)"|([A-Za-z]:\\[^\s"]*index\.mjs)/i.exec(line.trim());
    const full = m?.[1] ?? m?.[2];
    if (!full) continue;
    const dir = dirname(full);
    const c = classifyDir(dir);
    if (c) found.push({ ...c, source: 'running-process' });
  }
  return found;
}

// 插件目录的同级：SnowLuma 常与本插件并排装（同一份发行包解出来的）。
function detectFromSiblings() {
  const out = [];
  let entries = [];
  try { entries = readdirSync(dirname(PLUGIN_DIR)); } catch { return out; }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const dir = join(dirname(PLUGIN_DIR), name);
    let isDir = false;
    try { isDir = statSync(dir).isDirectory(); } catch { continue; }
    if (!isDir) continue;
    const c = classifyDir(dir);
    if (c) out.push({ ...c, source: 'sibling' });
  }
  return out;
}

// 常见的用户安装位置。
function detectFromCommonLocations() {
  const out = [];
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.USERPROFILE,
    'C:\\Program Files',
    'D:\\Program Files',
  ].filter(Boolean);
  const names = ['SnowLuma', 'snowluma'];
  for (const root of roots) {
    for (const name of names) {
      const dir = join(root, name);
      const c = classifyDir(dir);
      if (c) out.push({ ...c, source: 'common-location' });
    }
  }
  return out;
}

// 汇总候选，按可信度排序。confidence: strong > medium > weak。
export async function detectInstallDirs() {
  const all = [...await detectFromRunningProcess(), ...detectFromSiblings(), ...detectFromCommonLocations()];
  const seen = new Set();
  const unique = [];
  for (const c of all) {
    const key = c.dir.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  const rank = { strong: 0, medium: 1, weak: 2 };
  unique.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
  return unique;
}
