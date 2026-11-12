window.__ModuleLoader__.load({
  id: "@local/dsh-git-worktree",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client/main.ts
var main_exports = {};
__export(main_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(main_exports);

// src/client/plugin.ts
var import_react4 = require("react");

// src/client/styles.ts
var CSS = `
.wt-panel{display:flex;flex-direction:column;gap:14px;padding:20px 24px;width:100%;box-sizing:border-box;min-width:0;height:100%;overflow:auto;overscroll-behavior:contain;color:var(--dsw-alias-label-primary);font-size:13px}
[data-platform=darwin] .wt-panel{padding-top:calc(20px + var(--dsh-frame-top-clearance,0px))}
.wt-panel-head{display:flex;flex-direction:column;gap:4px}
.wt-title{font-size:16px;font-weight:600;margin:0;text-wrap:balance}
.wt-sub{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;text-wrap:pretty}
.wt-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wt-select,.wt-input{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid transparent;border-radius:8px;padding:6px 8px;font-size:12px;line-height:18px;font-family:inherit;transition:border-color .12s ease,background-color .12s ease,box-shadow .12s ease}
.wt-select:hover,.wt-input:hover{border-color:var(--dsw-alias-border-l1)}
.wt-select:focus,.wt-input:focus{border-color:var(--dsw-alias-brand-primary)}
.wt-select:focus-visible,.wt-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent)}
.wt-input-name{min-width:180px;flex:1 1 180px;max-width:260px}
.wt-input-base{min-width:140px;flex:0 1 180px}
.wt-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;border:1px solid transparent;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:5px 10px;font-size:12px;line-height:18px;font-family:inherit;cursor:pointer;white-space:nowrap;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.wt-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.wt-btn:hover{background:var(--dsw-alias-bg-layer-3)}
.wt-btn:disabled{opacity:.5;cursor:default}
.wt-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:transparent}
.wt-btn-primary:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.wt-btn-quiet{background:transparent;color:var(--dsw-alias-label-secondary)}
.wt-btn-quiet:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.wt-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);background:transparent}
.wt-btn-delete:hover{color:var(--dsw-alias-state-error-primary)}
.wt-grow{flex:1 1 auto}
.wt-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}
.wt-notice{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
.wt-muted{color:var(--dsw-alias-label-secondary);font-size:12px}
.wt-empty{display:flex;flex-direction:column;gap:6px;padding:18px 16px;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px}
.wt-empty p{margin:0;font-size:13px}
.wt-empty-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
.wt-rows{display:flex;flex-direction:column;gap:8px}
.wt-row{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}
.wt-row-head{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.wt-name{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wt-badges{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
.wt-badge{font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.wt-badge-dirty{color:var(--dsw-alias-state-warn-primary)}
.wt-badge-missing{color:var(--dsw-alias-state-error-primary)}
.wt-badge-branch{color:var(--dsw-alias-label-primary);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wt-badge-current{color:var(--dsw-alias-brand-primary)}
.wt-badge-external{color:var(--dsw-alias-label-secondary);border:1px dashed var(--dsw-alias-border-l1)}
.wt-isolation{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px solid var(--dsw-alias-brand-primary);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent);min-width:0}
.wt-isolation strong{font-size:12px;font-weight:600;line-height:1.5;word-break:break-all}
.wt-row[data-external=true]{border-style:dashed}
.wt-path{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.wt-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.wt-diff{margin:0;padding:10px;max-height:420px;overflow:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.45;white-space:pre;color:var(--dsw-alias-label-primary)}
.wt-diff-note{font-size:11px;color:var(--dsw-alias-label-secondary)}
.wt-confirm{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.wt-confirm-text{font-size:11px;color:var(--dsw-alias-state-warn-primary)}
.wt-spinner{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:wt-spin .8s linear infinite}
@keyframes wt-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.wt-spinner{animation:none;border-top-color:var(--dsw-alias-border-l2)}}
`;

// src/client/i18n/index.ts
var NS = "git-worktree";
var ZH = {
  "common.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "common.refresh": "\u5237\u65B0",
  "common.cancel": "\u53D6\u6D88",
  "panel.title": "\u9694\u79BB\u5DE5\u4F5C\u533A",
  "panel.description": "\u521B\u5EFA\u5DE5\u4F5C\u4EA4\u7ED9 AI\uFF1A\u5728\u4F1A\u8BDD\u91CC\u8BF4\u300C\u8FDB\u5165 worktree \u5DE5\u4F5C\u300D\u5373\u53EF\u3002\u8FD9\u91CC\u53EF\u4EE5\u9009\u4E00\u4E2A\u5DE5\u4F5C\u533A\u3001\u914D\u7F6E\u5206\u652F\u524D\u7F00\uFF0C\u5E76\u89C2\u5BDF\u6216\u6E05\u7406\u5DF2\u6709\u7684\u68C0\u51FA\u3002",
  "panel.repository": "\u5DE5\u4F5C\u533A",
  "panel.chooseRepository": "\u9009\u62E9\u5DE5\u4F5C\u533A\u2026",
  "panel.prefix": "\u5206\u652F\u524D\u7F00",
  "panel.prefixPlaceholder": "\u4F8B\u5982 worktree/ \u6216 feat/\u2026",
  "panel.prefixHint": "AI \u521B\u5EFA\u65F6\u7528\u300C\u524D\u7F00 + \u540D\u5B57\u300D\u547D\u540D\u5206\u652F\uFF1B\u7559\u7A7A\u5219\u76F4\u63A5\u7528\u540D\u5B57\u3002",
  "panel.save": "\u4FDD\u5B58",
  "panel.saved": "\u5DF2\u4FDD\u5B58",
  "panel.hostOutdated": "Host \u8FDB\u7A0B\u4E0E\u9875\u9762\u7248\u672C\u4E0D\u4E00\u81F4\uFF1A\u9875\u9762\u5DF2\u66F4\u65B0\u3001\u8FDB\u7A0B\u672A\u91CD\u8F7D\u3002\u91CD\u542F\u63D2\u4EF6\u540E\u518D\u6E05\u7406\uFF1B\u5F53\u524D\u8FDB\u7A0B\u65E0\u6CD5\u6536\u56DE\u5916\u90E8\u68C0\u51FA\u7684\u5931\u6548\u5143\u6570\u636E\u3002",
  "panel.isolation": "\u5F53\u524D\u4F1A\u8BDD\u5DF2\u5728\u8FD9\u4E2A\u9694\u79BB\u5DE5\u4F5C\u533A\u91CC\uFF1A{path}",
  "panel.isolationBranch": "\u5206\u652F {branch}",
  "panel.isolationDetached": "detached HEAD",
  "panel.isolationHint": "\u5DF2\u7ECF\u5728\u9694\u79BB\u91CC\u5C31\u4E0D\u9700\u8981\u518D\u5EFA\u4E00\u4E2A\u2014\u2014\u76F4\u63A5\u5728\u8FD9\u91CC\u6539\uFF0C\u518D\u63D0\u4EA4\u6216\u5E94\u7528\u56DE\u4E3B\u4ED3\u3002",
  "panel.layoutRepo": "\u68C0\u51FA\u76EE\u5F55\uFF1A\u4ED3\u5E93\u5185 .worktrees/",
  "panel.layoutState": "\u68C0\u51FA\u76EE\u5F55\uFF1A\u63D2\u4EF6\u72B6\u6001\u76EE\u5F55",
  "panel.empty": "\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u8FD8\u6CA1\u6709\u9694\u79BB\u68C0\u51FA\u3002",
  "panel.emptyHint": "\u5728\u4F1A\u8BDD\u91CC\u5BF9 AI \u8BF4\u300C\u8FDB\u5165 worktree \u5DE5\u4F5C\u300D\uFF0C\u5B83\u5C31\u4F1A\u7528\u4E0A\u9762\u7684\u524D\u7F00\u521B\u5EFA\u3002",
  "panel.noRepository": "\u8FD8\u6CA1\u786E\u5B9A\u5F53\u524D\u5DE5\u4F5C\u533A\u3002",
  "panel.noRepositoryHint": "\u4ECE\u4E0A\u9762\u7684\u4E0B\u62C9\u6846\u9009\u62E9\u4E00\u4E2A DSH \u5DE5\u4F5C\u533A\u3002",
  "panel.dirty": "\u672A\u63D0\u4EA4 {n}",
  "panel.ahead": "\u9886\u5148 {n}",
  "panel.behind": "\u843D\u540E {n}",
  "panel.files": "\u6539\u52A8 {n}",
  "panel.missing": "\u76EE\u5F55\u5DF2\u4E22\u5931",
  "panel.branch": "{branch}",
  "panel.detached": "detached",
  "panel.current": "\u5F53\u524D",
  "panel.external": "\u5916\u90E8\u521B\u5EFA",
  "panel.externalHint": "\u8FD9\u4E2A checkout \u4E0D\u662F\u672C\u63D2\u4EF6\u521B\u5EFA\u7684\uFF1A\u53EA\u80FD\u67E5\u770B\u548C\u6253\u5F00\uFF0C\u5220\u9664\u8BF7\u7528 git\u3002",
  "panel.openDir": "\u6253\u5F00\u76EE\u5F55",
  "panel.register": "\u5728\u5DE5\u4F5C\u533A\u4E2D\u6253\u5F00",
  "panel.registered": "\u5DF2\u6CE8\u518C\u4E3A\u5DE5\u4F5C\u533A",
  "panel.newSession": "\u65B0\u5EFA\u4F1A\u8BDD",
  "panel.sessionCreated": "\u5DF2\u5728 {name} \u65B0\u5EFA\u4F1A\u8BDD\uFF08{id}\uFF09\u5E76\u5207\u4E86\u8FC7\u53BB\u3002",
  "panel.sessionUnavailable": "\u8FD9\u4E2A Host \u6CA1\u6709\u53EF\u7528\u7684\u4F1A\u8BDD\u5DE5\u5382\uFF0C\u8BF7\u4ECE\u4FA7\u680F\u5728\u8BE5\u5DE5\u4F5C\u533A\u91CC\u65B0\u5EFA\u4F1A\u8BDD\u3002",
  "panel.openFailed": "\u8FD9\u4E2A Host \u6CA1\u6709\u6253\u5F00\u76EE\u5F55\u7684\u80FD\u529B\u3002",
  "panel.apply": "\u5E94\u7528\u5230\u4E3B\u4ED3",
  "panel.applied": "\u5DF2\u5E94\u7528 {n} \u4E2A\u6587\u4EF6\u5230\u4E3B\u4ED3\u5DE5\u4F5C\u533A\uFF08\u672A\u63D0\u4EA4\uFF09",
  "panel.viewDiff": "\u67E5\u770B\u6539\u52A8",
  "panel.hideDiff": "\u6536\u8D77\u6539\u52A8",
  "panel.diffAge": "{n} \u79D2\u524D\u7684\u5FEB\u7167",
  "panel.diffSummary": "\u6539\u52A8 {n} \u4E2A\u6587\u4EF6",
  "panel.diffStale": "\u5217\u8868\u5DF2\u5237\u65B0\uFF1A\u8FD9\u4EFD diff \u53EF\u80FD\u5DF2\u7ECF\u8FC7\u671F\uFF0C\u6536\u8D77\u518D\u770B\u4E00\u6B21\u3002",
  "panel.noChanges": "\u6CA1\u6709\u6539\u52A8\u3002",
  "panel.untracked": "\u672A\u8DDF\u8E2A\uFF1A{paths}",
  "panel.truncated": "diff \u592A\u5927\uFF0C\u53EA\u663E\u793A\u4E86\u4E00\u90E8\u5206\u3002",
  "panel.remove": "\u5220\u9664",
  "panel.removeConfirm": "\u5220\u9664\u8FD9\u4E2A\u9694\u79BB\u5DE5\u4F5C\u533A\uFF1F\u672A\u63D0\u4EA4\u7684\u6539\u52A8\u4F1A\u4E00\u8D77\u6D88\u5931\uFF08\u5206\u652F\u4F1A\u4FDD\u7559\uFF09\u3002",
  "panel.removeForce": "\u5F3A\u5236\u5220\u9664",
  "panel.removeForceConfirm": "\u786E\u8BA4\u5F3A\u5236\u5220\u9664\uFF1F\u672A\u63D0\u4EA4\u4E0E\u672A\u63A8\u9001\u7684\u5185\u5BB9\u4F1A\u88AB\u4E22\u5F03\uFF1Bdetached \u4F1A\u5148\u7559\u4E00\u4EFD\u5F52\u6863\u5F15\u7528\u3002",
  "panel.removed": "\u5DF2\u5220\u9664",
  "panel.removedBranch": "\u5206\u652F {branch} \u4FDD\u7559\u5728\u4ED3\u5E93\u91CC\uFF08\u63D0\u4EA4\u90FD\u8FD8\u5728\uFF09\u3002",
  "panel.removedArchived": "\u5220\u9664\u524D\u7684\u5185\u5BB9\u9489\u5728 {ref}\uFF0Cgit show {oid} \u53EF\u4EE5\u53D6\u56DE\u3002",
  "panel.forceHint": "\u8FD8\u6709\u672A\u63D0\u4EA4\u6216\u672A\u63A8\u9001\u7684\u5185\u5BB9\u3002\u518D\u70B9\u4E00\u6B21\u300C\u5F3A\u5236\u5220\u9664\u300D\u5E76\u786E\u8BA4\u5373\u53EF\uFF1Bdetached \u4F1A\u5148\u7559\u5F52\u6863\u5F15\u7528\u3002",
  "panel.prune": "\u6E05\u7406\u5931\u6548\u8BB0\u5F55",
  "panel.pruned": "\u5DF2\u6E05\u7406 {n} \u6761\u5931\u6548\u6B8B\u6E23",
  "panel.noPrune": "\u6CA1\u6709\u53EF\u6E05\u7406\u7684\u5931\u6548\u6B8B\u6E23",
  "error.generic": "\u64CD\u4F5C\u6CA1\u6709\u5B8C\u6210\u3002",
  "error.network": "\u8FDE\u4E0D\u4E0A Host\u3002",
  "error.bad-request": "\u8BF7\u6C42\u53C2\u6570\u4E0D\u5B8C\u6574\u3002",
  "error.bad-json": "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON\u3002",
  "error.too-large": "\u5185\u5BB9\u592A\u5927\uFF0C\u64CD\u4F5C\u88AB\u62D2\u7EDD\u3002",
  "error.not-a-repository": "\u8FD9\u4E2A\u76EE\u5F55\u4E0D\u662F Git \u4ED3\u5E93\u3002",
  "error.unknown-worktree": "\u8FD9\u4E2A\u9694\u79BB\u5DE5\u4F5C\u533A\u5DF2\u4E0D\u5728\u767B\u8BB0\u8868\u91CC\uFF0C\u5237\u65B0\u4E00\u4E0B\u3002",
  "error.duplicate-worktree": "\u540C\u540D\u7684\u9694\u79BB\u5DE5\u4F5C\u533A\u5DF2\u5B58\u5728\u3002",
  "error.duplicate-branch": "\u540C\u540D\u5206\u652F\u5DF2\u5B58\u5728\uFF1A\u6362\u4E00\u4E2A\u540D\u5B57\uFF0C\u6216\u6307\u5B9A\u522B\u7684\u5206\u652F\u540D\u3002",
  "error.invalid-name": "\u540D\u5B57\u4E0D\u5408\u6CD5\uFF1A\u53EA\u7528\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u548C\u8FDE\u5B57\u7B26\uFF0C\u4E14\u4E0D\u80FD\u662F Windows \u4FDD\u7559\u540D\u3002",
  "error.invalid-layout": "\u8FD9\u4E2A\u540D\u5B57/\u524D\u7F00\u4E0D\u5408\u6CD5\uFF1A\u4E0D\u80FD\u542B\u7A7A\u683C\uFF0C\u4E5F\u4E0D\u80FD\u7528 Git \u5F15\u7528\u91CC\u7684\u7981\u7528\u5B57\u7B26\u3002",
  "error.worktree-dirty": "\u8FD8\u6709\u672A\u63D0\u4EA4\u7684\u6539\u52A8\uFF0C\u786E\u8BA4\u540E\u53EF\u4EE5\u5F3A\u5236\u5220\u9664\u3002",
  "error.worktree-unmerged": "\u8FD9\u4E2A detached \u68C0\u51FA\u91CC\u6709\u4EFB\u4F55\u5206\u652F\u90FD\u4E0D\u5305\u542B\u7684\u63D0\u4EA4\uFF0C\u786E\u8BA4\u540E\u624D\u80FD\u5220\u9664\u3002",
  "error.worktree-unpushed": "\u8FD9\u4E2A\u5206\u652F\u4E0A\u7684\u63D0\u4EA4\u8FD8\u6CA1\u6709\u8FDB\u4EFB\u4F55\u5176\u4ED6\u5206\u652F\uFF08\u542B\u8FDC\u7AEF\uFF09\uFF0C\u786E\u8BA4\u540E\u624D\u80FD\u5220\u9664\u3002",
  "error.worktree-missing": "\u8FD9\u4E2A\u9694\u79BB\u5DE5\u4F5C\u533A\u7684\u76EE\u5F55\u5DF2\u7ECF\u4E0D\u5728\u4E86\u3002",
  "error.worktree-external": "\u8FD9\u4E2A checkout \u662F\u5916\u90E8 Git \u521B\u5EFA\u7684\uFF0C\u63D2\u4EF6\u53EA\u8BFB\u5C55\u793A\u3002",
  "error.git-failed": "Git \u547D\u4EE4\u5931\u8D25\uFF0C\u8BE6\u60C5\u89C1 Host \u63D0\u793A\u3002",
  "error.apply-conflict": "\u8865\u4E01\u548C\u4E3B\u4ED3\u5F53\u524D\u5185\u5BB9\u51B2\u7A81\uFF0C\u4E3B\u4ED3\u6CA1\u6709\u88AB\u4FEE\u6539\u3002",
  "error.no-workspace": "\u8FD9\u4E2A Host \u6CA1\u6709\u5DE5\u4F5C\u533A\u6CE8\u518C\u8868\u3002",
  "error.not-a-workspace": "\u53EA\u80FD\u9009\u62E9 DSH \u5DE5\u4F5C\u533A\u3002",
  "error.forbidden": "\u8FD9\u4E2A\u8BF7\u6C42\u6CA1\u6709\u88AB\u4FE1\u4EFB\u3002"
};
var EN = {
  "common.loading": "Loading\u2026",
  "common.refresh": "Refresh",
  "common.cancel": "Cancel",
  "panel.title": "Isolated worktrees",
  "panel.description": 'Creation belongs to the AI: say "work in a worktree" in a session. Here you pick a workspace, set the branch prefix, and watch or clean up existing checkouts.',
  "panel.repository": "Workspace",
  "panel.chooseRepository": "Choose workspace\u2026",
  "panel.prefix": "Branch prefix",
  "panel.prefixPlaceholder": "e.g. worktree/ or feat/\u2026",
  "panel.prefixHint": "The AI names the branch prefix + name; leave it empty to use the name alone.",
  "panel.save": "Save",
  "panel.saved": "Saved",
  "panel.hostOutdated": "The Host process and this page are from different builds (page updated, process not reloaded). Reload the plugin before cleaning; the running process cannot prune external checkouts.",
  "panel.isolation": "This session already lives in an isolated worktree: {path}",
  "panel.isolationBranch": "branch {branch}",
  "panel.isolationDetached": "detached HEAD",
  "panel.isolationHint": "No second worktree is needed \u2014 keep working here, then commit or apply back.",
  "panel.layoutRepo": "Checkouts live in .worktrees/ inside the repository",
  "panel.layoutState": "Checkouts live in the plugin state directory",
  "panel.empty": "No isolated checkout in this workspace yet.",
  "panel.emptyHint": "Ask the AI for a worktree in the session; it uses the prefix above.",
  "panel.noRepository": "No workspace selected yet.",
  "panel.noRepositoryHint": "Pick a DSH workspace above.",
  "panel.dirty": "{n} uncommitted",
  "panel.ahead": "{n} ahead",
  "panel.behind": "{n} behind",
  "panel.files": "{n} changed",
  "panel.missing": "directory missing",
  "panel.branch": "{branch}",
  "panel.detached": "detached",
  "panel.current": "current",
  "panel.external": "created outside",
  "panel.externalHint": "This checkout was not created by the plugin: view and open only; remove it with git.",
  "panel.openDir": "Open folder",
  "panel.register": "Open in workspace",
  "panel.registered": "Registered as a workspace",
  "panel.newSession": "New session",
  "panel.sessionCreated": "Created a session in {name} ({id}) and switched to it.",
  "panel.sessionUnavailable": "This Host has no session factory; start a session from the sidebar instead.",
  "panel.openFailed": "This Host cannot open folders.",
  "panel.apply": "Apply to source",
  "panel.applied": "Applied {n} files to the source working tree (not committed)",
  "panel.viewDiff": "Show changes",
  "panel.hideDiff": "Hide changes",
  "panel.diffAge": "snapshot from {n}s ago",
  "panel.diffSummary": "{n} files changed",
  "panel.diffStale": "The list has refreshed: this diff may be stale. Collapse and open it again.",
  "panel.noChanges": "No changes.",
  "panel.untracked": "Untracked: {paths}",
  "panel.truncated": "The diff is too large; only a part is shown.",
  "panel.remove": "Remove",
  "panel.removeConfirm": "Remove this worktree? Uncommitted changes go with it (the branch stays).",
  "panel.removeForce": "Force remove",
  "panel.removeForceConfirm": "Force remove? Uncommitted and unpushed work is discarded; a detached checkout is archived first.",
  "panel.removed": "Removed",
  "panel.removedBranch": "Branch {branch} stays in the repository (its commits are kept).",
  "panel.removedArchived": "The content was pinned at {ref}; recover it with git show {oid}.",
  "panel.forceHint": "There are uncommitted or unpushed changes. Press Force remove once more and confirm; a detached checkout is archived first.",
  "panel.prune": "Clean stale records",
  "panel.pruned": "Removed {n} stale records",
  "panel.noPrune": "Nothing to clean",
  "error.generic": "The operation did not complete.",
  "error.network": "Cannot reach the Host.",
  "error.bad-request": "The request is incomplete.",
  "error.bad-json": "The request body is not valid JSON.",
  "error.too-large": "The content is too large; the operation was refused.",
  "error.not-a-repository": "That directory is not a Git repository.",
  "error.unknown-worktree": "That worktree is no longer registered; refresh.",
  "error.duplicate-worktree": "A worktree with that name already exists.",
  "error.duplicate-branch": "That branch already exists; pick another name or another branch.",
  "error.invalid-name": "Invalid name: letters, digits, dots, underscores and hyphens only; no Windows reserved names.",
  "error.invalid-layout": "Invalid name/prefix: no spaces and no characters Git forbids in a ref.",
  "error.worktree-dirty": "There are uncommitted changes; confirm to force removal.",
  "error.worktree-unmerged": "The detached worktree has commits no branch contains; confirm to force removal.",
  "error.worktree-unpushed": "The branch has commits no other branch (including remotes) contains; confirm to force removal.",
  "error.worktree-missing": "The worktree directory is gone.",
  "error.worktree-external": "That checkout was created outside the plugin; it is read-only here.",
  "error.git-failed": "A Git command failed; see the Host message.",
  "error.apply-conflict": "The patch conflicts with the source tree; nothing was modified.",
  "error.no-workspace": "This Host has no workspace registry.",
  "error.not-a-workspace": "Only DSH workspaces can be selected.",
  "error.forbidden": "The request was not trusted."
};

// src/client/panel/view.tsx
var import_react3 = require("react");

// src/client/core/api.ts
var API_BASE = "git-worktree";
var ApiError = class extends Error {
  constructor(code, message) {
    super(message !== void 0 && message !== "" ? message : code);
    __publicField(this, "code");
    this.name = "ApiError";
    this.code = code === "" ? "generic" : code;
  }
};
async function readEnvelope(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
async function call(method, payload) {
  let response;
  try {
    response = await fetch(API_BASE + "/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload === void 0 ? {} : payload)
    });
  } catch (error2) {
    throw new ApiError("network", error2 instanceof Error ? error2.message : String(error2));
  }
  const body = await readEnvelope(response);
  if (body?.ok === true) return body.data;
  const error = body?.error;
  throw new ApiError(
    error?.code !== void 0 && error.code !== "" ? error.code : "http-" + String(response.status),
    error?.message
  );
}

// src/client/core/store.ts
var import_react = require("react");
var stores = /* @__PURE__ */ new Set();
function createStore(load) {
  let snapshot = { status: "idle", data: null, error: null };
  const listeners = /* @__PURE__ */ new Set();
  let inflight = null;
  let latest = 0;
  const emit = () => {
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
      }
    }
  };
  function refresh(force) {
    if (inflight !== null && force !== true) return inflight;
    if (snapshot.status === "ready" && snapshot.data !== null && force !== true) {
      return Promise.resolve(snapshot.data);
    }
    const generation = ++latest;
    inflight = load().then((data) => {
      if (generation !== latest) return snapshot.data;
      snapshot = { status: "ready", data, error: null };
      emit();
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
  return (0, import_react.useSyncExternalStore)(store.subscribe, store.get, store.get);
}

// src/client/core/ui.tsx
var import_react2 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function Spinner() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wt-spinner", "aria-hidden": true });
}
function ConfirmButton(props) {
  const [armed, setArmed] = (0, import_react2.useState)(false);
  (0, import_react2.useEffect)(() => {
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
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "wt-confirm", role: "group", "aria-live": "polite", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wt-confirm-text", children: props.confirmText }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "wt-btn wt-btn-danger",
          onClick: () => {
            setArmed(false);
            props.onConfirm();
          },
          children: props.confirmLabel
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "wt-btn", autoFocus: true, onClick: () => setArmed(false), children: props.cancelLabel })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "wt-btn wt-btn-quiet wt-btn-delete", title: props.title, onClick: () => setArmed(true), children: props.children });
}
function isTranslateKey(key) {
  return Object.prototype.hasOwnProperty.call(ZH, key);
}
function describeError(t, error) {
  if (error instanceof ApiError) {
    const key = "error." + error.code;
    if (isTranslateKey(key)) return t(key);
    return error.message === "" ? t("error.generic") : error.message;
  }
  if (error instanceof Error && error.message !== "") return error.message;
  return t("error.generic");
}

// src/client/panel/store.ts
var panelStore = createStore(() => call("state", {}));

// src/client/panel/row.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function summarizeFiles(diff, t) {
  if (diff.files.length === 0) return null;
  const shown = diff.files.slice(0, 8).map((file) => {
    const added = file.added === null ? "\xB7" : `+${file.added}`;
    const removed = file.removed === null ? "\xB7" : `-${file.removed}`;
    return `${file.path} ${added}/${removed}`;
  });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "wt-diff-note", children: [
    t("panel.diffSummary", { n: diff.files.length }),
    "\uFF1A",
    shown.join("\uFF0C")
  ] });
}
function WorktreeRow(props) {
  const t = props.t;
  const view = props.view;
  const missing = view.state === "missing";
  const managed = view.origin === "managed";
  const expandable = managed && !missing;
  const hasWork = view.dirty + view.ahead > 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "wt-row", "data-external": !managed, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "wt-row-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-name", title: view.path, children: view.name }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "wt-badges", children: [
        view.current ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-badge wt-badge-current", children: t("panel.current") }) : null,
        view.branch === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-badge", children: t("panel.detached") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-badge wt-badge-branch", children: t("panel.branch", { branch: view.branch }) }),
        !managed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-badge wt-badge-external", children: t("panel.external") }) : null,
        missing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-badge wt-badge-missing", children: t("panel.missing") }) : null,
        view.dirty > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-badge wt-badge-dirty", children: t("panel.dirty", { n: view.dirty }) }) : null,
        view.files > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-badge", children: t("panel.files", { n: view.files }) }) : null,
        view.ahead > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-badge", children: t("panel.ahead", { n: view.ahead }) }) : null,
        view.behind > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-badge", children: t("panel.behind", { n: view.behind }) }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-grow" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "wt-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "wt-btn wt-btn-quiet", disabled: props.busy || missing, onClick: props.onOpen, children: t("panel.openDir") }),
        managed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "wt-btn wt-btn-quiet", disabled: props.busy || missing, onClick: props.onRegister, children: view.workspaceId === null ? t("panel.register") : t("panel.registered") }) : null,
        managed && view.workspaceId !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "wt-btn wt-btn-quiet", disabled: props.busy || missing, onClick: props.onSession, children: t("panel.newSession") }) : null,
        expandable ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "wt-btn", disabled: props.busy || props.diffLoading, onClick: props.onToggleDiff, children: props.diff === null ? t("panel.viewDiff") : t("panel.hideDiff") }) : null,
        managed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "wt-btn wt-btn-primary",
            disabled: props.busy || missing || !hasWork,
            onClick: props.onApply,
            children: t("panel.apply")
          }
        ) : null,
        managed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          ConfirmButton,
          {
            title: props.forceArmed ? t("panel.removeForce") : t("panel.remove"),
            confirmText: props.forceArmed ? t("panel.removeForceConfirm") : t("panel.removeConfirm"),
            confirmLabel: props.forceArmed ? t("panel.removeForce") : t("panel.remove"),
            cancelLabel: t("common.cancel"),
            onConfirm: props.onRemove,
            children: props.forceArmed ? t("panel.removeForce") : t("panel.remove")
          }
        ) : null
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wt-path", children: view.path }),
    !managed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "wt-diff-note", children: t("panel.externalHint") }) : null,
    props.diff !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "wt-row-diff", children: [
      summarizeFiles(props.diff, t),
      props.diff.patch === "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "wt-diff-note", children: t("panel.noChanges") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "wt-diff", children: props.diff.patch }),
      props.diff.untracked.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "wt-diff-note", children: t("panel.untracked", { paths: props.diff.untracked.join(", ") }) }) : null,
      props.diff.truncated ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "wt-diff-note", children: t("panel.truncated") }) : null,
      props.diffStale ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "wt-diff-note", children: t("panel.diffStale") }) : null,
      props.diffAge > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "wt-diff-note", children: t("panel.diffAge", { n: props.diffAge }) }) : null
    ] }) : null
  ] });
}

// src/client/panel/view.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var POLL_MS = 1e4;
function Panel(props) {
  const t = props.t;
  const snapshot = useSnapshot(panelStore);
  const [prefix, setPrefix] = (0, import_react3.useState)("");
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [notice, setNotice] = (0, import_react3.useState)(null);
  const [diffs, setDiffs] = (0, import_react3.useState)({});
  const [diffLoading, setDiffLoading] = (0, import_react3.useState)(null);
  const [armedForce, setArmedForce] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    void panelStore.refresh(true);
  }, []);
  (0, import_react3.useEffect)(() => {
    if (armedForce === null) return void 0;
    const timer = setTimeout(() => setArmedForce(null), 8e3);
    return () => clearTimeout(timer);
  }, [armedForce]);
  (0, import_react3.useEffect)(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void panelStore.refresh(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);
  const data = snapshot.data;
  const hostOutdated = data !== null && typeof data.branchPrefix !== "string";
  (0, import_react3.useEffect)(() => {
    if (data !== null) setPrefix(data.branchPrefix ?? "");
  }, [data?.branchPrefix]);
  const repository = data?.repository ?? null;
  const worktrees = data?.worktrees ?? [];
  const repositories = data?.repositories ?? [];
  const isolation = data?.isolation ?? null;
  const alreadyIsolated = isolation?.inWorktree === true;
  const hasMissing = worktrees.some((view) => view.state === "missing" || view.prunable);
  const run = async (task) => {
    setBusy(true);
    setNotice(null);
    try {
      const message = await task();
      if (message !== null) setNotice({ kind: "ok", text: message });
      await refreshStores();
    } catch (error) {
      setNotice({ kind: "error", text: describeError(t, error) });
    } finally {
      setBusy(false);
    }
  };
  const select = (path) => {
    if (path === "") return;
    void run(async () => {
      await call("select", { repository: path });
      return null;
    });
  };
  const savePrefix = () => {
    void run(async () => {
      const result = await call("settings", { branchPrefix: prefix });
      setPrefix(result.branchPrefix);
      return t("panel.saved");
    });
  };
  const toggleDiff = (view) => {
    if (diffs[view.id] !== void 0) {
      setDiffs((prev) => {
        const next = { ...prev };
        delete next[view.id];
        return next;
      });
      return;
    }
    setDiffLoading(view.id);
    void call("diff", { id: view.id }).then((diff) => setDiffs((prev) => ({ ...prev, [view.id]: { value: diff, at: Date.now() } }))).catch((error) => setNotice({ kind: "error", text: describeError(t, error) })).finally(() => setDiffLoading(null));
  };
  const apply2 = (view) => {
    void run(async () => {
      const result = await call("apply", { id: view.id });
      setDiffs((prev) => {
        const next = { ...prev };
        delete next[view.id];
        return next;
      });
      return t("panel.applied", { n: result.result.files });
    });
  };
  const register = (view) => {
    void run(async () => {
      await call("register", { id: view.id });
      return t("panel.registered");
    });
  };
  const newSession = (view) => {
    void run(async () => {
      const result = await call("session", { id: view.id });
      if (result.sessionId === null) return t("panel.sessionUnavailable");
      props.onOpenSession?.(result.sessionId);
      return t("panel.sessionCreated", { name: view.name, id: result.sessionId.slice(0, 8) });
    });
  };
  const openFolder = (view) => {
    void run(async () => {
      const result = await call("open", { id: view.id });
      return result.opened ? null : t("panel.openFailed");
    });
  };
  const remove = (view) => {
    const force = armedForce === view.id;
    setBusy(true);
    setNotice(null);
    void (async () => {
      try {
        const result = await call("remove", { id: view.id, force });
        setArmedForce(null);
        const parts = [t("panel.removed")];
        if (result.branch !== null) parts.push(t("panel.removedBranch", { branch: result.branch }));
        if (result.archivedOid !== null) {
          const oid = result.archivedOid.slice(0, 7);
          parts.push(t("panel.removedArchived", { ref: "refs/dsh/archive/" + view.id, oid }));
        }
        setNotice({ kind: "ok", text: parts.join(" ") });
        await refreshStores();
      } catch (error) {
        if (error instanceof ApiError && (error.code === "worktree-dirty" || error.code === "worktree-unmerged" || error.code === "worktree-unpushed")) {
          setArmedForce(view.id);
          setNotice({ kind: "error", text: t("panel.forceHint") });
        } else {
          setNotice({ kind: "error", text: describeError(t, error) });
        }
      } finally {
        setBusy(false);
      }
    })();
  };
  const prune = () => {
    void run(async () => {
      const result = await call("prune");
      const total = (result.removed ?? 0) + (result.pruned?.length ?? 0);
      return total === 0 ? t("panel.noPrune") : t("panel.pruned", { n: total });
    });
  };
  if (snapshot.status === "error" && data === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "wt-panel", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "wt-error", role: "alert", children: describeError(t, snapshot.error) }) });
  }
  if (data === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "wt-panel", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-muted", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Spinner, {}),
      " ",
      t("common.loading")
    ] }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-panel", role: "region", "aria-label": t("panel.title"), "aria-busy": busy, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("header", { className: "wt-panel-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { className: "wt-title", children: t("panel.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "wt-sub", children: t("panel.description") })
    ] }),
    hostOutdated ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "wt-notice", role: "status", children: t("panel.hostOutdated") }) : null,
    alreadyIsolated && isolation !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-isolation", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: t("panel.isolation", { path: isolation.path ?? isolation.cwd ?? "" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wt-muted", children: isolation.branch === null ? t("panel.isolationDetached") : t("panel.isolationBranch", { branch: isolation.branch }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wt-muted", children: t("panel.isolationHint") })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-bar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "wt-muted", htmlFor: "wt-repository", children: t("panel.repository") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "select",
        {
          id: "wt-repository",
          className: "wt-select",
          value: repository?.root ?? "",
          disabled: busy,
          onChange: (event) => select(event.target.value),
          children: [
            repository === null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: t("panel.chooseRepository") }) : null,
            repositories.map((row) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: row.root, children: row.worktrees > 0 ? `${row.name}\uFF08${row.worktrees}\uFF09` : row.name }, row.root))
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wt-grow" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wt-muted", children: data.layout === "repo" ? t("panel.layoutRepo") : t("panel.layoutState") }),
      hasMissing ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "wt-btn wt-btn-quiet", disabled: busy, onClick: prune, children: t("panel.prune") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "wt-btn", disabled: busy, onClick: () => {
        void panelStore.refresh(true);
      }, children: t("common.refresh") })
    ] }),
    repository !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "form",
      {
        className: "wt-bar",
        onSubmit: (event) => {
          event.preventDefault();
          savePrefix();
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "wt-muted", htmlFor: "wt-prefix", children: t("panel.prefix") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              id: "wt-prefix",
              className: "wt-input wt-input-name",
              name: "worktree-prefix",
              value: prefix,
              disabled: busy,
              autoComplete: "off",
              spellCheck: false,
              placeholder: t("panel.prefixPlaceholder"),
              onChange: (event) => setPrefix(event.target.value)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "button",
            {
              type: "submit",
              className: "wt-btn wt-btn-primary",
              disabled: busy || hostOutdated || prefix.trim() === (data.branchPrefix ?? ""),
              children: [
                busy ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Spinner, {}) : null,
                " ",
                t("panel.save")
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wt-muted", children: t("panel.prefixHint") })
        ]
      }
    ) : null,
    notice !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        className: notice.kind === "error" ? "wt-error" : "wt-notice",
        role: notice.kind === "error" ? "alert" : "status",
        "aria-live": "polite",
        children: notice.text
      }
    ) : null,
    repository === null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t("panel.noRepository") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "wt-empty-hint", children: t("panel.noRepositoryHint") })
    ] }) : worktrees.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t("panel.empty") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "wt-empty-hint", children: t("panel.emptyHint") })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "wt-rows", children: worktrees.map((view) => {
      const entry = diffs[view.id];
      const age = entry === void 0 ? 0 : Date.now() - entry.at;
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        WorktreeRow,
        {
          t,
          view,
          busy,
          diff: entry?.value ?? null,
          diffAge: age === 0 ? 0 : Math.max(1, Math.round(age / 1e3)),
          diffStale: age >= POLL_MS,
          diffLoading: diffLoading === view.id,
          forceArmed: armedForce === view.id,
          onToggleDiff: () => toggleDiff(view),
          onOpen: () => openFolder(view),
          onRegister: () => register(view),
          onSession: () => newSession(view),
          onApply: () => apply2(view),
          onRemove: () => remove(view)
        },
        view.id
      );
    }) })
  ] });
}

// src/client/panel/icon.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function PanelIcon(props) {
  const size = props.size;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "data-active": props.active, "aria-hidden": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M4.5 13V3.5", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "4.5", cy: "13.4", r: "1.1", fill: "currentColor" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M4.5 9.2c0-2 1.6-2.6 3.4-3.1", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "8.4", y: "4.2", width: "5.6", height: "3.6", rx: "1", stroke: "currentColor", strokeWidth: "1.1" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "8.4", y: "9.4", width: "5.6", height: "3.6", rx: "1", stroke: "currentColor", strokeWidth: "1.1" })
  ] });
}

// src/client/plugin.ts
var PANEL_ID = "git-worktree";
var ICON_ORDER = 31;
var inject = ["slots", "locale"];
function apply(ctx) {
  installStyles(ctx);
  const locale = ctx.locale;
  const slots = ctx.slots;
  const onOpenSession = (sessionId) => {
    try {
      const navigation = ctx.get("uiWorkspace");
      navigation?.openSession?.(sessionId);
    } catch {
    }
  };
  ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), "git-worktree: dictionaries");
  const t = locale.bind(NS);
  slots.inject("sidebar.panellist", () => slots.register({
    name: "sidebar.panellist",
    id: PANEL_ID,
    order: ICON_ORDER,
    label: () => t("panel.title")
  }, PanelIcon));
  slots.inject("main", () => slots.register({
    name: "main",
    key: PANEL_ID,
    locale: NS
  }, (props) => (0, import_react4.createElement)(Panel, { ...props, onOpenSession })));
}
function installStyles(ctx) {
  const style = document.createElement("style");
  style.setAttribute("data-dsh-git-worktree", "");
  style.textContent = CSS;
  document.head.appendChild(style);
  ctx.effect(() => () => {
    style.remove();
  }, "git-worktree: styles");
}
    return module.exports;
  },
});
