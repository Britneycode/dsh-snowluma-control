export function parseLine(line) {
  const text = String(line);
  if (text.includes('[App] SnowLuma starting')) return { type: 'app-starting' };
  const pid = text.match(/Node integrity: pid=(\d+)/);
  if (pid) return { type: 'child-pid', payload: { pid: Number(pid[1]) } };
  if (text.includes('[WebUI] listening')) {
    const m = text.match(/(https?):\/\/([^:\s]+):(\d+)/);
    if (m) return { type: 'webui-listening', payload: { scheme: m[1], host: m[2], port: Number(m[3]) } };
  }
  if (text.includes('session closed: UIN=')) return { type: 'session-closed' };
  if (text.includes('[OneBot.HTTP]') || text.includes('[OneBot.WS-Server]')) {
    const m = text.match(/listening\s+([\d.]+):(\d+)/);
    if (m) return { type: 'onebot-listening', payload: { kind: text.includes('WS-Server') ? 'ws' : 'http', port: Number(m[2]) } };
  }
  if (text.includes('Shutting down (')) return { type: 'shutting-down' };
  return null;
}