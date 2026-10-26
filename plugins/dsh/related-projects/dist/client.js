(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/client/styles.ts
  var CSS = `
.rprj-dock{display:flex;flex-direction:column;gap:6px;padding:2px 4px;font-size:12px;color:var(--dsw-alias-label-secondary);position:relative}
.rprj-dock-inner{display:flex;align-items:center;gap:8px;min-height:24px;flex-wrap:wrap}
.rprj-dock-label{display:inline-flex;align-items:center;gap:4px;background:none;border:none;padding:2px 4px;border-radius:6px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;white-space:nowrap}
.rprj-dock-label:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.rprj-caret{font-size:9px;opacity:.7}
.rprj-chip-badge{font-weight:600;color:var(--dsw-alias-state-error-primary);font-size:11px}
.rprj-dock-add{align-self:flex-start;padding:2px 10px;border-radius:999px;border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;line-height:18px}
.rprj-dock-add:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.rprj-icon-btn{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:6px;width:22px;height:22px;line-height:1;font-size:13px;display:inline-flex;align-items:center;justify-content:center}
.rprj-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.rprj-notice{color:var(--dsw-alias-state-warn-primary);font-size:12px}
.rprj-popover{position:absolute;z-index:40;bottom:calc(100% + 6px);left:0;min-width:280px;max-width:min(520px,90vw);max-height:320px;overflow:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:8px}
.rprj-popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 4px 8px;color:var(--dsw-alias-label-secondary);font-size:11px}
.rprj-popover-row{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:6px 8px;border:none;border-radius:8px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-primary)}
.rprj-popover-row:hover{background:var(--dsw-alias-bg-layer-2)}
.rprj-popover-row[data-missing=true]{cursor:default;opacity:.75}
.rprj-popover-line{display:flex;align-items:center;gap:6px;min-width:0}
.rprj-popover-name{font-size:12px;font-weight:600}
.rprj-popover-name[data-missing=true]{color:var(--dsw-alias-state-error-primary);text-decoration:line-through}
.rprj-popover-path{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.rprj-popover-note{font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.85}
.rprj-popover-missing{font-size:11px;color:var(--dsw-alias-state-error-primary)}
.rprj-popover-foot{padding:8px 4px 2px;font-size:11px;color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-border-l1);margin-top:6px}
.rprj-panel{display:flex;flex-direction:column;gap:14px;padding:20px 24px;width:100%;box-sizing:border-box;min-width:0;height:100%;overflow:auto;overscroll-behavior:contain;color:var(--dsw-alias-label-primary);font-size:13px}
[data-platform=darwin] .rprj-panel{padding-top:calc(20px + var(--dsh-frame-top-clearance,0px))}
.rprj-panel-head{display:flex;flex-direction:column;gap:4px}
.rprj-title{font-size:16px;font-weight:600;margin:0}
.rprj-sub{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
.rprj-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rprj-select,.rprj-input,.rprj-textarea{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 8px;font-size:12px;font-family:inherit}
.rprj-select{max-width:420px}
.rprj-input:focus,.rprj-textarea:focus,.rprj-select:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.rprj-input-grow{flex:1 1 260px}
.rprj-input-name{width:180px;font-weight:600}
.rprj-textarea{width:100%;resize:vertical;line-height:1.5}
.rprj-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;line-height:18px}
.rprj-btn:hover{border-color:var(--dsw-alias-border-l2)}
.rprj-btn:disabled{opacity:.5;cursor:default}
.rprj-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}
.rprj-btn-primary:hover{background:var(--dsw-alias-bg-layer-2)}
.rprj-btn-quiet{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}
.rprj-btn-quiet:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.rprj-btn-danger{background:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);color:#fff}
.rprj-rows{display:flex;flex-direction:column;gap:8px}
.rprj-row{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:6px}
.rprj-row[data-missing=true]{border-style:dashed;border-color:var(--dsw-alias-state-error-primary)}
.rprj-row-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rprj-row-path{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.rprj-tag{font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.rprj-tag-error{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.rprj-grow{flex:1 1 auto}
.rprj-toggle{width:34px;height:20px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);position:relative;cursor:pointer;padding:0;flex:0 0 auto}
.rprj-toggle[aria-checked=true]{border-color:var(--dsw-alias-brand-primary)}
.rprj-toggle-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:left .15s ease,background .15s ease}
.rprj-toggle[aria-checked=true] .rprj-toggle-knob{left:16px;background:var(--dsw-alias-brand-primary)}
.rprj-btn-delete:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);color:var(--dsw-alias-state-error-primary)}
/* \u5F85\u786E\u8BA4\u7684\u5220\u9664\u6761\uFF1A\u5148\u8BF4\u540E\u679C\uFF0C\u518D\u7ED9\u4E24\u4E2A\u7B54\u6848\uFF0C\u6392\u6210\u4E00\u884C\uFF0C
   \u7A84\u9762\u677F\u4E0B\u4F1A\u6298\u884C\u3002\u5E26\u8272\u8C03\u7684\u8FB9\u6846\u8BA9\u5B83\u8BFB\u8D77\u6765\u50CF\u4E00\u4E2A\u72B6\u6001\uFF0C\u800C\u4E0D\u662F\u6309\u94AE\u3002 */
.rprj-confirm{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px 6px 4px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,var(--dsw-alias-bg-layer-1));animation:rprj-confirm-in .12s ease-out}
.rprj-confirm-text{font-size:12px;line-height:16px;color:var(--dsw-alias-label-primary);max-width:34ch}
.rprj-confirm .rprj-btn{padding:2px 10px}
@keyframes rprj-confirm-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
.rprj-ws-list{display:flex;flex-direction:column;gap:10px}
.rprj-ws{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:8px 12px;display:flex;flex-direction:column;gap:8px;min-width:0}
.rprj-ws-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
.rprj-ws-toggle{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:2px 4px;border-radius:6px;line-height:1;display:inline-flex;align-items:center;flex:0 0 auto}
.rprj-ws-toggle:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.rprj-ws-id{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 220px;overflow:hidden}
.rprj-ws-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rprj-ws-path{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.rprj-ws-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}
.rprj-ws-count{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.rprj-ws-warn{font-size:11px;color:var(--dsw-alias-state-warn-primary)}
.rprj-ws-manual{margin-top:2px}
.rprj-select-copy{max-width:200px}
.rprj-row-add{align-self:flex-start}
.rprj-empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:18px;text-align:center}
.rprj-muted{color:var(--dsw-alias-label-secondary);font-size:12px;margin:0}
.rprj-error{color:var(--dsw-alias-state-error-primary);font-size:12px}
.rprj-foot{font-size:11px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rprj-spinner{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:rprj-spin .8s linear infinite;vertical-align:-2px}
@keyframes rprj-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.rprj-spinner{animation:none}}
`;

  // src/client/core/runtime.ts
  var react = null;
  function setReact(value) {
    react = value;
  }
  function useReact() {
    if (react === null) throw new Error("related-projects: React was not provided by the module loader");
    return react;
  }
  var h = (type, props, ...children) => useReact().createElement(type, props, ...children);

  // src/client/i18n/common.ts
  var ZH_COMMON = {
    "common.cancel": "\u53D6\u6D88",
    "common.loading": "\u52A0\u8F7D\u4E2D\u2026",
    "manual.title": "\u624B\u52A8\u8F93\u5165\u8DEF\u5F84",
    "manual.placeholder": "D:\\other\\project",
    "manual.ok": "\u786E\u5B9A",
    "error.generic": "\u64CD\u4F5C\u5931\u8D25",
    "error.not-directory": "\u8DEF\u5F84\u4E0D\u5B58\u5728\u6216\u4E0D\u662F\u76EE\u5F55\u3002",
    "error.root": "\u4E0D\u80FD\u628A\u78C1\u76D8\u6839\u76EE\u5F55\u8BBE\u4E3A\u5173\u8054\u9879\u76EE\u3002",
    "error.home": "\u4E0D\u80FD\u628A\u7528\u6237\u4E3B\u76EE\u5F55\u8BBE\u4E3A\u5173\u8054\u9879\u76EE\u3002",
    "error.self": "\u4E0D\u80FD\u628A\u5F53\u524D\u5DE5\u4F5C\u533A\u81EA\u8EAB\u8BBE\u4E3A\u5173\u8054\u9879\u76EE\u3002",
    "error.workspace-missing": "\u8FD9\u4E2A\u4F1A\u8BDD\u627E\u4E0D\u5230\u6240\u5C5E\u5DE5\u4F5C\u533A\u76EE\u5F55\uFF0C\u65E0\u6CD5\u6DFB\u52A0\u3002",
    "error.limit": "\u5DF2\u8FBE\u5173\u8054\u9879\u76EE\u6570\u91CF\u4E0A\u9650\u3002",
    "error.no-group": "\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u8FD8\u6CA1\u6709\u5173\u8054\u9879\u76EE\u3002",
    "error.no-project": "\u8FD9\u4E2A\u9879\u76EE\u5DF2\u7ECF\u4E0D\u5728\u5217\u8868\u91CC\u4E86\uFF0C\u8BF7\u5237\u65B0\u3002",
    "error.outside-project": "\u8FD9\u4E2A\u76EE\u5F55\u4E0D\u5728\u4EFB\u4F55\u5173\u8054\u9879\u76EE\u5185\u3002",
    "error.pick-unavailable": "\u76EE\u5F55\u9009\u62E9\u5668\u4E0D\u53EF\u7528\uFF0C\u8BF7\u624B\u52A8\u8F93\u5165\u8DEF\u5F84\u3002",
    "error.bad-json": "\u8BF7\u6C42\u683C\u5F0F\u4E0D\u5BF9\u3002",
    "error.too-large": "\u8BF7\u6C42\u5185\u5BB9\u8FC7\u5927\u3002",
    "error.transport": "\u8BF7\u6C42\u4F20\u8F93\u4E2D\u65AD\u3002",
    "error.internal": "\u5BBF\u4E3B\u5185\u90E8\u9519\u8BEF\u3002",
    "error.not-found": "\u4E0D\u8BA4\u8BC6\u7684\u63A5\u53E3\u3002",
    "error.forbidden": "\u8BF7\u6C42\u88AB\u62D2\u7EDD\uFF08\u6765\u6E90\u4E0D\u88AB\u4FE1\u4EFB\uFF09\u3002",
    "error.unauthorized": "\u8BF7\u6C42\u88AB\u62D2\u7EDD\uFF08\u9700\u8981\u5DF2\u767B\u5F55\u7684\u6D4F\u89C8\u5668\u4F1A\u8BDD\uFF09\u3002",
    "error.network": "\u8FDE\u4E0D\u4E0A\u5BBF\u4E3B\u3002",
    "error.bad-path": "\u8FD9\u4E2A\u8DEF\u5F84\u65E0\u6CD5\u8868\u793A\u4E3A @ \u5F15\u7528\uFF08\u5305\u542B\u5F15\u53F7\u6216\u63A7\u5236\u5B57\u7B26\uFF09\u3002"
  };
  var EN_COMMON = {
    "common.cancel": "Cancel",
    "common.loading": "Loading\u2026",
    "manual.title": "Type a path",
    "manual.placeholder": "D:\\other\\project",
    "manual.ok": "OK",
    "error.generic": "Operation failed",
    "error.not-directory": "The path does not exist or is not a directory.",
    "error.root": "A drive root cannot be a related project.",
    "error.home": "The user home directory cannot be a related project.",
    "error.self": "The current workspace cannot be its own related project.",
    "error.workspace-missing": "This session has no resolvable workspace directory.",
    "error.limit": "The related-project limit is reached.",
    "error.no-group": "This workspace has no related projects yet.",
    "error.no-project": "That project is no longer in the list; reload.",
    "error.outside-project": "That directory is not inside any related project.",
    "error.pick-unavailable": "The directory picker is unavailable; type the path instead.",
    "error.bad-json": "The request body is not valid JSON.",
    "error.too-large": "The request body is too large.",
    "error.transport": "The request was interrupted.",
    "error.internal": "Internal host error.",
    "error.not-found": "Unknown API method.",
    "error.forbidden": "The request was refused (untrusted origin).",
    "error.unauthorized": "The request was refused (a signed-in browser session is required).",
    "error.network": "The host could not be reached.",
    "error.bad-path": "That path cannot be expressed as an @ reference (it contains a quote or control character)."
  };

  // src/client/i18n/dock.ts
  var ZH_DOCK = {
    "dock.label": "{n} \u4E2A\u5173\u8054\u9879\u76EE",
    "dock.empty": "+ \u5173\u8054\u5176\u5B83\u9879\u76EE",
    "dock.applies": "\u672C\u6B21\u4F1A\u8BDD\u4F1A\u544A\u8BC9\u6A21\u578B\u8FD9\u4E9B\u8DEF\u5F84"
  };
  var EN_DOCK = {
    "dock.label": "{n} related projects",
    "dock.empty": "+ Add related project",
    "dock.applies": "The agent is told these paths for this session"
  };

  // src/client/i18n/menu.ts
  var ZH_MENU = {
    "menu.files": "\u5173\u8054\u9879\u76EE-\u9879\u76EE\u6587\u4EF6"
  };
  var EN_MENU = {
    "menu.files": "Related projects - project files"
  };

  // src/client/i18n/panel.ts
  var ZH_PANEL = {
    "panel.title": "\u5173\u8054\u9879\u76EE",
    "panel.description": "\u4E00\u6B21\u6539\u52A8\u4F1A\u7275\u52A8\u7684\u4E00\u7EC4\u5176\u5B83\u9879\u76EE\uFF08\u524D\u7AEF / \u6587\u6863 / \u670D\u52A1\uFF09\u3002\u4F1A\u8BDD\u5F00\u59CB\u65F6\u4F1A\u544A\u8BC9\u6A21\u578B\uFF0C\u6539\u540E\u7AEF\u65F6\u4E0D\u5FC5\u518D\u624B\u52A8\u627E\u8DEF\u5F84\u3002",
    "panel.addHere": "+ \u5173\u8054\u9879\u76EE",
    "panel.empty": "\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u8FD8\u6CA1\u6709\u5173\u8054\u9879\u76EE\u3002",
    "panel.emptyHint": "\u52A0\u4E0A\u4E00\u6B21\u6539\u52A8\u5E38\u4E00\u8D77\u52A8\u7684\u9879\u76EE\uFF08\u524D\u7AEF / \u6587\u6863 / \u5144\u5F1F\u670D\u52A1\uFF09\uFF0C\u6A21\u578B\u5728\u4F1A\u8BDD\u5F00\u59CB\u5C31\u4F1A\u77E5\u9053\u5B83\u4EEC\u3002",
    "panel.unregistered": "\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u5DF2\u4E0D\u5728 DSH \u7684\u5DE5\u4F5C\u533A\u5217\u8868\u91CC\uFF0C\u5173\u8054\u9879\u76EE\u4ECD\u4FDD\u7559\u3002",
    "panel.copyTo": "\u590D\u5236\u6574\u7EC4\u5230\u2026",
    "panel.rows": "{n} \u4E2A\u9879\u76EE",
    "panel.expand": "\u5C55\u5F00",
    "panel.collapse": "\u6536\u8D77",
    "panel.namePlaceholder": "\u540D\u79F0",
    "panel.notePlaceholder": "\u4EC0\u4E48\u60C5\u51B5\u4E0B\u9700\u8981\u6539\u5B83\uFF1F\uFF08\u2264200 \u5B57\uFF09",
    "panel.enabled": "\u542F\u7528",
    "panel.delete": "\u5220\u9664",
    "panel.deleteConfirm": "\u5220\u9664\u300C{name}\u300D\uFF1F\u5907\u6CE8\u4E00\u5E76\u5220\u9664\uFF0C\u65E0\u6CD5\u6062\u590D",
    "panel.deleteYes": "\u5220\u9664",
    "panel.open": "\u5728\u6587\u4EF6\u7BA1\u7406\u5668\u4E2D\u6253\u5F00",
    "panel.missing": "\u8DEF\u5F84\u4E0D\u5B58\u5728",
    "panel.agentAdded": "Agent \u6DFB\u52A0",
    "panel.limit": "\u6BCF\u4E2A\u5DE5\u4F5C\u533A\u6700\u591A {n} \u4E2A\u5173\u8054\u9879\u76EE\u3002",
    "panel.showDock": "\u5728\u8F93\u5165\u6846\u4E0B\u65B9\u663E\u793A\u5173\u8054\u9879\u76EE\u6761"
  };
  var EN_PANEL = {
    "panel.title": "Related projects",
    "panel.description": "The sibling projects one change touches (frontend / docs / services). The agent learns them when a session starts, so you never hunt for a path again.",
    "panel.addHere": "+ Add project",
    "panel.empty": "This workspace has no related projects yet.",
    "panel.emptyHint": "Add the projects you usually change together (frontend / docs / sibling services); the agent learns them when a session starts.",
    "panel.unregistered": "This workspace is no longer in the DSH list; its related projects are kept.",
    "panel.copyTo": "Copy group to\u2026",
    "panel.rows": "{n} projects",
    "panel.expand": "Expand",
    "panel.collapse": "Collapse",
    "panel.namePlaceholder": "Name",
    "panel.notePlaceholder": "When does this project need a change? (<=200 chars)",
    "panel.enabled": "Enabled",
    "panel.delete": "Delete",
    "panel.deleteConfirm": 'Delete "{name}"? Its note goes too, unrecoverable',
    "panel.deleteYes": "Delete",
    "panel.open": "Open in file manager",
    "panel.missing": "Path missing",
    "panel.agentAdded": "Added by agent",
    "panel.limit": "At most {n} related projects per workspace.",
    "panel.showDock": "Show the related-projects row under the composer"
  };

  // src/client/i18n/index.ts
  var NS = "related-projects";
  var ZH = { ...ZH_COMMON, ...ZH_PANEL, ...ZH_DOCK, ...ZH_MENU };
  var EN = { ...EN_COMMON, ...EN_PANEL, ...EN_DOCK, ...EN_MENU };
  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, key) => values !== void 0 && values[key] !== void 0 ? String(values[key]) : match);
  }
  function activeTag(ctx) {
    try {
      const locale = ctx.get("locale");
      const active = locale?.getSnapshot?.()?.active;
      if (typeof active === "string" && active !== "") return active;
    } catch {
    }
    if (typeof navigator === "object" && typeof navigator.language === "string") return navigator.language;
    return "";
  }
  function dictionaryFor(tag) {
    const primary = tag.toLowerCase().replace(/_/g, "-").split("-")[0];
    return primary === "zh" ? ZH : EN;
  }
  function translate(ctx, key, values) {
    const dict = dictionaryFor(activeTag(ctx));
    return fill(dict[key] ?? EN[key] ?? key, values);
  }
  function withFallback(seat, fallback) {
    return (key, values) => {
      const resolved = typeof seat === "function" ? seat(key, values) : void 0;
      if (typeof resolved === "string" && resolved !== "" && resolved !== key) return resolved;
      return fallback(key, values);
    };
  }

  // src/client/core/session.ts
  function sessionWorkspace(ctx, sessionId) {
    if (typeof sessionId !== "string" || sessionId === "") return "";
    let catalog;
    try {
      catalog = ctx.get("sessions");
    } catch {
      return "";
    }
    if (catalog === void 0 || catalog === null) return "";
    try {
      const row = catalog.list?.getSnapshot?.()?.byId?.[sessionId];
      return row !== void 0 && typeof row.cwd === "string" ? row.cwd : "";
    } catch {
      return "";
    }
  }
  function workspaceHintOf(ctx) {
    return (sessionId) => sessionWorkspace(ctx, sessionId);
  }

  // src/client/core/api.ts
  var API_BASE = "related-projects/api";
  var ApiError = class extends Error {
    constructor(code, message) {
      super(message !== void 0 && message !== "" ? message : code);
      __publicField(this, "code");
      this.name = "ApiError";
      this.code = code === "" ? "generic" : code;
    }
  };
  async function call(method, payload) {
    let response;
    try {
      response = await fetch(API_BASE + "/" + method, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload === void 0 ? {} : payload)
      });
    } catch (error) {
      throw new ApiError("network", error instanceof Error ? error.message : String(error));
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (body !== null && body.ok === true) return body.data;
    const code = body !== null && body.error !== void 0 ? String(body.error.code ?? "") : "";
    const message = body !== null && body.error !== void 0 ? String(body.error.message ?? "") : "";
    throw new ApiError(code === "" ? "http-" + String(response.status) : code, message);
  }
  function sessionPayload(sessionId, hint, extra = {}) {
    const payload = { ...extra, sessionId };
    const workspace = hint(sessionId);
    if (workspace !== "") payload.workspace = workspace;
    return payload;
  }

  // src/client/core/store.ts
  var WORKSPACE_RETRY_MS = [120, 250, 500, 1e3, 2e3, 3e3, 5e3, 8e3, 1e4, 15e3, 15e3];
  var stores = /* @__PURE__ */ new Set();
  function createStore(load, options = {}) {
    const requireWorkspace = options.requireWorkspace === true;
    let snapshot = { status: "idle", data: null, error: null };
    const listeners = /* @__PURE__ */ new Set();
    let inflight = null;
    let timer = null;
    let retries = 0;
    let latest = 0;
    const emit = () => {
      for (const listener of Array.from(listeners)) {
        try {
          listener();
        } catch {
        }
      }
    };
    const cancelRetry = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const scheduleRetry = (data) => {
      if (!requireWorkspace || data.workspace !== null) {
        retries = 0;
        cancelRetry();
        return;
      }
      if (retries >= WORKSPACE_RETRY_MS.length) return;
      const delay = WORKSPACE_RETRY_MS[retries];
      retries += 1;
      cancelRetry();
      timer = setTimeout(() => {
        timer = null;
        void refresh(true);
      }, delay);
    };
    function refresh(force) {
      if (inflight !== null && force !== true) return inflight;
      const settled = snapshot.status === "ready" && snapshot.data !== null && (!requireWorkspace || snapshot.data.workspace !== null);
      if (settled && force !== true) return Promise.resolve(snapshot.data);
      const generation = ++latest;
      inflight = load().then((data) => {
        if (generation !== latest) return snapshot.data;
        snapshot = { status: "ready", data, error: null };
        emit();
        scheduleRetry(data);
        return data;
      }).catch((error) => {
        if (generation !== latest) return snapshot.data;
        snapshot = { status: "error", data: snapshot.data, error };
        emit();
        return null;
      }).then((value) => {
        if (generation === latest) inflight = null;
        return value;
      });
      return inflight;
    }
    const store = {
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      get() {
        return snapshot;
      },
      refresh
    };
    stores.add(store);
    return store;
  }
  async function refreshStores() {
    await Promise.all(Array.from(stores).map((store) => store.refresh(true)));
  }
  function useSnapshot(store) {
    const React = useReact();
    return React.useSyncExternalStore(store.subscribe, store.get, store.get);
  }

  // src/client/dock/store.ts
  var stores2 = /* @__PURE__ */ new Map();
  function dockStoreFor(sessionId, hint = () => "") {
    const key = String(sessionId ?? "");
    let store = stores2.get(key);
    if (store === void 0) {
      store = createStore(
        () => call("state", sessionPayload(key, hint)),
        { requireWorkspace: true }
      );
      stores2.set(key, store);
    }
    return store;
  }

  // src/client/core/reference.ts
  function slashPath(path) {
    return String(path ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  }
  function basename(path) {
    const parts = slashPath(path).split("/").filter((part) => part !== "");
    return parts.length === 0 ? String(path ?? "") : parts[parts.length - 1];
  }
  function referenceOf(path, directory) {
    const text = slashPath(path);
    return directory ? text + "/" : text;
  }
  function atToken(reference) {
    if (reference === "" || /["\u0000-\u001f]/.test(reference)) return "";
    return /\s/.test(reference) ? '@"' + reference + '"' : "@" + reference;
  }
  function formatMention(path) {
    const token = atToken(referenceOf(path, true));
    return token === "" ? null : token;
  }
  function insertMention(inputActions, path) {
    if (inputActions === void 0 || inputActions === null) return false;
    const capture = inputActions.captureInsertion;
    const insert = inputActions.insertText;
    if (typeof capture !== "function" || typeof insert !== "function") return false;
    const token = formatMention(path);
    if (token === null) return false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const span = capture();
      if (span === void 0 || span === null) return false;
      const prefix = span.start > 0 ? " " : "";
      if (insert(prefix + token + " ", span) === true) return true;
    }
    return false;
  }

  // src/client/core/ui.ts
  function Toggle(props) {
    return h("button", {
      type: "button",
      className: "rprj-toggle",
      role: "switch",
      "aria-checked": props.checked === true,
      "aria-label": props.label,
      title: props.label,
      onClick: () => props.onChange(props.checked !== true)
    }, h("span", { className: "rprj-toggle-knob" }));
  }
  function ConfirmButton(props) {
    const React = useReact();
    const [armed, setArmed] = React.useState(false);
    React.useEffect(() => {
      if (armed !== true) return void 0;
      const timer = setTimeout(() => setArmed(false), 6e3);
      const onKey = (event) => {
        if (event.key === "Escape") setArmed(false);
      };
      window.addEventListener("keydown", onKey);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("keydown", onKey);
      };
    }, [armed]);
    if (armed === true) {
      return h(
        "span",
        { className: "rprj-confirm", role: "group" },
        h("span", { className: "rprj-confirm-text" }, props.confirmText),
        h("button", {
          type: "button",
          className: "rprj-btn rprj-btn-danger",
          autoFocus: true,
          onClick: () => {
            setArmed(false);
            props.onConfirm();
          }
        }, props.confirmLabel),
        h("button", { type: "button", className: "rprj-btn", onClick: () => setArmed(false) }, props.cancelLabel)
      );
    }
    return h("button", {
      type: "button",
      className: "rprj-btn rprj-btn-quiet rprj-btn-delete",
      title: props.title,
      onClick: () => setArmed(true)
    }, props.children);
  }
  function Spinner() {
    return h("span", { className: "rprj-spinner", "aria-hidden": true });
  }
  function describeError(t, error) {
    if (error instanceof ApiError) {
      const key = "error." + error.code;
      const text = t(key);
      if (text !== key) return text;
      return error.message === "" ? t("error.generic") : error.message;
    }
    if (error instanceof Error && error.message !== "") return error.message;
    return t("error.generic");
  }

  // src/client/dock/view.ts
  function DockRow(props) {
    const React = useReact();
    const t = withFallback(props.t, props.fallbackT ?? props.t);
    const sessionId = props.sessionId;
    const store = props.dockStore;
    const snapshot = useSnapshot(store);
    const [open, setOpen] = React.useState(false);
    const [notice, setNotice] = React.useState(null);
    React.useEffect(() => {
      void store.refresh();
    }, [store]);
    React.useEffect(() => {
      const refreshNow = () => {
        void store.refresh(true);
      };
      window.addEventListener("focus", refreshNow);
      document.addEventListener("visibilitychange", refreshNow);
      return () => {
        window.removeEventListener("focus", refreshNow);
        document.removeEventListener("visibilitychange", refreshNow);
      };
    }, [store]);
    React.useEffect(() => {
      if (open !== true) return void 0;
      const onPress = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          setOpen(false);
          return;
        }
        if (target.closest(".rprj-popover") !== null) return;
        if (target.closest(".rprj-dock-label") !== null) return;
        setOpen(false);
      };
      const onKey = (event) => {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", onPress);
      window.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onPress);
        window.removeEventListener("keydown", onKey);
      };
    }, [open]);
    const data = snapshot.data;
    if (data === null || data.workspace === null) return null;
    if (data.settings.alwaysShowDock === false) return null;
    const visible = data.projects.filter((project) => project.enabled);
    const missing = visible.filter((project) => project.exists === false).length;
    const onPick = (project) => {
      if (project.exists === false) {
        setNotice(t("panel.missing"));
        return;
      }
      const ok = insertMention(props.inputActions, project.path);
      setNotice(ok === true ? null : t("error.bad-path"));
      if (ok === true) setOpen(false);
    };
    const addViaPicker = async () => {
      setNotice(null);
      try {
        const picked = await call("pick", {});
        const path = picked.path ?? "";
        if (path === "") return;
        await call("add", sessionPayload(String(sessionId ?? ""), props.workspaceHint, { path, notify: true }));
        await store.refresh(true);
      } catch (error) {
        setNotice(describeError(t, error));
      }
    };
    if (visible.length === 0) {
      return h(
        "div",
        { className: "rprj-dock" },
        h(
          "div",
          { className: "rprj-dock-inner" },
          h("button", { type: "button", className: "rprj-dock-add", onClick: addViaPicker }, t("dock.empty")),
          notice !== null ? h("span", { className: "rprj-notice" }, notice) : null
        )
      );
    }
    return h(
      "div",
      { className: "rprj-dock" },
      h(
        "div",
        { className: "rprj-dock-inner" },
        h(
          "button",
          {
            type: "button",
            className: "rprj-dock-label",
            onClick: () => setOpen((value) => !value),
            title: t("dock.applies"),
            "aria-expanded": open === true,
            "aria-haspopup": "dialog"
          },
          h("span", null, t("dock.label", { n: visible.length })),
          missing > 0 ? h("span", { className: "rprj-chip-badge" }, "!" + String(missing)) : null,
          h("span", { className: "rprj-caret", "aria-hidden": true }, open === true ? "\u25BE" : "\u25B8")
        ),
        notice !== null ? h("span", { className: "rprj-notice" }, notice) : null
      ),
      open === true ? h(Popover, { t, projects: visible, onClose: () => setOpen(false), onPick }) : null
    );
  }
  function Popover(props) {
    const t = props.t;
    return h(
      "div",
      { className: "rprj-popover", role: "dialog", "aria-label": t("panel.title") },
      h(
        "div",
        { className: "rprj-popover-head" },
        h("span", null, t("dock.applies")),
        h("button", {
          type: "button",
          className: "rprj-icon-btn",
          onClick: props.onClose,
          "aria-label": t("common.cancel")
        }, "\xD7")
      ),
      props.projects.map((project) => h(
        "button",
        {
          key: project.id,
          type: "button",
          className: "rprj-popover-row",
          "data-missing": project.exists === false,
          title: project.exists === false ? t("panel.missing") : project.path,
          onClick: () => props.onPick(project)
        },
        h(
          "span",
          { className: "rprj-popover-line" },
          h("span", { className: "rprj-popover-name", "data-missing": project.exists === false }, project.name),
          project.exists === false ? h("span", { className: "rprj-popover-missing" }, t("panel.missing")) : null
        ),
        h("span", { className: "rprj-popover-path" }, project.path),
        project.note === "" ? null : h("span", { className: "rprj-popover-note" }, project.note)
      )),
      h("div", { className: "rprj-popover-foot", role: "note" }, t("dock.applies"))
    );
  }

  // src/client/panel/row.ts
  function ProjectRow(props) {
    const React = useReact();
    const t = props.t;
    const project = props.project;
    const [name, setName] = React.useState(project.name);
    const [note, setNote] = React.useState(project.note);
    React.useEffect(() => {
      setName(project.name);
    }, [project.name]);
    React.useEffect(() => {
      setNote(project.note);
    }, [project.note]);
    const commitName = () => {
      const next = name.trim();
      if (next === "") {
        setName(project.name);
        return;
      }
      if (next !== project.name) props.onUpdate({ name: next });
    };
    return h(
      "div",
      { className: "rprj-row", "data-missing": project.exists === false },
      h(
        "div",
        { className: "rprj-row-head" },
        h("input", {
          className: "rprj-input rprj-input-name",
          value: name,
          placeholder: t("panel.namePlaceholder"),
          disabled: props.busy,
          onChange: (event) => setName(event.target.value),
          onBlur: commitName,
          onKeyDown: (event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }
        }),
        project.origin === "agent" ? h("span", { className: "rprj-tag" }, t("panel.agentAdded")) : null,
        project.exists === false ? h("span", { className: "rprj-tag rprj-tag-error" }, t("panel.missing")) : null,
        h("span", { className: "rprj-grow" }),
        h(Toggle, {
          checked: project.enabled,
          label: t("panel.enabled"),
          onChange: (next) => props.onUpdate({ enabled: next })
        }),
        h("button", {
          type: "button",
          className: "rprj-btn rprj-btn-quiet",
          title: t("panel.open"),
          onClick: props.onOpen
        }, "\u2197"),
        h(ConfirmButton, {
          title: t("panel.delete"),
          confirmText: t("panel.deleteConfirm", { name: project.name }),
          confirmLabel: t("panel.deleteYes"),
          cancelLabel: t("common.cancel"),
          onConfirm: props.onRemove
        }, t("panel.delete"))
      ),
      h("div", { className: "rprj-row-path" }, project.path),
      h("textarea", {
        className: "rprj-textarea",
        rows: 2,
        value: note,
        placeholder: t("panel.notePlaceholder"),
        maxLength: props.noteMax,
        disabled: props.busy,
        onChange: (event) => setNote(event.target.value),
        onBlur: () => {
          if (note !== project.note) props.onUpdate({ note });
        }
      })
    );
  }

  // src/client/panel/store.ts
  var panelStore = createStore(() => call("state", {}));

  // src/client/core/types.ts
  var DEFAULT_LIMITS = { max: 10, noteMax: 200, nameMax: 60 };

  // src/client/panel/view.ts
  function Panel(props) {
    const React = useReact();
    const t = withFallback(props.t, props.fallbackT ?? props.t);
    const snapshot = useSnapshot(panelStore);
    const [expanded, setExpanded] = React.useState({});
    const [notice, setNotice] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [manual, setManual] = React.useState(null);
    React.useEffect(() => {
      void panelStore.refresh(true);
    }, []);
    const data = snapshot.data;
    const workspaces = data === null ? [] : data.workspaces;
    const copied = data === null ? [] : data.groups;
    const limits = data === null ? DEFAULT_LIMITS : data.limits;
    const run = async (task) => {
      setBusy(true);
      setNotice(null);
      try {
        await task();
        await refreshStores();
      } catch (error) {
        setNotice(describeError(t, error));
      } finally {
        setBusy(false);
      }
    };
    const pickDirectory = async () => {
      const result = await call("pick", {});
      const path = result.path ?? "";
      return path === "" ? null : path;
    };
    const openSection = (workspace) => {
      setExpanded((prev) => ({ ...prev, [workspace.key]: true }));
    };
    const addTo = (workspace) => run(async () => {
      const path = await pickDirectory();
      if (path === null) return;
      await call("add", { workspace: workspace.path, path, notify: true });
      openSection(workspace);
    });
    const submitManual = (workspace) => run(async () => {
      const text = manual === null ? "" : manual.text.trim();
      if (text === "") return;
      await call("add", { workspace: workspace.path, path: text, notify: true });
      setManual(null);
      openSection(workspace);
    });
    const update = (workspace, project, patch) => run(async () => {
      await call("update", { workspace: workspace.path, id: project.id, patch, notify: true });
    });
    const remove = (workspace, project) => run(async () => {
      await call("remove", { workspace: workspace.path, id: project.id, notify: true });
    });
    const openProject = (workspace, project) => {
      setNotice(null);
      void call("open", { workspace: workspace.path, id: project.id }).catch((error) => {
        setNotice(describeError(t, error));
      });
    };
    const copyGroup = (workspace, target) => run(async () => {
      await call("copy", { from: workspace.path, to: target, notify: true });
    });
    const toggleDock = (next) => run(async () => {
      await call("settings", { alwaysShowDock: next });
    });
    if (snapshot.status === "error" && data === null) {
      return h(
        "div",
        { className: "rprj-panel" },
        h("div", { className: "rprj-error" }, describeError(t, snapshot.error))
      );
    }
    if (data === null) {
      return h("div", { className: "rprj-panel" }, h("div", { className: "rprj-muted" }, h(Spinner), " ", t("common.loading")));
    }
    const isOpen = (workspace) => expanded[workspace.key] !== void 0 ? expanded[workspace.key] : workspace.projects.length > 0;
    const sections = workspaces.map((workspace) => {
      const open = isOpen(workspace);
      const targets = copied.filter((group) => group.key !== workspace.key);
      const head = h(
        "div",
        { className: "rprj-ws-head" },
        h("button", {
          type: "button",
          className: "rprj-ws-toggle",
          "aria-expanded": open === true,
          title: open === true ? t("panel.collapse") : t("panel.expand"),
          onClick: () => setExpanded((prev) => ({ ...prev, [workspace.key]: !open }))
        }, h("span", { className: "rprj-caret", "aria-hidden": true }, open === true ? "\u25BE" : "\u25B8")),
        h(
          "div",
          { className: "rprj-ws-id" },
          h("span", { className: "rprj-ws-name" }, workspace.title === null ? basename(workspace.path) : workspace.title),
          h("span", { className: "rprj-ws-path" }, workspace.path)
        ),
        h(
          "div",
          { className: "rprj-ws-actions" },
          h("span", { className: "rprj-ws-count" }, t("panel.rows", { n: workspace.projects.length })),
          h("button", {
            type: "button",
            className: "rprj-btn rprj-btn-primary",
            disabled: busy,
            onClick: () => {
              void addTo(workspace);
            }
          }, t("panel.addHere")),
          workspace.projects.length > 0 && targets.length > 0 ? h(
            "select",
            {
              className: "rprj-select rprj-select-copy",
              value: "",
              disabled: busy,
              title: t("panel.copyTo"),
              onChange: (event) => {
                const value = event.target.value;
                event.target.value = "";
                if (value !== "") void copyGroup(workspace, value);
              }
            },
            h("option", { value: "" }, t("panel.copyTo")),
            targets.map((group) => h("option", { key: group.key, value: group.path }, group.path))
          ) : null
        )
      );
      if (open !== true) return h("section", { className: "rprj-ws", key: workspace.key }, head);
      const manualBar = manual === null || manual.key !== workspace.key ? null : h(
        "form",
        {
          className: "rprj-bar rprj-ws-manual",
          onSubmit: (event) => {
            event.preventDefault();
            void submitManual(workspace);
          }
        },
        h("input", {
          className: "rprj-input rprj-input-grow",
          value: manual === null ? "" : manual.text,
          placeholder: t("manual.placeholder"),
          autoFocus: true,
          onChange: (event) => setManual({ key: workspace.key, text: event.target.value })
        }),
        h("button", {
          type: "submit",
          className: "rprj-btn rprj-btn-primary",
          disabled: busy || manual === null || manual.text.trim() === ""
        }, t("manual.ok")),
        h("button", { type: "button", className: "rprj-btn rprj-btn-quiet", onClick: () => setManual(null) }, t("common.cancel"))
      );
      const body = workspace.projects.length === 0 ? h(
        "div",
        { className: "rprj-empty" },
        h("p", null, t("panel.empty")),
        h("p", { className: "rprj-muted" }, t("panel.emptyHint")),
        h("button", {
          type: "button",
          className: "rprj-btn",
          onClick: () => setManual({ key: workspace.key, text: "" })
        }, t("manual.title"))
      ) : h(
        "div",
        { className: "rprj-rows" },
        workspace.projects.map((project) => h(ProjectRow, {
          key: project.id,
          t,
          project,
          busy,
          noteMax: limits.noteMax,
          onUpdate: (patch) => {
            void update(workspace, project, patch);
          },
          onRemove: () => {
            void remove(workspace, project);
          },
          onOpen: () => openProject(workspace, project)
        })),
        h("button", {
          type: "button",
          className: "rprj-btn rprj-btn-quiet rprj-row-add",
          onClick: () => setManual({ key: workspace.key, text: "" })
        }, t("manual.title"))
      );
      return h(
        "section",
        { className: "rprj-ws", key: workspace.key },
        head,
        workspace.registered !== true ? h("div", { className: "rprj-ws-warn" }, t("panel.unregistered")) : null,
        manualBar,
        body
      );
    });
    return h(
      "div",
      { className: "rprj-panel" },
      h(
        "header",
        { className: "rprj-panel-head" },
        h("h2", { className: "rprj-title" }, t("panel.title")),
        h("p", { className: "rprj-sub" }, t("panel.description"))
      ),
      notice !== null ? h("div", { className: "rprj-error" }, notice) : null,
      workspaces.length === 0 ? h("div", { className: "rprj-empty" }, h("p", null, t("panel.emptyHint"))) : h("div", { className: "rprj-ws-list" }, sections),
      h(
        "footer",
        { className: "rprj-foot rprj-muted" },
        h("span", null, t("panel.limit", { n: limits.max })),
        h("span", { className: "rprj-grow" }),
        h("span", null, t("panel.showDock")),
        h(Toggle, {
          checked: data.settings.alwaysShowDock !== false,
          label: t("panel.showDock"),
          onChange: (next) => {
            if (busy !== true) void toggleDock(next);
          }
        })
      )
    );
  }

  // src/client/panel/icon.ts
  function PanelIcon(props) {
    const size = typeof props.size === "number" ? props.size : 16;
    return h(
      "svg",
      {
        width: size,
        height: size,
        viewBox: "0 0 16 16",
        fill: "none",
        "aria-hidden": true
      },
      h("path", {
        d: "M1.5 4.2c0-.6.5-1.1 1.1-1.1h3l1.3 1.6h5.4c.6 0 1.1.5 1.1 1.1v5.9c0 .6-.5 1.1-1.1 1.1H2.6c-.6 0-1.1-.5-1.1-1.1V4.2Z",
        stroke: "currentColor",
        strokeWidth: "1.2",
        strokeLinejoin: "round"
      }),
      h("path", { d: "M9.2 6.1 6.8 9.9", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round" }),
      h("circle", { cx: "9.6", cy: "6.1", r: "1.15", fill: "currentColor" }),
      h("circle", { cx: "6.4", cy: "9.9", r: "1.15", fill: "currentColor" })
    );
  }

  // src/client/menu/query.ts
  function unquote(query) {
    const text = query.trim();
    if (text.startsWith('@"')) return text.slice(2).replace(/"$/, "");
    if (text.startsWith("@")) return text.slice(1);
    return text;
  }
  function directoryTarget(projects, query) {
    const text = unquote(query).replace(/\\/g, "/");
    const slash = text.lastIndexOf("/");
    if (slash < 0) return null;
    const head = text.slice(0, slash + 1);
    const filter = text.slice(slash + 1);
    const headLower = head.toLowerCase();
    for (const project of projects) {
      const root2 = slashPath(project.path);
      const rootLower = root2.toLowerCase();
      if (headLower === rootLower + "/" || headLower.startsWith(rootLower + "/")) {
        return { project, dir: root2 + head.slice(root2.length), filter };
      }
    }
    const first = head.split("/")[0];
    const named = projects.find((project) => project.name.toLowerCase() === first.toLowerCase());
    if (named === void 0) return null;
    const root = slashPath(named.path);
    return { project: named, dir: root + head.slice(first.length), filter };
  }
  function rankProjects(projects, query) {
    const tokens = query.toLowerCase().split(/\s+/).filter((token) => token !== "");
    if (tokens.length === 0) return projects;
    const hits = [];
    for (const project of projects) {
      const name = project.name.toLowerCase();
      const path = project.path.toLowerCase().replace(/\\/g, "/");
      const note = project.note.toLowerCase();
      let score = 0;
      let matched = true;
      for (const token of tokens) {
        const inName = name.indexOf(token);
        const inPath = path.indexOf(token);
        const inNote = note.indexOf(token);
        if (inName < 0 && inPath < 0 && inNote < 0) {
          matched = false;
          break;
        }
        if (name === token) score += 1e3;
        else if (inName === 0) score += 500;
        else if (inName > 0) score += 300;
        else if (inPath >= 0) score += 150;
        else score += 50;
      }
      if (matched === true) hits.push({ project, score });
    }
    return hits.sort((left, right) => right.score - left.score).map((hit) => hit.project);
  }

  // src/client/menu/rows.ts
  function drillValue(label, path) {
    return JSON.stringify({ kind: "directory", label, mention: referenceOf(path, true) });
  }
  function valueOf(value) {
    return JSON.stringify(value);
  }
  function parseRowValue(value) {
    if (typeof value !== "string" || value === "") return null;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed.mention !== "string" || parsed.mention === "") return null;
      return {
        kind: typeof parsed.kind === "string" ? parsed.kind : "project",
        label: typeof parsed.label === "string" && parsed.label !== "" ? parsed.label : parsed.mention,
        mention: parsed.mention
      };
    } catch {
      return null;
    }
  }
  function projectRows(projects, section) {
    return projects.map((project) => ({
      name: project.name + "/",
      description: project.note === "" ? project.path : project.path + "  \xB7  " + project.note,
      icon: "folder",
      section,
      drill: true,
      value: valueOf({ kind: "project", label: project.name, mention: referenceOf(project.path, true) })
    }));
  }
  function levelRows(hits, section) {
    return hits.map((entry) => {
      const directory = entry.kind === "directory";
      return {
        name: directory ? entry.name + "/" : entry.name,
        description: entry.rel,
        icon: directory ? "folder" : "file",
        section,
        drill: directory,
        value: valueOf({ kind: entry.kind, label: entry.name, mention: referenceOf(entry.path, directory) })
      };
    });
  }

  // src/client/menu/source.ts
  var SOURCE_KEY = "related-projects";
  var TRIGGER = "@";
  var ORDER = -10;
  var CACHE_TTL_MS = 1e4;
  function createTriggerSource(hint = () => "", t = (key) => key) {
    const cache = /* @__PURE__ */ new Map();
    const load = async (sessionId) => {
      const hit = cache.get(sessionId);
      if (hit !== void 0 && Date.now() - hit.at < CACHE_TTL_MS) return hit.projects;
      const state = await call("state", sessionPayload(sessionId, hint));
      const projects = state.projects.filter((project) => project.enabled && project.exists);
      if (state.workspace !== null) cache.set(sessionId, { at: Date.now(), projects });
      return projects;
    };
    const files = async (sessionId, query) => {
      try {
        const answer = await call("files", sessionPayload(sessionId, hint, { query }));
        return Array.isArray(answer.rows) ? answer.rows : [];
      } catch {
        return [];
      }
    };
    const list = async (sessionId, dir, filter) => {
      try {
        const answer = await call("list", sessionPayload(sessionId, hint, { dir, filter }));
        return Array.isArray(answer.rows) ? answer.rows : [];
      } catch {
        return [];
      }
    };
    return {
      trigger: TRIGGER,
      name: SOURCE_KEY,
      showGroupTitle: false,
      order: ORDER,
      async candidates(session, request) {
        let projects;
        try {
          projects = await load(session.sessionId);
        } catch {
          return [];
        }
        if (request.signal.aborted) return [];
        const query = request.query;
        const target = directoryTarget(projects, query);
        if (target !== null) {
          const rows2 = levelRows(await list(session.sessionId, target.dir, target.filter), t("menu.files"));
          return request.signal.aborted ? [] : rows2;
        }
        const rows = projectRows(rankProjects(projects, query), t("panel.title"));
        if (query.trim() !== "") {
          rows.push(...levelRows(await files(session.sessionId, query), t("menu.files")));
        }
        return request.signal.aborted ? [] : rows;
      },
      /* drill 位置的面包屑：先是项目，然后是每一级目录段。
         只在菜单确实由 drill 打开时发布，与随附源限定其 header 的方式一致。 */
      header(session, request) {
        if (request.drilled !== true) return void 0;
        const projects = cache.get(session.sessionId)?.projects ?? [];
        const target = directoryTarget(projects, request.query);
        if (target === null) return void 0;
        const root = referenceOf(target.project.path, false);
        const dir = referenceOf(target.dir, false);
        const crumbs = [
          { label: target.project.name, value: drillValue(target.project.name, root) }
        ];
        const rest = dir.slice(root.length).replace(/^\/+/, "");
        if (rest !== "") {
          const segments = rest.split("/");
          for (let index = 0; index < segments.length; index += 1) {
            const path = root + "/" + segments.slice(0, index + 1).join("/");
            crumbs.push({ label: segments[index], value: drillValue(segments[index], path) });
          }
        }
        const last = crumbs[crumbs.length - 1];
        if (last !== void 0) last.current = true;
        return crumbs;
      },
      /* 在 warm 时预取，这样会话中的第一个 `@` 不必再等一次往返。 */
      warm(session) {
        void load(session.sessionId).catch(() => void 0);
      },
      onPick(pick) {
        const payload = parseRowValue(pick.candidate.value);
        const fromDescription = (pick.candidate.description ?? "").split("  \xB7  ")[0];
        const absolute = payload?.mention ?? referenceOf(fromDescription, true);
        const name = payload?.label ?? pick.candidate.name;
        const directory = payload === null ? true : payload.kind !== "file";
        const token = atToken(absolute);
        if (directory && pick.action === "drill") return { text: token, continue: true };
        return {
          insert: {
            source: SOURCE_KEY,
            ref: absolute,
            label: directory ? name + "/" : name,
            appearance: directory ? "folder" : "file",
            clipboardText: token
          }
        };
      },
      codec: {
        /* `ref` 已经携带目录的斜杠约定，因此两个 codec 都不能再加一个：
           文件引用绝不能长出尾随斜杠。 */
        clipboardText: (ref) => atToken(ref),
        serialize: (ref) => Promise.resolve(atToken(ref))
      },
      /* 名称是草稿中纯 `@name` 文本的可着色 token。 */
      lexicon(session) {
        const hit = cache.get(session.sessionId);
        return hit === void 0 ? void 0 : hit.projects.map((project) => project.name);
      }
    };
  }

  // src/client/plugin.ts
  var PANEL_ID = "related-projects";
  var DOCK_ORDER = 60;
  var ICON_ORDER = 30;
  function createPlugin(React) {
    setReact(React);
    return {
      /* 只有 `slots` 是硬依赖：没有它就没有可挂载的东西。`locale` 和
         `inputTriggers` 走下面的 `ctx.inject` 挂接，因此晚到的服务照样能完成注册，
         而缺失时只降级对应功能（`fallbackT` 这一项保证文案仍可读）。 */
      inject: ["slots"],
      apply(ctx) {
        installStyles(ctx);
        whenProvided(ctx, ["locale"], (scoped) => {
          const locale = scoped.get("locale");
          if (locale === void 0 || locale === null || typeof locale.register !== "function") {
            warn("locale service unavailable; UI copy falls back to the bundled dictionaries");
            return;
          }
          scoped.effect(() => guarded(
            () => locale.register(NS, { zh: ZH, en: EN }),
            "locale dictionaries already registered (stale reload)"
          ), "related-projects: dictionaries");
        });
        whenProvided(ctx, ["inputTriggers"], (scoped) => {
          const triggers = scoped.get("inputTriggers");
          if (triggers === void 0 || triggers === null || typeof triggers.registerSource !== "function") {
            warn("inputTriggers service unavailable; @ menu disabled");
            return;
          }
          const hint2 = workspaceHintOf(ctx);
          scoped.effect(() => {
            const dispose = guarded(
              () => triggers.registerSource(createTriggerSource(hint2, (key, values) => translate(ctx, key, values))),
              "@ source already registered (stale reload)"
            );
            return () => {
              try {
                dispose();
              } catch {
              }
            };
          }, "related-projects: @ source");
        });
        const slots = ctx.get("slots");
        if (slots === void 0 || slots === null) return;
        const hint = workspaceHintOf(ctx);
        const fallbackT = (key, values) => translate(ctx, key, values);
        const mount = (name, options, component) => {
          ctx.effect(() => slots.inject(name, () => slots.register(
            { name, ...options },
            (props) => h(component, props)
          )), "related-projects: " + name);
        };
        mount("conversation.composer.dock", {
          id: PANEL_ID,
          order: DOCK_ORDER,
          locale: NS,
          inject: (sessionId) => ({
            dockStore: dockStoreFor(sessionId, hint),
            workspaceHint: (id) => hint(String(id ?? "")),
            /* 命名空间没有字典时框架会把 key 原样返回；这一项保证那种情况下屏幕上
               仍有可读的标签。 */
            fallbackT
          })
        }, DockRow);
        mount("sidebar.panellist", {
          id: PANEL_ID,
          order: ICON_ORDER,
          label: () => translate(ctx, "panel.title")
        }, PanelIcon);
        mount("main", {
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ fallbackT })
        }, Panel);
      }
    };
  }
  function installStyles(ctx) {
    const style = document.createElement("style");
    style.setAttribute("data-dsh-related-projects", "");
    style.textContent = CSS;
    document.head.appendChild(style);
    ctx.effect(() => () => {
      style.remove();
    }, "related-projects: styles");
  }
  function whenProvided(ctx, names, mount) {
    if (typeof ctx.inject === "function") ctx.inject(names, mount);
    else mount(ctx);
  }
  function guarded(register, duplicateMessage) {
    try {
      return register();
    } catch (error) {
      warn(duplicateMessage, error);
      return () => {
      };
    }
  }
  function warn(message, error) {
    if (error === void 0) console.warn("[related-projects] " + message);
    else console.warn("[related-projects] " + message, error);
  }

  // src/client/main.ts
  var scope = window;
  scope.__ModuleLoader__.load({
    id: "@local/dsh-related-projects",
    factory(require2) {
      return createPlugin(require2("react"));
    }
  });
})();
