import { readBodyJson, sameOrigin, sendJson } from './http-utils.js';
import { detectInstallDirs } from './detect.js';

const API_PREFIX = '/api/plugins/snowluma-control';

export function registerRoutes(ctx, { controller, log }) {
  const logger = log ?? (() => {});
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: API_PREFIX,
    handler: async (req, res) => {
      const send = (code, obj) => sendJson(res, code, obj);
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname.replace(API_PREFIX, '') || '/';
        const method = req.method ?? 'GET';
        if (method === 'GET' && path === '/state') return send(200, { ok: true, ...controller.getState() });
        if (method === 'GET' && path === '/logs') return send(200, { ok: true, ...controller.readLogs(url.searchParams.get('cursor')) });
        if (method === 'GET' && path === '/detect') {
          // 自动识别安装目录：运行中进程 > 插件同级目录 > 常见安装位置
          const candidates = await detectInstallDirs();
          return send(200, { ok: true, candidates, current: controller.getState().root });
        }
        if (method === 'POST') {
          if (!sameOrigin(req)) return send(403, { ok: false, error: 'forbidden' });
          if (path === '/start')  return send(200, { ok: true, ...(await controller.start()) });
          if (path === '/stop')   return send(200, { ok: true, ...(await controller.stop()) });
          if (path === '/restart')return send(200, { ok: true, ...(await controller.restart()) });
          if (path === '/config') {
            const body = await readBodyJson(req);
            return send(200, { ok: true, ...(await controller.updateConfig({ root: body.root })) });
          }
        }
        return send(404, { ok: false, error: 'not found' });
      } catch (err) {
        logger('error', err);
        return send(err.status ?? 500, { ok: false, error: String(err.message ?? err) });
      }
    },
  }));
}