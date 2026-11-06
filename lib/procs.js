import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// spawnSync 会同步阻塞宿主的事件循环：DSH 宿主与插件同进程，
// 停止/启动一次要卡 149–732ms（实测），期间宿主所有请求与定时器全部停摆。
// 全部改异步，宿主只在这段时间里处理别的请求。
//
// execFile 的 reject 语义要统一成 spawnSync 的返回形状（{status, stdout, stderr}），
// 否则调用方得为两种错误模型各写一套判断。
async function run(file, args, { timeout = 5000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      encoding: 'utf8', windowsHide: true, timeout,
    });
    return { status: 0, stdout: stdout ?? '', stderr: stderr ?? '' };
  } catch (e) {
    // 非零退出码是 taskkill 的常态（进程已死就是 128），要如实带回给调用方判断
    return { status: e.code ?? null, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

export function pidAlive(pid) {
  const n = Number(pid);
  // 非法 PID 必须先判掉：Number(null)===0 会去探测进程组、恒成功。
  if (!Number.isInteger(n) || n <= 0) return false;
  try { process.kill(n, 0); return true; }
  catch (e) {
    // 只有 EPERM 能证明进程活着（存在但无权限）。
    // ESRCH = 已死；其余错误码（ERR_INVALID_ARG_TYPE / ERR_OUT_OF_RANGE 等）
    // 说明这个 pid 根本不可用，判死 —— 旧写法 e.code !== 'ESRCH' 会把它们当成活着。
    return e.code === 'EPERM';
  }
}

export async function killTree(pid) { // 带 /T
  return run('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 10000 });
}

export async function killSingle(pid) { // 不带 /T：让 child 走 disconnect 优雅退出
  return run('taskkill', ['/PID', String(pid), '/F'], { timeout: 10000 });
}

// childPid 缺失时的 ③ 段兜底：在 node.exe 里找出命令行含 index.mjs 的那个子进程。
// 纯函数便于测试；rows = [{pid, ppid, cmd}]
export function pickIndexChild(rows, launcherPid, root) {
  const cands = rows.filter((r) => r.pid !== launcherPid && /index\.mjs/i.test(r.cmd || ''));
  if (!cands.length) return null;
  const direct = cands.find((r) => r.ppid === launcherPid);
  if (direct) return direct.pid;
  if (!root) return null;
  const norm = String(root).replace(/[\\/]+$/, '').toLowerCase();
  // 必须是「目录边界」匹配而非子串匹配：root=D:\SnowLuma 时，D:\SnowLuma-test\index.mjs
  // 也包含该子串，误命中会让 killTree 杀掉另一个项目的整棵进程树。
  const near = cands.filter((r) => {
    const cmd = String(r.cmd || '').toLowerCase();
    return cmd.includes(`${norm}\\`) || cmd.includes(`${norm}/`) || cmd.endsWith(norm);
  });
  // 多个候选说明认不准了（同一目录下起了多个 node）。宁可不杀也不误杀：
  // 交给用户点「强制停止」，由用户确认后再动。
  if (near.length !== 1) return null;
  return near[0].pid;
}

export async function findIndexChild(launcherPid, root) {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.CommandLine)" }`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 8000 });
  if (r.status !== 0) return null;
  const rows = [];
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const i = line.indexOf('|');
    const j = line.indexOf('|', i + 1);
    if (i < 0 || j < 0) continue;
    rows.push({ pid: Number(line.slice(0, i)), ppid: Number(line.slice(i + 1, j)), cmd: line.slice(j + 1) });
  }
  return pickIndexChild(rows, launcherPid, root);
}

// 返回 {name, startMs} —— 进程存在且能读到启动时间
// 返回 {dead: true}      —— 进程确定不存在（ObjectNotFound）
// 返回 null              —— 读不到（AccessDenied / PowerShell 起不来 / 输出异常）
//
// 判定只看 stdout 的显式标记，不看退出码：原实现用 `r.status !== 0` 判失败，
// 但 PowerShell 的退出码取决于脚本末句是否执行 —— 死进程时 `if ($p)` 不成立，
// 退出码是 1 而非 0，于是「进程已死」和「PowerShell 报错」被混成同一个 null。
export async function processStartMs(pid) {
  const ps = `
$Error.Clear()
$p = Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue
if ($p) {
  "OK|$($p.ProcessName)|$(([DateTimeOffset]$p.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds())"
} elseif ($Error.Count -gt 0) {
  "ERR|$($Error[0].CategoryInfo.Category)|"
} else {
  "ERR|unknown|"
}`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 5000 });
  const out = (r.stdout || '').trim();
  let m = /^OK\|([^|]*)\|(\d+)$/.exec(out);
  if (m) return { name: m[1], startMs: Number(m[2]) };
  m = /^ERR\|([^|]*)\|/.exec(out);
  if (m) {
    // Category 是语言无关的枚举：ObjectNotFound=进程不存在，PermissionDenied=无权访问
    if (m[1] === 'ObjectNotFound') return { dead: true };
    return null;
  }
  return null;
}
