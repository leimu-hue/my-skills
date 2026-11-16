# Whistle 工具 / Whistle Tools

把本机的 Whistle 代理接成 Agent 工具：模型能直接查抓包、翻 WebSocket 帧、读改写规则文件与 Values，不用让人切到浏览器里一层层点。

当前版本 `0.1.0`，适配 DSH `>=0.2.1-rc.3 <0.3.0`，要求 Whistle `>= 2.10.7`。

---

## 这个插件做什么

注册七个 `whistle_*` 工具，全部走 Whistle 官方的 [Local Agent API](https://wproxy.org/docs/extensions/api.html)：

| 工具 | 作用 | 读/写 |
|---|---|---|
| `whistle_status` | 一次看清版本、抓包界面地址、规则引擎开关、HTTPS 拦截、已装插件 | 读 |
| `whistle_sessions` | 按类型 / URL / 方法 / 状态码 / 请求头 / 响应头筛抓包，一行一条 | 读 |
| `whistle_session` | 一条记录的全貌：耗时、命中的规则、请求/响应头、正文（JSON 美化 + 截断） | 读 |
| `whistle_frames` | 一个 WebSocket / Socket 连接的帧（方向、opcode、正文） | 读 |
| `whistle_rules` | 规则文件的列表/读取/写入/勾选/取消勾选/启停引擎/置顶/多选/后置优先 | 读 + 写 |
| `whistle_values` | Values 面板（规则里 `{name}` 指向的值） | 读 + 写 |
| `whistle_plugins` | 装了哪些 whistle 插件、哪些被关掉 | 读 |

**它不做什么**（都是有意的）：

- 不是 whistle 扩展插件（`whistle.xxx`）：不装进 whistle、不加界面、不拦截流量。它只是**调用** whistle 已经暴露的本地 API。
- 不改 HTTPS 拦截与根证书：`whistle_status` 会告诉你当前状态，改它请用抓包界面或 `w2` 命令行。
- 不开关别人的插件：`whistle_plugins` 只读。插件规则的覆盖是另一套配置，不该由一个通用工具悄悄改。
- 不写任何本地文件：没有注册表、没有缓存目录。

**原理**：先 `require.resolve('whistle/bin/api')`，失败再执行 `w2 root bin/api` 拿到模块路径，然后在 Host 进程里直接加载 —— 本质是向 whistle 自己的管理端口发 HTTP，所以没有 MCP、端口、token 之类的额外配置。

---

## 前置

- **Whistle >= 2.10.7**，且已启动：

  ```powershell
  npm install -g whistle
  w2 start
  ```

  版本不够时工具会直接报「低于最低版本」并给出升级命令，不会静默降级。
- **Node 18+**：只影响 `npm test`（`node --test`）。

---

## 构建与安装

```powershell
cd D:\custom_project\ai-project\my-skills\plugins\dsh\whistle
npm install        # 只有 devDependencies：typescript + 官方 @deepseek-ai/* 类型包
npm run build      # src/host/**/*.ts -> dist/host/**
npm test           # 可选：Host 行为测试，导入 dist/ 运行
```

产物只有一个入口，`dist/` 是运行时真正被加载的东西，**不要删**：

```
dist/host/index.js        插件入口（ESM，一个模块一个文件）
dist/host/tools/*.js      七个工具的声明与渲染
dist/host/whistle/*.js    加载器、抓包查询、格式化、规则纯逻辑
```

安装到当前 profile（用 DSH 的 `plugin_manager`，不要手改 profile 的 `package.json`）：

```
plugin_manager(action: "install_bundle", target: "D:\\custom_project\\ai-project\\my-skills\\plugins\\dsh\\whistle")
```

返回里 `application: "applied"` 表示已生效。**没有界面**：装好后在下一轮对话里模型就能看到七个 `whistle_*` 工具，不需要刷新页面。

升级时按改动范围选动作：

| 改动 | 动作 |
|---|---|
| 只改 `src/host/**` | 重载插件行（`set_plugin` 关再开）即可 |
| 改了 `cordis.patch.yml`（含 `config.*`） | 生效的是 profile 里那份，改它或重装，并**完整重启** |
| 改了 `package.json` 的 `version` / `exports` / `dsh` | `remove_bundle` 后重新 `install_bundle` |

---

## 配置

在 profile 侧的 `cordis.patch.yml` 里覆盖（缺省即生效）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `command` | `w2` | whistle 命令行。Windows 上实际是 `w2.cmd`；装在非标准位置时填完整路径 |
| `apiPath` | 空 | 直接指定 `bin/api` 的绝对路径，跳过所有探测（多版本共存、非常规安装时用） |
| `timeoutMs` | `20000` | 单次调用的超时。超时报错，而不是把这一轮对话拖住 |
| `minVersion` | `2.10.7` | 最低 API 版本；留空表示跳过版本校验 |

```yaml
- insert:
    - id: whistle
      name: '@local/dsh-whistle'
      config:
        command: C:\Users\you\AppData\Roaming\npm\w2.cmd
        timeoutMs: 30000
```

---

## 工具

### `whistle_status`

体检工具，也是模型的第一站。区分三种失败：**没装**（找不到 `w2`）、**没启动**（连不上端口）、**版本太低**。

```json
{
  "whistle": { "version": "2.10.14", "captureUrl": "http://127.0.0.1:9988/", "httpsInterception": false },
  "rules": { "disabled": false, "pluginsDisabled": false, "multiSelect": false, "laterRulesFirst": false,
             "selected": ["Default", "smoke-rules"], "files": [...], "total": 2 },
  "ruleFiles": [{ "name": "Default", "selected": true }],
  "plugins": { "total": 0, "enabled": [], "disabled": [] }
}
```

参数：`rules` / `plugins` / `values`（要不要列、默认列前两个）。每个子查询各走各的 `attempt`：旧版本缺某个接口只会让那一项变成 `"unknown"` 或 `{"error": ...}`，不会让整次体检失败。

### `whistle_sessions`

参数：`latest`、`count`(1–200，默认 30)、`type`（`JSON`/`JS`/`WS`/`Error`/… 与抓包界面底部筛选一致）、`subUrl`、`method`（`GET,POST`）、`statusCode`（`200,304`）、`reqHeader` / `resHeader`（`x-token` 只要求存在，`x-token=abc` 还要求值包含 `abc`）、`startId` / `startTime`（游标）。

输出固定列宽，一行一条，够扫一眼比：

```
whistle 2.10.14  ·  2 row(s)  ·  subUrl="/api/hello" method="POST"
id                    time      method  code     size      took  url
1794563565807-001     17:52:45  POST    502     282B      64ms  http://127.0.0.1:9987/api/hello
```

正文不在列表里返回 —— 要看内容用 `whistle_session`，否则几十个响应体会瞬间把上下文灌满。

### `whistle_session`

参数：`id`（必填）、`bodyLimit`（每段正文的字符上限，默认 4000，0 表示不限）、`headers`（默认 true）。

```
id: 1794563565807-001
url: http://127.0.0.1:9987/api/hello
POST 502  ·  282B  ·  64ms  ·  http  ·  started 17:52:45
matched rules:
  * example.com 127.0.0.1:8081
── request headers ──
content-type: application/json
...
── request body (application/json) ──
{
  "hello": "world"
}
```

### `whistle_frames`

参数：`reqId`（必填，就是会话 id）、`from`（`all`/`client`/`server`）、`latest`、`count`、`startId`、`startTime`、`bodyLimit`。

```
reqId 1784885309943-086  ·  1 frame(s)  ·  from=client
frameId               dir  op    size  body
1784903620142-000     C>S   1    12B  {"t":1}
```

### `whistle_rules`

`action` 决定行为，默认只有 `list` / `get` 是只读（也标成可并发）：

| action | 作用 | 必要参数 |
|---|---|---|
| `list` | 文件名、勾选态、行数、首行预览 | — |
| `get` | 一个文件的完整内容（空文件显示 `(empty)`） | `name` |
| `set` | 写入/覆盖一个文件，**写完回读校验** | `name`、`value`；`selected` 默认 true |
| `select` / `unselect` | 勾选/取消勾选；`unselect` 不填 `name` 表示全取消 | `name` |
| `enable` / `disable` | 全局规则引擎开关 | — |
| `moveToTop` | 置顶（后置规则优先时才影响结果） | `name` |
| `multiSelect` / `laterFirst` | 引擎选项 | `enabled` |

两个刻意的设计：

1. **写后回读**。`set` 之后立刻 `rules/get` 比对，不一致就在结果里写 `verified: false` 并说明「这个版本的 `rules/add` 可能只追加不覆盖」——「写成功却没生效」比报错更难查。（实测 2.10.14 是覆盖语义。）
2. **`select` 顺手开启引擎**。规则引擎全局关闭时勾中文件也不生效，这是「我明明选了规则却没用」的头号原因。

### `whistle_values`

`action`: `list`（名称、大小、首行）/ `get` / `set`。写后同样回读比对。

### `whistle_plugins`

`action`: `list` / `get`。只读，用来回答「某个插件规则为什么没生效」。

---

## 边界与已知取舍

- **120 条窗口**。Whistle 单次最多返回 120 条记录/帧，游标是「大于某个 id」的增量语义。工具会顺游标再要一页，拿到空页就停（单次最多 5 页），绝不猜方向、不重复问同一窗口。要看更早的数据，自己带 `startId`。
- **没有 `getSession(id)`**。`whistle_session` 的做法是：id 的前缀就是 `startTime`，先开一个 1ms 的时间窗，抓不到再退回最新一页。**已经被挤出 120 条窗口的旧记录确实取不到**，那时会明确让你先用 `whistle_sessions` 拿 id。
- **`Default` 规则文件读不到内容**。`rules/list` 不返回它，`rules/get` 只回 `{ selected: true }`。`list` 因此用 `rules/status` 计数，并单列一行说明「这些文件 API 不给内容」，不让「2 个文件却只有 1 行」看起来像 bug。
- **超时只是不再等待**。底层是 HTTP 请求，没法真正中断；超时后工具立刻返回错误，请求可能在 whistle 那边继续跑完。
- **Windows 上必须走 shell**。`w2` 实际是 `w2.cmd`，`CreateProcess` 起不来，所以探测时用 `spawnSync(..., { shell: true })`；命令行带空格时会自动加引号。
- **缓存的是 API 模块，不是连接**。Whistle 每次请求都会重读自己的配置，所以 `w2 restart` 换了端口也不必让本插件重载；探测失败时不缓存，用户装好/启动 whistle 后下一次调用立刻可用，不用重启 Harness。
- **性能**。每次工具调用 ≈ 1–3 次本地 HTTP 往返（`status` 最多 5 次，因为要顺带查规则/插件/HTTPS）。抓包查询本身受 whistle 单页 120 条限制。

---

## 测试

```powershell
npm test        # 构建 + 27 个用例
```

> 用 nvm 切过版本的机器上先确认 `node -v` 是 18 以上：`node --test` 在 16 上根本不存在。

全部用例导入 `dist/`（Harness 真正加载的产物），并用 `apiFactory` 注入假 whistle，因此**本机不需要装 whistle**，也能覆盖三条真实失败路径：

- 客户端：版本低于 2.10.7 时报错且升级后可自愈；端口不通 → 提示 `w2 start`；挂死 → 超时；找不到 `w2` → 提示安装；版本号比较忽略预发布后缀。
- 查询：翻页只在整页时继续、`latest` 只问一次、按 id 的时间窗定位、请求头过滤的两种写法。
- 格式化：定宽行、JSON 美化、规则预览保持单行、换行风格无关的规则文本比较。
- 工具：七个工具名与顺序；`status` 单项失败不影响整体；筛选参数透传；会话详情的规则/头/正文；id 过期时的下一步提示；帧的方向与 opcode；`set` 的回读校验（含「只追加」的版本）；`select` 会开引擎；空规则文件显示 `(empty)`；`list` 的计数与隐藏文件说明；Values；插件只读。
- 接线：`apply` 通过 `ctx.tools` 注册七个工具、名字唯一、卸载时清理，且必填项真的落在 JSON Schema 的 `required` 上。

## 实测记录（Whistle 2.10.14 / Windows）

除单测外，用真实运行的 whistle 走了一遍（脚本在 `.preview/whistle-smoke/`，已被 gitignore）：

- `w2 start -p 9988` 后 `network.getStatus` 拿到 `2.10.14`，`createUrl` 给出抓包地址；
- 真造了一条经代理的 POST 流量：`whistle_sessions` 的 `subUrl` / `method` / `reqHeader` 命中，`whistle_session` 正确解出请求头、请求体（JSON 美化）与响应体；
- `whistle_rules set` → `list` → `select` → `get` 全链路一致（`verified: true`），规则确实生效（命中后把请求改到了未监听端口，502 可作证）；
- `whistle_values set/list`、`whistle_plugins list`、`whistle_session`（不存在的 id）均符合预期。

## 目录

```
plugins/dsh/whistle/
├── cordis.patch.yml        Host 行 + 默认配置
├── package.json            只有 Host 一半：没有 dsh.client
├── scripts/build.mjs       tsc 构建（工具链可回退到 ../related-projects）
├── src/host/
│   ├── index.ts            插件入口：接线，不干活
│   ├── shared/errors.ts    失败身份、时间预算、尽力而为的 attempt
│   ├── whistle/            client（加载/版本/错误）、types、query、format、rules
│   └── tools/              七个工具，一个文件一个
├── test/host.test.mjs      27 个用例，导入 dist/
└── dist/                   运行时产物（已提交，便于直接安装）
```
