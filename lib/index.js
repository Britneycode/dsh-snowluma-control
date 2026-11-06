import { join } from 'node:path';
import { homedir } from 'node:os';
import { SnowLumaController } from './controller.js';
import { registerRoutes } from './routes.js';

export const name = 'dsh-snowluma-control';
export const inject = ['webServer'];

export async function apply(ctx) {
  const controller = new SnowLumaController({
    storeFile: join(homedir(), '.dsh', 'snowluma-control.json'),
    pushLog: () => {}, // 宿主侧日志可由 ctx.logger 接；本轮保持静默
  });
  // 残留对账要先跑完再挂路由：状态没定下来就暴露 /start，
  // 用户可能点到一个跟实际不符的状态上（原本是同步调用，天然就是这个顺序）。
  // 对账失败不该拖垮整个插件 —— 挂上路由，面板还能显示并允许重新配置。
  try {
    await controller.reconcile();
  } catch (error) {
    ctx?.logger?.error?.(`[dsh-snowluma-control] 残留对账失败：${error?.message ?? error}`);
  }
  registerRoutes(ctx, { controller, log: (lvl, msg) => ctx?.logger?.[lvl]?.(msg) });
  ctx.effect(() => () => controller.dispose()); // 宿主退出时同步收尾
}
