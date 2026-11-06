window.__ModuleLoader__.load({
  id: "dsh-snowluma-control",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    let react = require("react");
    const h = react.createElement;
    const inject = ["slots"];
    const PLUGIN_ID = "dsh-snowluma-control";
    const API = "/api/plugins/snowluma-control";

    // 版式对齐宿主官方设置 section（app.asar :: dsh-client-ui-settings-models / -general）：
    // 无外壳 flex 列 + 自带 h2 + 行式字段（.5px 分隔线）；只用令牌表里真实存在的 --dsw-*。
    const css = `
.sc{display:flex;flex-direction:column;width:100%;max-width:720px;gap:12px;
  color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);
  font-size:var(--dsw-font-s-14-font-size,14px);line-height:var(--dsw-font-s-14-line-height,22px)}
.sc-title{margin:0;font-size:var(--dsw-font-base-16-font-size,16px);line-height:24px;font-weight:500}
.sc-intro{margin:0;color:var(--dsw-alias-label-tertiary);
  font-size:var(--dsw-font-s-14-font-size,14px);line-height:var(--dsw-font-s-14-line-height,22px)}
.sc-rows{display:flex;flex-direction:column}
.sc-row{display:flex;align-items:center;justify-content:space-between;gap:24px;
  padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.sc-row:last-child{border-bottom:none}
.sc-main{display:flex;flex-direction:column;gap:4px;min-width:0}
.sc-row-title{font-size:var(--dsw-font-s-14-font-size,14px);line-height:20px}
.sc-desc{color:var(--dsw-alias-label-secondary);
  font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}
.sc-mono{font-family:"JetBrains Mono","Cascadia Code",Consolas,monospace;font-variant-numeric:tabular-nums}
.sc-pill{display:inline-flex;align-items:center;gap:6px;flex:none;padding:2px 10px;border-radius:999px;
  border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);
  color:var(--dsw-alias-label-secondary);
  font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:18px;white-space:nowrap}
.sc-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.sc-pill.success{color:var(--dsw-alias-state-success-primary);
  border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,transparent)}
.sc-pill.warn{color:var(--dsw-alias-state-warn-primary);
  border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 35%,transparent)}
.sc-pill.info{color:var(--dsw-alias-state-business-primary);
  border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 35%,transparent)}
.sc-pill.error{color:var(--dsw-alias-state-error-primary);
  border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent)}
.sc-actions{display:flex;align-items:center;gap:8px;flex:none}
.sc-input{flex:1;min-width:200px;max-width:380px;height:36px;padding:0 10px;
  border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,12px);
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  font-family:var(--dsw-font-family);font-size:var(--dsw-font-xxs-12-font-size,12px)}
.sc-input:focus-visible,.sc-btn:focus-visible{
  outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));
  outline-offset:1px}
.sc-input:disabled{opacity:.55}
.sc-btn{flex:none;height:28px;padding:0 12px;border-radius:var(--dsw-radius-md,12px);
  border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);
  font-family:var(--dsw-font-family);font-size:var(--dsw-font-xxs-12-font-size,12px);cursor:pointer}
.sc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.sc-btn:disabled{opacity:.45;cursor:not-allowed}
.sc-btn.primary{height:36px;border:none;background:var(--dsw-alias-button-primary-fill);
  color:var(--dsw-alias-label-primary-foreground)}
.sc-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.sc-btn.danger{color:var(--dsw-alias-state-error-primary);
  border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent)}
.sc-log-card{display:flex;flex-direction:column;gap:8px;padding:12px 14px;
  border:.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);
  border-radius:var(--dsw-radius-xl,20px)}
.sc-cands{display:flex;flex-direction:column;gap:6px;margin:-4px 0 4px}
.sc-cand{display:flex;align-items:center;justify-content:space-between;gap:12px;
  width:100%;padding:8px 12px;border-radius:var(--dsw-radius-md,12px);
  border:.5px solid var(--dsw-alias-border-l2);background:transparent;
  color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);
  font-size:var(--dsw-font-xxs-12-font-size,12px);cursor:pointer;text-align:left}
.sc-cand:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sc-cand-dir{font-family:"JetBrains Mono","Cascadia Code",Consolas,monospace;
  font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-log-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.sc-log{margin:0;min-height:96px;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-all;
  color:var(--dsw-alias-label-secondary);
  font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:18px}
.sc-err{color:var(--dsw-alias-state-error-primary);font-size:var(--dsw-font-xxs-12-font-size,12px)}
.sc-note{margin:0;color:var(--dsw-alias-label-tertiary);
  font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:18px}
`;

    function ensureStyle() {
      if (typeof document === "undefined") return;
      const tagId = `${PLUGIN_ID}/panel.css`;
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    async function api(method, path, body) {
      const res = await fetch(API + path, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json;
    }

    // spec §8 徽章映射
    function badgeOf(s) {
      if (!s) return { cls: "sc-pill", text: "读取中…" };
      if (s.state === "stopped") {
        const abnormal = s.lastError || (s.lastExit?.code !== null && s.lastExit?.code !== 0);
        return abnormal
          ? { cls: "sc-pill error", text: `异常退出${s.lastExit?.code ? ` (code ${s.lastExit.code})` : ""}` }
          : { cls: "sc-pill", text: "已停止" };
      }
      if (s.state === "starting") return { cls: "sc-pill info", text: "启动中" };
      if (s.state === "stopping") return { cls: "sc-pill info", text: "停止中" };
      if (s.state === "orphan") return { cls: "sc-pill warn", text: "残留进程" };
      if (s.state === "running") {
        return s.webui?.ready
          ? { cls: "sc-pill success", text: "运行中" }
          : { cls: "sc-pill warn", text: "WebUI 未就绪" };
      }
      return { cls: "sc-pill", text: s.state };
    }

    function can(s, action) {
      if (!s || s.busy) return false;
      const st = s.state;
      if (action === "start") return st === "stopped";
      if (action === "stop") return st === "starting" || st === "running" || st === "orphan";
      if (action === "restart") return st === "starting" || st === "running" || st === "orphan";
      if (action === "config") return st === "stopped" || st === "orphan";
      return false;
    }

    function statusLine(s) {
      if (!s) return "读取中…";
      const webui = s.webui?.ready ? `WebUI ${s.webui.port}` : s.webui?.timedOut ? "WebUI 20s 未就绪" : "WebUI 等待中";
      const onebot = s.onebot?.ready
        ? `OneBot 就绪${s.onebot.http ? ` (HTTP ${s.onebot.http})` : ""}${s.onebot.ws ? ` (WS ${s.onebot.ws})` : ""}`
        : "OneBot 未绑定";
      const pid = s.pid ? `pid ${s.pid}${s.childPid ? ` / child ${s.childPid}` : ""}` : "pid --";
      return `${webui} · ${onebot} · ${pid}`;
    }

    // WebUI 端口会静默顺延（RISKS.md：5099→5100），地址一律取自日志解析出的真实端口。
    function webuiUrl(s) {
      return s?.webui?.ready && s.webui.port ? `http://127.0.0.1:${s.webui.port}` : null;
    }

    // 宿主文档：ctx.sidebarRight.openTab('browser', { params: { url } }) 开右栏 Browser tab。
    // Desktop 用 <webview> 载体，不受目标页 X-Frame-Options/CSP frame-ancestors 约束；
    // 没有该服务时退回 window.open（宿主会转给 shell.openExternal）。
    function openWebui(url, ctx) {
      if (!url) return false;
      let sr = null;
      try { sr = ctx?.get?.("sidebarRight") ?? ctx?.sidebarRight ?? null; } catch { sr = null; }
      if (typeof sr?.openTab === "function") {
        try { sr.openTab("browser", { params: { url } }); return "sidebar"; } catch { /* 退回系统浏览器 */ }
      }
      try {
        if (typeof window !== "undefined" && typeof window.open === "function") {
          window.open(url, "_blank", "noopener,noreferrer");
          return "external";
        }
      } catch { /* 两条路都不通 */ }
      return false;
    }

    function createPanel(ctx) { return function Panel() {
      const [s, setS] = react.useState(null);
      const [lines, setLines] = react.useState([]);
      const [busy, setBusy] = react.useState(false);
      const [err, setErr] = react.useState("");
      const [rootDraft, setRootDraft] = react.useState("");
      const [cands, setCands] = react.useState([]);
      const [detecting, setDetecting] = react.useState(false);
      const cursorRef = react.useRef(0);
      const stickRef = react.useRef(true);
      const boxRef = react.useRef(null);
      const rootInitRef = react.useRef(false); // 只回填一次，避免轮询覆盖用户正在输入的路径
      const detectRef = react.useRef(false);   // 自动识别只跑一次，别每 2s 轮询都扫盘

      react.useEffect(() => {
        let alive = true;
        let timer = null;
        const tick = async () => {
          if (document.visibilityState === "hidden") { timer = setTimeout(tick, 2000); return; }
          try {
            const st = await api("GET", "/state");
            if (!alive) return;
            setS(st);
            if (!rootInitRef.current && st.root) { rootInitRef.current = true; setRootDraft(st.root); }
            // 目录没配过时自动识别一次：填好直接能点启动
            if (!detectRef.current && !st.root) {
              detectRef.current = true;
              try {
                const d = await api("GET", "/detect");
                if (!alive) return;
                setCands(d.candidates ?? []);
                // 只有一个强候选时直接填入，多个则让用户挑
                const strong = (d.candidates ?? []).filter((c) => c.confidence === "strong");
                if (strong.length === 1) setRootDraft(strong[0].dir);
              } catch { /* 识别失败不打扰用户，手填即可 */ }
            }
            const lg = await api("GET", `/logs?cursor=${cursorRef.current}`);
            if (!alive) return;
            cursorRef.current = lg.cursor;
            if (lg.reset) setLines(lg.lines);
            else if (lg.lines.length) {
              setLines((prev) => {
                const next = prev.concat(lg.truncated ? [{ seq: -1, text: "⋯ 已跳过被环形缓冲覆盖的行 ⋯" }] : [], lg.lines);
                return next.slice(-200);
              });
            }
          } catch (e) { if (alive) setErr(String(e.message ?? e)); }
          if (alive) timer = setTimeout(tick, 2000);
        };
        tick();
        return () => { alive = false; if (timer) clearTimeout(timer); };
      }, []);

      react.useEffect(() => {
        const el = boxRef.current;
        if (el && stickRef.current) el.scrollTop = el.scrollHeight;
      }, [lines]);

      const onScroll = () => {
        const el = boxRef.current;
        if (!el) return;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      };

      const act = async (fn) => {
        setBusy(true); setErr("");
        try { setS(await fn()); } catch (e) { setErr(String(e.message ?? e)); }
        finally { setBusy(false); }
      };

      // 自动识别：只扫盘，不改配置，扫完让用户点候选填进输入框
      const detect = async () => {
        setDetecting(true); setErr("");
        try {
          const d = await api("GET", "/detect");
          setCands(d.candidates ?? []);
          const strong = (d.candidates ?? []).filter((c) => c.confidence === "strong");
          if (strong.length === 1) setRootDraft(strong[0].dir);
        } catch (e) { setErr(String(e.message ?? e)); }
        finally { setDetecting(false); }
      };

      const b = badgeOf(s);
      const orphan = s?.state === "orphan";

      return h("section", { className: "sc" }, [
        h("h2", { key: "title", className: "sc-title" }, "SnowLuma 控制台"),
        h("p", { key: "intro", className: "sc-intro" },
          "启动 / 停止 SnowLuma 的 Node 进程，并读取它打印的 WebUI 与 OneBot 状态；QQ 登录不由本插件负责。"),

        h("div", { key: "rows", className: "sc-rows" }, [
          h("div", { key: "state", className: "sc-row" }, [
            h("div", { key: "m", className: "sc-main" }, [
              h("span", { key: "t", className: "sc-row-title" }, "运行状态"),
              h("span", { key: "d", className: "sc-desc sc-mono" }, statusLine(s)),
            ]),
            h("span", { key: "b", className: b.cls }, [
              h("i", { key: "dot", className: "sc-dot" }),
              b.text,
            ]),
          ]),

          h("div", { key: "path", className: "sc-row" }, [
            h("div", { key: "m", className: "sc-main" }, [
              h("span", { key: "t", className: "sc-row-title" }, "安装目录"),
              h("span", { key: "d", className: "sc-desc" },
                s?.root ? "含 index.mjs 的 SnowLuma 目录" : "必填：含 index.mjs 的 SnowLuma 目录"),
            ]),
            h("div", { key: "c", className: "sc-actions" }, [
              h("input", {
                key: "i", className: "sc-input sc-mono", value: rootDraft, spellCheck: false,
                placeholder: "D:\\path\\to\\SnowLuma",
                disabled: !can(s, "config"),
                onChange: (e) => setRootDraft(e.target.value),
              }),
              h("button", {
                key: "d", className: "sc-btn", disabled: detecting || busy,
                title: "扫描运行中的进程与常见安装位置",
                onClick: detect,
              }, detecting ? "识别中…" : "自动识别"),
              h("button", {
                key: "s", className: "sc-btn", disabled: !can(s, "config") || busy,
                onClick: () => act(async () => { await api("POST", "/config", { root: rootDraft }); return api("GET", "/state"); }),
              }, "保存"),
            ]),
          ]),

          cands.length ? h("div", { key: "cands", className: "sc-cands" },
            cands.map((c, i) => h("button", {
              key: `c${i}`, className: "sc-cand", title: c.reason,
              onClick: () => setRootDraft(c.dir),
            }, [
              h("span", { key: "d", className: "sc-cand-dir" }, c.dir),
              h("span", { key: "b", className: `sc-pill ${c.confidence === "strong" ? "success" : c.confidence === "medium" ? "info" : ""}` },
                c.confidence === "strong" ? "已确认" : c.confidence === "medium" ? "可能" : "待确认"),
            ]))) : null,

          h("div", { key: "act", className: "sc-row" }, [
            h("div", { key: "m", className: "sc-main" }, [
              h("span", { key: "t", className: "sc-row-title" }, "操作"),
              h("span", { key: "d", className: "sc-desc" },
                orphan
                  ? "存在残留进程，只能强制停止"
                  : "停止为三段式：先杀 launcher，等 child 优雅退出，超时再强杀"),
            ]),
            h("div", { key: "c", className: "sc-actions" }, [
              h("button", { key: "a", className: "sc-btn primary", disabled: !can(s, "start") || busy, onClick: () => act(() => api("POST", "/start")) }, "启动"),
              h("button", { key: "b2", className: orphan ? "sc-btn danger" : "sc-btn", disabled: !can(s, "stop") || busy, onClick: () => act(() => api("POST", "/stop")) }, orphan ? "强制停止" : "停止"),
              h("button", { key: "c", className: "sc-btn", disabled: !can(s, "restart") || busy, onClick: () => act(() => api("POST", "/restart")) }, "重启"),
            ]),
          ]),
        h("div", { key: "webui", className: "sc-row" }, [
            h("div", { key: "m", className: "sc-main" }, [
              h("span", { key: "t", className: "sc-row-title" }, "WebUI"),
              h("span", { key: "d", className: "sc-desc sc-mono" },
                s?.webui?.ready
                  ? `在 DSH 右栏的 Browser 标签打开 ${webuiUrl(s)}`
                  : "WebUI 就绪后可在这里打开"),
            ]),
            h("div", { key: "c", className: "sc-actions" }, [
              h("button", {
                key: "o", className: "sc-btn", disabled: !s?.webui?.ready || busy,
                onClick: () => { setErr(""); openWebui(webuiUrl(s), ctx); },
              }, "打开 WebUI"),
            ]),
          ]),
        ]),

        h("div", { key: "log", className: "sc-log-card" }, [
          h("div", { key: "h", className: "sc-log-head" }, [
            h("span", { key: "t", className: "sc-row-title" }, "日志"),
            h("button", { key: "c", className: "sc-btn", onClick: () => setLines([]) }, "清空"),
          ]),
          h("pre", { key: "p", className: "sc-log sc-mono", ref: boxRef, onScroll, "aria-live": "polite" },
            lines.map((l) => `${l.text}\n`).join("")),
        ]),

        err ? h("p", { key: "err", className: "sc-err" }, err) : null,
      ]);
    }; }

    function apply(ctx) {
      ensureStyle();
      ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "snowluma-control",
        order: 70,
        label: () => "SnowLuma 控制台",
      }, createPanel(ctx))), `${PLUGIN_ID}: panel`); // 第二参数必须是组件函数，不能是 h(Panel) 元素
    }

    exports.webuiUrl = webuiUrl;
    exports.openWebui = openWebui;

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});