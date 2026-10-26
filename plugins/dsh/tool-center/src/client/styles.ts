/**
 * 样式，全部挂在 `.dsk-*` 前缀下，基于宿主的 `--dsw-*` 变量并写好字面量兜底，
 * 于是页面跟随主题、变量缺失时也不至于塌掉。
 *
 * 一条硬规则：**成对的 token 要成对用**。宿主的 `--dsw-alias-brand-primary` 在浅色主题是
 * 近黑、在深色主题是近白；把它当底色却把文字写死成 #fff，深色下就是白底白字（开关同样会变成
 * 白胶囊）。所以底色用 `button-primary-fill`，上面的字/旋钮用 `label-primary-inverted`。
 */
export const CSS = `
.dsk-root{display:flex;flex-direction:column;gap:12px;min-height:0;padding:4px 2px 24px;color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;line-height:20px}
.dsk-head{display:flex;flex-direction:column;gap:6px}
.dsk-title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsk-title{font-size:15px;font-weight:600;margin:0}
.dsk-sub{color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px;margin:0}
.dsk-badge{display:inline-flex;align-items:center;gap:4px;padding:0 6px;height:18px;border-radius:9px;font-size:11px;line-height:18px;background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-secondary,#5c6068);white-space:nowrap}
/* 状态徽章：中性底 + 彩色圆点。直接用「彩色底 + 彩色字」在深色主题下会糊在一起（对比度不够）。 */
.dsk-badge-ok,.dsk-badge-warn,.dsk-badge-off{background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-secondary,#5c6068)}
.dsk-badge-ok::before,.dsk-badge-warn::before{content:'';width:6px;height:6px;border-radius:50%;flex:none}
.dsk-badge-ok::before{background:var(--dsw-static-green-500,#2ea56a)}
.dsk-badge-warn::before{background:var(--dsw-static-amber-500,#d49245)}
.dsk-badge-off{background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-tertiary,#8a8f99)}

/* 页签栏：多域入口（场景 / MCP / 技能 / 提示词） */
.dsk-view{display:flex;flex-direction:column;gap:12px;min-height:0}
.dsk-tabs{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb);padding-bottom:6px;flex-wrap:wrap}
.dsk-tab{height:26px;padding:0 10px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#5c6068);font-size:12px;cursor:pointer}
.dsk-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.dsk-tab[data-active='true']{background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-primary,#1f2329);font-weight:600}
.dsk-tab-count{color:var(--dsw-alias-label-tertiary,#8a8f99);font-weight:400}

.dsk-scope{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f7f8fa)}
.dsk-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer;white-space:nowrap}
.dsk-check input{margin:0;flex:none}
/* MCP 服务器那颗胶囊：勾选框与文字必须同一条基线 */
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
/* 主栏面板的外壳：挂在 sidebar.panellist + main 上，所以整块占满、自己滚动、自己负责内边距
   （设置页那边的 .dsk-root 内边距在这里被归零，两处复用同一套页签与域视图）。 */
.dsk-page{display:flex;flex-direction:column;gap:12px;padding:20px 24px;width:100%;box-sizing:border-box;min-width:0;height:100%;overflow:auto;overscroll-behavior:contain}
[data-platform=darwin] .dsk-page{padding-top:calc(20px + var(--dsh-frame-top-clearance,0px))}
.dsk-page .dsk-root{padding:0;min-height:0}
`
