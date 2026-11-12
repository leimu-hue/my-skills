/**
 * 一份样式表，由 `apply` 注入一次，随插件一起移除。
 *
 * 除图形外，只用 `--dsw-alias-*` 令牌。默认暗色主题下品牌令牌接近白色，
 * 所以「primary」做成描边——填充的品牌色按钮会变成白底白字。
 */
export const CSS = `
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
`
