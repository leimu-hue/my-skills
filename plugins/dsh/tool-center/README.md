# @local/dsh-tool-center · 工具中心

DeepSeek Harness 的一个左侧栏面板：**场景 / MCP / 技能 / 提示词** 四个域放在同一处管，另带一个
模型可读的技能工具（`skill_list`；启停仍归用户）。

```
左栏「插件」区 → 工具中心
```

它和 `dsh-plugin-tool-management` 管的是同一类事，但实现上刻意避开了那个插件的坑：
**读路径绝不写盘、写操作幂等短路、状态只有一个文件、客户端只有一个页面**。

## 四个域

### 场景

一个场景 = 一组要**启用**的 MCP 服务器 + 一批要**启用**的技能 + 一份提示词预设（及其作用范围）。

- **白名单语义**：场景记「你要用什么」，不是「你要关什么」。早先按关闭清单实现，界面上就变成
  让你勾掉一堆东西 —— 那不是人的表达方式。
- **整套切换**（默认开）：没勾选的技能与服务器会被关掉，所以一个场景就是一套完整环境；
  关掉它则只「启用勾选的、不动其它」。
- **重新应用时按记录回滚**：每项改动都记下「改之前是什么」，切到另一个场景或退出时逐项恢复，
  所以不会越切越关，也不会把你手工关掉的技能弄丢。
- 提示词可以**只对某个工作区生效**（写那个项目的 `AGENTS.md`），不影响别的项目与全局。

### MCP

读 `$DSH_HOME/cordis.patch.yml` 里的 MCP 服务器，支持启停与删除。

- 启停写成**文件末尾的覆盖行**（`disabled: true/false`），你原来那条声明一个字都不改；
- 启用也显式写 `disabled: false` —— 只删掉禁用行是不够的，你自己那条 `disabled: true` 仍然生效；
- 删除会把这个 id 的**所有行**（声明与各处覆盖）一起摘掉，避免「删了再加回来」继承旧的禁用状态；
- 任何写入先把 patch 备份到 `tool-center/backups/`（保留 10 份）。

> 刻意不做「新增服务器」表单：启动命令、参数、环境变量属于你的主机配置，让插件替你拼一个
> 错的命令，代价是宿主起不来。新增仍然手写，启停与删除交给这里。

### 技能

来源一览、逐条启停、同名优先级、详情、新建/编辑/删除（进回收站）、单技能与 ZIP 导入导出。新建固定落到「DSH 技能」，导入固定落到「导入技能」—— 不让人在两个内部键名（`import` / `local`）之间做没有意义的选择。

- **停用不改源文件**：注册自己的 provider，被停用的技能以 `modelInvocable: false` 的低 rank
  候选压过宿主条目；
- 技能自己的 `disable-model-invocation` / `user-invocable` 照旧生效，插件的开关叠加在上；
- 同名多份时按 rank（项目 > 导入 > DSH > agents > codex > claude > 自定义），可一键「设为首选」；
- **导入用「＋ 选择技能文件夹…」，先看再导**：选完先调 host 的 `import-scan`（只读，不写盘）列出包里有哪些技能、哪些已存在，用户勾选后才 `import-zip`；不再有「手填本机路径」那一栏。浏览器拿不到磁盘真实路径（Electron 不再暴露 `File.path`），所以选中的文件在前端打成 store-only ZIP 再上传，嵌套的 `references/`、平铺 `.md` 都照旧处理；
- **进不了技能目录的文件：一个文件一行**，写清「文件 — 原因」，而不是一句「N 个文件不在任何技能目录下」把名字挤成逗号串。两档分开报：
  - **能确定与技能无关的直接忽略**（`已忽略 N 个无关文件`，折叠着只报个数，点开是全部路径）：`__MACOSX/`、`.DS_Store`、`~$x.docx` 这类系统/编辑器垃圾，以及与技能目录**并列**的 `bundle-manifest.json`、`使用指引.md` 这类 bundle 说明与清单 —— 它们永远进不了技能，也不该算进技能的文件数；
  - **说不清的逐条列出**：例如一个只有 `references/` 却没有 `SKILL.md` 的目录，每个文件一行、原因写「缺少 SKILL.md」。原因带原因码（`noDoc` / `bundleDoc` / `junk`），界面按码取词条，所以中英文界面都不会露出另一种语言；
- **不猜技能目录，改从宿主注册表读**：宿主把技能装在哪是它自己的实现细节（`skill-filesystem.customSkillDirs`、应用自带的官方技能包等），写死路径迟早会错。所以本插件读一次 `ctx.skills.list()`，从中反推「宿主已经在发布、但我们没有对应来源」的目录，补成只读来源（`kind=host`，标题取目录名）：

  - 宿主路径变了，下一次读取自然跟上；宿主不再发布，它就自动消失；
  - `skills.list()` 的摘要**只有 `resourceBase`**（技能自己的目录），没有 `path` / `locator`。bundle 的 `resourceBase` 是 `<root>/<skill>`，父目录才是来源；平铺技能的 `resourceBase` 就是来源本身，不再往上猜（否则会把 `~/.claude` 当成来源）；
  - 系统容器（`%TEMP%`、家目录、`$DSH_HOME`、进程工作目录）本身或它们的祖先永远不会被自动加成来源 —— Windows ACL 诊断技能会把自己解包到 `%TEMP%\dsh-acl-skill-*`，正是它让「反推」误把整个 Temp 扫成了技能列表；
  - 已经在我们已知来源里的目录（`$DSH_HOME/skills`、`~/.agents/skills` 等）不会被重复列出；
  - 这些来源是 `hostScans: true` —— 宿主本来就在发，我们只在策略变化时补一条覆盖候选，绝不在里面写文件；
  - **事件驱动，不在读路径上探测**：宿主注册表变化时会发 `skills/change`（provider 注册 / 失效、文件监听都会触发），插件订阅它并防抖 250ms 重探一次；启动时也先探一次。面板读取只碰缓存 —— 进入技能页不会再为「宿主还在发布什么」跑一遍全部 provider；写技能不影响宿主目录集合，所以不因此重探；另有 60 秒兜底后台探测（只在事件没到且缓存过期时补一次，不挡读取）；
  - **provider 自己绝不探测注册表**：`skills.list()` 会回调本插件的 `provider.list()`，而 provider 也要读视图 —— 若在视图里再调 `skills.list()`，就是「面板 → 宿主 → 面板」的无限递归（症状是面板永远停在「正在加载技能…」、硬盘被反复读）。所以 provider 那条读取路径只读缓存（`ReadOptions.probeHost: false`），面板 / 工具那条路径才探测，且同一时刻只探一次、最多等 1.5 秒（超时先用旧值返回，探测在后台继续）；
  - **面板改完策略，`/` 菜单也跟着刷新**：DSH 的 `ui-skill` 按 session 缓存 `remote.skills.list()`，只认两个事件 —— `agent-preset/selected`（远端，第一个参数是 sessionId）与 `connection/reset`（浏览器本地）；这一版的 remote 转发白名单里没有 `skills/change`。所以每次 `skills/change`（防抖 250ms）我们补发一次 `agent-preset/selected`（sessionId, preset）：它只被 `ui-skill` 清技能缓存、`ui-commands` 重置该 session 的命令目录消费，宿主侧没有任何监听，不改会话 preset、不写会话日志。DSH 将来把 `skills/change` 转发到浏览器后，这段可以删掉；
- **只发宿主会收的候选**：宿主在 `skills.list()` 的 provider 返回值上硬校验形状（名字必须 `kebab-case`、描述非空），而且校验在 try/catch 之外 —— 一条不合规的候选不是「跳过这一条」，而是让整次 list() 抛错，用户看到的是「本轮运行失败 skill provider "tool-center" returned invalid skill name …」。所以扫描器把不合规的名字标成 `结构不完整 / invalid name`，provider 再逐条挡掉，绝不把无效技能塞进 harness；
- **覆盖候选固定 rank = 1**：宿主的 provider rank 是一整片，不是「400 一档」—— project 100/200、runtime 250、custom 300、user 400、agents 500、bundled 600。覆盖候选必须比该名字的**每一个**宿主候选都小，否则「在面板里关掉」只对一部分来源生效（典型症状：office 来自 custom 目录 rank 300，旧的 399 压不住它，关了还能在 `/` 里搜到）。组内只有一个赢家会被发布，不同名字之间不会互相竞争，所以固定 1 就够，并有测试守着；
- **每个 agent 的作用域里也注册一份覆盖 provider**：宿主按查看方的 scope 链合并技能，**更近的层直接压过全局层，rank 不参与跨层比较**。只在全局注册的话，宿主在 agent / preset 层发布的同名技能（office 就是这样）永远压着我们 —— 所以 `agent/created` 时把 `service.makeProvider()` 再注册进 `agent.ctx` 的作用域（`Agent.id` 是 `SessionId` 字符串，别只认数字），agent 卸载时随之拆除；
- **来源可折叠**：每个来源头部有折叠三角，来源里条目多时收起来，才不用滑很久才看到下一个来源（Codex / Claude 这些）。折叠状态只记在本机 `localStorage`，不写进技能策略，换台机器不会跟着走；
- 只在该介入时才发候选：本机实测 70 条技能里只发 4 条候选（宿主看不见的那些），
  28 条同名副本一条都不发。

### 提示词

多套预设（`tool-center/prompts/*.md`，中文名可用），**作用范围是每份预设自己的属性**，卡片上
直接启用 / 停用：

| 作用范围 | 写到哪 | 谁受影响 |
|---|---|---|
| 全局 | `$DSH_HOME/AGENTS.md` | 每个会话 |
| 工作区 | `<项目>/AGENTS.md` | 只该项目里的会话 |

两档都是宿主真实存在的指令来源（`dsh-agent-instructions` 读用户级全局 + cwd 到项目根这条祖先链），
所以「只对某个工作区生效」不是模拟。工作区列表来自宿主的**工作区登记表**
（`ctx.workspaceRegistry`），不是猜的、也不是写死的。

- 因为范围属于预设，**可以同时有两份在不同工作区生效**，互不干扰；
- 同一个目标（同一个 `AGENTS.md`）上只允许一份生效：启用新的会自动停用旧的，并告诉你换掉了谁；
- **启用 = 先备份再覆盖**，每个目标各留 5 代；**停用 = 回到该目标的链起点**
  （起点本来没有文件就把文件删掉，而不是留一个空文件被宿主当成空指令读进去）；
- 每个目标各自记内容指纹：外部手改了某份 `AGENTS.md`，界面会标那份「已被外部改动」；
- 页面下方列「生效中的目标」，一眼看清哪份写到了哪个文件。

**生效时机说实话**：宿主每个会话**每轮**都会重新读取这些文件，所以启用 / 停用 / 改正文会影响
已有会话的**下一轮**；文件方案做不到「只对新会话生效」，本插件不假装能。真正的隔离边界是
作用范围：绑定到工作区 A 的预设不碰 B 项目和全局。

## 安装

桌面版，与同仓库的 `@local/dsh-related-projects` 一样的本地链接方式：

```jsonc
// ~/.dsh/profiles/desktop/package.json
{
  "dependencies": {
    "@local/dsh-tool-center": "link:D:/custom_project/ai-project/my-skills/plugins/dsh/tool-center"
  },
  "dsh": {
    "profile": { "bundles": [ /* ... */ "@local/dsh-tool-center" ] }
  }
}
```

```powershell
cd D:\custom_project\ai-project\my-skills\plugins\dsh\tool-center
npm install        # 只装 esbuild / typescript / @types/node
npm run build      # 必须先构建：dist/ 不存在时宿主加载会失败
npm test           # 130 个用例

cd $env:USERPROFILE\.dsh\profiles\desktop
npm install --no-audit --no-fund
```

**重启桌面应用**，然后点左栏「插件」区里的 `工具中心`（在「关联项目」旁边）。

## 插件清单元数据

设置里的插件列表显示的**名字与描述**来自本包的 `locale/<lang>.json`：

```json
{ "meta": { "title": "工具中心", "description": "…" } }
```

- `zh.json` / `en.json` 各一份，按宿主语言选取；缺了它，列表里就只剩包名 `@local/dsh-tool-center`（图标仍来自 `exports["./icon"]`）；
- 这两个文件由 `exports["./locale/*.json"]` 暴露，**不要**当成无用配置删掉；
- 它与面板内部的界面词典（`src/client/i18n/`，运行时注册）是两回事：一个给插件管理器看，一个给面板自身用。

## 数据落点

| 内容 | 位置 |
|---|---|
| 技能策略（来源开关、逐条开关、首选、自定义目录、rank、预留分层） | `$DSH_HOME/tool-center/state.json` |
| 提示词预设 + 索引 + 备份 | `$DSH_HOME/tool-center/prompts/`（备份在 `__backup__/`） |
| 提示词生效文件 | `$DSH_HOME/AGENTS.md` |
| 场景 | `$DSH_HOME/tool-center/scenes.json` |
| MCP 服务器 | `$DSH_HOME/cordis.patch.yml`（本插件只追加自己的段落，写前备份） |
| patch 备份 | `$DSH_HOME/tool-center/backups/` |
| 技能导入落点 | `$DSH_HOME/tool-center/skills/` |
| 技能回收站 | `$DSH_HOME/tool-center/trash/` |
| 插件日志 | `$DSH_HOME/tool-center/plugin.log`（只在真的变更时写，512 KiB 滚动） |

旧版本（包名 `skill-manager`）留下的 `$DSH_HOME/skill-manager/` 会在首次启动时**自动改名**为
`tool-center/`，不需要手工搬。

## 模型能看到什么、能改什么

分工是刻意的：**启停是用户的判断，不是模型的。**

| 动作 | 谁做 | 为什么 |
|---|---|---|
| 启停技能 / 切换场景 | **你**（面板、场景按钮、或对话里让模型……见下） | 开关改变的是「模型能看见什么、能调什么」，属于能力面。让模型自己改，等于让它决定自己的权限边界 |
| 知道「这条技能存在，但被关掉了、原因是什么」 | 模型（只读） | 会话里的技能目录按设计**藏掉**停用项，模型否则只能说「没有这个技能」 |
| 读技能正文 | 官方 `skill` 工具 | 它经 `ctx.skills.get()` 拿到的正是我们候选里的正文，再做一个 `skill_read` 只是第二个入口 |

所以默认只注册**一个只读工具**：

| 工具 | 参数 | 作用 |
|---|---|---|
| `skill_list` | `all?`（默认 true）`root?` `search?` | 列出技能与开关状态，并给出原因：`disabled-by-user` / `source-off` / `shadowed-by:<root>` / `invalid` / `manual-only` |

想保留「在对话里说一句，让它替我切」的用法，在插件配置里显式打开：

```yaml
- id: tool-center
  name: '@local/dsh-tool-center'
  config:
    allowAgentSwitch: true   # 默认 false
```

打开后才会多注册 `skill_switch`（形状与面板一致，仍然不写技能文件；`scope` 只接受 `global`，
`session` 会明确报「已预留、未实现」）。

**新增 / 删除技能不需要任何工具**：写一个 `SKILL.md`，官方 `dsh-skill-filesystem` 经
`fs/observed` 与 watcher 自动发现并广播 `skills/change`；本插件只在改完策略后调
provider 的 `control.invalidate()`。

## 分层作用域（已预留）

技能策略的结构里已经有 `layers.sessions` / `layers.workspaces`，所有策略读取都经过
`resolveLayer()`。补齐时只改 `skills/state.ts` 与三个写 op，扫描 / 分组 / provider 不用动。

## 开发

```powershell
npm run build            # tsc → dist/host/（保留目录树），esbuild → dist/client.js
npm test                 # node --test "test/*.test.mjs"
npm run typecheck:host
npm run typecheck:client
```

```
src/host/
  index.ts              接线：provider（全局 + 每个 agent 作用域）、工具、路由、watcher、迁移
  shared/               四个域共用的地基
    types.ts            root / entry / row / policy / 状态 / 视图 的词汇表
    result.ts           OpResult + DomainError（一份领域异常，不再每域一个类）
    paths.ts            路径身份、原子写、唯一写锁、旧布局迁移
    fs.ts               「出错就当没有」的读法（exists / statOrNull / readTextOrNull）
    json.ts             isRecord：非 null、非数组的「普通对象」判断（原先各处手写）
    backups.ts          带时间戳的备份 + 保留最近 N 份（提示词 / MCP 共用）
    http.ts             请求管道：POST、门禁头、JSON 体与大小上限、回环兜底
    zip.ts              零依赖 ZIP 读写（CRC 表与浏览器侧 core/zip.ts 各一份，改动时两处一起改）
    log.ts              插件日志（512 KiB 滚动）
  skills/               技能域（本插件的核心）
    frontmatter.ts      SKILL.md 解析；编辑只改目标键，其余字节原样保留
    roots.ts            来源与 rank（rank 是数据，可用 state.ranks 覆盖）
    scan.ts             遍历 + 解析缓存（mtime/size），并发合流
    state.ts            技能策略文档；读坏降级；分层作用域的唯一入口
    policy.ts           同名分组与开关解析的唯一实现
    view.ts             面板 / provider / 工具共用的一份视图
    provider.ts         ctx.skills.registerProvider 的候选与正文
    service.ts          技能域的 op 表面（独占状态 + 锁 + 扫描器）
    files/              文件操作
      guard.ts          名字校验、目标路径解析、可写断言、树复制
      authoring.ts      新建 / 编辑 / 读详情（一次读盘出正文与 frontmatter）
      trash.ts          回收站：删除是移动，索引只有一个文件
      transfer.ts       导入（路径 / ZIP）与导出
  prompts/service.ts    提示词预设、应用 / 取消应用、备份与指纹
  mcp/service.ts        cordis.patch.yml 的 MCP 服务器：列出 / 启停 / 删除
  scenes/service.ts     场景：三域组合的应用与回滚
  api/
    routes.ts           全部 op 的表（技能 / 提示词 / MCP / 场景）
    tools.ts            skill_list（只读）+ 可选 skill_switch（allowAgentSwitch）
    server.ts           那条具名路由的请求处理与状态码映射
src/client/
  main.ts               ModuleLoader 入口
  plugin.ts             slots 装配：sidebar.panellist（图标）+ main（面板），同一 id 配对
  page.ts               页签外壳（场景 / MCP / 技能 / 提示词）
  shell/                panel.ts（主栏容器）+ icon.ts（侧栏单色图标）
  styles.ts             全部 `.dsk-*` 样式（成对使用宿主 --dsw-* token）
  core/
    runtime.ts          React 访问器与 hooks
    api.ts              同源 POST /tool-center/api
    types.ts            Host 视图形状在浏览器半侧的镜像
    domain.ts           useDomain：读一次 / 写一次 / busy / error / 提示语
    ui.ts               共用渲染原子（页头、分组、模态框、字段、按钮、开关）
    zip.ts              浏览器侧 store-only ZIP 写入（选文件夹后打包用）
  i18n/
    index.ts            词典合并、translateWith、按语言挑词典
    common.ts           页签名与通用动作
    skills.ts           技能域词条
    prompts.ts          提示词域词条
    mcp.ts              MCP 域词条
    scenes.ts           场景域词条
  skills/
    view.ts             技能域外壳（列表 / 详情 / 表单 / 导入 / 回收站串起来）
    list.ts             来源分组与技能行
    detail.ts           详情面板
    form.ts             新建 / 编辑表单
    import.ts           导入面板
    trash.ts            回收站面板
  prompts/view.ts       提示词域视图
  mcp/view.ts           MCP 域视图
  scenes/view.ts        场景域视图
```

## 测试

`npm test` → **130 个用例 / 全部通过**：

| 文件 | 盯的是什么 |
|---|---|
| `frontmatter.test.mjs` | 解析子集、严格布尔、未知键与注释在编辑后原样保留 |
| `zip.test.mjs` | 读写往返、CRC、路径穿越拒绝、尺寸上限 |
| `state.test.mjs` | 坏文件降级不锁死、归一化、分层预留、死名字清理 |
| `policy.test.mjs` | 同名分组、停用赢家仍然遮蔽、rank、`needsOverlay` 边界 |
| `scan.test.mjs` | 嵌套发现、解析缓存、并发合流、读取失败有出口 |
| `service.test.mjs` | **读不写盘**、重复开关不写盘、来源/首选/增删改/回收站/导入导出、候选最小化、按组 rank |
| `prompts.test.mjs` | 预设 CRUD、应用/链起点/取消应用、外部改动的 drift、备份上限 |
| `mcp.test.mjs` | patch 解析、显式 `disabled:false` 覆盖、幂等、删除连覆盖行、拒绝只读覆盖 |
| `scenes.test.mjs` | 三域应用、切换回滚只回滚自己动过的、退出、活动场景不可删 |
| `wiring.test.mjs` | 真实 `apply()` 接线、门禁头、op 分发、预留作用域、卸载清理 |
| `client-bundle.test.mjs` | 浏览器半在 vm 里加载、侧栏图标 + 主栏面板配对、词典覆盖、渲染一次不抛错 |
| `client-views.test.mjs` | 四个域视图各自单独打包后各渲染一次（空状态不抛错） |

## 已知边界

- 面板没有会话上下文，所以技能页**只列用户级来源**；项目技能要在对话里由 `skill_list` 看到。
- 场景作用于全局策略，没有会话级场景（技能的分层作用域仅预留）。
- MCP 只读 `$DSH_HOME/cordis.patch.yml`；profile 级 patch 里的服务器不在这个面板里。
- 递归发现技能到第 3 层；第 2 层及更深的由本插件发布（面板标「子目录」）。
- watcher 只监听来源根目录（非递归）；bundle 内部的改动靠 mtime 校验在下一次读取时生效。
