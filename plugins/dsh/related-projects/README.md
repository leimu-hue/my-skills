# 关联项目 / Related Projects

给每个 DSH 工作区维护一组「关联项目」：路径 + 名称 + 备注（什么情况下要改它）+ 启用开关。
会话开始时以**静态 system prompt section** 告诉模型，于是「改后端顺手改前端和文档」不再需要每次去文件管理器找路径、粘贴进对话框。

- **工作区**用 DSH 自己的工作区（`workspaceRegistry`），本插件不另造概念。
- **注入**每会话只算一次、逐字不变，保住前缀缓存；同时带一行**实时可写边界**（来自 `sandboxPolicy.resolve()`）。
- **会话内增删**走宿主**运行时上下文**通道投递一次，不会在聊天记录里产生用户消息。
- **模型**只能新增（可带备注），且只能写当前会话所属工作区；改名/备注/开关/删除仅限 UI。

---

## 安装到 DSH

前提：DSH 已在运行，且你有一个 profile（本仓库开发时用的是 `desktop`）。

### 1. 构建（首次安装或改过 `src/` 后）

```powershell
cd D:\custom_project\ai-project\my-skills\plugins\dsh\related-projects
npm install          # 只装 devDependencies：typescript / esbuild / @types/node
npm run build        # src/ -> dist/（Host 用 tsc，Client 用 esbuild 打成单文件）
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
| `src/client/**` 或 `src/client/styles.ts` | 重新构建 + **刷新页面** |
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

输入框里打 `@`，官方的触发菜单里会出现「关联项目」组（**排在最前**，在文件/会话候选之前），每行是**名称 + 绝对路径（有备注时附备注）**。

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

## 约定与边界

- 每个工作区最多 **10** 个关联项目；备注 ≤200 字，名称 ≤60 字。
- 路径护栏：拒绝不存在 / 非目录 / 盘根 / 用户主目录 / 等于当前工作区；同路径重复添加是幂等操作。
- 路径失效（改名、移动、拔盘）：条目保留并标红，注入时跳过，只报"另有 N 个不可用"；一个可用项目都没有时整段不注入。
- 工作区不可写时，注入里会写明真实边界（`workspace-write` 只允许会话 cwd，其它目录需要审批）。
- **旧会话首屏**：输入框下方那一行不依赖"宿主是否已恢复该会话"。客户端会话清单里本来就有每个会话的目录（`cwd`，来自持久化 header），这条目录随 `state` 请求一起发给宿主，宿主再折成已注册的工作区拼写；宿主暂时还查不到该会话时，客户端按退避重试（120ms 起、共约 1 分钟），窗口重新聚焦/可见时也会再问一次。因此"第一次打开旧会话不显示、再打开才出现"不会再发生。

## 数据与诊断

- 注册表：`$DSH_HOME/related-projects.json`（默认 `C:\Users\<你>\.dsh\related-projects.json`），原子写（临时文件 + rename）。
  - `groups` 以工作区**规范路径**小写后为键；`settings.alwaysShowDock` 控制输入框下方那一行。
- 诊断接口（本机 HTTP，POST JSON）：

```powershell
$base='http://127.0.0.1:<port>/related-projects/api'
Invoke-RestMethod "$base/prompt" -Method Post -ContentType application/json -Body '{"sessionId":"session-..."}'
```

返回该会话**将被注入的原文**（`text`）、是否挂上（`attached`）、section 挂载状态（`section`）、变更通知通道状态（`notice`），用于判断"模型为什么不知道这些路径"。

## 代码结构

```
src/host/
  types.ts      共享类型
  store.ts      注册表：持久化 + 校验规则（不依赖框架/HTTP）
  files.ts      关联项目内部的文件索引与搜索（有上限、跳过产物目录）
  prompt.ts     模型读到的全部文案
  context.ts    "我在哪个工作区" 与 "我能写哪里"
  sessions.ts   每会话两条 prompt 通道（section + 一次性 notice）
  routes.ts     UI 调用的 JSON 路由
  tool.ts       related_projects 工具
  http.ts       请求管道（信任校验、JSON 解析）
  index.ts      装配（apply）
src/client/
  main.ts       __ModuleLoader__ 入口（唯一被 Web 加载的文件）
  plugin.ts     slot 注册 + `@` 源注册
  trigger.ts    InputTriggerSource：把关联项目喂给官方 @ 菜单
  dock.ts       输入框下方条 + 弹层 + 侧栏图标
  panel.ts      管理面板
  session.ts    客户端会话清单 → 会话目录（旧会话首屏解析工作区）
  api.ts        Client→Host 唯一通道
  state.ts      客户端缓存 store
  locale.ts     双语文案 + 实时语言
  mention.ts    @ 引用插入
  ui.ts         共享控件
  styles.ts     唯一一份 CSS（只用 --dsw-alias-* token）
scripts/build.mjs  构建脚本
```

改动后的自检：`npm run typecheck:host`、`npm run typecheck:client`。
