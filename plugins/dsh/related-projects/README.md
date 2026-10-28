# 关联项目 / Related Projects

给每个 DSH 工作区维护一组「关联项目」：路径 + 名称 + 备注（什么情况下要改它）+ 启用开关。
新会话开始时模型就会知道：这次改动可能还要动哪些兄弟仓库、文档或服务——不必再翻文件管理器找路径。

- 输入框里打 `@`，直接从菜单引用它们的路径，也能逐层进入项目内部选文件；
- 输入框下方一行 `N 个关联项目`，随时查看本会话生效的列表；
- 侧栏面板按工作区分节管理：新增、改名、写备注、启停、删除、打开目录、整组复制；
- 模型自己也能查列表、能新增（只能写当前会话所属工作区），改名与删除仍然只由人来做。

当前版本 `0.8.0`，适配 DSH `>=0.2.1-rc.3 <0.3.0`。

---

## 这个插件做什么

### 1. 会话上下文：首轮冻结，之后只追加

会话首轮把**启用中**的项目渲染成一段静态 system prompt 小节（名称 / 路径 / 备注），并附一行当时的可写边界（例如 `workspace-write`）。
这段文本之后**不再重写**——DSH 的 system prompt 是一个整体节点，改一个字就会让整段前缀缓存作废。

会话内增删改以**一条新的静态运行时快照**追加到历史尾部，内容只有当前完整列表，并声明它取代 system prompt 与更早的通知。新快照登记后会退休上一条通知的提供者，否则每追加一次，当前快照就会把之前所有通知再拼一遍。

### 2. 三个入口

| 位置 | 挂载点 | 作用 |
|---|---|---|
| 输入框下方条 | `conversation.composer.dock` | 只占一行；点开是只读列表，点一行把该路径插入输入框 |
| 侧栏图标 + 管理面板 | `sidebar.panellist` + `main` | 按工作区分节管理关联项目 |
| `@` 菜单 | `inputTriggers` 源 | 「关联项目」分组 + 「关联项目-项目文件」逐层进入 |

`@` 菜单的搜索规则与官方文件源一致：名称、绝对路径、备注都参与匹配，空格分隔的多个词要求全部命中（AND）；排序为「名称精确 > 名称前缀 > 名称包含 > 路径包含 > 仅备注命中」，同分保持注册表顺序。

### 3. Agent 工具

插件注册一个 `related_projects` 工具：模型可以读取当前工作区的列表，也可以新增项目（可带备注）；改名、备注、启停、删除只开放给界面。

### 4. 边界

- 每个工作区最多 **10** 个关联项目；备注 ≤200 字，名称 ≤60 字。
- 拒绝：不存在 / 非目录 / 盘根 / 用户主目录 / 当前工作区自身 / 相对路径。
- 路径失效（改名、移动、拔盘）：条目保留并标红，注入时跳过，只报「另有 N 个不可用」。
- 注册表数据在 `$DSH_HOME/related-projects.json`（默认 `%USERPROFILE%\.dsh\related-projects.json`），原子写；卸载插件不会删它。

---

## 人怎么安装

### 前置

- DSH 已在运行，且你有一个 profile（桌面版默认是 `desktop`）。
- Node 18+ / npm。`npm install` 只会装 devDependencies（typescript、esbuild、react 与官方 `@deepseek-ai/*` 类型包），这些**不会**进入插件产物。

### 1. 构建

```powershell
cd D:\custom_project\ai-project\my-skills\plugins\dsh\related-projects
npm install
npm run build      # src/ -> dist/
npm test           # 可选：Host 行为测试，导入 dist/ 运行
```

产物只有两个，`dist/` 是运行时真正被加载的东西，**不要删**：

```
dist/host/index.js      Host 入口（ESM，多模块）
dist/client.js          Client 单文件包（window.__ModuleLoader__ 形态，只外置 react）
```

### 2. 安装到当前 profile

用 DSH 的 `plugin_manager` 工具，不要手工改 profile 的 `package.json`：

```
plugin_manager(action: "install_bundle", target: "D:\\custom_project\\ai-project\\my-skills\\plugins\\dsh\\related-projects")
```

返回里 `application: "applied"` 表示已生效。首次安装后**刷新页面（F5）**：左侧栏出现「关联项目」图标，输入框下方出现关联项目条。

### 3. 升级

重新构建，再按改动范围选择：

| 改动 | 动作 |
|---|---|
| 只改 `src/host/**` | 重载插件行（见下），无需刷新页面 |
| 只改 `src/client/**`（含 `styles.ts`） | `npm run build` + **刷新页面** |
| 改了 `package.json` 的 `version` / `exports` / `dsh` | `remove_bundle` 后重新 `install_bundle` |

重载插件行（entryId 以 `Config.listConfigs` 报出的为准，通常是 `include:related-projects`）：

```
plugin_manager(action: "set_plugin", target: "include:related-projects", enabled: false)
plugin_manager(action: "set_plugin", target: "include:related-projects", enabled: true)
```

### 4. 卸载

```
plugin_manager(action: "remove_bundle", target: "@local/dsh-related-projects")
```

---

## Agent 怎么安装

把下面这段直接交给 DSH 里的 agent；它需要 `plugin_manager` 工具与本地 shell 权限。

```text
把 D:\custom_project\ai-project\my-skills\plugins\dsh\related-projects
这个 DSH 插件装到当前 profile：

1. 读 package.json，确认 name / version / engines.dsh，并回报版本。
2. 在插件目录执行 npm install && npm run build && npm test，任一失败就停下并贴出报错。
3. 若之前装过同版本或改过 version / exports / dsh 字段：先
   plugin_manager remove_bundle target="@local/dsh-related-projects"，再安装。
4. plugin_manager install_bundle target="<插件绝对路径>"，检查返回的 application 是否为 "applied"。
5. 最后告诉我：安装的版本、测试结果、以及需要我刷新页面（F5）。
```

Agent 执行清单与判定：

| 步骤 | 通过标准 |
|---|---|
| 读清单 | `engines.dsh` 覆盖当前 DSH；`dsh.client.inject` 列出的官方包都在 profile 里 |
| 构建 | `npm run build` 退出码 0，`dist/host/index.js` 与 `dist/client.js` 都存在 |
| 测试 | `npm test` 全绿（当前 11 项：注册表规则、prompt 文案、文件索引、路由与信任栅栏） |
| 安装 | `install_bundle` 返回 `application: "applied"` |
| 收尾 | 提醒人类刷新页面；若是升级且只动了 `src/host`，可改用 `set_plugin` 关-开重载 |

常见失败：

- **`duplicate exact route`**：上次的插件行没被回收。`set_plugin` 关闭再打开，或 `remove_bundle` 后重装。
- **`application` 不是 `applied`**：先看返回里的原因；`version` / `exports` 变化必须重装，而不是只重载。
- **界面没出现**：先确认构建产物是最新的（`dist/client.js` 的修改时间），再 F5；仍是旧的清一次浏览器缓存。
- **401 / 403（诊断接口直连）**：Host 会校验 Host/Origin 与浏览器会话，命令行直连被拒是预期行为。

---

## 怎么用

1. 左栏点「关联项目」→ 每个 DSH 工作区一段 → 「＋ 关联项目」选目录，或手动输入路径。
2. 给每条写备注，例如「改了接口/表结构时，同步这里的 API 文档和 mock 脚本」。
3. 回到会话：输入框下方是 `N 个关联项目 ▾`，点开列出名称 / 路径 / 备注 / 是否失效；点一行即插入 `@"D:/abs/path/"` 引用。
4. 输入框里打 `@`，在「关联项目」分组里按名称、路径或备注过滤；目录行按 `Tab` 或点右侧箭头逐层进入，顶部出现面包屑。
5. 不想看到输入框下方那一行：面板底部关掉「在输入框下方显示关联项目条」（注入不受影响，只影响显示）。

> 那一行没有就地隐藏按钮，也不放单个项目的 chip：条目一多会把输入区挤满。要整体隐藏，请去面板里关。

---

## 设计与实现要点

- **一切皆插件**：Host 导出 `name` / `inject` / `Config`（Schemastery）/ `apply`；客户端导出 `inject = ['slots','locale']` 与 `apply(ctx)`，用 `ctx.inject` 表达可选服务。
- **UI 走官方 Slots**：组件就是 React 组件（`SlotComponent<P>`，JSX），`t`、`sessionId`、`inputActions` 等席位由框架注入，不手造 props，也不替换任何随包服务。
- **路由是 exact**：每个方法一条 `{ kind: 'exact', path: '/related-projects/<method>' }`，不用 `prefix` 占整个命名空间；`webServer.register` 的回收由 `ctx.effect` 负责。
- **字典走官方 locale**：`ctx.locale.register(NS, { zh, en })` 注册，`LocaleNamespaceMap` 声明合并后 `ctx.locale.bind(NS)` 得到类型安全的 `t`。
- **诊断**：在 Web 界面按 F12 执行下面这段，返回当前会渲染出的原文、是否挂上、通知数与 live 会话数：

```js
await fetch('related-projects/prompt', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sessionId: 'session-...' }),
}).then((response) => response.json())
```

> 路由从旧版的共享前缀 `related-projects/api/<method>` 改成了每个方法一条 exact 路由；若你有脚本直连过诊断接口，需要同步改路径。

---

## 目录结构

```
src/host/
  index.ts              装配（apply）：配置、路由、工具、会话跟踪
  shared/               路径身份、视图类型、JSON 管道、connection 探测
  registry/service.ts   注册表：持久化 + 校验规则 + 视图构建
  prompt/               模型读到的文案，以及「冻结小节 + 追加通知」通道
  files/service.ts      项目内部文件索引与搜索（有上限、跳过产物目录、越界拒绝）
  workspace/service.ts  工作区身份、可写边界、面板要列的工作区行
  api/                  方法表、exact 路由分发、related_projects 工具
src/client/
  main.ts               模块体：具名导出 apply / inject（Loader 外壳由构建脚本提供）
  plugin.ts             slot / 字典 / @ 源注册，仅接线
  styles.ts             唯一一份 CSS（只用 --dsw-alias-* 令牌）
  core/                 api、store、引用语法、共享控件、Host 视图类型镜像
  i18n/                 词条按功能分文件，index.ts 只做合并与命名空间声明
  dock/ panel/ menu/    三个入口，各自 view + store
scripts/build.mjs       构建脚本（Host 用 tsc，Client 用 esbuild）
test/host.test.mjs      Host 行为测试（导入 dist/，即运行时真实产物）
```

改动后的自检：

```powershell
npm run build
npm test
npm run typecheck:host
npm run typecheck:client
```
