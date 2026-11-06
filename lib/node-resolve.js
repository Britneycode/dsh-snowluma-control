import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// 逐字对齐 SnowLuma/check-node-version.cjs:9-18
export function isSupportedNodeVersion(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim());
  if (!m) return false;
  const [major, minor, patch] = m.slice(1, 4).map(Number);
  if (major === 24) return minor > 22 || (minor === 22 && patch >= 1);
  if (major === 26) return minor > 12 || (minor === 12 && patch >= 1);
  return major > 26;
}

async function tryExec(file, args, timeout) {
  try {
    const { stdout } = await execFileAsync(file, args, { encoding: 'utf8', windowsHide: true, timeout });
    return (stdout ?? '').trim();
  } catch {
    return null;
  }
}

async function versionOf(nodePath) {
  const out = await tryExec(nodePath, ['-v'], 3000);
  return out || null;
}

export async function resolveNode({ configuredPath = null } = {}) {
  const candidates = [];
  if (configuredPath) candidates.push(configuredPath);
  const w = await tryExec('where.exe', ['node.exe'], 5000);
  if (w) {
    for (const line of w.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      if (!candidates.includes(line)) candidates.push(line);
    }
  }
  const probed = [];
  for (const p of candidates) {
    const v = await versionOf(p);
    probed.push({ path: p, version: v });
    if (v && isSupportedNodeVersion(v)) return { path: p, version: v, ok: true, candidates: probed };
  }
  return { path: candidates[0] ?? null, version: probed[0]?.version ?? null, ok: false, candidates: probed };
}
