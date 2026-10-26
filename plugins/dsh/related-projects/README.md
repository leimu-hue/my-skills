# 关联项目 / Related Projects

给每个 DSH 工作区维护一组「关联项目」：路径 + 名称 + 备注（什么情况下要改它）+ 启用开关。
会话开始时以**静态 system prompt section** 告诉模型，于是「改后端顺手改前端和文档」不再需要每次去文件管理器找路径、粘贴进对话框。

- **工作区**用 DSH 自己的工作区（`workspaceRegistry`），本插件不另造概念。
- **注入**是**会话首轮的冻结快照**（逐字不变 → 保住 provider 的前缀缓存），同时带一行**会话首轮的可写边界**（来自 `sandboxPolicy.resolve()`，随 section 一起冻结）。边界只写模式，不重复工作区路径（工作目录上下文里已经有）。
- **会话内变更**走**追加式通知**：每次改动以一条**新的、静态文本的运行时上下文快照**追加进历史（内容含"改了什么 + 当前完整列表"，并声明取代 system prompt 与更早的通知）。通知只带**当前列表**，不重复 section 的指令和可写边界。system 节点**从不重写**，缓存前缀始终复用，代价只有这条通知本身的 token（一次性）。新快照登记后会**退休上一条通知的提供者**，否则当前快照会把之前每一条通知再拼一遍（变更越多、快照越长）。
- **模型**只能新增（可带备注），且只能写当前会话所属工作区；改名/备注/开关/删除仅限 UI。

---

## 安装到 DSH

前提：DSH 已在运行，且你有一个 profile（本仓库开发时用的是 `desktop`）。

### 1. 构建（首次安装或改过 `src/` 后）

```powershell
cd D:\custom_project\ai-project\my-skills\plugins\dsh\related-projects
npm install          # 只装 devDependencies：typescript / esbuild / @types/node
npm run build        # src/ -> dist/（Host 用 tsc，Client 用 esbuild 打成单文件）
npm test             # 可选：Host 行为测试，导入 dist/ 运行
```

产物：

```
dist/host/index.js      Host 入口（ESM，多模块）
dist/client.js          Client 单文件包（Web 侧每个插件只加载一个文件）
```

> `dist/` 是运行时真正被加载的东西，**不要删**。`src/` 只是源码。

### 2. 安装到当前 profile

用 DSH 的 `plugin_manager` 工具（不要手工改 profile 的 `package.json`）：

```
plugin_manager(action: "install_bundle", target: "D:\\custom_project\\ai-project\\my-skills\\plugins\\dsh\\related-projects")
```

返回值里 `application: "applied"` 表示已生效。首次安装后**刷新页面**（F5）才能看到界面：左侧栏出现「关联项目」图标，输入框下方出现关联项目条。

### 3. 升级（改了代码之后）

重新构建，然后按改动范围选择：

| 改动 | 需要的动作 |
|---|---|
| `src/host/**`（服务端逻辑） | 重载该行插件（见下），无需刷新页面 |
| `src/client/**`（含 `styles.ts`） | 重新构建 + **刷新页面** |
| `package.json` 的 `exports` / `version` | 先 `remove_bundle` 再 `install_bundle`（入口会被重新解析） |

重载插件行（`include:related-projects` 是 `Config.listConfigs` 报出的 entryId）：

```
plugin_manager(action: "set_plugin", target: "include:related-projects", enabled: false)
plugin_manager(action: "set_plugin", target: "include:related-projects", enabled: true)
```

### 4. 卸载

```
plugin_manager(action: "remove_bundle", target: "@local/dsh-related-projects")
```

注册表数据不会被删，仍在 `%USERPROFILE%\.dsh\related-projects.json`（或 `$DSH_HOME/related-projects.json`）。

---

## 怎么用

1. 左栏点「关联项目」→ 每个 DSH 工作区一段 → 「＋ 关联项目」选目录（也可手动输入路径）。
2. 给每条写备注，例如「改了接口/表结构时，同步这里的 API 文档和 mock 脚本」。
3. 回到会话：输入框下方**只有一行** `N 个关联项目 ▾`（项目多时不会把输入框挤满）：
   - 点这一行 → 展开面板，列出每个项目的名称 / 路径 / 备注 / 是否失效；
   - 点其中一项 → 往输入框插入 `@"D:/abs/path/"` 引用，面板随即关闭；
   - 点面板外任意位置或按 Esc → 面板自动关闭；
   - 没有项目时这一行显示 `＋ 关联其它项目`。

> 输入框下方那一行**没有**就地关闭按钮，也不放单个项目的 chip：条目多时会明显挤压输入区。要整行隐藏，去左栏面板底部关「在输入框下方显示关联项目条」。

### 在 `@` 菜单里直接选

输入框里打 `@`，官方的触发菜单里会出现「关联项目」分组（**排在最前**，在文件/会话候选之前），每行是**名称 + 绝对路径（有备注时附备注）**。

分组的可见标题来自**行级 `section`**（「关联项目」/「关联项目-项目文件」），source 的 `name` 是稳定标识 `related-projects`、不随语言变化——否则切换语言重载后，草稿里已有 chip 的来源就对不上了（chip 按 source name 路由）。

搜索规则与文件候选一致：输入的内容参与过滤，**名称、绝对路径、备注都算命中**（备注往往就是"什么时候该改它"，所以可以直接按记忆里的词来找，例如输入 `前端`、`文档`、`mock`）；多个词用空格分隔时要求**全部命中**（AND）。排序上"名称精确 > 名称前缀 > 名称包含 > 路径包含 > 仅备注命中"，同分保持注册表顺序；一个都不命中时该组自动消失。

选中一行后：输入框里落一个引用 chip，发送时序列化为 `@D:/custom_project/xpd-flow-web/`（含空格则 `@"…"`），模型拿到的是绝对路径。

### 搜关联项目「内部」的文件（逐层进入）

官方文件源只能搜**会话工作区**内的文件，而关联项目是工作区之外的兄弟目录，所以它们的文件原来看不到。现在在 `@` 后面继续打字，同一个分组会在「关联项目-项目文件」小标题下列出**关联项目内部的条目**，行为与官方「文件与文件夹」一致：

- **按条目名匹配，不摊平**：输入 `需求开发` 只会列出**那个目录本身**（一行，可 Tab/箭头进入），不会把它下面的 `设计/`、`说明.md` 一次性铺开；命中目录后其子孙条目不再参与排序；
- **逐层进入**（drill）：目录行按 `Tab` 或点右侧箭头 → 输入框被改写为该目录的引用（`@D:/…/需求开发/`）并重开菜单，此时列出**该层的直接子项**（目录在前、文件在后）；按 Enter/点击仍是"插入这个路径"；
- **面包屑**：进入后菜单顶部出现 `项目名 / 子目录 …` 的面包屑，点任意一级即可回到那一层；最深层标记为当前；
- 继续在同一层打过滤词（例如进入 `需求开发/` 后打 `需`）只在该层内收窄，不会跨层乱窜；
- 排序：名称精确 > 名称前缀 > 名称包含；目录与文件同分时目录在前。

性能与安全边界：宿主为每个项目建一份**文件索引**（最多 20000 项、深度 ≤12、按 60s TTL 复用），每次按键只在内存里过滤；跳过 `node_modules`、`.git`、`dist`、`build`、`target`、`venv`、`__pycache__` 等依赖/产物目录，不跟随符号链接；`list` 目录必须落在本项目已注册的关联项目目录**之内**，越界请求直接拒绝；读不到的子目录跳过，不会让菜单整体失败。

实现方式：向 `ctx.inputTriggers.registerSource()` 注册一个 `InputTriggerSource`（`trigger: '@'`、`name: 'related-projects'`、`order: -10`、`candidates` / `onPick` / `codec` / `lexicon`），文件搜索走插件自己的宿主路由 `files`。候选行使用与官方文件源相同的字段（`icon` / `section` / `value`），菜单的渲染、键盘、分组全部由 `dsh-client-ui-input-trigger` 负责，本插件不碰菜单 UI，也**不替换**任何随包服务。

### 为什么是"冻结 + 追加"，不是"每次重渲染"

system prompt 在 DSH 里是**一个整体节点**，所以任何一次重渲染（哪怕只是备注多了一个字）都会重写这个节点，把该会话**整段前缀缓存**作废。实测：某会话新增第三个关联项目后，日志里立刻出现 `system/message replace`，命中率的代价远大于"通知本身的那点 token"。

因此本插件的策略是：section 只在会话首轮渲染一次并冻结；后续变更以**新名字 + 静态文本**的运行时上下文快照追加到历史尾部。通知只重复项目行（必要时加一行"不可用"），不再重复标题、说明和可写边界——那些已经在冻结的 section 里。追加不会改动任何已缓存的前缀，且文本恒定不变，后续请求不会再触发任何重写。

（踩过的坑：旧实现用"读一次即失效"的 context 提供者做通知。DSH 每个 step 会读 context **两次**——`assemble()` 一次、`agent/pre-step` 之后的 `refreshContext()` 再一次——第一次读就把状态置为已送达，第二次读返回空串，通知在准入前就被丢弃了。导出的会话日志里该文案出现 0 次即为证据。）

## 约定与边界

- 每个工作区最多 **10** 个关联项目；备注 ≤200 字，名称 ≤60 字。
- 路径护栏：拒绝不存在 / 非目录 / 盘根 / 用户主目录 / 等于当前工作区 / **相对路径**（相对拼写不会被解析到 Host 进程 cwd）；同路径重复添加是幂等操作。
- 路径失效（改名、移动、拔盘）：条目保留并标红，注入时跳过，只报"另有 N 个不可用"；一个可用项目都没有时整段不注入。
- 工作区不可写时，注入里会写明真实边界（`workspace-write` 只允许会话 cwd，其它目录需要审批）。
- **旧会话首屏**：输入框下方那一行不依赖"宿主是否已恢复该会话"。客户端会话清单里本来就有每个会话的目录（`cwd`，来自持久化 header），这条目录随 `state` 请求一起发给宿主，宿主再折成已注册的工作区拼写；宿主暂时还查不到该会话时，客户端按退避重试（120ms 起、共约 1 分钟），窗口重新聚焦/可见时也会再问一次。因此"第一次打开旧会话不显示、再打开才出现"不会再发生。

## 数据与诊断

- 注册表：`$DSH_HOME/related-projects.json`（默认 `C:\Users\<你>\.dsh\related-projects.json`），原子写（临时文件 + rename）。
  - `groups` 以工作区**规范路径**小写后为键；`settings.alwaysShowDock` 控制输入框下方那一行。
- 诊断接口（本机 HTTP，POST JSON；与 `/api` 一样先过 Web 的 Host/Origin + 浏览器会话校验）。在 Web 界面按 F12，于控制台执行：

```js
await fetch('related-projects/api/prompt', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sessionId: 'session-...' }),
}).then((response) => response.json())
```

> 插件优先调用 `ctx.connection.requestRejection()`（Host/Origin 校验 + 浏览器会话认证）；只有宿主没有挂 Connection（自建 Web 组合）时才退回"仅回环地址"的兜底检查。因此用 `Invoke-RestMethod` 直连、不带浏览器 cookie 的请求会被 401 拒绝。

返回**当前注册表会渲染出的原文**（`current`）、是否挂上（`attached`）、section 挂载状态（`section`）、本会话已追加的变更通知数（`notices`；当前快照只含最新一条）、live 会话数（`liveSessions`），用于判断"模型为什么不知道这些路径"。

## 代码结构

两端都按**功能**分目录，不再是"一层一个平铺文件"。`src/host` 用 tsc 逐文件产出 ESM，`src/client` 由 esbuild 打成单文件，因此两端的类型是**各自镜像**的（浏览器半侧不能 import Host 的构建产物）；镜像点在两端各自的 `types.ts`，靠两边的 typecheck 抓漂移。

```
src/host/
  index.ts              装配（apply）：路由、工具、会话跟踪，仅接线
  shared/               半端内共享，不含业务
    context.ts          Cordis 上下文的极小结构切片 + 服务探测（缺服务只降级）
    paths.ts            路径身份：规范化、比较键、根/主目录判定、相对/包含关系
    types.ts            领域与视图类型（Project / ProjectView / Snapshot / StateValue…）
    errors.ts           RegistryError（唯一一种业务异常，路由按 code 转 HTTP）
    http.ts             JSON 收发、错误信封、Host/Origin 兜底栅栏
  registry/service.ts   注册表：持久化 + 校验规则（不依赖框架/HTTP），视图构建
  prompt/
    text.ts             模型读到的全部文案（section / 通知 / 可写边界 / 变更描述）
    sessions.ts         每会话的 prompt section（冻结）+ 变更的追加式通知
  files/service.ts      关联项目内部的文件索引与搜索（有上限、跳过产物目录、越界拒绝）
  workspace/service.ts  "我在哪个工作区"、"我能写哪里"、面板要列的工作区行
  api/
    server.ts           路由分发：信任栅栏 → 方法查表 → JSON 回执
    routes.ts           方法表（state / files / list / add / update / remove / copy /
                        settings / open / pick / prompt）
    tools.ts            related_projects 工具（只读 + 新增）
src/client/
  main.ts               __ModuleLoader__ 入口（唯一被 Web 加载的文件）
  plugin.ts             slot / 字典 / `@` 源注册，仅接线
  styles.ts             唯一一份 CSS（只用 --dsw-alias-* token）
  core/                 半端内共享，不含业务
    runtime.ts          React 访问器 + h()
    api.ts              Client→Host 唯一通道 + 会话态请求体
    types.ts            Host 视图类型的镜像 + 默认 limits
    store.ts            通用快照 store（含"工作区未解析"的退避重试）+ 全量失效
    session.ts          客户端会话清单 → 会话目录（旧会话首屏解析工作区）
    reference.ts        路径拼写与 @ 引用语法（唯一实现：菜单、插入、面板标题共用）
    ui.ts               共享控件（Toggle / 两步删除 / Spinner / 错误文案）
  i18n/                 词条按功能分文件，index.ts 只做合并与当前语言解析
    common.ts           通用词条、错误码文案、手动输入路径
    panel.ts / dock.ts / menu.ts
  dock/                 输入框下方条：view.ts（行 + 弹层）、store.ts（每会话一份）
  panel/                管理面板：view.ts（工作区分节）、row.ts（项目行）、
                        icon.ts（侧栏图标）、store.ts
  menu/                 官方 @ 菜单的 source
    types.ts            InputTriggerSource 契约
    query.ts            查询 → 目录（drill）/ 项目排序（名称 > 路径 > 备注）
    rows.ts             项目行 / 文件行 / 面包屑的载荷
    source.ts           缓存 + candidates / header / onPick / codec / lexicon
scripts/build.mjs       构建脚本
test/host.test.mjs      Host 行为测试（导入 dist/，即运行时的真实产物）
```

改动后的自检：

```powershell
npm run build          # 必须：test/ 与运行时都读 dist/
npm test               # Host 行为测试（注册表规则、prompt 文案、文件索引、路由与栅栏）
npm run typecheck:host
npm run typecheck:client
```


