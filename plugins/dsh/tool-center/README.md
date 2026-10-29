# @local/dsh-tool-center · 工具中心

DeepSeek Harness 的一个左侧栏面板：**场景 / MCP / 技能 / 提示词** 四个域放在同一处管，另带一个
模型可读的技能工具（`skill_list`；启停仍归用户）。

```
左栏「插件」区 → 工具中心
```

它和 `dsh-plugin-tool-management` 管的是同一类事，但实现上刻意避开了那个插件的坑：
**读路径绝不写盘、写操作幂等短路、状态只有一个文件、客户端只有一个页面**。

当前版本 `0.5.1`：客户端按「逻辑 / 界面」分成 `lib/` 与 `components/` 两层（见「开发」）。

## 四个域

### 场景

一个场景 = **一组可复用的定义**：要**启用**的技能 + 要**保留**的 MCP 服务器 + 一份提示词预设。

**场景不属于某个工作区，而是被工作区选择**：

| 层级 | 谁决定 | 存在哪 | 影响 |
|---|---|---|---|
| 场景定义 | 你（面板新建 / 编辑） | `scenes.json` 的 `scenes[]` | 什么都没生效，只是一个档案 |
| 工作区默认 | 面板里每个工作区各选一次 | `active[<工作区>]` | 该工作区所有会话的默认场景 |
| 会话选择 | 新会话页的下拉 / `/scene` | `sessions[<根会话>]` | 只影响这个对话，压过工作区默认 |
| 待认领 | 新会话页的下拉额外记一条 | `pending[<工作区>]` | 交给「本工作区接下来真正开始的那场对话」 |

- 同一个场景可以同时被多个工作区使用；一个工作区同时只用一个。
- 会话可以「跟随工作区 / 指定某个场景 / 不使用」三选一 —— 这是「会话开始时选择」的落点：
  新会话页那一行（工作区与预设控件右侧）有一个场景下拉；已有会话用 `/scene`。
- **新会话页上的选择会被「认领」**：那个页面的会话 id 只是草稿（宿主在真正发送时才建对话），
  所以下拉除了写 `sessions[草稿 id]`，还写一条 `pending[工作区]`。等某个真实会话在同一个
  工作区里**第一次读技能**时（provider 的 `beforeView`），把它认领过来、写进那个会话、
  再把草稿 id 上的残留记录清掉。三条克制：会话自己选过（含 `/scene`）就不动；超过 30 分钟
  的意图作废；工作区默认一改，这条意图也随之作废。没有这一步，在开始页选好的场景会
  静静地不生效 —— 这正是会话日志里被复现过的情形（选了场景的会话只有一行 header，
  真正跑对话的是另一个 id）。
- **隔离方式**：技能写进作用域层（`state.layers.workspaces['<工作区>']` /
  `state.layers.sessions['<根会话>']`），全局策略一个字节都不改；会话选择是**整层替代**，
  不是叠加。清掉选择 = 删掉那一层，没有「回滚」要算。
- **白名单语义**：场景记「你要用什么」，不是「你要关什么」。
- **整套切换**（默认开）：所选作用域里没勾选的技能会被挡掉，所以一个场景就是一套完整环境；
  关掉它则只「启用勾选的、不动其它」。实现上是给这一层打 `whitelist` 标记，而不是把未选中的
  名字逐条记下来 —— 白名单是规则：之后新装的技能不会悄悄漏进场景，状态文件也不会被快照撑大。
- **可以打开平时关着的技能**：作用域层是正向覆盖（`enabledSkills`），优先级高于全局的关闭记录。
- **子会话算在它所属的那次对话里**：子代理 / 侧聊有自己的 session id，工作区与会话选择都沿
  `header.parentSession` 上溯到根会话 —— 否则父会话里藏起来的服务器与技能，派一个子代理就能
  重新看见。取不到会话身份时按「不做隔离」处理（宁可少隔离，不串到别的项目）。
- **「进了，但没全进」要说出来**：档案里的技能已被删除 / 改名时，报告给出「只生效了 N 条」与差额；
  会话级选择与工作区默认走同一句提醒（早先只有工作区那条会说，会话那条默默少几条）。
- **技能留空的场景只动 MCP**：只勾了服务器的场景不会写一张空白名单 —— 那会把整个会话的
  技能一次全关掉。一条没命中时写 `null`（跟随下层）；只有「整套切换 + 勾了技能」才会遮人。
- 提示词**只有作用范围就是这个工作区的预设**才会进场景；全局预设会被跳过并警告。
  **提示词没有会话级**：区段正文按工作区现算，按会话开关不了 —— 所以会话选择只覆盖
  技能与 MCP 工具，命令与界面都会说明这一点。
- **MCP 工具按作用域隔离**：服务器本身仍是宿主级装载（`cordis.patch.yml` 不动），但「模型能看见
  哪些 MCP 工具」是在 **agent 作用域**里遮出来的 —— 只保留勾选服务器的
  `mcp__<serverName>__*` 工具，其余对模型不可见（`ctx.tools.restrict({deny})`，只作用于这个会话，
  dispose 即解除）。不需要重启、不改配置、也不影响别的项目。
  - 只能**收窄**：宿主里没启用的服务器，工具根本不存在，场景无法只在一个项目里把它拉起来
    （那需要把 mcp-client 挂进 agent 作用域，是另一件事）——这种勾选会明确告警；
  - 只在**整套切换**下生效：非整套切换的语义是「只加不减」，而工具层没有「新增」这个动作；
  - 依赖工具的**当前**注册表：`restrict()` 拒绝未知名字，所以名单从 `tools.schemas()` 算，并在
    `tools/change` 时重算（服务器连上 / 掉线 / 启停都算），名单没变就不重挂。

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
直接启用 / 停用。启用后**追加成一段系统提示词**（`ctx.systemPrompt.section`），**不写任何用户
文件** —— 所以用户手改、覆盖、甚至删掉 `AGENTS.md`，预设都照旧生效。

| 作用范围 | 追加给谁 |
|---|---|
| 全局 | 每个会话 |
| 工作区 | 只该项目里的会话（含子目录） |

工作区列表来自宿主的**工作区登记表**（`ctx.workspaceRegistry`），不是猜的、也不是写死的。

- 范围属于预设，所以**可以同时有两份在不同工作区生效**，互不干扰；
- 同一个目标上只允许一份生效：启用新的会自动停用旧的，并告诉你换掉了谁；
- 正文只在预设文件里存在一份：改正文不用「再应用一次」，也就不需要备份与「已被外部改动」这种状态；
- 区段固定在 order 9500（工具说明之后、结构化输出的约束之前），正文按 `interpolate: false`
  原样注入 —— 正文里的 `{{…}}` 只是正文，不会被当成提示词变量解析；
- 页面下方列「生效中的目标」，一眼看清哪份追加到了哪个范围。

**生效时机说实话**：系统提示词每一步都会重新组装，所以启用 / 停用 / 改正文会影响已有会话的
**下一轮**；做不到「只对新会话生效」。真正的隔离边界是作用范围：绑定到工作区 A 的预设不碰
B 项目和全局。

> 旧版本（≤0.5）把预设正文**覆盖写进** `AGENTS.md`。升级时那份副本会被收回：内容仍是当初写进去
> 的那份就恢复成你当时的原文；已经被你手改过的文件一个字都不动，只记一条日志。
> `tool-center/prompts/__backup__/` 是旧版本留下的备份，可以手动删掉。

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
npm install        # 只装 esbuild / typescript / @types/node / react / @types/react
npm run build      # 必须先构建：dist/ 不存在时宿主加载会失败
npm test           # 188 个用例

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
| 技能策略（来源开关、逐条开关、首选、自定义目录、rank）+ **工作区场景层** | `$DSH_HOME/tool-center/state.json`（工作区层在 `layers.workspaces`） |
| 提示词预设 + 索引 | `$DSH_HOME/tool-center/prompts/`（`__backup__/` 是旧版本遗留，可删） |
| 提示词生效方式 | 追加成系统提示词区段（`tool-center:prompt`），不写任何用户文件 |
| 场景定义 + 每个工作区默认 + 每个会话的选择 | `$DSH_HOME/tool-center/scenes.json`（v4：`scenes[]` / `active[工作区]` / `sessions[根会话]` / `applied[工作区]`） |
| MCP 服务器 | `$DSH_HOME/cordis.patch.yml`（本插件只追加自己的段落，写前备份） |
| patch 备份 | `$DSH_HOME/tool-center/backups/` |
| 技能导入落点 | `$DSH_HOME/tool-center/skills/` |
| 技能回收站 | `$DSH_HOME/tool-center/trash/` |
| 插件日志 | `$DSH_HOME/tool-center/plugin.log`（只在真的变更时写，512 KiB 滚动） |

场景文件从 v2 迁移：旧的全局场景读进来是「未绑定工作区」，用 `/scene <名字>` 第一次进入时
自动绑定到当时的会话工作区；面板里则需要先给它选一个工作区再进入。
v2 的全局 `active` / 回滚快照不再使用（技能开关本来就没被改过，没有要恢复的东西）。

旧版本（包名 `skill-manager`）留下的 `$DSH_HOME/skill-manager/` 会在首次启动时**自动改名**为
`tool-center/`，不需要手工搬。

## 模型能看到什么、能改什么

分工是刻意的：**启停是用户的判断，不是模型的。** 场景也一样 —— 它由人用面板按钮或斜杠命令按下去。

| 动作 | 谁做 | 为什么 |
|---|---|---|
| 启停技能 / 进入、退出场景 | **你**（面板按钮、或对话里的 `/scene`） | 开关改变的是「模型能看见什么、能调什么」，属于能力面。让模型自己改，等于让它决定自己的权限边界 |
| 知道「这条技能存在，但被关掉了、原因是什么」 | 模型（只读） | 会话里的技能目录按设计**藏掉**停用项，模型否则只能说「没有这个技能」 |
| 读技能正文 | 官方 `skill` 工具 | 它经 `ctx.skills.get()` 拿到的正是我们候选里的正文，再做一个 `skill_read` 只是第二个入口 |

### 斜杠命令 `/scene`

场景的开关走 `ctx.commands`（人手动的通道，结果渲染在界面上，**不产生模型消息**）：

| 命令 | 作用 |
|---|---|
| `/scene` 或 `/scene list` | 列出所有场景，并说明本会话现在用的是哪个、这个答案是谁给的（会话自选 / 跟随工作区） |
| `/scene <名字>` | **本会话**用这个场景（不改工作区默认，也不改别的会话） |
| `/scene off` | 本会话明确不用场景（压过工作区默认） |
| `/scene follow` | 本会话回到跟随工作区（`auto` / `reset` 同义） |

工作区与会话身份都取自会话身份解析：工作区是 `session.header.cwd`（旧形状回退 `session.meta.cwd`），
会话是根会话 id（子代理沿 `header.parentSession` 上溯到它所属的那次对话）。两者都**不接受**调用方
另传 —— 否则「只在这个对话 / 这个项目生效」就成了一句可以绕开的口号。没有工作区目录、或拿不到会话
身份的会话，会明确说明场景不可用。新会话页那一行的场景下拉走同一个 op（`scene-session`），工作区由
服务端按会话 id 反查。

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

## 分层作用域

技能的**工作区层已经启用**：`resolveLayer()` 认 `ws:<绝对路径>`，`view()` / provider 在拿到
会话 cwd 时自动解析到它所在的工作区层（最长前缀，Windows 大小写不敏感、`/` 与 `\` 混写也认）。

| 层 | 键 | 谁写 | 现状 |
|---|---|---|---|
| 全局 | —（`state.json` 顶层） | 面板启停、`skill_switch` | 生效 |
| 工作区 | `layers.workspaces['<工作区绝对路径>']` | 工作区选择的场景（整层替换 / 删除，带 `whitelist` / `enabledSkills`） | 生效 |
| 会话 | `layers.sessions['<根会话 id>']` | 会话自选的场景（整层替代，按文档重新物化） | 生效 |

逐条开关（`setSkill` / `setAll`）仍然只写全局层；作用域层只由场景整层写入（`setLayer`），这样不会出现「半层场景」。

### 与 `dsh-plugin-tool-management` 的取舍

那个插件（`ouli-1242/dsh-plugin-tool-management`）是同一类事的参考实现，做法更重也更全：

- **四层并值**：会话覆盖 > 场景档案层 > 进入场景时的基线快照 > 全局，三态存储、二态展示，
  退出落回**基线**而不是全局（因为全局会变）；场景在 全局 / 工作区 / 会话 三种粒度都能用；
- **资源租约**：全局关着但别的对话还在用，连接就不停，界面显示「临时运行 · N 个对话」；
- **工具表**：26 条模型工具按层开关，与场景一起切。

本插件刻意只做**工作区粒度**（先把「一个场景只在一个项目里生效」做对），因此：

| 行为 | 本插件 | 参考实现 |
|---|---|---|
| 退出场景 | 删掉工作区层 → 回到**此刻**的全局 | 回到进入场景时的**基线快照** |
| 场景粒度 | 工作区默认 + 会话自选 | 全局 / 工作区 / 会话（本插件不做「全局场景」） |
| 会话身份 | `header.cwd` + `parentSession` 上溯 | 同上，且另用租约计「还有谁在用」 |
| MCP 工具屏蔽 | agent scope 上 `restrict({deny})` | 同一机制（另有全局停用表 + 已知工具清单） |

没有「基线快照」不是省略：本插件的场景**从不改全局**（技能写工作区层、MCP 只遮不改配置），
所以「退出 = 回到全局此刻的值」不存在把别人改动吃掉的问题 —— 这也是它敢保持简单的前提。

## 开发

```powershell
npm run build            # tsc → dist/host/（保留目录树），esbuild → dist/client.js
npm test                 # node --test "test/*.test.mjs"
npm run typecheck:host
npm run typecheck:client
```

客户端是一份普通的 ES 模块 + JSX：React 与 `react/jsx-runtime` 由宿主的模块表提供，
`__ModuleLoader__.load({ id, factory })` 那层外壳改由 `scripts/build.mjs` 的 banner/footer 补
—— 和同仓库的 `related-projects` 同一套做法。所以 `src/client/main.ts` 只剩一句
`export { apply, inject }`，`src/client/tsconfig.json` 也能开 `strict` 与 `react-jsx` 做类型检查。

> 客户端配置刻意放在 `src/client/tsconfig.json`（而不是根目录的 `tsconfig.client.json`）：
> 编辑器只会按「最近的 `tsconfig.json`」给文件归类，而根目录那个是 Host 的（`include: src/host/**`）。
> 放在根目录时，客户端文件不属于任何工程，编辑器会回退到默认的 `node10` 解析，
> 连带把 `import './zip.js'` 报成 `ts(2307)` —— 命令行 `tsc` 却一切正常。

`src/client/` 下只分两层：

- **`lib/` 是逻辑**（没有 JSX）：`lib/core/` 放与业务无关的通用件（传输、域 hook、类型镜像、
  路径、本机存储、ZIP），其余按域分到 `lib/skills|prompts|mcp|scenes/`，每个域一个 `use-*.ts`；
- **`components/` 是界面**（只有版面）：状态一律从 `lib/` 的 hook 取，自己不做判断。

### 两个工程共用同一套类型纪律

| | Host（`tsconfig.json`） | Client（`src/client/tsconfig.json`） |
|---|---|---|
| 严格度 | `strict` / `noImplicitOverride` / `noUnusedLocals` / `noUnusedParameters` / `isolatedModules` / `verbatimModuleSyntax` | 同左 + `jsx: react-jsx` |
| 产物 | tsc 输出 `dist/host/`（ESM） | esbuild 打包成 `dist/client.js` |
| 相对导入 | 写 `.ts`，由 `rewriteRelativeImportExtensions` 在输出时改回 `.js` | 写 `.ts` / `.tsx`（`allowImportingTsExtensions`，不产物） |

导入一律写**磁盘上的真实扩展名**（`.ts`、`.tsx`），不再写 `.js`：源码里看到的就是真的文件，
编辑器不用在两个后缀之间做推断，`.js` 后缀也再没有理由被误报成 `ts(2307)`。

> 刻意没开的两项：`noUncheckedIndexedAccess`（patch / frontmatter / policy 等解析器里有 44 处数组下标）
> 与 `exactOptionalPropertyTypes`（16 处可选属性契约，涉及 `ServiceOptions` / `RouteMeta` 等对外形状）。
> 它们需要逐个确认语义后再改，不该和结构调整揉在一次改动里。

```
src/host/
  index.ts              接线：provider（全局 + 每个 agent 作用域）、工具、路由、watcher、迁移
  shared/               四个域共用的地基
    types.ts            root / entry / row / policy / 状态 / 视图 的词汇表
    result.ts           OpResult + DomainError（一份领域异常，不再每域一个类）
    paths.ts            路径身份、原子写、唯一写锁、旧布局迁移
    fs.ts               「出错就当没有」的读法（exists / statOrNull / readTextOrNull）
    json.ts             isRecord：非 null、非数组的「普通对象」判断（原先各处手写）
    backups.ts          带时间戳的备份 + 保留最近 N 份（MCP 的 patch 用）
    http.ts             请求管道：POST、门禁头、JSON 体与大小上限、回环兜底
    zip.ts              零依赖 ZIP 读写（CRC 表与浏览器侧 lib/core/zip.ts 各一份，改动时两处一起改）
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
  prompts/service.ts    提示词预设、启用 / 停用、系统提示词区段的正文快照
  mcp/service.ts        cordis.patch.yml 的 MCP 服务器：列出 / 启停 / 删除
  scenes/service.ts     场景：可复用定义、工作区默认、会话自选、层物化与提示词
  scenes/gate.ts        场景的工具闸门：在 agent 作用域里遮掉不属于该场景的 MCP 工具
  scope/agent-scope.ts  会话身份 → 工作区与会话作用域（子会话沿 parentSession 上溯）
  commands/scene.ts     `/scene`：本会话选用 / 不用 / 跟随，身份取自会话头
  api/
    routes.ts           全部 op 的表（技能 / 提示词 / MCP / 场景）
    tools.ts            skill_list（只读）+ 可选 skill_switch（allowAgentSwitch）
    server.ts           那条具名路由的请求处理与状态码映射
src/client/
  main.ts               模块体：具名导出 apply / inject（ModuleLoader 外壳由构建脚本提供）
  plugin.ts             slots 装配：sidebar.panellist（图标）+ main（面板）+ conversation.hero.options（新会话页的场景下拉）；样式 / 词典 / 槽位登记在同一份生命周期里，停用与重新启用各走一次
  styles.ts             全部 `.dsk-*` 样式（成对使用宿主 --dsw-* token）
  lib/                  逻辑层：数据、请求与 hook，一律不含 JSX
    core/               与业务无关的通用件
      api.ts            同源 POST /tool-center/api；插件「在 / 不在」的广播与 404/405 判定
      domain.ts         useDomain：读一次 / 写一次 / busy / error / 提示语
      types.ts          Host 视图形状在浏览器半侧的镜像 + 面板自己的表单 / 导入形状
      paths.ts          工作区路径比较（宿主 samePath 的镜像）
      storage.ts        本机界面偏好：页签、来源折叠、工作区小节折叠
      format.ts         时间显示（Intl，跟着运行环境的语言走）
      zip.ts            浏览器侧 store-only ZIP 写入（选文件夹后打包用）
    skills/
      selectors.ts      新建 / 导入落点、搜索过滤（纯选择器）
      files.ts          选文件夹（打成 store-only ZIP）/ 选 ZIP；FileList 是活引用这件事只写一遍
      use-skills.ts     技能域：列表 / 开关 / 详情 / 表单 / 导入 / 回收站的 state + 动作
    prompts/use-prompts.ts      提示词域：预设列表、作用范围选项、编辑器草稿
    mcp/use-mcp.ts              MCP 域：服务器列表、启停、删除
    scenes/use-scenes.ts        场景域：场景定义、工作区默认、编辑器三份清单
    scenes/use-scene-picker.ts  新会话页那个小下拉的逻辑（含“点别处收起”）
  components/           界面层：只摆版面，状态全部来自 lib/
    page.tsx            页签外壳（场景 / MCP / 技能 / 提示词）+ 统一 toast
    shell/              panel.tsx（主栏容器）+ icon.tsx（侧栏单色图标）
    ui/
      atoms.tsx         徽章、告警条、空状态、弱化说明、单行截断的行内说明
      controls.tsx      按钮、开关、输入、下拉、折叠三角、模态框
      layout.tsx        页头、工具栏、动作条、列表、分组
    skills/
      view.tsx          技能域外壳（列表 / 详情 / 表单 / 导入 / 回收站串起来）
      root.tsx          来源分组与技能行
      detail.tsx        详情抽屉
      form.tsx          新建 / 编辑表单
      import.tsx        导入面板
      trash.tsx         回收站面板
    prompts/            view.tsx + preset.tsx（预设卡片）+ editor.tsx（编辑器）
    mcp/view.tsx        MCP 域视图
    scenes/             view.tsx + draft.tsx（编辑器）+ hero.tsx（新会话页的场景下拉）
  i18n/
    index.ts            词典合并、translateWith、按语言挑词典
    common.ts           页签名与通用动作
    skills.ts           技能域词条
    prompts.ts          提示词域词条
    mcp.ts              MCP 域词条
    scenes.ts           场景域词条
```

## 测试

`npm test` → **185 个用例 / 全部通过**：

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
| `scenes.test.mjs` | 场景可被多个工作区选用、别的工作区与全局不动、会话自选 / 明确不用 / 跟随、换工作区场景后重新物化、v3 迁移、提示词只认工作区预设、MCP 引用校验；**新会话页的选择被真正开始的会话认领 / 过期 / 不覆盖会话自己的选择 / 技能留空的场景不动技能** |
| `gate.test.mjs` | 工具名 → 服务器归属（最长前缀）、整套切换只留勾选服务器、非整套不遮、退出解除、幂等、工具集合变化后重算、restrict 失败只记日志 |
| `scope.test.mjs` | 会话 id 的两种来源、子会话沿 `parentSession` 上溯、环/断链不卡死、工作区继承与回退 |
| `commands.test.mjs` | `/scene` 的工作区与会话来源（含子代理上溯）、列表、本会话选用、`off` / `follow`、未知场景 |
| `wiring.test.mjs` | 真实 `apply()` 接线、门禁头、op 分发、`/scene` 注册与 `ctx.inject` 时序、无命令服务时降级、卸载清理；**开始页选好的场景经 provider 的 `beforeView` 进入真正开始的会话**；版本号与 `package.json` 一致 |
| `client-bundle.test.mjs` | 浏览器半在 vm 里加载、侧栏图标 + 主栏面板配对、词典覆盖、渲染一次不抛错 |
| `client-views.test.mjs` | 四个域视图各自单独打包后各渲染一次（空状态不抛错）；行内说明的字数上限与省略号 |

## 已知边界

- 面板没有会话上下文，所以技能页**只列用户级来源**、技能开关也只看全局层；项目技能与工作区场景的实际效果要在对话里看（`/scene` 或 `skill_list`）。
- **MCP 工具能按工作区收窄，但不能按工作区新增**：场景只在整套切换下遮蔽未勾选服务器的工具；
  宿主里停用的服务器无法只在某个工作区启用（工具得先由宿主装载出来），界面与命令都会说明。
- 场景的提示词只认「作用范围就是这个工作区」的预设；全局预设会被跳过并告警。**提示词没有会话级**：会话选择只覆盖技能与 MCP 工具。
- 工作区路径来自宿主的项目登记表；会话 cwd 落在工作区子目录时按最长前缀命中该工作区。
- MCP 只读 `$DSH_HOME/cordis.patch.yml`；profile 级 patch 里的服务器不在这个面板里。
- **插件被停用后，界面会自己走掉**：宿主那侧的路由消失时，数据请求会拿到 404/405。这被识别成 `error.pluginUnavailable`（不是数据错误），客户端随即卸载自己注入的三个槽位（侧栏图标 / 主面板 / 新会话页的场景下拉）——不会留一个点开就报错的页签。切回窗口时会做一次极轻的 `health` 探测，所以不点开也能及时发现；**重新启用后会自动恢复**：停用期间每 5 秒探一次活（最多 5 分钟），拿到真实回执就把槽位重新挂上，不需要刷新页面。
- 递归发现技能到第 3 层；第 2 层及更深的由本插件发布（面板标「子目录」）。
- watcher 只监听来源根目录（非递归）；bundle 内部的改动靠 mtime 校验在下一次读取时生效。
