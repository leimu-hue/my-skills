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

.dsk-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer;white-space:nowrap}
.dsk-check input{margin:0;flex:none}
/* MCP 服务器那颗胶囊：勾选框与文字必须同一条基线 */
.dsk-file{display:inline-flex;align-items:center;gap:6px;line-height:18px}
.dsk-file input{margin:0;flex:none}
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
/* 键盘焦点：宿主未必给每个自绘控件画焦点环，这里统一补一条。focus-visible 保证
   只有键盘操作才看得见，鼠标点击不会留下一圈蓝边。 */
.dsk-btn:focus-visible,.dsk-tab:focus-visible,.dsk-switch:focus-visible,.dsk-disclosure:focus-visible,.dsk-pick:focus-visible,.dsk-scene-pick-btn:focus-visible,.dsk-scene-pick-item:focus-visible,.dsk-section-toggle:focus-visible,.dsk-hint>summary:focus-visible,.dsk-input:focus-visible,.dsk-textarea:focus-visible,.dsk-select:focus-visible,.dsk-search:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2f6bff);outline-offset:2px}
/* 让 <label> 冒充按钮：真正的控件（file input）藏在里面。input 不用 display:none ——
   那样它会连 Tab 都收不到，键盘用户就永远选不了文件；改成“看得见但隐形”，
   焦点环画在 label 上（:focus-within）。 */
.dsk-pick{position:relative;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.dsk-file-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.dsk-pick:focus-within{outline:2px solid var(--dsw-alias-brand-primary,#2f6bff);outline-offset:2px}
/* 导入候选：一个可滚动的勾选列表，条目多时不把模态框撑破。 */
.dsk-candidates{display:flex;flex-direction:column;gap:2px;max-height:240px;overflow:auto;padding:4px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f7f8fa)}
.dsk-candidate{display:flex;align-items:center;gap:8px;width:100%;padding:3px 4px;border-radius:6px;box-sizing:border-box}
.dsk-candidate:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.dsk-candidate[data-disabled='true']{opacity:.55}
.dsk-candidate-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-primary,#1f2329)}
/* 导入诊断：一个文件一行「文件 — 原因」。路径用等宽字体且允许断行（压缩包里的路径可能很长），
   原因右对齐、用次级色，一眼能扫出是哪几个文件出了问题。 */
.dsk-fails{display:flex;flex-direction:column;gap:1px;max-height:32vh;overflow:auto;padding:4px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff)}
.dsk-fail{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);gap:4px 12px;align-items:baseline;padding:3px 6px;border-radius:6px}
.dsk-fail:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.dsk-fail-path{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-primary,#1f2329);overflow-wrap:anywhere}
.dsk-fail-reason{justify-self:end;text-align:right;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.dsk-fails-more{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.dsk-fails-more>summary{cursor:pointer;padding:2px 0}
.dsk-fails-more .dsk-fails{margin-top:4px}

.dsk-list{display:flex;flex-direction:column;gap:10px;min-height:0}
.dsk-group{border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#fff)}
.dsk-group-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
/* 分组头的折叠三角：压到按钮以下、只占一个字形的位置，别把「名称 + 徽章」挤走。 */
.dsk-disclosure{flex:none;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:10px;line-height:1;cursor:pointer}
.dsk-disclosure:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary,#1f2329)}
.dsk-group-head{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb);flex-wrap:wrap}
/* 只有一条头、没有内容的分组（场景卡片就是）：下面那道分隔线不和卡片底边叠在一起。 */
.dsk-group-head:last-child{border-bottom:0}
.dsk-group-name{font-weight:600;font-size:12px;white-space:nowrap}
/* 行内说明（场景说明那类）：单行、超长省略，全文靠 title。flex 收缩要配 min-width:0，否则省略号永远不会出现。 */
.dsk-note{flex:0 1 auto;min-width:0;max-width:34ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary,#8a8f99)}
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
/* 只读行（工作区清单、生效目标）：整行不可点，就不要手型光标。 */
.dsk-row-static{cursor:default}
.dsk-row-sub{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.dsk-row-when{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f99);white-space:nowrap;font-variant-numeric:tabular-nums}

.dsk-switch{position:relative;width:32px;height:18px;border-radius:9px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.14));background:var(--dsw-alias-bg-layer-3,#dfe1e6);cursor:pointer;flex:none;padding:0;transition:background .12s ease}
.dsk-switch::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#8a8f99);transition:transform .12s ease,background .12s ease}
.dsk-switch[data-on='true']{background:var(--dsw-alias-button-primary-fill,#2f6bff);border-color:transparent}
.dsk-switch[data-on='true']::after{transform:translateX(14px);background:var(--dsw-alias-label-primary-inverted,#fff)}
.dsk-switch:disabled{opacity:.45;cursor:default}

/* 详情抽屉：遮罩铺满窗口，抽屉靠右；抽屉自己负责高度与滚动。
   早先是 position:fixed 直接贴在窗口右边、没有遮罩 —— 会把左侧列表压掉一块，
   而且看起来像「飘在窗口右侧的一条」，点别处也关不掉。 */
/* 遮罩只盖内容区：上边界由 shell/panel.ts 实测后写进 --dsk-content-top，
   这样原生标题栏（含右上角最小化/最大化/关闭）不会被盖住，用户也不会误以为
   那三个按钮属于抽屉。 */
.dsk-panel-mask{position:fixed;inset:var(--dsk-content-top,0px) 0 0 var(--dsk-content-left,0px);display:flex;justify-content:flex-end;align-items:stretch;padding:8px 0;box-sizing:border-box;background:var(--dsw-alias-bg-mask,rgba(8,10,14,.32));z-index:20}
.dsk-panel{position:relative;display:flex;flex-direction:column;min-height:0;width:min(560px,100%);max-width:100%;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-right:0;border-radius:12px 0 0 12px;box-shadow:var(--dsw-elevation-panel,-8px 0 24px rgba(0,0,0,.12))}
.dsk-panel-head{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb)}
.dsk-panel-title-row{display:flex;align-items:center;gap:8px}
.dsk-panel-title{flex:1;min-width:0;font-weight:600;font-size:13px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsk-panel-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.dsk-panel-body{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:12px}
.dsk-kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;font-size:12px}
.dsk-kv-key{color:var(--dsw-alias-label-tertiary,#8a8f99);white-space:nowrap}
.dsk-kv-val{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);word-break:break-all}
.dsk-pre{margin:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f7f8fa);font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:11.5px;line-height:18px;white-space:pre-wrap;word-break:break-word;max-height:46vh;overflow:auto}
.dsk-files{display:flex;flex-wrap:wrap;gap:4px}
.dsk-file{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:11px;padding:1px 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,#f2f3f5)}
.dsk-section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6068);margin:0}
/* 可折叠的小节头：标题本身就是按钮（三角 + 标题 + 计数徽章同一行）。 */
.dsk-section-head{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.dsk-section-toggle{display:inline-flex;align-items:center;gap:6px;min-width:0;padding:2px 4px 2px 2px;margin-left:-2px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.dsk-section-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.dsk-section-caret{flex:none;width:10px;font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary,#8a8f99)}

/* 说明性折叠块（提示词的「生效时机」）：默认收起，展开后是一段小字。 */
.dsk-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.dsk-hint>summary{cursor:pointer;padding:2px 0;width:fit-content}
.dsk-hint>p{margin:4px 0 0;line-height:17px}

/* 卡片（预设 / 生效目标）：标题行 / 正文摘要 / 脚注三段。 */
.dsk-card{display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff)}
/* 生效中的那份给一条品牌色左边条：扫一眼就知道哪几张是活的（徽章仍然保留，不只靠颜色） */
.dsk-card[data-on='true']{box-shadow:inset 2px 0 0 var(--dsw-alias-button-primary-fill,#2f6bff)}
.dsk-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.dsk-card-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}
.dsk-card-actions{margin-left:auto;display:flex;align-items:center;gap:6px;flex:none}
.dsk-card-body{margin:0;font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-secondary,#5c6068);word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dsk-card-meta{display:flex;align-items:center;gap:10px;min-width:0;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.dsk-card-path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace)}
.dsk-card-when{margin-left:auto;flex:none;font-variant-numeric:tabular-nums}

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
.dsk-alert{padding:6px 10px;border-radius:6px;background:var(--dsw-alias-state-warn-tertiary,rgba(212,146,69,.12));color:var(--dsw-alias-state-warn-label,#8a5a1e);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
/* 错误条：底色与文字也必须成对。
   早先底色用 state-error-secondary（浅色主题里它是**实心红** red-400）、文字用
   state-error-primary（red-600）—— 红底红字，整条只剩一块红。宿主自己在 diff 里用的是
   「primary 按 12% 混底色」，这里跟它；前面一行 rgba 兜底老浏览器（没有 color-mix）。 */
.dsk-alert-err{background:rgba(201,65,74,.12);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c9414a) 12%,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-state-error-primary,#c9414a)}
.dsk-empty{padding:14px;text-align:center;color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px}
/* 新会话页的场景选择器（conversation.hero.options）。
   这里刻意**不用原生 <select>**：它展开的候选项列表由系统/浏览器绘制，渲染在页面之外的
   弹出层里，我们的样式与宿主的深色主题都管不到 —— 深色界面下就是「白底浅灰字」，正好是
   用户截图里那块看不清的列表。整块自绘之后，颜色全部走宿主成对的 token。 */
.dsk-scene-pick{position:relative;display:inline-flex;align-items:center;font-size:12px;line-height:16px}
.dsk-scene-pick-btn{display:inline-flex;align-items:center;gap:6px;max-width:220px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#5c6068);font:inherit;font-size:12px;line-height:16px;cursor:pointer}
.dsk-scene-pick-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.dsk-scene-pick-btn:disabled{opacity:.6;cursor:default}
.dsk-scene-pick-label{color:var(--dsw-alias-label-tertiary,#8a8f99);flex:none}
.dsk-scene-pick-value{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#1b1d21)}
.dsk-scene-pick-caret{flex:none;font-size:9px;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.dsk-scene-pick-list{position:absolute;bottom:calc(100% + 4px);left:0;z-index:60;min-width:150px;max-width:260px;padding:4px;display:flex;flex-direction:column;gap:2px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 6px 20px rgba(0,0,0,.28)}
.dsk-scene-pick-item{padding:5px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1b1d21);font:inherit;font-size:12px;line-height:16px;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsk-scene-pick-item:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.dsk-scene-pick-item[data-current="true"]{color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#4d6bfe);font-weight:600}
/* 提示条：底色与文字必须用宿主**成对**的那两个 token。
   早先文字用的是 label-primary-inverted —— 它在深色主题里是 neutral-bluish-800（深灰），
   配 toast-bg（深色主题 neutral-bluish-750）就是灰底灰字，几乎看不见。宿主自己的 toast
   用的是 toast-bg + toast-label，这里跟随它。 */
.dsk-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:7px 14px;border-radius:16px;background:var(--dsw-alias-toast-bg,rgba(28,32,38,.92));color:var(--dsw-alias-toast-label,#f7f8fa);font-size:12px;z-index:40;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.28)}
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
