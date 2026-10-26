(() => {
  // src/client/styles.ts
  var CSS = `
.dsk-root{display:flex;flex-direction:column;gap:12px;min-height:0;padding:4px 2px 24px;color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;line-height:20px}
.dsk-head{display:flex;flex-direction:column;gap:6px}
.dsk-title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsk-title{font-size:15px;font-weight:600;margin:0}
.dsk-sub{color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px;margin:0}
.dsk-badge{display:inline-flex;align-items:center;gap:4px;padding:0 6px;height:18px;border-radius:9px;font-size:11px;line-height:18px;background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-secondary,#5c6068);white-space:nowrap}
/* \u72B6\u6001\u5FBD\u7AE0\uFF1A\u4E2D\u6027\u5E95 + \u5F69\u8272\u5706\u70B9\u3002\u76F4\u63A5\u7528\u300C\u5F69\u8272\u5E95 + \u5F69\u8272\u5B57\u300D\u5728\u6DF1\u8272\u4E3B\u9898\u4E0B\u4F1A\u7CCA\u5728\u4E00\u8D77\uFF08\u5BF9\u6BD4\u5EA6\u4E0D\u591F\uFF09\u3002 */
.dsk-badge-ok,.dsk-badge-warn,.dsk-badge-off{background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-secondary,#5c6068)}
.dsk-badge-ok::before,.dsk-badge-warn::before{content:'';width:6px;height:6px;border-radius:50%;flex:none}
.dsk-badge-ok::before{background:var(--dsw-static-green-500,#2ea56a)}
.dsk-badge-warn::before{background:var(--dsw-static-amber-500,#d49245)}
.dsk-badge-off{background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-tertiary,#8a8f99)}

/* \u9875\u7B7E\u680F\uFF1A\u591A\u57DF\u5165\u53E3\uFF08\u573A\u666F / MCP / \u6280\u80FD / \u63D0\u793A\u8BCD\uFF09 */
.dsk-view{display:flex;flex-direction:column;gap:12px;min-height:0}
.dsk-tabs{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb);padding-bottom:6px;flex-wrap:wrap}
.dsk-tab{height:26px;padding:0 10px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#5c6068);font-size:12px;cursor:pointer}
.dsk-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.dsk-tab[data-active='true']{background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-primary,#1f2329);font-weight:600}
.dsk-tab-count{color:var(--dsw-alias-label-tertiary,#8a8f99);font-weight:400}

.dsk-scope{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f7f8fa)}
.dsk-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer;white-space:nowrap}
.dsk-check input{margin:0;flex:none}
/* MCP \u670D\u52A1\u5668\u90A3\u9897\u80F6\u56CA\uFF1A\u52FE\u9009\u6846\u4E0E\u6587\u5B57\u5FC5\u987B\u540C\u4E00\u6761\u57FA\u7EBF */
.dsk-file{display:inline-flex;align-items:center;gap:6px;line-height:18px}
.dsk-file input{margin:0;flex:none}
.dsk-select-inline{width:auto;min-width:220px;max-width:46ch}
.dsk-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dsk-search{flex:1 1 200px;min-width:140px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#d9dbe0);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font-size:12px}
.dsk-actions{display:flex;align-items:center;gap:6px;flex:none}
.dsk-btn{height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,#d9dbe0);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.dsk-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.dsk-btn:disabled{opacity:.5;cursor:default}
.dsk-btn-primary{background:var(--dsw-alias-button-primary-fill,#2f6bff);border-color:transparent;color:var(--dsw-alias-label-primary-inverted,#fff)}
.dsk-btn-primary:hover{background:var(--dsw-alias-button-primary-hover,#2a5fe0)}
.dsk-btn-danger{color:var(--dsw-alias-state-error-primary,#c9414a);border-color:var(--dsw-alias-border-l3,rgba(201,65,74,.4))}
.dsk-btn-danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(201,65,74,.08))}
.dsk-btn-sm{height:24px;padding:0 8px;font-size:11px}

.dsk-list{display:flex;flex-direction:column;gap:10px;min-height:0}
.dsk-group{border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#fff)}
.dsk-group-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.dsk-group-head{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb);flex-wrap:wrap}
.dsk-group-name{font-weight:600;font-size:12px;white-space:nowrap}
.dsk-group-path{width:100%;color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:11px;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:44ch;flex:1 1 180px;min-width:0}
.dsk-group-actions{margin-left:auto;display:flex;align-items:center;gap:6px;flex:none}
.dsk-rows{display:flex;flex-direction:column}
.dsk-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 10px;border-top:1px solid var(--dsw-alias-border-l2,#f0f1f3);cursor:pointer}
.dsk-row:first-child{border-top:0}
.dsk-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.04))}
.dsk-row-main{min-width:0;display:flex;flex-direction:column;gap:2px}
.dsk-row-name{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:12px;font-weight:600}
.dsk-row-desc{color:var(--dsw-alias-label-secondary,#5c6068);font-size:11.5px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dsk-row-off .dsk-row-name,.dsk-row-off .dsk-row-desc{opacity:.5}
.dsk-row-actions{display:flex;align-items:center;gap:6px}

.dsk-switch{position:relative;width:32px;height:18px;border-radius:9px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.14));background:var(--dsw-alias-bg-layer-3,#dfe1e6);cursor:pointer;flex:none;padding:0;transition:background .12s ease}
.dsk-switch::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#8a8f99);transition:transform .12s ease,background .12s ease}
.dsk-switch[data-on='true']{background:var(--dsw-alias-button-primary-fill,#2f6bff);border-color:transparent}
.dsk-switch[data-on='true']::after{transform:translateX(14px);background:var(--dsw-alias-label-primary-inverted,#fff)}
.dsk-switch:disabled{opacity:.45;cursor:default}

.dsk-panel{position:fixed;top:0;right:0;bottom:0;width:min(560px,92%);background:var(--dsw-alias-bg-layer-1,#fff);border-left:1px solid var(--dsw-alias-border-l2,#e5e6eb);box-shadow:var(--dsw-elevation-panel,-8px 0 24px rgba(0,0,0,.08));display:flex;flex-direction:column;z-index:20}
.dsk-panel-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb);flex-wrap:wrap}
.dsk-panel-title{font-weight:600;font-size:13px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsk-panel-actions{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
.dsk-panel-body{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:12px}
.dsk-kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;font-size:12px}
.dsk-kv-key{color:var(--dsw-alias-label-tertiary,#8a8f99);white-space:nowrap}
.dsk-kv-val{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);word-break:break-all}
.dsk-pre{margin:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f7f8fa);font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:11.5px;line-height:18px;white-space:pre-wrap;word-break:break-word;max-height:46vh;overflow:auto}
.dsk-files{display:flex;flex-wrap:wrap;gap:4px}
.dsk-file{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:11px;padding:1px 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,#f2f3f5)}
.dsk-section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6068);margin:0}

.dsk-modal-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(15,17,20,.35));display:flex;align-items:center;justify-content:center;z-index:30;padding:24px}
.dsk-modal{width:min(680px,96%);max-height:88%;background:var(--dsw-alias-bg-layer-1,#fff);border-radius:10px;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--dsw-elevation-prominent,0 12px 40px rgba(0,0,0,.2))}
.dsk-modal-head{display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb);font-weight:600;font-size:13px}
.dsk-modal-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px;overflow:auto}
.dsk-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l2,#e5e6eb)}
.dsk-section{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f7f8fa)}
.dsk-field{display:flex;flex-direction:column;gap:4px}
.dsk-label{font-size:12px;color:var(--dsw-alias-label-secondary,#5c6068)}
.dsk-input,.dsk-textarea,.dsk-select{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,#d9dbe0);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font-size:12px;font-family:inherit}
.dsk-textarea{min-height:180px;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);line-height:18px;resize:vertical}
.dsk-alert{padding:6px 10px;border-radius:6px;background:var(--dsw-alias-state-warn-tertiary,rgba(212,146,69,.12));color:var(--dsw-alias-state-warn-label,#8a5a1e);font-size:12px}
.dsk-alert-err{background:var(--dsw-alias-state-error-secondary,rgba(201,65,74,.1));color:var(--dsw-alias-state-error-primary,#b03a42)}
.dsk-empty{padding:14px;text-align:center;color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px}
.dsk-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:7px 14px;border-radius:16px;background:var(--dsw-alias-toast-bg,rgba(28,32,38,.92));color:var(--dsw-alias-label-primary-inverted,#fff);font-size:12px;z-index:40;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsk-trash-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px}
.dsk-trash-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f99);word-break:break-all}
.dsk-trash-actions{display:flex;gap:6px}
.dsk-muted{color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:11px}
/* \u4E3B\u680F\u9762\u677F\u7684\u5916\u58F3\uFF1A\u6302\u5728 sidebar.panellist + main \u4E0A\uFF0C\u6240\u4EE5\u6574\u5757\u5360\u6EE1\u3001\u81EA\u5DF1\u6EDA\u52A8\u3001\u81EA\u5DF1\u8D1F\u8D23\u5185\u8FB9\u8DDD
   \uFF08\u8BBE\u7F6E\u9875\u90A3\u8FB9\u7684 .dsk-root \u5185\u8FB9\u8DDD\u5728\u8FD9\u91CC\u88AB\u5F52\u96F6\uFF0C\u4E24\u5904\u590D\u7528\u540C\u4E00\u5957\u9875\u7B7E\u4E0E\u57DF\u89C6\u56FE\uFF09\u3002 */
.dsk-page{display:flex;flex-direction:column;gap:12px;padding:20px 24px;width:100%;box-sizing:border-box;min-width:0;height:100%;overflow:auto;overscroll-behavior:contain}
[data-platform=darwin] .dsk-page{padding-top:calc(20px + var(--dsh-frame-top-clearance,0px))}
.dsk-page .dsk-root{padding:0;min-height:0}
`;

  // src/client/core/runtime.ts
  var react = null;
  function setReact(value) {
    react = value;
  }
  function useReact() {
    if (react === null) throw new Error("tool-center: React was not provided by the module loader");
    return react;
  }
  var h = (type, props, ...children) => useReact().createElement(type, props, ...children);
  function useClientEffect(fn, deps) {
    useReact().useEffect(fn, deps);
  }
  function useStateOf(initial) {
    return useReact().useState(initial);
  }

  // src/client/i18n/common.ts
  var ZH_COMMON = {
    "nav.title": "\u5DE5\u5177\u4E2D\u5FC3",
    "tab.scenes": "\u573A\u666F",
    "tab.mcp": "MCP",
    "tab.skills": "\u6280\u80FD",
    "tab.prompts": "\u63D0\u793A\u8BCD",
    "common.save": "\u4FDD\u5B58",
    "common.cancel": "\u53D6\u6D88",
    "common.search": "\u641C\u7D22"
  };
  var EN_COMMON = {
    "nav.title": "Tool center",
    "tab.scenes": "Scenes",
    "tab.mcp": "MCP",
    "tab.skills": "Skills",
    "tab.prompts": "Prompts",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.search": "Search"
  };

  // src/client/i18n/skills.ts
  var ZH_SKILLS = {
    "page.subtitle": "\u6765\u6E90\u3001\u542F\u505C\u3001\u4F18\u5148\u7EA7\u4E0E\u6587\u4EF6\u64CD\u4F5C\u3002\u5F00\u5173\u53EA\u5199\u672C\u63D2\u4EF6\u81EA\u5DF1\u7684\u7B56\u7565\uFF0C\u4E0D\u6539\u6280\u80FD\u6E90\u6587\u4EF6\u3002",
    "page.loading": "\u8BFB\u53D6\u4E2D\u2026",
    "page.empty": "\u8FD9\u4E2A\u6765\u6E90\u91CC\u8FD8\u6CA1\u6709\u6280\u80FD\u3002",
    "page.noMatch": "\u6CA1\u6709\u5339\u914D\u7684\u6280\u80FD\u3002",
    "page.search": "\u641C\u7D22\u540D\u79F0\u6216\u63CF\u8FF0",
    "page.refresh": "\u5237\u65B0",
    "page.create": "\u65B0\u5EFA\u6280\u80FD",
    "page.import": "\u5BFC\u5165",
    "page.export": "\u5BFC\u51FA\u5168\u90E8",
    "page.trash": "\u56DE\u6536\u7AD9",
    "page.counts": "{total} \u4E2A\u6280\u80FD \xB7 {enabled} \u542F\u7528 \xB7 {disabled} \u505C\u7528 \xB7 {shadowed} \u88AB\u8986\u76D6",
    "page.roots": "{n} \u4E2A\u6765\u6E90",
    "page.globalScope": "\u4F5C\u7528\u57DF\uFF1A\u5168\u5C40",
    "page.scopeReserved": "\u4F1A\u8BDD/\u5DE5\u4F5C\u533A\u5C42\u6B21\u5DF2\u9884\u7559\uFF0C\u6682\u672A\u542F\u7528",
    "page.duration": "\u8BFB\u76D8 {ms} ms",
    "page.degraded": "\u72B6\u6001\u6587\u4EF6\u5DF2\u635F\u574F\uFF0C\u672C\u6B21\u6309\u9ED8\u8BA4\u503C\u7EE7\u7EED\uFF08\u539F\u6587\u4EF6\u5DF2\u5907\u4EFD\uFF09\u3002",
    "root.hostScans": "\u5BBF\u4E3B\u5DF2\u626B\u63CF",
    "root.pluginOnly": "\u63D2\u4EF6\u63A5\u7BA1",
    "root.removed": "\u5DF2\u79FB\u9664\u8BFB\u53D6",
    "root.readonly": "\u53EA\u8BFB\u76EE\u5F55",
    "root.writable": "\u53EF\u5199\u76EE\u5F55",
    "root.rank": "rank {rank}",
    "root.count": "{n} \u6761",
    "root.remove": "\u4E0D\u518D\u8BFB\u53D6",
    "root.restore": "\u6062\u590D\u8BFB\u53D6",
    "row.preferred": "\u9996\u9009",
    "row.shadowed": "\u88AB {root} \u8986\u76D6",
    "row.manualOnly": "\u4EC5\u624B\u52A8",
    "row.invalid": "\u7ED3\u6784\u4E0D\u5B8C\u6574",
    "row.nested": "\u5B50\u76EE\u5F55",
    "row.linked": "\u94FE\u63A5",
    "row.readonly": "\u53EA\u8BFB",
    "row.sourceOff": "\u6765\u6E90\u5DF2\u505C",
    "row.enabled": "\u5DF2\u542F\u7528",
    "row.disabled": "\u5DF2\u505C\u7528",
    "detail.close": "\u5173\u95ED",
    "detail.edit": "\u7F16\u8F91",
    "detail.delete": "\u5220\u9664",
    "detail.export": "\u5BFC\u51FA ZIP",
    "detail.prefer": "\u8BBE\u4E3A\u9996\u9009",
    "detail.unprefer": "\u53D6\u6D88\u9996\u9009",
    "detail.frontmatter": "frontmatter",
    "detail.files": "\u6587\u4EF6\uFF08{n}\uFF09",
    "detail.body": "\u6B63\u6587",
    "detail.path": "\u8DEF\u5F84",
    "detail.problem": "\u95EE\u9898",
    "detail.busy": "\u5904\u7406\u4E2D\u2026",
    "form.createTitle": "\u65B0\u5EFA\u6280\u80FD",
    "form.editTitle": "\u7F16\u8F91\u6280\u80FD",
    "form.name": "\u540D\u79F0\uFF08kebab-case\uFF09",
    "form.description": "\u63CF\u8FF0\uFF08\u5FC5\u586B\uFF09",
    "form.whenToUse": "\u4F55\u65F6\u4F7F\u7528\uFF08\u53EF\u9009\uFF09",
    "form.body": "\u6B63\u6587\uFF08Markdown\uFF09",
    "form.root": "\u843D\u5230\u54EA\u4E2A\u6765\u6E90",
    "form.required": "\u540D\u79F0\u4E0E\u63CF\u8FF0\u90FD\u5FC5\u987B\u586B\u5199",
    "trash.title": "\u56DE\u6536\u7AD9",
    "trash.empty": "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684\u3002",
    "trash.deletedAt": "\u5220\u9664\u4E8E {time}",
    "trash.restore": "\u6062\u590D",
    "trash.purge": "\u6C38\u4E45\u5220\u9664",
    "trash.emptyAll": "\u6E05\u7A7A\u56DE\u6536\u7AD9",
    "trash.confirmPurge": "\u6C38\u4E45\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D\uFF0C\u786E\u5B9A\u5220\u9664\u300C{name}\u300D\uFF1F",
    "trash.confirmEmpty": "\u6E05\u7A7A\u56DE\u6536\u7AD9\u4F1A\u6C38\u4E45\u5220\u9664\u5168\u90E8\u6761\u76EE\uFF0C\u786E\u5B9A\uFF1F",
    "import.title": "\u5BFC\u5165\u6280\u80FD",
    "import.root": "\u5BFC\u5165\u5230",
    "import.pathLabel": "\u672C\u5730\u76EE\u5F55\u6216 .md \u8DEF\u5F84\uFF08\u5BFC\u5165\u8BE5\u76EE\u5F55\u4E0B\u7684\u6280\u80FD\uFF09",
    "import.pathPlaceholder": "D:\\path\\to\\skills",
    "import.byPath": "\u6309\u8DEF\u5F84\u5BFC\u5165",
    "import.byZip": "\u4E0A\u4F20 ZIP",
    "import.done": "\u5BFC\u5165\u5B8C\u6210\uFF1A{imported} \u4E2A\uFF0C\u8DF3\u8FC7 {skipped} \u4E2A",
    "import.skipped": "\u8DF3\u8FC7\u7684\u6761\u76EE",
    "import.needTarget": "\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u53EF\u5199\u7684\u6765\u6E90",
    "import.close": "\u5173\u95ED",
    "toast.saved": "\u5DF2\u4FDD\u5B58",
    "toast.deleted": "\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9",
    "toast.restored": "\u5DF2\u6062\u590D",
    "toast.purged": "\u5DF2\u6C38\u4E45\u5220\u9664",
    "toast.exported": "\u5DF2\u5BFC\u51FA {name}",
    "toast.prefer": "\u5DF2\u8BBE\u4E3A\u9996\u9009",
    "toast.unprefer": "\u5DF2\u53D6\u6D88\u9996\u9009",
    "toast.rootAdded": "\u5DF2\u6DFB\u52A0\u6765\u6E90",
    "toast.rootRemoved": "\u5DF2\u79FB\u9664\u6765\u6E90\u8BB0\u5F55",
    "toast.refreshed": "\u5DF2\u5237\u65B0",
    "error.title": "\u51FA\u9519\u4E86",
    "error.network": "\u8BF7\u6C42\u6CA1\u6709\u53D1\u51FA\u53BB",
    "error.protocol": "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u975E JSON \u5185\u5BB9",
    "error.scope.reserved": "\u4F1A\u8BDD/\u5DE5\u4F5C\u533A\u5206\u5C42\u5DF2\u9884\u7559\uFF0C\u6682\u672A\u542F\u7528",
    "error.root.readonly": "\u8FD9\u4E2A\u76EE\u5F55\u662F\u53EA\u8BFB\u7684",
    "error.unknown": "\u672A\u77E5\u9519\u8BEF"
  };
  var EN_SKILLS = {
    "page.subtitle": "Roots, switches, priority and file operations. A switch writes this plugin's own policy \u2014 skill files are never modified.",
    "page.loading": "Loading\u2026",
    "page.empty": "No skills in this root yet.",
    "page.noMatch": "No skill matches.",
    "page.search": "Search name or description",
    "page.refresh": "Refresh",
    "page.create": "New skill",
    "page.import": "Import",
    "page.export": "Export all",
    "page.trash": "Trash",
    "page.counts": "{total} skills \xB7 {enabled} on \xB7 {disabled} off \xB7 {shadowed} shadowed",
    "page.roots": "{n} roots",
    "page.globalScope": "Scope: global",
    "page.scopeReserved": "Session/workspace layers are reserved but not enabled yet",
    "page.duration": "read in {ms} ms",
    "page.degraded": "The state file was unusable and defaults were used (the original is backed up).",
    "root.hostScans": "host-scanned",
    "root.pluginOnly": "plugin-managed",
    "root.removed": "not read",
    "root.readonly": "read-only",
    "root.writable": "writable",
    "root.rank": "rank {rank}",
    "root.count": "{n}",
    "root.remove": "Stop reading",
    "root.restore": "Read again",
    "row.preferred": "preferred",
    "row.shadowed": "shadowed by {root}",
    "row.manualOnly": "manual only",
    "row.invalid": "not loadable",
    "row.nested": "nested",
    "row.linked": "linked",
    "row.readonly": "read-only",
    "row.sourceOff": "source off",
    "row.enabled": "on",
    "row.disabled": "off",
    "detail.close": "Close",
    "detail.edit": "Edit",
    "detail.delete": "Delete",
    "detail.export": "Export ZIP",
    "detail.prefer": "Make preferred",
    "detail.unprefer": "Clear preferred",
    "detail.frontmatter": "frontmatter",
    "detail.files": "Files ({n})",
    "detail.body": "Body",
    "detail.path": "Path",
    "detail.problem": "Problem",
    "detail.busy": "Working\u2026",
    "form.createTitle": "New skill",
    "form.editTitle": "Edit skill",
    "form.name": "Name (kebab-case)",
    "form.description": "Description (required)",
    "form.whenToUse": "When to use (optional)",
    "form.body": "Body (Markdown)",
    "form.root": "Root",
    "form.required": "Name and description are required",
    "trash.title": "Trash",
    "trash.empty": "The trash is empty.",
    "trash.deletedAt": "Deleted {time}",
    "trash.restore": "Restore",
    "trash.purge": "Delete forever",
    "trash.emptyAll": "Empty trash",
    "trash.confirmPurge": 'This cannot be undone. Delete "{name}" forever?',
    "trash.confirmEmpty": "This deletes every trashed item forever. Continue?",
    "import.title": "Import skills",
    "import.root": "Import into",
    "import.pathLabel": "Local directory or .md path (skills inside it are imported)",
    "import.pathPlaceholder": "D:\\path\\to\\skills",
    "import.byPath": "Import by path",
    "import.byZip": "Upload ZIP",
    "import.done": "Imported {imported}, skipped {skipped}",
    "import.skipped": "Skipped",
    "import.needTarget": "Pick a writable root first",
    "import.close": "Close",
    "toast.saved": "Saved",
    "toast.deleted": "Moved to trash",
    "toast.restored": "Restored",
    "toast.purged": "Deleted forever",
    "toast.exported": "Exported {name}",
    "toast.prefer": "Preferred root set",
    "toast.unprefer": "Preferred root cleared",
    "toast.rootAdded": "Root added",
    "toast.rootRemoved": "Root record removed",
    "toast.refreshed": "Refreshed",
    "error.title": "Something went wrong",
    "error.network": "The request did not leave the browser",
    "error.protocol": "The host returned something that is not JSON",
    "error.scope.reserved": "Session/workspace layers are reserved but not enabled yet",
    "error.root.readonly": "That directory is read-only",
    "error.unknown": "Unknown error"
  };

  // src/client/i18n/prompts.ts
  var ZH_PROMPTS = {
    "prompts.title": "\u63D0\u793A\u8BCD",
    "prompts.subtitle": "\u591A\u5957\u5168\u5C40\u6307\u4EE4\uFF08AGENTS.md\uFF09\u4E00\u952E\u5207\u6362\u3002\u5E94\u7528\u4F1A\u8986\u76D6\u76EE\u6807 AGENTS.md\uFF0C\u5199\u524D\u81EA\u52A8\u5907\u4EFD\u3002",
    "prompts.effectNote": "\u8BF4\u660E\uFF1A\u5BBF\u4E3B\u6BCF\u8F6E\u90FD\u4F1A\u91CD\u65B0\u8BFB\u53D6 AGENTS.md\uFF0C\u6240\u4EE5\u542F\u7528 / \u505C\u7528 / \u6539\u6B63\u6587\u4F1A\u5F71\u54CD\u5DF2\u6709\u4F1A\u8BDD\u7684\u4E0B\u4E00\u8F6E\uFF1B\u7ED1\u5B9A\u5230\u5DE5\u4F5C\u533A\u7684\u9884\u8BBE\u53EA\u5F71\u54CD\u90A3\u4E2A\u9879\u76EE\u3002",
    "prompts.active": "\u6B63\u5728\u751F\u6548",
    "prompts.inactive": "\u672A\u542F\u7528",
    "prompts.activeCount": "{n} \u4EFD\u751F\u6548\u4E2D",
    "prompts.new": "\u65B0\u5EFA\u9884\u8BBE",
    "prompts.edit": "\u7F16\u8F91",
    "prompts.delete": "\u5220\u9664",
    "prompts.name": "\u9884\u8BBE\u540D",
    "prompts.content": "\u6B63\u6587\uFF08Markdown\uFF09",
    "prompts.empty": "\u8FD8\u6CA1\u6709\u9884\u8BBE\u3002\u65B0\u5EFA\u4E00\u4EFD\uFF0C\u628A\u5E38\u7528\u6307\u4EE4\u5199\u8FDB\u53BB\u3002",
    "prompts.scope": "\u4F5C\u7528\u8303\u56F4",
    "prompts.scopeGlobal": "\u5168\u5C40",
    "prompts.scopeWorkspace": "\u5DE5\u4F5C\u533A",
    "prompts.scopeHint": "\u9009\u5DE5\u4F5C\u533A\u65F6\uFF0C\u53EA\u5199\u90A3\u4E2A\u9879\u76EE\u7684 AGENTS.md\uFF1B\u9009\u5168\u5C40\u5219\u6BCF\u4E2A\u4F1A\u8BDD\u90FD\u8BFB\u3002",
    "prompts.scopeLockedHint": "\u4F5C\u7528\u8303\u56F4\u5728\u521B\u5EFA\u65F6\u786E\u5B9A\uFF1B\u8981\u6362\u8303\u56F4\u8BF7\u65B0\u5EFA\u4E00\u4EFD\uFF08\u6216\u5148\u505C\u7528\u518D\u6539\uFF09\u3002",
    "prompts.backups": "\u5907\u4EFD {n} \u4EFD",
    "prompts.confirmDelete": "\u5220\u9664\u9884\u8BBE\u300C{name}\u300D\uFF1F",
    "prompts.saved": "\u9884\u8BBE\u5DF2\u4FDD\u5B58",
    "prompts.enabledMsg": "\u5DF2\u542F\u7528\u300C{name}\u300D",
    "prompts.disabledMsg": "\u5DF2\u505C\u7528\u300C{name}\u300D",
    "prompts.replaced": "\u540C\u4E00\u76EE\u6807\u4E0A\u7684\u300C{name}\u300D\u5DF2\u81EA\u52A8\u505C\u7528",
    "prompts.driftShort": "\u5DF2\u88AB\u5916\u90E8\u6539\u52A8",
    "prompts.enable": "\u542F\u7528",
    "prompts.disable": "\u505C\u7528",
    "prompts.appliedTargets": "\u751F\u6548\u4E2D\u7684\u76EE\u6807"
  };
  var EN_PROMPTS = {
    "prompts.title": "Prompts",
    "prompts.subtitle": "Switch between several instruction sets (AGENTS.md). Applying overwrites the target AGENTS.md after a backup.",
    "prompts.effectNote": "Note: the host re-reads AGENTS.md every turn, so enabling / disabling / editing affects existing sessions from their next turn. A preset bound to a workspace only affects that project.",
    "prompts.active": "applied",
    "prompts.inactive": "off",
    "prompts.activeCount": "{n} applied",
    "prompts.new": "New preset",
    "prompts.edit": "Edit",
    "prompts.delete": "Delete",
    "prompts.name": "Preset name",
    "prompts.content": "Body (Markdown)",
    "prompts.empty": "No presets yet. Create one and put your standing instructions in it.",
    "prompts.scope": "Scope",
    "prompts.scopeGlobal": "global",
    "prompts.scopeWorkspace": "workspace",
    "prompts.scopeHint": "A workspace writes only that project AGENTS.md; global is read by every session.",
    "prompts.scopeLockedHint": "The scope is fixed when created; create a new preset to use another scope (or disable this one first).",
    "prompts.backups": "{n} backups",
    "prompts.confirmDelete": 'Delete preset "{name}"?',
    "prompts.saved": "Preset saved",
    "prompts.enabledMsg": 'Enabled "{name}"',
    "prompts.disabledMsg": 'Disabled "{name}"',
    "prompts.replaced": '"{name}" on the same target was disabled automatically',
    "prompts.driftShort": "edited outside",
    "prompts.enable": "Enable",
    "prompts.disable": "Disable",
    "prompts.appliedTargets": "Applied targets"
  };

  // src/client/i18n/mcp.ts
  var ZH_MCP = {
    "mcp.title": "MCP \u670D\u52A1\u5668",
    "mcp.subtitle": "\u8BFB\u53D6 cordis.patch.yml \u91CC\u7684 MCP \u670D\u52A1\u5668\u3002\u542F\u505C\u5199\u6210\u6587\u4EF6\u672B\u5C3E\u7684\u8986\u76D6\u884C\uFF0C\u4E0D\u6539\u4F60\u539F\u6765\u90A3\u6761\u58F0\u660E\uFF1B\u4EFB\u4F55\u5199\u5165\u524D\u90FD\u5148\u5907\u4EFD\u3002",
    "mcp.noPatch": "\u8FD8\u6CA1\u6709 cordis.patch.yml\uFF0C\u5148\u5728 DSH \u914D\u7F6E\u91CC\u52A0\u4E00\u53F0\u670D\u52A1\u5668\u3002",
    "mcp.empty": "\u8FD9\u4E2A patch \u6587\u4EF6\u91CC\u6CA1\u6709 MCP \u670D\u52A1\u5668\u884C\u3002",
    "mcp.enabled": "\u5DF2\u542F\u7528",
    "mcp.disabled": "\u5DF2\u505C\u7528",
    "mcp.patchPath": "\u8865\u4E01\u6587\u4EF6",
    "mcp.servers": "{n} \u53F0",
    "mcp.backups": "\u5907\u4EFD {n} \u4EFD",
    "mcp.args": "\u53C2\u6570",
    "mcp.delete": "\u5220\u9664",
    "mcp.confirmDelete": "\u4ECE cordis.patch.yml \u91CC\u5220\u6389\u670D\u52A1\u5668\u300C{name}\u300D\uFF1F\u4F1A\u5148\u5907\u4EFD\u3002",
    "mcp.overridden": "\u7531\u672C\u63D2\u4EF6\u8986\u76D6",
    "mcp.toggled": "\u300C{name}\u300D\u5DF2{state}"
  };
  var EN_MCP = {
    "mcp.title": "MCP servers",
    "mcp.subtitle": "Reads the MCP servers in cordis.patch.yml. Switches are written as an override at the end of the file; your declaration is untouched and every write is backed up first.",
    "mcp.noPatch": "No cordis.patch.yml yet \u2014 add a server in the DSH config first.",
    "mcp.empty": "No MCP server rows in this patch file.",
    "mcp.enabled": "enabled",
    "mcp.disabled": "disabled",
    "mcp.patchPath": "Patch file",
    "mcp.servers": "{n} servers",
    "mcp.backups": "{n} backups",
    "mcp.args": "Args",
    "mcp.delete": "Delete",
    "mcp.confirmDelete": 'Remove server "{name}" from cordis.patch.yml? A backup is written first.',
    "mcp.overridden": "overridden by this plugin",
    "mcp.toggled": '"{name}" is now {state}'
  };

  // src/client/i18n/scenes.ts
  var ZH_SCENES = {
    "scenes.title": "\u573A\u666F",
    "scenes.subtitle": "\u4E00\u4E2A\u573A\u666F = \u4E00\u7EC4\u8981\u542F\u7528\u7684 MCP \u670D\u52A1\u5668 + \u4E00\u6279\u8981\u542F\u7528\u7684\u6280\u80FD + \u4E00\u4EFD\u63D0\u793A\u8BCD\u9884\u8BBE\u3002\u5207\u6362\u573A\u666F\u4F1A\u5148\u56DE\u6EDA\u4E0A\u4E00\u4E2A\u573A\u666F\u52A8\u8FC7\u7684\u4E1C\u897F\u3002",
    "scenes.empty": "\u8FD8\u6CA1\u6709\u573A\u666F\u3002\u65B0\u5EFA\u4E00\u4E2A\uFF0C\u628A\u4E09\u6837\u62E8\u5230\u4E00\u8D77\u3002",
    "scenes.active": "\u751F\u6548\u4E2D",
    "scenes.apply": "\u8FDB\u5165\u573A\u666F",
    "scenes.exit": "\u9000\u51FA\u573A\u666F",
    "scenes.new": "\u65B0\u5EFA\u573A\u666F",
    "scenes.edit": "\u7F16\u8F91",
    "scenes.delete": "\u5220\u9664",
    "scenes.name": "\u573A\u666F\u540D",
    "scenes.description": "\u8BF4\u660E\uFF08\u53EF\u9009\uFF09",
    "scenes.behaviourTitle": "\u8FDB\u5165\u8FD9\u4E2A\u573A\u666F\u4F1A\u53D1\u751F\u4EC0\u4E48",
    "scenes.exclusive": "\u6574\u5957\u5207\u6362",
    "scenes.exclusiveOn": "\u672A\u52FE\u9009\u7684\u6280\u80FD\u4E0E MCP \u670D\u52A1\u5668\u4F1A\u88AB\u5173\u6389\uFF08\u6574\u5957\u5207\u6362\uFF09\u3002",
    "scenes.exclusiveOff": "\u53EA\u542F\u7528\u52FE\u9009\u7684\uFF1B\u5176\u5B83\u4FDD\u6301\u73B0\u72B6\uFF0C\u4E0D\u52A8\u3002",
    "scenes.pickTitle": "\u573A\u666F\u542F\u7528\u54EA\u4E9B",
    "scenes.skills": "\u8981\u542F\u7528\u7684\u6280\u80FD",
    "scenes.mcp": "\u8981\u542F\u7528\u7684 MCP \u670D\u52A1\u5668",
    "scenes.prompt": "\u5E94\u7528\u8FD9\u4EFD\u63D0\u793A\u8BCD",
    "scenes.promptNone": "\u4E0D\u6539\u53D8\u63D0\u793A\u8BCD",
    "scenes.promptScopeFromPreset": "\u4F5C\u7528\u8303\u56F4\u7531\u8FD9\u4EFD\u9884\u8BBE\u81EA\u5DF1\u51B3\u5B9A\uFF08\u5168\u5C40\u6216\u67D0\u4E2A\u5DE5\u4F5C\u533A\uFF09\u3002",
    "scenes.noSkills": "\u6CA1\u6709\u53EF\u9009\u7684\u6280\u80FD",
    "scenes.noMcp": "\u6CA1\u6709\u53EF\u9009\u7684\u670D\u52A1\u5668",
    "scenes.count.skills": "\u6280\u80FD {n}",
    "scenes.count.mcp": "MCP {n}",
    "scenes.confirmDelete": "\u5220\u9664\u573A\u666F\u300C{name}\u300D\uFF1F",
    "scenes.applied": "\u5DF2\u8FDB\u5165\u300C{name}\u300D",
    "scenes.exited": "\u5DF2\u9000\u51FA\u573A\u666F"
  };
  var EN_SCENES = {
    "scenes.title": "Scenes",
    "scenes.subtitle": "A scene = a set of MCP servers to enable + skills to enable + one prompt preset. Switching scenes first rolls back what the previous scene changed.",
    "scenes.empty": "No scenes yet. Create one to tie the three together.",
    "scenes.active": "active",
    "scenes.apply": "Enter scene",
    "scenes.exit": "Leave scene",
    "scenes.new": "New scene",
    "scenes.edit": "Edit",
    "scenes.delete": "Delete",
    "scenes.name": "Scene name",
    "scenes.description": "Note (optional)",
    "scenes.behaviourTitle": "What entering this scene does",
    "scenes.exclusive": "Full switch",
    "scenes.exclusiveOn": "Skills and MCP servers that are not ticked get switched off (full switch).",
    "scenes.exclusiveOff": "Only enable what is ticked; leave everything else as it is.",
    "scenes.pickTitle": "What this scene enables",
    "scenes.skills": "Skills to enable",
    "scenes.mcp": "MCP servers to enable",
    "scenes.prompt": "Apply this prompt",
    "scenes.promptNone": "Leave prompts alone",
    "scenes.promptScopeFromPreset": "The scope comes from that preset itself (global or a workspace).",
    "scenes.noSkills": "No skills to pick",
    "scenes.noMcp": "No servers to pick",
    "scenes.count.skills": "skills {n}",
    "scenes.count.mcp": "MCP {n}",
    "scenes.confirmDelete": 'Delete scene "{name}"?',
    "scenes.applied": 'Entered "{name}"',
    "scenes.exited": "Left the scene"
  };

  // src/client/i18n/index.ts
  var NS = "tool-center";
  var ZH = {
    ...ZH_COMMON,
    ...ZH_SKILLS,
    ...ZH_PROMPTS,
    ...ZH_MCP,
    ...ZH_SCENES
  };
  var EN = {
    ...EN_COMMON,
    ...EN_SKILLS,
    ...EN_PROMPTS,
    ...EN_MCP,
    ...EN_SCENES
  };
  function translateWith(dict, key, values) {
    const template = dict[key];
    if (template === void 0) return key;
    if (values === void 0) return template;
    return template.replace(/\{(\w+)\}/g, (_all, name) => {
      const value = values[name];
      return value === void 0 ? `{${name}}` : String(value);
    });
  }
  function dictionaryFor(active) {
    return String(active ?? "").toLowerCase().startsWith("zh") ? ZH : EN;
  }
  function dictionaries() {
    return { zh: ZH, en: EN };
  }

  // src/client/core/api.ts
  var PLUGIN_ID = "tool-center";
  function endpoint() {
    return new URL("tool-center/api", document.baseURI).toString();
  }
  async function callOp(op, args = {}) {
    let response;
    try {
      response = await fetch(endpoint(), {
        method: "POST",
        headers: { "content-type": "application/json", "x-dsh-plugin": PLUGIN_ID },
        body: JSON.stringify({ op, args }),
        credentials: "same-origin"
      });
    } catch (cause) {
      throw opError(`\u8BF7\u6C42\u6CA1\u6709\u53D1\u51FA\u53BB\uFF1A${describeCause(cause)}`, "error.network");
    }
    const text = await response.text();
    let payload;
    try {
      payload = text === "" ? {} : JSON.parse(text);
    } catch {
      throw opError(`\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u975E JSON \u5185\u5BB9\uFF08HTTP ${response.status}\uFF09`, "error.protocol");
    }
    if (payload.ok === false) {
      const message = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
      throw opError(message, typeof payload.code === "string" ? payload.code : void 0, payload.params);
    }
    if (!response.ok) throw opError(`HTTP ${response.status}`, "error.http");
    return payload.data;
  }
  function describeCause(cause) {
    return String(cause?.message ?? cause);
  }
  function opError(message, code, params) {
    const error = new Error(message);
    error.code = code;
    if (params !== void 0) error.params = params;
    return error;
  }
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25"));
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(file);
    });
  }
  function downloadBase64(filename, base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2e3);
  }

  // src/client/core/domain.ts
  function failureOf(cause) {
    const candidate = cause;
    return { message: describeCause(cause), code: typeof candidate?.code === "string" ? candidate.code : void 0 };
  }
  function useDomain(op, notify) {
    const [state, setState] = useStateOf(null);
    const [busy, setBusy] = useStateOf("");
    const [error, setError] = useStateOf(null);
    const reload = async (options = {}) => {
      if (options.silent !== true) setBusy(op);
      try {
        const next = await callOp(op, {});
        setState(next);
        setError(null);
        return next;
      } catch (cause) {
        setError(failureOf(cause));
        return null;
      } finally {
        if (options.silent !== true) setBusy("");
      }
    };
    useClientEffect(() => {
      void reload();
    }, []);
    const act = async (action, args, notice) => {
      setBusy(action);
      setError(null);
      try {
        const result = await callOp(action, args);
        await reload({ silent: true });
        const message = typeof notice === "function" ? notice(result) : notice ?? "";
        if (message !== "") notify(message);
        return { ok: true, result };
      } catch (cause) {
        setError(failureOf(cause));
        return { ok: false };
      } finally {
        setBusy("");
      }
    };
    const fail = (message) => setError({ message });
    return { state, busy, error, reload, act, fail };
  }
  function noticeWithWarnings(message, result) {
    const warnings = result?.warnings;
    if (!Array.isArray(warnings) || warnings.length === 0) return message;
    return `${message} \xB7 ${warnings.join(" \xB7 ")}`;
  }

  // src/client/core/ui.ts
  function badgeOf(text, kind, title) {
    const className = kind === void 0 ? "dsk-badge" : `dsk-badge dsk-badge-${kind}`;
    return h("span", title === void 0 ? { className } : { className, title }, text);
  }
  function alertOf(text, kind) {
    return h("div", { className: kind === "err" ? "dsk-alert dsk-alert-err" : "dsk-alert" }, text);
  }
  function emptyOf(text) {
    return h("div", { className: "dsk-empty" }, text);
  }
  function mutedOf(text) {
    return h("div", { className: "dsk-muted" }, text);
  }
  function headOf(spec) {
    return h(
      "div",
      { className: "dsk-head" },
      h(
        "div",
        { className: "dsk-title-row" },
        h("h3", { className: "dsk-title" }, spec.title),
        ...spec.badges ?? []
      ),
      spec.subtitle === void 0 ? null : h("p", { className: "dsk-sub" }, spec.subtitle),
      spec.muted === void 0 ? null : h("p", { className: "dsk-muted" }, spec.muted),
      ...spec.alerts ?? []
    );
  }
  function toolbarOf(children) {
    return h("div", { className: "dsk-toolbar" }, ...children);
  }
  function actionsOf(children) {
    return h("div", { className: "dsk-actions" }, ...children);
  }
  function listOf(children) {
    return h("div", { className: "dsk-list" }, ...children);
  }
  function groupOf(key, head, children) {
    return h("div", { className: "dsk-group", key }, h("div", { className: "dsk-group-head" }, ...head), ...children);
  }
  function groupLineOf(name, badges, actions) {
    return h(
      "div",
      { className: "dsk-group-line" },
      h("span", { className: "dsk-group-name" }, name),
      ...badges,
      actions
    );
  }
  function groupPathOf(text, title) {
    return h("div", { className: "dsk-group-path", title: title ?? text }, text);
  }
  function groupActionsOf(children) {
    return h("div", { className: "dsk-group-actions" }, ...children);
  }
  function buttonOf(spec) {
    const classes = ["dsk-btn"];
    if (spec.small === true) classes.push("dsk-btn-sm");
    if (spec.variant === "primary") classes.push("dsk-btn-primary");
    if (spec.variant === "danger") classes.push("dsk-btn-danger");
    const props = { className: classes.join(" "), onClick: spec.onClick };
    if (spec.disabled !== void 0) props.disabled = spec.disabled;
    if (spec.title !== void 0) props.title = spec.title;
    return h("button", props, spec.label);
  }
  function switchOf(spec) {
    const props = {
      className: "dsk-switch",
      "data-on": String(spec.on),
      onClick: spec.stopPropagation === true ? (event) => {
        event.stopPropagation();
        spec.onClick();
      } : spec.onClick
    };
    if (spec.title !== void 0) props.title = spec.title;
    if (spec.disabled !== void 0) props.disabled = spec.disabled;
    return h("button", props);
  }
  function fieldOf(label, control) {
    return h(
      "div",
      { className: "dsk-field" },
      h("label", { className: "dsk-label" }, label),
      control
    );
  }
  function inputOf(spec) {
    const props = {
      className: spec.className ?? "dsk-input",
      value: spec.value,
      onChange: (event) => spec.onChange(event.target.value)
    };
    if (spec.placeholder !== void 0) props.placeholder = spec.placeholder;
    if (spec.disabled !== void 0) props.disabled = spec.disabled;
    return h("input", props);
  }
  function textAreaOf(spec) {
    return h("textarea", {
      className: "dsk-textarea",
      value: spec.value,
      onChange: (event) => spec.onChange(event.target.value)
    });
  }
  function selectOf(spec) {
    const props = {
      className: "dsk-select",
      value: spec.value,
      onChange: (event) => spec.onChange(event.target.value)
    };
    if (spec.disabled !== void 0) props.disabled = spec.disabled;
    return h("select", props, spec.options.map((option) => h("option", { value: option.value, key: option.value }, option.label)));
  }
  function modalOf(title, body, foot) {
    return h(
      "div",
      { className: "dsk-modal-mask" },
      h(
        "div",
        { className: "dsk-modal" },
        h("div", { className: "dsk-modal-head" }, title),
        h("div", { className: "dsk-modal-body" }, ...body),
        h("div", { className: "dsk-modal-foot" }, ...foot)
      )
    );
  }
  function errorAlertOf(t, failure) {
    const text = failure.code === void 0 ? failure.message : translateCode(t, failure.code, failure.message);
    return alertOf(`${t("error.title")}\uFF1A${text}`, "err");
  }
  function translateCode(t, code, fallback) {
    const translated = t(code);
    return translated === code ? fallback : translated;
  }

  // src/client/skills/list.ts
  function renderRoot(t, root, handlers) {
    const actions = groupActionsOf([
      root.toggleable && root.project !== true ? switchOf({
        on: root.enabled,
        title: root.enabled ? t("row.enabled") : t("row.disabled"),
        disabled: handlers.busy !== "",
        onClick: () => handlers.onToggleSource(!root.enabled)
      }) : null,
      removableRoot(root) ? buttonOf({
        label: t("root.remove"),
        small: true,
        disabled: handlers.busy !== "",
        onClick: () => handlers.onToggleRemoved(true)
      }) : null
    ]);
    if (root.removed && root.skills.length === 0) {
      return groupOf(root.key, [
        h("span", { className: "dsk-group-name" }, root.label),
        badgeOf(t("root.removed"), "off"),
        badgeOf(t("root.rank", { rank: root.rank }), "off"),
        groupActionsOf([buttonOf({
          label: t("root.restore"),
          small: true,
          onClick: () => handlers.onToggleRemoved(false)
        })])
      ], []);
    }
    return groupOf(root.key, [
      // 第一行：名字 + 徽章 + 操作；路径单独一行 —— 路径一长就把按钮挤到第二行，看着像错位。
      groupLineOf(root.label, [
        badgeOf(root.hostScans ? t("root.hostScans") : t("root.pluginOnly"), root.hostScans ? "ok" : void 0),
        badgeOf(t("root.rank", { rank: root.rank }), "off"),
        badgeOf(t("root.count", { n: root.skills.length }), "off"),
        root.writable ? badgeOf(t("root.writable"), "ok") : badgeOf(t("root.readonly"), "off")
      ], actions),
      groupPathOf(root.path)
    ], [
      root.error === void 0 ? null : h("div", { className: "dsk-alert dsk-alert-err" }, root.error),
      handlers.rows.length === 0 ? emptyOf(root.skills.length === 0 ? t("page.empty") : t("page.noMatch")) : h("div", { className: "dsk-rows" }, handlers.rows.map((row) => renderRow(t, row, root, handlers)))
    ]);
  }
  function removableRoot(root) {
    return root.kind !== "local" && root.kind !== "import" && root.project !== true;
  }
  function renderRow(t, row, root, handlers) {
    const on = row.policy.modelInvocable;
    const marks = [];
    if (row.preferred) marks.push(badgeOf(t("row.preferred"), "ok"));
    if (row.shadowed) marks.push(badgeOf(t("row.shadowed", { root: row.shadowedBy?.rootLabel ?? "?" }), "warn"));
    if (!row.policy.rootOn) marks.push(badgeOf(t("row.sourceOff"), "off"));
    if (row.loadable === false) marks.push(badgeOf(t("row.invalid"), "warn", row.problem ?? ""));
    if (row.loadable && row.policy.skillOn && !row.declaresModelInvocable) marks.push(badgeOf(t("row.manualOnly"), "off"));
    if (row.nested) marks.push(badgeOf(t("row.nested"), "off"));
    if (row.linked) marks.push(badgeOf(t("row.linked"), "off"));
    if (root.writable === false) marks.push(badgeOf(t("row.readonly"), "off"));
    return h(
      "div",
      {
        className: "dsk-row" + (on ? "" : " dsk-row-off"),
        key: row.rootKey + "/" + row.name,
        onClick: () => handlers.onOpen(row)
      },
      h(
        "div",
        { className: "dsk-row-main" },
        h("div", { className: "dsk-row-name" }, row.declaredName, ...marks),
        h("div", { className: "dsk-row-desc" }, row.description === "" ? "\u2014" : row.description)
      ),
      h(
        "div",
        { className: "dsk-row-actions" },
        switchOf({
          on,
          title: on ? t("row.enabled") : t("row.disabled"),
          disabled: handlers.busy !== "" || row.loadable === false || row.shadowed,
          stopPropagation: true,
          onClick: () => handlers.onToggleSkill(row, !on)
        })
      )
    );
  }

  // src/client/skills/detail.ts
  function renderDetail(t, props) {
    const row = props.detail?.row;
    const disabled = props.busy !== "";
    const action = (label, onClick, danger = false) => buttonOf({
      label,
      small: true,
      disabled,
      variant: danger ? "danger" : void 0,
      onClick
    });
    return h(
      "div",
      { className: "dsk-panel" },
      h(
        "div",
        { className: "dsk-panel-head" },
        h("h4", { className: "dsk-panel-title" }, row?.declaredName ?? props.selected.name),
        h(
          "div",
          { className: "dsk-panel-actions" },
          row !== void 0 && row.rootWritable ? action(t("detail.edit"), props.onEdit) : null,
          row !== void 0 ? action(row.preferred ? t("detail.unprefer") : t("detail.prefer"), () => props.onPrefer(row.preferred !== true)) : null,
          row !== void 0 ? action(t("detail.export"), props.onExport) : null,
          row !== void 0 && row.rootWritable ? action(t("detail.delete"), props.onDelete, true) : null,
          buttonOf({ label: t("detail.close"), small: true, onClick: props.onClose })
        )
      ),
      h(
        "div",
        { className: "dsk-panel-body" },
        ...props.detail === null ? [emptyOf(t("detail.busy"))] : bodyOf(t, props.detail)
      )
    );
  }
  function bodyOf(t, detail) {
    const row = detail.row;
    return [
      h(
        "div",
        { className: "dsk-kv" },
        h("span", { className: "dsk-kv-key" }, t("detail.path")),
        h("span", { className: "dsk-kv-val" }, row.docPath),
        h("span", { className: "dsk-kv-key" }, "root"),
        h("span", { className: "dsk-kv-val" }, `${row.rootKey} \xB7 rank ${row.rootRank}`)
      ),
      row.problem === void 0 ? null : alertOf(`${t("detail.problem")}\uFF1A${row.problem}`),
      row.whenToUse === void 0 ? null : h(
        "div",
        null,
        h("p", { className: "dsk-section-title" }, "whenToUse"),
        h("div", { className: "dsk-row-desc" }, row.whenToUse)
      ),
      h(
        "div",
        null,
        h("p", { className: "dsk-section-title" }, t("detail.frontmatter")),
        h("pre", { className: "dsk-pre" }, JSON.stringify(detail.frontmatter, null, 2))
      ),
      h(
        "div",
        null,
        h("p", { className: "dsk-section-title" }, t("detail.files", { n: detail.files.length })),
        h("div", { className: "dsk-files" }, detail.files.slice(0, 60).map((file) => h("span", { className: "dsk-file", key: file }, file)))
      ),
      h(
        "div",
        null,
        h("p", { className: "dsk-section-title" }, t("detail.body")),
        h("pre", { className: "dsk-pre" }, detail.body)
      )
    ];
  }

  // src/client/skills/form.ts
  function renderForm(t, props) {
    const form = props.form;
    const create = form.mode === "create";
    return modalOf(
      create ? t("form.createTitle") : t("form.editTitle"),
      [
        create ? fieldOf(t("form.root"), selectOf({
          value: form.root,
          onChange: (root) => props.onChange({ root }),
          options: props.roots.map((root) => ({ value: root.key, label: `${root.label} (${root.key})` }))
        })) : null,
        fieldOf(t("form.name"), inputOf({
          value: form.name,
          placeholder: "my-skill",
          disabled: !create,
          onChange: (name) => props.onChange({ name })
        })),
        fieldOf(t("form.description"), inputOf({
          value: form.description,
          onChange: (description) => props.onChange({ description })
        })),
        fieldOf(t("form.whenToUse"), inputOf({
          value: form.whenToUse,
          onChange: (whenToUse) => props.onChange({ whenToUse })
        })),
        fieldOf(t("form.body"), textAreaOf({
          value: form.body,
          onChange: (body) => props.onChange({ body })
        }))
      ],
      [
        buttonOf({ label: t("common.cancel"), onClick: props.onCancel }),
        buttonOf({ label: t("common.save"), variant: "primary", disabled: props.busy !== "", onClick: props.onSave })
      ]
    );
  }

  // src/client/skills/import.ts
  function renderImport(t, props) {
    const state = props.state;
    const body = [];
    if (props.roots.length === 0) {
      body.push(alertOf(t("import.needTarget")));
    } else {
      body.push(
        fieldOf(t("import.root"), selectOf({
          value: state.root,
          onChange: (root) => props.onChange({ root }),
          options: props.roots.map((root) => ({ value: root.key, label: root.label }))
        })),
        fieldOf(t("import.pathLabel"), h(
          "div",
          { className: "dsk-toolbar" },
          inputOf({
            value: state.path,
            placeholder: t("import.pathPlaceholder"),
            onChange: (path) => props.onChange({ path })
          }),
          buttonOf({ label: t("import.byPath"), disabled: props.busy !== "", onClick: props.onImportPath })
        )),
        fieldOf(t("import.byZip"), h("input", {
          className: "dsk-input",
          type: "file",
          accept: ".zip",
          onChange: (event) => {
            const file = event.target.files?.[0];
            if (file !== void 0) props.onImportZip(file);
          }
        }))
      );
    }
    if (state.result !== null) {
      body.push(h(
        "div",
        null,
        badgeOf(t("import.done", { imported: state.result.imported.length, skipped: state.result.skipped.length }), "ok"),
        state.result.skipped.length > 0 ? h(
          "div",
          null,
          h("p", { className: "dsk-section-title" }, t("import.skipped")),
          h("pre", { className: "dsk-pre" }, state.result.skipped.map((item) => `${item.name} \u2014 ${item.reason}`).join("\n"))
        ) : null
      ));
    }
    return modalOf(t("import.title"), body, [
      buttonOf({ label: t("import.close"), onClick: props.onClose })
    ]);
  }

  // src/client/skills/trash.ts
  function renderTrash(t, props) {
    const disabled = props.busy !== "";
    return modalOf(
      t("trash.title"),
      props.items.length === 0 ? [emptyOf(t("trash.empty"))] : props.items.map((item) => h(
        "div",
        { className: "dsk-trash-item", key: item.id },
        h(
          "div",
          null,
          h("div", { className: "dsk-row-name" }, item.declaredName),
          h(
            "div",
            { className: "dsk-trash-meta" },
            `${item.rootLabel} \xB7 ${t("trash.deletedAt", { time: new Date(item.deletedAt).toLocaleString() })}`
          ),
          h("div", { className: "dsk-trash-meta" }, item.originalPath)
        ),
        h(
          "div",
          { className: "dsk-trash-actions" },
          buttonOf({ label: t("trash.restore"), small: true, disabled, onClick: () => props.onRestore(item) }),
          buttonOf({ label: t("trash.purge"), small: true, variant: "danger", disabled, onClick: () => props.onPurge(item) })
        )
      )),
      [
        props.items.length > 0 ? buttonOf({ label: t("trash.emptyAll"), variant: "danger", disabled, onClick: props.onEmpty }) : null,
        buttonOf({ label: t("detail.close"), onClick: props.onClose })
      ]
    );
  }

  // src/client/skills/view.ts
  function writableRoots(view) {
    return (view?.roots ?? []).filter((root) => root.writable && !root.removed);
  }
  function SkillsView(props) {
    const t = props.t;
    const domain = useDomain("state", props.notify);
    const view = domain.state;
    const busy = domain.busy;
    const [query, setQuery] = useStateOf("");
    const [selected, setSelected] = useStateOf(null);
    const [detail, setDetail] = useStateOf(null);
    const [trash, setTrash] = useStateOf(null);
    const [form, setForm] = useStateOf(null);
    const [importing, setImporting] = useStateOf(null);
    const [health, setHealth] = useStateOf(null);
    useClientEffect(() => {
      void callOp("health", {}).then((value) => setHealth(value)).catch(() => void 0);
    }, []);
    const openDetail = async (root, name) => {
      setSelected({ root, name });
      setDetail(null);
      try {
        setDetail(await callOp("detail", { root, name }));
      } catch (cause) {
        domain.fail(String(cause?.message ?? cause));
      }
    };
    const closeDetail = () => {
      setSelected(null);
      setDetail(null);
    };
    const openTrash = async () => {
      try {
        const value = await callOp("trash-list", {});
        setTrash(value.items);
      } catch (cause) {
        domain.fail(String(cause?.message ?? cause));
      }
    };
    const visibleRows = (root) => {
      const needle = query.trim().toLowerCase();
      if (needle === "") return root.skills;
      return root.skills.filter((row) => row.declaredName.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle));
    };
    const exportSelection = async (items) => {
      try {
        const result = await callOp(
          "export-zip",
          items === void 0 ? {} : { items }
        );
        downloadBase64(result.filename, result.base64);
        props.notify(t("toast.exported", { name: result.filename }));
      } catch (cause) {
        domain.fail(String(cause?.message ?? cause));
      }
    };
    const counts = view?.counts;
    const warnings = view?.warnings ?? [];
    const badges = [];
    if (counts !== void 0) {
      badges.push(badgeOf(t("page.counts", {
        total: counts.total,
        enabled: counts.enabled,
        disabled: counts.disabled,
        shadowed: counts.shadowed
      })));
      badges.push(badgeOf(t("page.roots", { n: counts.sources })));
    }
    badges.push(badgeOf(t("page.globalScope"), "off", t("page.scopeReserved")));
    if (view !== null) badges.push(badgeOf(t("page.duration", { ms: view.durationMs }), "off"));
    if (health !== null) badges.push(badgeOf("v" + health.version, "off"));
    const alerts = [];
    if (view !== null && view.stateHealthy === false) alerts.push(alertOf(t("page.degraded")));
    if (warnings.length > 0) alerts.push(alertOf(warnings.join(" \xB7 ")));
    if (domain.error !== null) alerts.push(errorAlertOf(t, domain.error));
    return h(
      "div",
      { className: "dsk-view" },
      headOf({ title: t("nav.title"), badges, subtitle: t("page.subtitle"), alerts }),
      toolbarOf([
        inputOf({ className: "dsk-search", placeholder: t("page.search"), value: query, onChange: setQuery }),
        buttonOf({
          label: t("page.refresh"),
          disabled: busy !== "",
          onClick: () => {
            void domain.reload().then(() => props.notify(t("toast.refreshed")));
          }
        }),
        buttonOf({
          label: t("page.create"),
          variant: "primary",
          disabled: busy !== "",
          onClick: () => setForm({
            mode: "create",
            root: writableRoots(view)[0]?.key ?? "local",
            name: "",
            description: "",
            whenToUse: "",
            body: ""
          })
        }),
        buttonOf({
          label: t("page.import"),
          disabled: busy !== "",
          onClick: () => setImporting({ root: writableRoots(view)[0]?.key ?? "import", path: "", result: null })
        }),
        buttonOf({ label: t("page.export"), disabled: busy !== "" || view === null, onClick: () => {
          void exportSelection(void 0);
        } }),
        buttonOf({ label: t("page.trash"), disabled: busy !== "", onClick: () => {
          void openTrash();
        } })
      ]),
      domain.state === null && busy !== "" ? emptyOf(t("page.loading")) : listOf((view?.roots ?? []).map((root) => renderRoot(t, root, {
        busy,
        rows: visibleRows(root),
        onToggleSource: (enabled) => {
          void domain.act("set-source", { root: root.key, enabled });
        },
        onToggleRemoved: (removed) => {
          void domain.act("remove-source", { root: root.key, removed }, removed ? t("toast.rootRemoved") : t("toast.rootAdded"));
        },
        onToggleSkill: (row, enabled) => {
          void domain.act("set-skill", { root: row.rootKey, name: row.name, enabled });
        },
        onOpen: (row) => {
          void openDetail(row.rootKey, row.name);
        }
      }))),
      selected === null ? null : renderDetail(t, {
        selected,
        detail,
        busy,
        onClose: closeDetail,
        onEdit: () => {
          if (detail === null) return;
          setForm({
            mode: "edit",
            root: detail.row.rootKey,
            name: detail.row.name,
            description: detail.row.description,
            whenToUse: detail.row.whenToUse ?? "",
            body: detail.body
          });
        },
        onDelete: () => {
          if (detail === null) return;
          const row = detail.row;
          void domain.act("remove", { root: row.rootKey, name: row.name }, t("toast.deleted")).then((done) => {
            if (done.ok) closeDetail();
          });
        },
        onExport: () => {
          if (detail === null) return;
          void exportSelection([{ root: detail.row.rootKey, name: detail.row.name }]);
        },
        onPrefer: (preferred) => {
          if (detail === null) return;
          const row = detail.row;
          void domain.act(
            "prefer",
            { root: row.rootKey, name: row.name, preferred },
            preferred ? t("toast.prefer") : t("toast.unprefer")
          ).then(() => openDetail(row.rootKey, row.name));
        }
      }),
      form === null ? null : renderForm(t, {
        form,
        roots: writableRoots(view),
        busy,
        onChange: (patch) => setForm({ ...form, ...patch }),
        onCancel: () => setForm(null),
        onSave: () => {
          if (form.name.trim() === "" || form.description.trim() === "") {
            props.notify(t("form.required"));
            return;
          }
          const args = {
            root: form.root,
            name: form.mode === "create" ? form.name.trim() : form.name,
            description: form.description.trim(),
            whenToUse: form.whenToUse.trim(),
            body: form.body
          };
          const op = form.mode === "create" ? "create" : "update";
          void domain.act(op, args, t("toast.saved")).then((done) => {
            if (!done.ok) return;
            setForm(null);
            if (form.mode === "edit") void openDetail(form.root, form.name);
          });
        }
      }),
      importing === null ? null : renderImport(t, {
        state: importing,
        roots: writableRoots(view),
        busy,
        onChange: (patch) => setImporting({ ...importing, ...patch }),
        onClose: () => setImporting(null),
        onImportPath: () => {
          if (importing.path.trim() === "") return;
          void domain.act("import-path", { root: importing.root, path: importing.path.trim() }).then((done) => {
            if (done.ok) setImporting({ ...importing, result: done.result });
          });
        },
        onImportZip: async (file) => {
          try {
            const base64 = await readFileAsBase64(file);
            const done = await domain.act("import-zip", { root: importing.root, base64 });
            if (done.ok) setImporting({ ...importing, result: done.result });
          } catch (cause) {
            domain.fail(String(cause?.message ?? cause));
          }
        }
      }),
      trash === null ? null : renderTrash(t, {
        items: trash,
        busy,
        onClose: () => setTrash(null),
        onRestore: (item) => {
          void domain.act("trash-restore", { id: item.id }, t("toast.restored")).then(() => {
            void openTrash();
          });
        },
        onPurge: (item) => {
          if (!window.confirm(t("trash.confirmPurge", { name: item.declaredName }))) return;
          void domain.act("trash-purge", { id: item.id }, t("toast.purged")).then(() => {
            void openTrash();
          });
        },
        onEmpty: () => {
          if (!window.confirm(t("trash.confirmEmpty"))) return;
          void domain.act("trash-empty", {}, t("toast.purged")).then(() => {
            void openTrash();
          });
        }
      })
    );
  }

  // src/client/prompts/view.ts
  function PromptsView(props) {
    const t = props.t;
    const domain = useDomain("prompt-state", props.notify);
    const state = domain.state;
    const [targets, setTargets] = useStateOf([]);
    const [draft, setDraft] = useStateOf(null);
    useClientEffect(() => {
      void callOp("prompt-targets", {}).then((list) => setTargets(list.options)).catch(() => void 0);
    }, []);
    const withReplaced = (message) => (result) => {
      const replaced = result?.replaced;
      return replaced === void 0 || replaced === null ? message : `${message} \xB7 ${t("prompts.replaced", { name: replaced })}`;
    };
    const presets = state?.presets ?? [];
    const warnings = state?.warnings ?? [];
    const applied = state?.applied ?? [];
    const workspaceTargets = targets.filter((option) => option.kind === "workspace");
    const badges = [];
    if (presets.length > 0) badges.push(badgeOf(String(presets.length)));
    if (applied.length > 0) badges.push(badgeOf(t("prompts.activeCount", { n: applied.length }), "ok"));
    if (state !== null) badges.push(badgeOf(t("prompts.backups", { n: state.backupCount }), "off"));
    const alerts = [
      warnings.length > 0 ? alertOf(warnings.join(" \xB7 ")) : null,
      domain.error === null ? null : errorAlertOf(t, domain.error)
    ];
    return h(
      "div",
      { className: "dsk-root" },
      headOf({
        title: t("prompts.title"),
        badges,
        subtitle: t("prompts.subtitle"),
        muted: t("prompts.effectNote"),
        alerts
      }),
      toolbarOf([
        actionsOf([buttonOf({
          label: t("prompts.new"),
          variant: "primary",
          disabled: domain.busy !== "",
          onClick: () => setDraft({ name: "", content: "", isNew: true, scopeKind: "global", scopePath: "" })
        })])
      ]),
      presets.length === 0 ? emptyOf(t("prompts.empty")) : listOf(presets.map((preset) => renderPreset(t, preset, {
        busy: domain.busy,
        onToggle: (enabled) => {
          void domain.act(
            "prompt-toggle",
            { name: preset.name, enabled },
            withReplaced(enabled ? t("prompts.enabledMsg", { name: preset.name }) : t("prompts.disabledMsg", { name: preset.name }))
          );
        },
        onEdit: () => setDraft({
          name: preset.name,
          content: preset.content,
          isNew: false,
          scopeKind: preset.scope.kind,
          scopePath: preset.scope.kind === "workspace" ? preset.scope.path : ""
        }),
        onDelete: () => {
          if (!window.confirm(t("prompts.confirmDelete", { name: preset.name }))) return;
          void domain.act("prompt-delete", { name: preset.name });
        }
      }))),
      /* 生效中的目标一览：一眼看清「哪份写到了哪个文件」 */
      applied.length === 0 ? null : groupOf("applied", [
        groupLineOf(t("prompts.appliedTargets"), [badgeOf(String(applied.length), "off")], null)
      ], [
        h("div", { className: "dsk-rows" }, applied.map((record) => h(
          "div",
          {
            className: "dsk-row",
            key: record.key,
            style: { cursor: "default" }
          },
          h(
            "div",
            { className: "dsk-row-main" },
            h(
              "div",
              { className: "dsk-row-name" },
              record.preset,
              record.drifted ? badgeOf(t("prompts.driftShort"), "warn") : null
            ),
            mutedOf(record.label),
            mutedOf(record.agentsPath)
          ),
          h("div", { className: "dsk-row-actions" }, mutedOf(new Date(record.at).toLocaleString()))
        )))
      ]),
      draft === null ? null : renderEditor(t, {
        draft,
        busy: domain.busy,
        workspaces: workspaceTargets,
        onChange: (patch) => setDraft({ ...draft, ...patch }),
        onCancel: () => setDraft(null),
        onSave: () => {
          if (draft.name.trim() === "" || draft.content.trim() === "") return;
          const scope2 = draft.scopeKind === "workspace" && draft.scopePath.trim() !== "" ? { kind: "workspace", path: draft.scopePath.trim() } : { kind: "global" };
          void domain.act(
            "prompt-save",
            { name: draft.name.trim(), content: draft.content, scope: scope2 },
            t("prompts.saved")
          ).then((done) => {
            if (done.ok) setDraft(null);
          });
        }
      })
    );
  }
  function renderPreset(t, preset, handlers) {
    const disabled = handlers.busy !== "";
    return groupOf(preset.name, [
      groupLineOf(preset.name, [
        preset.enabled ? badgeOf(t("prompts.active"), "ok") : badgeOf(t("prompts.inactive"), "off"),
        badgeOf(t(preset.scope.kind === "global" ? "prompts.scopeGlobal" : "prompts.scopeWorkspace"), void 0, preset.scope.path)
      ], groupActionsOf([
        buttonOf({ label: t("prompts.edit"), small: true, disabled, onClick: handlers.onEdit }),
        buttonOf({ label: t("prompts.delete"), small: true, variant: "danger", disabled: disabled || preset.enabled, onClick: handlers.onDelete }),
        switchOf({
          on: preset.enabled,
          disabled,
          title: preset.enabled ? t("prompts.disable") : t("prompts.enable"),
          onClick: () => handlers.onToggle(!preset.enabled)
        })
      ])),
      groupPathOf(preset.scope.label, preset.scope.path)
    ], [
      h(
        "div",
        { className: "dsk-row", style: { cursor: "default" } },
        h(
          "div",
          { className: "dsk-row-main" },
          h(
            "pre",
            { className: "dsk-pre", style: { maxHeight: "96px", margin: 0 } },
            preset.content.length > 400 ? preset.content.slice(0, 400) + " \u2026" : preset.content
          )
        ),
        h(
          "div",
          { className: "dsk-row-actions" },
          mutedOf(new Date(preset.updatedAt).toLocaleString())
        )
      )
    ]);
  }
  function renderEditor(t, props) {
    const draft = props.draft;
    const editing = draft.isNew === false;
    return modalOf(
      draft.isNew ? t("prompts.new") : `${t("prompts.edit")}: ${draft.name}`,
      [
        fieldOf(t("prompts.name"), inputOf({
          value: draft.name,
          placeholder: "coding",
          disabled: editing,
          onChange: (name) => props.onChange({ name })
        })),
        /* 作用范围是这份预设的属性，所以放在编辑器里。 */
        fieldOf(t("prompts.scope"), h(
          "div",
          null,
          selectOf({
            value: draft.scopeKind === "workspace" ? draft.scopePath : "",
            disabled: editing,
            options: [
              { value: "", label: t("prompts.scopeGlobal") },
              ...props.workspaces.map((option) => ({ value: option.path, label: option.label }))
            ],
            onChange: (path) => props.onChange(path === "" ? { scopeKind: "global", scopePath: "" } : { scopeKind: "workspace", scopePath: path })
          }),
          mutedOf(t(editing ? "prompts.scopeLockedHint" : "prompts.scopeHint"))
        )),
        fieldOf(t("prompts.content"), textAreaOf({
          value: draft.content,
          onChange: (content) => props.onChange({ content })
        }))
      ],
      [
        buttonOf({ label: t("common.cancel"), onClick: props.onCancel }),
        buttonOf({ label: t("common.save"), variant: "primary", disabled: props.busy !== "", onClick: props.onSave })
      ]
    );
  }

  // src/client/mcp/view.ts
  function McpView(props) {
    const t = props.t;
    const domain = useDomain("mcp-state", props.notify);
    const state = domain.state;
    const servers = state?.servers ?? [];
    const warnings = state?.warnings ?? [];
    const badges = [];
    if (state !== null) {
      badges.push(badgeOf(t("mcp.servers", { n: servers.length })));
      badges.push(badgeOf(t("mcp.backups", { n: state.backupCount }), "off"));
    }
    const alerts = [
      state !== null && state.patchExists === false ? alertOf(t("mcp.noPatch")) : null,
      warnings.length > 0 ? alertOf(warnings.join(" \xB7 ")) : null,
      domain.error === null ? null : errorAlertOf(t, domain.error)
    ];
    return h(
      "div",
      { className: "dsk-root" },
      headOf({
        title: t("mcp.title"),
        badges,
        subtitle: t("mcp.subtitle"),
        muted: state === null ? void 0 : `${t("mcp.patchPath")}: ${state.patchPath}`,
        alerts
      }),
      toolbarOf([
        buttonOf({ label: t("page.refresh"), disabled: domain.busy !== "", onClick: () => {
          void domain.reload();
        } })
      ]),
      servers.length === 0 ? emptyOf(t("mcp.empty")) : listOf(servers.map((server) => renderServer(t, server, {
        busy: domain.busy,
        onToggle: (enabled) => {
          void domain.act("mcp-toggle", { id: server.id, enabled }, t("mcp.toggled", {
            name: server.name,
            state: enabled ? t("mcp.enabled") : t("mcp.disabled")
          }));
        },
        onDelete: () => {
          if (!window.confirm(t("mcp.confirmDelete", { name: server.name }))) return;
          void domain.act("mcp-delete", { id: server.id });
        }
      })))
    );
  }
  function renderServer(t, server, handlers) {
    const command = server.command === "" ? server.url : [server.command, ...server.args].join(" ");
    const disabled = handlers.busy !== "";
    return groupOf(server.id, [
      h("span", { className: "dsk-group-name" }, server.name),
      badgeOf(server.transport),
      server.enabled ? badgeOf(t("mcp.enabled"), "ok") : badgeOf(t("mcp.disabled"), "off"),
      server.declaredAt === "tool-center" ? badgeOf(t("mcp.overridden"), "warn") : null,
      h("span", { className: "dsk-group-path", title: command }, command),
      groupActionsOf([
        switchOf({
          on: server.enabled,
          disabled,
          title: server.enabled ? t("mcp.enabled") : t("mcp.disabled"),
          onClick: () => handlers.onToggle(!server.enabled)
        }),
        buttonOf({ label: t("mcp.delete"), small: true, variant: "danger", disabled, onClick: handlers.onDelete })
      ])
    ], [
      h(
        "div",
        { className: "dsk-row", style: { cursor: "default" } },
        h(
          "div",
          { className: "dsk-row-main" },
          mutedOf("id: " + server.id),
          server.args.length > 0 ? mutedOf(`${t("mcp.args")}: ${server.args.join(" ")}`) : null
        ),
        h(
          "div",
          { className: "dsk-row-actions" },
          mutedOf(server.command === "" ? "http" : "stdio")
        )
      )
    ]);
  }

  // src/client/scenes/view.ts
  function ScenesView(props) {
    const t = props.t;
    const domain = useDomain("scene-state", props.notify);
    const state = domain.state;
    const [skills, setSkills] = useStateOf(null);
    const [mcp, setMcp] = useStateOf(null);
    const [prompts, setPrompts] = useStateOf(null);
    const [draft, setDraft] = useStateOf(null);
    const [search, setSearch] = useStateOf("");
    const loadSources = async () => {
      const [skillState, mcpState, promptState] = await Promise.all([
        callOp("state", {}).catch(() => null),
        callOp("mcp-state", {}).catch(() => null),
        callOp("prompt-state", {}).catch(() => null)
      ]);
      setSkills(skillState);
      setMcp(mcpState);
      setPrompts(promptState);
    };
    const sources = {
      skills: skills?.roots.flatMap((root) => root.skills.filter((row) => !row.shadowed).map((row) => ({
        root: root.key,
        name: row.name,
        label: row.declaredName,
        rootLabel: root.label,
        on: row.policy.skillOn
      }))) ?? [],
      servers: mcp?.servers.map((server) => ({ id: server.id, name: server.name, on: server.enabled })) ?? [],
      presets: prompts?.presets.map((preset) => preset.name) ?? []
    };
    const scenes = state?.scenes ?? [];
    const active = state?.active ?? null;
    const warnings = state?.warnings ?? [];
    const badges = [];
    if (scenes.length > 0) badges.push(badgeOf(String(scenes.length)));
    if (active !== null) badges.push(badgeOf(`${t("scenes.active")}: ${active}`, "ok"));
    const openDraft = (next) => {
      setDraft(next);
      void loadSources();
    };
    return h(
      "div",
      { className: "dsk-root" },
      headOf({
        title: t("scenes.title"),
        badges,
        subtitle: t("scenes.subtitle"),
        alerts: [
          warnings.length > 0 ? alertOf(warnings.join(" \xB7 ")) : null,
          domain.error === null ? null : errorAlertOf(t, domain.error)
        ]
      }),
      toolbarOf([
        actionsOf([
          buttonOf({
            label: t("scenes.new"),
            variant: "primary",
            disabled: domain.busy !== "",
            onClick: () => openDraft({
              name: "",
              description: "",
              isNew: true,
              skills: [],
              mcp: [],
              prompt: "",
              promptScope: "global",
              promptWorkspace: "",
              exclusive: true
            })
          }),
          active === null ? null : buttonOf({
            label: t("scenes.exit"),
            disabled: domain.busy !== "",
            onClick: () => {
              void domain.act("scene-exit", {}, (result) => noticeWithWarnings(t("scenes.exited"), result));
            }
          })
        ])
      ]),
      scenes.length === 0 ? emptyOf(t("scenes.empty")) : listOf(scenes.map((scene) => renderScene(t, scene, {
        busy: domain.busy,
        active,
        onApply: () => {
          void domain.act(
            "scene-apply",
            { name: scene.name },
            (result) => noticeWithWarnings(t("scenes.applied", { name: scene.name }), result)
          );
        },
        onEdit: () => openDraft({
          name: scene.name,
          description: scene.description,
          isNew: false,
          skills: scene.skills.slice(),
          mcp: scene.mcp.slice(),
          prompt: scene.prompt ?? "",
          promptScope: scene.promptTarget?.scope === "workspace" ? "workspace" : "global",
          promptWorkspace: scene.promptTarget?.workspace ?? "",
          exclusive: scene.exclusive !== false
        }),
        onDelete: () => {
          if (!window.confirm(t("scenes.confirmDelete", { name: scene.name }))) return;
          void domain.act("scene-delete", { name: scene.name });
        }
      }))),
      draft === null ? null : renderDraft(t, {
        draft,
        busy: domain.busy,
        search,
        sources,
        onChange: (patch) => setDraft({ ...draft, ...patch }),
        onSearch: setSearch,
        onCancel: () => setDraft(null),
        onSave: () => {
          if (draft.name.trim() === "") return;
          void domain.act("scene-save", {
            name: draft.name.trim(),
            description: draft.description,
            skills: draft.skills,
            mcp: draft.mcp,
            prompt: draft.prompt === "" ? null : draft.prompt,
            promptTarget: draft.promptScope === "workspace" && draft.promptWorkspace.trim() !== "" ? { scope: "workspace", workspace: draft.promptWorkspace.trim() } : { scope: "global" },
            exclusive: draft.exclusive
          }, t("common.save")).then((done) => {
            if (done.ok) setDraft(null);
          });
        }
      })
    );
  }
  function renderScene(t, scene, handlers) {
    const isActive = handlers.active === scene.name;
    const disabled = handlers.busy !== "";
    return groupOf(scene.name, [
      h("span", { className: "dsk-group-name" }, scene.name),
      isActive ? badgeOf(t("scenes.active"), "ok") : null,
      scene.skills.length > 0 ? badgeOf(t("scenes.count.skills", { n: scene.skills.length }), "off") : null,
      scene.mcp.length > 0 ? badgeOf(t("scenes.count.mcp", { n: scene.mcp.length }), "off") : null,
      scene.prompt === null ? null : badgeOf(`${t("scenes.prompt")}: ${scene.prompt}`, "off"),
      groupActionsOf([
        buttonOf({ label: t("scenes.apply"), small: true, disabled: disabled || isActive, onClick: handlers.onApply }),
        buttonOf({ label: t("scenes.edit"), small: true, disabled, onClick: handlers.onEdit }),
        buttonOf({ label: t("scenes.delete"), small: true, variant: "danger", disabled: disabled || isActive, onClick: handlers.onDelete })
      ])
    ], [
      scene.description === "" ? null : mutedOf(scene.description)
    ]);
  }
  function renderDraft(t, props) {
    const draft = props.draft;
    const needle = props.search.trim().toLowerCase();
    const visibleSkills = (needle === "" ? props.sources.skills : props.sources.skills.filter((row) => row.label.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle))).slice(0, 120);
    const picked = new Set(draft.skills.map((ref) => ref.root + "\0" + ref.name));
    return modalOf(
      draft.isNew ? t("scenes.new") : `${t("scenes.edit")}: ${draft.name}`,
      [
        fieldOf(t("scenes.name"), inputOf({
          value: draft.name,
          disabled: draft.isNew === false,
          onChange: (name) => props.onChange({ name })
        })),
        fieldOf(t("scenes.description"), inputOf({
          value: draft.description,
          onChange: (description) => props.onChange({ description })
        })),
        /* ── 切换行为：先说清楚「进这个场景会做什么」，再列具体勾选 ── */
        h(
          "div",
          { className: "dsk-section" },
          h("p", { className: "dsk-section-title" }, t("scenes.behaviourTitle")),
          h(
            "label",
            { className: "dsk-check" },
            h("input", {
              type: "checkbox",
              checked: draft.exclusive,
              onChange: () => props.onChange({ exclusive: !draft.exclusive })
            }),
            h("span", null, t("scenes.exclusive"))
          ),
          mutedOf(draft.exclusive ? t("scenes.exclusiveOn") : t("scenes.exclusiveOff"))
        ),
        h(
          "div",
          { className: "dsk-section" },
          h("p", { className: "dsk-section-title" }, t("scenes.pickTitle")),
          fieldOf(t("scenes.prompt"), h(
            "div",
            null,
            selectOf({
              value: draft.prompt,
              options: [
                { value: "", label: t("scenes.promptNone") },
                ...props.sources.presets.map((name) => ({ value: name, label: name }))
              ],
              onChange: (prompt) => props.onChange({ prompt })
            }),
            /* 作用范围由那份预设自己决定，这里只说明，避免让人再选一次。 */
            draft.prompt === "" ? null : mutedOf(t("scenes.promptScopeFromPreset"))
          )),
          fieldOf(t("scenes.mcp"), props.sources.servers.length === 0 ? mutedOf(t("scenes.noMcp")) : h("div", { className: "dsk-files" }, props.sources.servers.map((server) => {
            const checked = draft.mcp.includes(server.id);
            return h(
              "label",
              { className: "dsk-file", key: server.id, style: { cursor: "pointer" } },
              h("input", {
                type: "checkbox",
                checked,
                onChange: () => props.onChange({
                  mcp: checked ? draft.mcp.filter((id) => id !== server.id) : [...draft.mcp, server.id]
                })
              }),
              server.name,
              server.on ? null : mutedOf(` (${t("mcp.disabled")})`)
            );
          }))),
          fieldOf(`${t("scenes.skills")} (${draft.skills.length})`, h(
            "div",
            null,
            inputOf({
              value: props.search,
              placeholder: t("common.search"),
              onChange: props.onSearch
            }),
            props.sources.skills.length === 0 ? mutedOf(t("scenes.noSkills")) : h("div", { style: { maxHeight: "180px", overflow: "auto" } }, visibleSkills.map((row) => {
              const key = row.root + "\0" + row.name;
              return h(
                "label",
                { className: "dsk-row", key, style: { cursor: "pointer" } },
                h(
                  "div",
                  { className: "dsk-row-main" },
                  h("div", { className: "dsk-row-name" }, row.label),
                  mutedOf(row.rootLabel + (row.on ? "" : ` \xB7 ${t("row.disabled")}`))
                ),
                h("input", {
                  type: "checkbox",
                  checked: picked.has(key),
                  onChange: () => props.onChange({
                    skills: picked.has(key) ? draft.skills.filter((ref) => !(ref.root === row.root && ref.name === row.name)) : [...draft.skills, { root: row.root, name: row.name }]
                  })
                })
              );
            }))
          ))
        )
      ],
      [
        buttonOf({ label: t("common.cancel"), onClick: props.onCancel }),
        buttonOf({ label: t("common.save"), variant: "primary", disabled: props.busy !== "", onClick: props.onSave })
      ]
    );
  }

  // src/client/page.ts
  var activeDictionary = {};
  function setDictionary(dict) {
    activeDictionary = dict;
  }
  var TABS = ["scenes", "mcp", "skills", "prompts"];
  var TAB_KEY = "tool-center:tab";
  function ToolCenterPage(props) {
    const fromProps = props?.t;
    const t = typeof fromProps === "function" ? fromProps : (key, values) => translateWith(activeDictionary, key, values);
    const [tab, setTab] = useStateOf("skills");
    const [toast, setToast] = useStateOf("");
    const notify = (message) => {
      setToast(message);
      setTimeout(() => setToast((current) => current === message ? "" : current), 2800);
    };
    useClientEffect(() => {
      try {
        const saved = window.localStorage.getItem(TAB_KEY);
        if (saved !== null && TABS.includes(saved)) setTab(saved);
      } catch {
      }
    }, []);
    const select = (next) => {
      setTab(next);
      try {
        window.localStorage.setItem(TAB_KEY, next);
      } catch {
      }
    };
    const view = () => {
      switch (tab) {
        case "scenes":
          return h(ScenesView, { t, notify });
        case "mcp":
          return h(McpView, { t, notify });
        case "prompts":
          return h(PromptsView, { t, notify });
        default:
          return h(SkillsView, { t, notify });
      }
    };
    return h(
      "div",
      { className: "dsk-root" },
      h(
        "div",
        { className: "dsk-tabs", role: "tablist" },
        TABS.map((key) => h("button", {
          key,
          role: "tab",
          className: "dsk-tab",
          "data-active": String(tab === key),
          "aria-selected": String(tab === key),
          onClick: () => select(key)
        }, t("tab." + key)))
      ),
      h("div", { key: tab }, view()),
      toast !== "" ? h("div", { className: "dsk-toast" }, toast) : null
    );
  }

  // src/client/shell/panel.ts
  function ToolCenterPanel(props) {
    return h(
      "div",
      { className: "dsk-page" },
      h(ToolCenterPage, props)
    );
  }

  // src/client/shell/icon.ts
  function ToolCenterIcon(props) {
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
      h("rect", {
        x: "2.1",
        y: "2.1",
        width: "11.8",
        height: "11.8",
        rx: "3",
        stroke: "currentColor",
        strokeWidth: "1.2"
      }),
      h("path", { d: "M4.9 5.6h6.2M4.9 8.2h3.5", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round" }),
      h("path", {
        d: "M5.6 10.9l1.5 1.4 3.2-3.3",
        stroke: "currentColor",
        strokeWidth: "1.2",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      })
    );
  }

  // src/client/plugin.ts
  var PANEL_ID = "tool-center";
  var PANEL_ORDER = 31;
  function activeLocaleOf(ctx) {
    try {
      const locale = ctx.get("locale");
      return locale?.getSnapshot?.().active;
    } catch {
      return void 0;
    }
  }
  function createPlugin(React) {
    setReact(React);
    return {
      inject: ["slots"],
      apply(ctx) {
        const style = document.createElement("style");
        style.setAttribute("data-dsh-tool-center", "");
        style.textContent = CSS;
        document.head.appendChild(style);
        ctx.effect(() => () => {
          style.remove();
        }, "tool-center: styles");
        const mountDictionary = (scoped) => {
          setDictionary(dictionaryFor(activeLocaleOf(scoped)));
          const locale = scoped.get("locale");
          if (locale === void 0 || locale === null || typeof locale.register !== "function") {
            console.warn("[tool-center] locale service unavailable; UI copy falls back to the bundled dictionaries");
            return;
          }
          scoped.effect(() => {
            try {
              return locale.register(NS, dictionaries());
            } catch (error) {
              console.warn("[tool-center] locale dictionaries already registered (stale reload)", error);
              return () => void 0;
            }
          }, "tool-center: dictionaries");
        };
        if (typeof ctx.inject === "function") ctx.inject(["locale"], mountDictionary);
        else mountDictionary(ctx);
        const slots = ctx.get("slots");
        if (slots === void 0 || slots === null) {
          console.warn("[tool-center] slots service unavailable; the panel cannot mount");
          return;
        }
        const mount = (name, options, component) => {
          ctx.effect(() => slots.inject(name, () => slots.register(
            { name, ...options },
            (props) => h(component, props)
          )), `tool-center: ${name}`);
        };
        mount("sidebar.panellist", {
          id: PANEL_ID,
          order: PANEL_ORDER,
          locale: NS,
          label: () => translateWith(dictionaryFor(activeLocaleOf(ctx)), "nav.title")
        }, ToolCenterIcon);
        mount("main", {
          key: PANEL_ID,
          locale: NS
        }, ToolCenterPanel);
      }
    };
  }

  // src/client/main.ts
  var scope = window;
  scope.__ModuleLoader__.load({
    id: "@local/dsh-tool-center",
    factory(require2) {
      return createPlugin(require2("react"));
    }
  });
})();
