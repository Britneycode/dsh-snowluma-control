# dsh-snowluma-control

DSH（DeepSeek Harness）插件：在设置页里一键**启动 / 停止 / 重启** [SnowLuma](https://github.com/Britneycode/dsh-fish-soul) QQ 机器人的 Node 进程，并实时显示它打印的 WebUI 与 OneBot 就绪状态。

不用再开终端跑 `launcher.bat`。

**平台**：Windows。停止走 `taskkill`，进程查询走 `powershell.exe`，Node 探测走 `where.exe`。
**零依赖**：只用 `node:*` 标准库 + 宿主机 React。

## 面板

设置页 →「SnowLuma 控制台」，四行字段 + 一块日志：

| 行 | 内容 |
|---|---|
| 运行状态 | 状态徽章：`已停止` / `启动中` / `运行中` / `停止中` / `残留进程` / `异常退出 (code N)`；副行显示 `WebUI … · OneBot … · pid …` |
| 安装目录 | 输入框 + 「自动识别」，候选来自**运行中进程 > 插件同级目录 > 常见安装位置**，每个候选标置信度（strong / medium / weak） |
| 进程 | 「启动 / 停止 / 重启」（残留进程时停止按钮变「强制停止」） |
| WebUI | 「打开 WebUI」，在宿主右栏的 Browser 标签里打开真实端口 |
| 日志 | 滚动环，2 秒轮询，「清空」 |

QQ 登录不由本插件负责，它是 SnowLuma 自己的事。

## 设计要点

**就绪判定全部来自日志，不设门。** 进程 spawn 成功 ≠ 能用。插件解析 SnowLuma 的标准输出，识别 `[App] SnowLuma starting`、`[WebUI] listening …`、`[OneBot.HTTP] … listening`、`[OneBot.WS-Server] … listening`、`[App] Node integrity: pid=…`、`Shutting down (launcher disconnected)`。WebUI 端口会随占用**静默顺延**（5099 → 5100 …），所以地址一律取自日志里解析出的真实端口，不写死。

**停止是三段式的。** ① 先杀 launcher，让 child 靠 IPC `disconnect` 优雅退出；② 等最多 15 秒；③ 还活着才 `taskkill /T /F` 整树强杀。SnowLuma 的 launcher 只在 child 退出码为 75 时重拉，其他退出码它会自己退出——所以不能一上来就整树强杀。

**孤儿对账。** 宿主被强杀时留下的 SnowLuma 进程，下次开面板会被识别成「残留进程」并允许一键强制停止。判定要同时过 pid 存活、启动时间吻合与命令行匹配——单看 pid 会把复用同一 pid 的无关进程误判成自己的。

**状态归零与迟到事件。** 停止后 WebUI / OneBot 就绪位立即归零（否则按钮指向死端口）；主动停止后到达的 `exit` 事件不会把状态改写成「异常退出」。

## 安装

从 npm（若已发布）：

```bash
dsh plugin --profile desktop add dsh-snowluma-control
```

本地源码：

```bash
dsh plugin --profile desktop add ./dsh-snowluma-control
```

手工等价：profile 的 `package.json` 里把 `dsh-snowluma-control` 加进 `dsh.profile.bundles`，`dependencies` 里写 `"dsh-snowluma-control": "link:/path/to/dsh-snowluma-control"`，然后 `pnpm install`。

插件注入 `webServer`，注册前缀路由 `/api/plugins/snowluma-control`（`GET /state`、`GET /logs`、`GET /detect`、`POST /start|/stop|/restart|/config`）。写操作校验同源。

安装后**重启宿主**才生效。插件目录用 `link:` 挂载时，改完代码同样要重启宿主——运行中的进程一直跑的是启动时加载的那份。

## 测试

```bash
node --test
```

69 个断言全绿（约 2.5s）。宿主会话的 PATH 可能不含 `C:\Windows\System32`，而 `lib/procs.js` 用裸名调 `powershell.exe`；缺了会 `ENOENT` 导致进程时间戳拿到 null、对账误判。先补上：

```bash
export PATH="/c/Windows/System32:/c/Windows/System32/WindowsPowerShell/v1.0:$PATH"
```

不要写 `node --test test/`——Windows 下目录参数会被当入口模块。

## 许可

MIT
