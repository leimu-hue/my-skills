/**
 * 一份样式表，由 `apply` 注入一次，随插件一起移除。
 *
 * 除图形外，只用 `--dsw-alias-*` 令牌。注意：默认暗色主题下品牌令牌
 * 接近白色，所以「primary」做成描边——填充的品牌色按钮会变成
 * 白底白字。
 */
export const CSS = `
.rprj-dock{display:flex;flex-direction:column;gap:6px;padding:2px 4px;font-size:12px;color:var(--dsw-alias-label-secondary);position:relative}
.rprj-dock-inner{display:flex;align-items:center;gap:8px;min-height:24px;flex-wrap:wrap}
.rprj-dock-label{display:inline-flex;align-items:center;gap:4px;background:none;border:none;padding:2px 4px;border-radius:6px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;white-space:nowrap}
.rprj-dock-label:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.rprj-caret{font-size:9px;opacity:.7}
.rprj-chip-badge{font-weight:600;color:var(--dsw-alias-state-error-primary);font-size:11px;font-variant-numeric:tabular-nums}
.rprj-dock-add{align-self:flex-start;padding:2px 10px;border-radius:999px;border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;line-height:18px}
.rprj-dock-add:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.rprj-icon-btn{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:6px;width:22px;height:22px;line-height:1;font-size:13px;display:inline-flex;align-items:center;justify-content:center}
.rprj-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.rprj-notice{color:var(--dsw-alias-state-warn-primary);font-size:12px}
.rprj-popover{position:absolute;z-index:40;bottom:calc(100% + 6px);left:0;min-width:280px;max-width:min(520px,90vw);max-height:320px;overflow:auto;overscroll-behavior:contain;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:8px}
.rprj-popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 4px 8px;color:var(--dsw-alias-label-secondary);font-size:11px}
.rprj-popover-row{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:6px 8px;border:none;border-radius:8px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-primary)}
.rprj-popover-row:hover{background:var(--dsw-alias-bg-layer-2)}
.rprj-popover-row[data-missing=true]{cursor:default;opacity:.75}
.rprj-popover-line{display:flex;align-items:center;gap:6px;min-width:0}
.rprj-popover-name{font-size:12px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rprj-popover-name[data-missing=true]{color:var(--dsw-alias-state-error-primary);text-decoration:line-through}
.rprj-popover-path{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.rprj-popover-note{font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.85;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rprj-popover-missing{font-size:11px;color:var(--dsw-alias-state-error-primary)}
.rprj-panel{display:flex;flex-direction:column;gap:14px;padding:20px 24px;width:100%;box-sizing:border-box;min-width:0;height:100%;overflow:auto;overscroll-behavior:contain;color:var(--dsw-alias-label-primary);font-size:13px}
[data-platform=darwin] .rprj-panel{padding-top:calc(20px + var(--dsh-frame-top-clearance,0px))}
.rprj-panel-head{display:flex;flex-direction:column;gap:4px}
.rprj-title{font-size:16px;font-weight:600;margin:0;text-wrap:balance}
.rprj-sub{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;text-wrap:pretty}
.rprj-select,.rprj-input,.rprj-textarea{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid transparent;border-radius:8px;padding:6px 8px;font-size:12px;line-height:18px;font-family:inherit;transition:border-color .12s ease,background-color .12s ease,box-shadow .12s ease}
.rprj-select:hover,.rprj-input:hover,.rprj-textarea:hover{border-color:var(--dsw-alias-border-l1)}
/* 焦点：边框转品牌色 + 一圈淡色外环，这就是替代 outline 的焦点指示。
   2px 白环在整宽输入框上又亮又跳（尤其暗色主题），所以不用 outline。 */
.rprj-select:focus,.rprj-input:focus,.rprj-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent)}
.rprj-select{max-width:420px}
/* 名称是行卡片里的标题：平时读作文字，指上去才显出它是一个可编辑框。 */
.rprj-input-name{flex:1 1 160px;min-width:0;width:auto;margin-left:-6px;padding:4px 6px;font-size:13px;font-weight:600;background:transparent}
/* 指上去浮出一块底色：名称平时读作标题，但得看得出可改。聚焦时不叠这层，
   否则同样特异性的 hover 边框会盖掉焦点色。 */
.rprj-input-name:hover:not(:focus){border-color:transparent;background:var(--dsw-alias-bg-layer-2)}
.rprj-textarea{width:100%;resize:vertical;line-height:1.55;background:transparent}
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
.rprj-toggle:hover{border-color:var(--dsw-alias-label-secondary)}
.rprj-toggle[aria-checked=true]:hover{border-color:var(--dsw-alias-brand-primary)}
.rprj-toggle-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .15s ease,background-color .15s ease}
.rprj-toggle[aria-checked=true] .rprj-toggle-knob{transform:translateX(14px);background:var(--dsw-alias-brand-primary)}
.rprj-btn-delete:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);color:var(--dsw-alias-state-error-primary)}
/* 待确认的删除条：先说后果，再给两个答案，排成一行，
   窄面板下会折行。带色调的边框让它读起来像一个状态，而不是按钮。 */
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
.rprj-ws-name{font-size:13px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rprj-ws-path{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.rprj-ws-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}
.rprj-ws-count{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.rprj-ws-warn{font-size:11px;color:var(--dsw-alias-state-warn-primary)}
.rprj-select-copy{max-width:200px}
.rprj-empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:18px;text-align:center}
.rprj-muted{color:var(--dsw-alias-label-secondary);font-size:12px;margin:0}
.rprj-error{color:var(--dsw-alias-state-error-primary);font-size:12px}
.rprj-foot{font-size:11px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rprj-spinner{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:rprj-spin .8s linear infinite;vertical-align:-2px}
@keyframes rprj-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){
  .rprj-spinner{animation:none}
  .rprj-confirm{animation:none}
  .rprj-toggle-knob{transition:none}
}
/* 可交互元素：去掉双击缩放延迟与点击高亮。按钮类用 focus-visible 焦点环；
   输入类自己带品牌色边框 + 淡外环，所以不在这里再加一圈 outline。 */
.rprj-dock-label,.rprj-dock-add,.rprj-icon-btn,.rprj-btn,.rprj-toggle,.rprj-ws-toggle,.rprj-popover-row,.rprj-select,.rprj-input,.rprj-textarea{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.rprj-dock-label:focus-visible,.rprj-dock-add:focus-visible,.rprj-icon-btn:focus-visible,.rprj-btn:focus-visible,.rprj-toggle:focus-visible,.rprj-ws-toggle:focus-visible,.rprj-popover-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
/* 组合控件用 focus-within 提示：整行/整卡都是同一个编辑对象。 */
.rprj-row:focus-within,.rprj-ws:focus-within{border-color:var(--dsw-alias-border-l2)}
`
