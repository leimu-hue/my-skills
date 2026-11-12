# Git Worktree

把「隔离检出」做成 Harness 的原生能力：模型可以在用户要求时创建，Git 是事实来源，
人保留合并与删除的决定权。

## 设计约束

这些是当前实现必须保持的行为：

- 已经在 linked worktree 里时不创建第二个；submodule 只是普通检出，照常允许创建。
- 检出默认放在 `<仓库>/.worktrees/`，也可切到插件状态目录。
- 默认建分支（前缀可配，默认 `worktree/`），也可选 detached；detached 的净改动
  通过 `apply` 回到主仓工作区。
- 列表以 `git worktree list --porcelain` 为准，注册表只补「谁建的、基线是什么」。
- 外部创建的检出只读，插件不删。
- 删除前拒绝未提交改动，以及「没有任何其他分支或远端包含」的提交；强制删除前
  先留归档引用。
- 创建后把检出注册成工作区，并在能拿到 agent 工厂时新开一个以检出为 cwd 的会话。

## 生命周期

```
隔离检测 → 解析基线 → 建检出（可选分支）→ 带本地文件 / 跑 setup → 工作 → 落地 → 清理
```

### 隔离检测：已经在隔离里就不建

会话目录如果是 linked worktree（`GIT_DIR != GIT_COMMON`），创建请求原样返回
`created: false, reason: "already-isolated"`，不再产生第二个。没有这一步，模型或用户
很容易在检出里再套一层，两个 checkout 互相看不见对方的改动。

submodule 里 `GIT_DIR != GIT_COMMON` 同样成立，但它只是普通检出：用
`git rev-parse --show-superproject-working-tree` 区分，submodule 照常允许创建。

### 基线

| 配置 | 起点 |
|---|---|
| `basePolicy: "fresh"`（默认） | `origin/<默认分支>`，没有远端时退到本地 `main` / `master` |
| `basePolicy: "head"` | 主仓当前 HEAD |
| `create(..., base: "ref")` | 显式 ref |

`fresh` 的价值是不把本地未推送的提交带进新检出——前提是「这个检出要拿去开 PR」。

### 创建方式

| `mode` | 检出状态 | 工作怎么回去 | 适用 |
|---|---|---|---|
| `branch`（默认） | 新分支 `worktree/<name>` | 在检出里 commit → push / PR / merge | 需要评审、需要留下历史的改动 |
| `detached` | `--detach`，不污染分支 | 面板或 `/worktree apply` 把净改动搬进主仓工作区 | 一次性尝试、并行试验 |

两种模式共用同一条性能路径：`worktree add --no-checkout` → `read-tree` →
`checkout-index --all --index`。最后那个 `--index` 会把检出结果的 stat 写回 index：
没有它，第一次 `git status` 要重新哈希整个工作区（8000 文件实测 2.2s → 0.14s）。
`git status` 自己在第二次起也会回填 stat，所以这里只是把那次慢查询提前到创建时，
而不是修一个「永远不会自愈」的问题。

### 把改动搬回主仓（`apply`）

`apply` 只做三件事，顺序是刻意的：

1. **给检出内容造一个孤立快照**（`commit-tree`）：不移动 HEAD、不移动分支、不触发
   hooks，结束后把 index 复原——所以一次应用不会改变检出里「未提交」这个状态，
   也不会往用户分支上塞 `dsh worktree snapshot` 这样的提交；
2. **用 `base...快照` 生成补丁**（三点 diff）：等价于「从分叉点算起」。两点 diff 在
   检出 rebase / 拉过上游之后会把上游的新提交算成本检出的删除，应用回主仓就是反向撤销；
3. **先严格预演，再应用**：不带 `--3way` 的 `apply --check` 过了就严格应用（原子，失败即
   一字节不动）；不过才退到三方预演，并**显式拒绝** stderr 里的 `with conflicts`——
   `apply --check --3way` 遇到冲突时退出码依然是 0，只看退出码等于没检查。

冲突时主仓不被修改，错误信息里带冲突文件名。

### 收尾（可选）

`setupCommands` 在新检出里依次执行（`npm install`、`cargo build`…），`verifyCommand`
再跑一次基线自检。失败只报告、不撤销检出：命令的输出是给人看的，检出本身是资产。

### 创建即就绪：工作区与会话

检出建好后不会停在「一个目录」上，而是立刻变成可以干活的地方：

1. **注册工作区**（`autoRegisterWorkspace`，默认开）：侧栏出现该项目，标题是
   `仓库 · worktree/<名字>`（detached 则是 `仓库 · <名字> (detached)`）。工作区按 cwd
   归组会话，所以这个标签就是「标注为 worktree」。
2. **新建会话**（`autoSession`，默认开）：调用 `ctx.agents.create({ meta: { cwd } })`
   在检出目录里开一个实时会话。会话的 cwd 就是检出，工具的相对路径、系统提示里的
   工作目录、工作区归组全部指向那里。

两步都是尽力而为：Host 没有工作区注册表或 agent 工厂，或者用户把开关关掉时，
只把原因放进回执，检出照常创建。面板行上常驻「新建会话」，已有检出也能随时补一个。

## 界面、命令与工具

### 面板（左侧栏「隔离工作区」）

面板不提供「创建」：创建由用户在会话里提出、由 AI 调 `worktree_create` 执行。
它负责观察与配置：

- **工作区选择**直接读 Host 的 `workspaceRegistry`，只列 DSH 工作区（非 Git 的工作区跳过）；
  不支持手动选任意目录。
- **分支前缀**（如 `worktree/`、`feat/`）当场可改，存在状态目录的 `settings.json` 里，
  下一次 AI 创建立即生效；合法性交给 `git check-ref-format` 判。
- 顶部显示隔离检测读数：已经在隔离里时只解释现状。
- 列表里每行显示分支（或 `detached`）、当前标记、外在创建标记、未提交/领先/落后。
- 外部创建的检出只有「打开目录」；受管行提供「注册 / 已注册」「新建会话」「查看改动」
  「应用」「删除」。

### `/worktree`

```
/worktree                                    列出当前仓库的隔离 checkout
/worktree help                               打印完整用法
/worktree create <名字> [基线] [--detach] [--branch <分支>] [-- 任务…]
/worktree path <名字>
/worktree open <名字>                        注册成工作区，随后可在侧栏新建会话
/worktree apply <名字>                       净改动进主仓工作区（不提交）
/worktree remove <名字> [--force]
/worktree prune                              清理目录已丢失的残留（含外部检出）
```

`--` 之后是任务，原样交给新会话（换行、缩进、看起来像 flag 的文字都不解析）：

```
/worktree create fix-login -- 修一下登录超时：
1. 加超时配置项
2. 补一个失败用例
```

创建仍然在**那个检出里新开的会话**中发生，命令只是在它建好后立刻发一条消息把那一轮
叫起来——回执里会给出会话 id，面板上新建会话建完会直接切过去。任务发不进去（Host
没有 agent 工厂、或 agent 不支持 `followup`）时，检出与会话照样留下，回执里说明原因。

### 工具

| 工具 | 权限 | 说明 |
|---|---|---|
| `worktree_list` | 只读 | 隔离检测读数 + 全部检出（含外部创建的） |
| `worktree_diff` | 只读 | 相对基线的 diff，patch 截断到 8 KB |
| `worktree_create` | 写 | 创建检出；已在隔离里时返回 `created: false` |

`apply` 与 `remove` 故意不暴露给模型：一个改用户主仓的工作区，一个销毁别人的工作。
策略门禁（`tools/pre-execute` 的 allow/deny/ask）本来就在，但「创建」和「销毁」
不该共用一个授权级别。

### Git 命令清单

每一条 git 调用都定义在 [`src/host/git/commands.ts`](src/host/git/commands.ts)，
其他地方只引用（`runGit(Git.status(), options)`），不再散落字符串数组。
每条命令带两个标签：

- `purpose`：为什么需要它；
- `effect`：`none` / `index` / `worktree` / `refs` / `registration`——调用方据此判断
  要不要加锁、要不要失效缓存。

`GIT_COMMANDS` 是给人看的清单（可直接打印）。新增 git 操作时：先在 `SPECS` 里写一条，
再加构建器——`build()` 的 `K extends keyof typeof SPECS` 保证拼错名字是编译错误，
不会静默多出一条没人知道的命令。

集中之后，几类只在字符串里才存在的坑也一并堵上了：`rev-parse --abbrev-ref HEAD HEAD`
会把**分支名**当成提交 id（现在拆成 `symbolic-ref` + `rev-parse`，返回值是品牌类型
`Oid`）；`check-ref-format --branch -- <name>` 会直接把 `--` 当 refname（exit 129）。

## 目录与忽略规则

`layout: "repo"`（默认）把检出放在仓库内，IDEA、VS Code、`git worktree list` 和人的
直觉都能看见它；代价是目录必须被忽略，否则主仓立刻变脏。

处理方式是**只写 `.git/info/exclude`，不写 `.gitignore`**：后者会立刻把主仓变成
dirty，还要用户为一条本机路径提交一次历史记录；前者只影响本机，且主仓保持干净。
代价是队友看不到这条规则——所以只在「仓库内布局、且确实没有任何规则覆盖」时才写。

`layout: "state"` 回到 `$DSH_HOME/git-worktree/worktrees/<仓库键>/<名字>`，适合
「不想让检出出现在仓库目录里」的场景。

### 本地文件随迁（`.worktreeinclude`）

worktree 是干净检出，`.env`、本地证书这类被忽略的文件不会出现。在仓库根放一个
`.worktreeinclude`（`.gitignore` 语法），创建时把它们复制过去：

```text
.env
.env.local
config/secrets.json
```

只有**同时**满足「匹配 include 模式」和「被仓库忽略」的文件才会复制：tracked 文件
不会重复，普通 untracked 文件也不会被误带。实现上用两次 Git 查询求交，不遍历整棵
被忽略的目录树，所以 `node_modules` 再大也不影响创建速度。

复制有上限（单文件 1 MiB、总计 8 MiB、最多 200 个）；目标已存在时跳过，绝不覆盖已
检出的内容。include 处理失败不会撤销 worktree，只在界面/命令回执里提示原因。

## 清理

删除分两步：先不带 `force` 让 Host 检查会丢什么，被拒绝后界面才解锁「强制删除」。

| 情况 | 默认行为 | 强制删除时 |
|---|---|---|
| 目录已经不存在 | 只清记录与 Git 的失效登记，不需要 `force` | — |
| 有未提交 / 未跟踪文件 | 拒绝（`worktree-dirty`） | detached 先做孤立快照并钉引用，再删；分支模式直接删（分支保留） |
| 有提交，但除检出自己的分支外没有任何本地/远端分支包含它 | 拒绝（分支：`worktree-unpushed`；detached：`worktree-unmerged`） | 同上：detached 会留下 `refs/dsh/archive/<id>` |
| 外部创建的检出 | 拒绝（`worktree-external`），请用 `git` | — |

两条硬约束：

- **删除失败就是失败**。`git worktree remove` 报错时，只有「目录确实已经不在」才算成功；
  目录还在就原样抛错、记录保留。曾经的做法是拿 `git worktree prune` 的退出码当成功，
  而 prune 无事可做时同样返回 0——于是 Windows 上文件被占用时插件报「已删除」、记录也删了，
  目录留在磁盘上，Git 不再列它，面板也再也看不见它。
- **归档失败必须中止**。做不到归档和没东西可归档不是一回事，前者不能继续强删。

分支模式下强制删除**不会丢提交**：分支留在仓库里。detached 模式没有这条退路，所以
强制删除前会把内容（含未提交改动）做成一个提交并挂到 `refs/dsh/archive/<id>`，
对象因此可达，`git gc` 不会回收它。

应用补丁与删除期间会持有 `git worktree lock`，另一个进程或清理任务因此无法并发删掉
同一个目录；结束后释放。

目录被外部删除后，记录会显示为「缺失」。面板顶部的「清理失效记录」或
`/worktree prune` 会做三件事：删掉目录已失的**记录**、对每个已知仓库跑 `git worktree prune`
（所以**外部创建的**、目录已失的检出也会被收走）、并在 prune 前 unlock 那些被锁住的失效
条目（Git 默认不会 prune 锁住的条目）。清理是显式
操作，不在启动时自动执行——外接盘/网络盘短暂不可用不该被当成「用户删掉了它」。

## 配置

| 键 | 默认 | 说明 |
|---|---|---|
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | 状态目录：注册表，以及 `state` 布局的检出 |
| `layout` | `repo` | `repo` = 仓库内 `.worktrees/`；`state` = 状态目录 |
| `worktreeDir` | `.worktrees` | `repo` 布局下的目录名（相对仓库根） |
| `basePolicy` | `fresh` | `fresh` = 远端默认分支；`head` = 主仓当前 HEAD |
| `mode` | `branch` | 默认创建方式：`branch` / `detached` |
| `setupCommands` | `[]` | 创建后在新检出里依次执行的命令 |
| `verifyCommand` | 无 | 创建后执行的基线自检 |
| `setupTimeoutMs` | `600000` | setup / verify 单条超时 |
| `autoRegisterWorkspace` | `true` | 创建后自动把检出注册成工作区（侧栏可见） |
| `autoSession` | `true` | 创建后自动在检出里新建会话（cwd = 检出目录） |
| `gitTimeoutMs` | `120000` | 普通 git 命令超时 |
| `worktreeAddTimeoutMs` | `600000` | 全量检出的超时 |

**运行时可改的设置**（面板里直接改，即时生效，存在状态目录的 `settings.json`）：

| 设置 | 默认 | 说明 |
|---|---|---|
| `branchPrefix` | `worktree/` | 分支名前缀：`前缀 + 名字`；空串表示直接用名字 |

## 安全边界

- worktree 名只允许 `[A-Za-z0-9._-]`，拒绝 Windows 保留名与结尾点号；
- 分支名过 `git check-ref-format --branch`，已存在的分支一律拒绝（不复用别人的分支）；
- 目标目录必须落在算出来的检出根之内；
- 创建失败会收回登记与空目录，非空残留一律保留；
- 删除前检查未提交改动与「只有这里知道」的提交，非 `--force` 不动；
- 强制删除前留快照引用（detached）或保留分支（branch）；
- `.worktreeinclude` 只复制仓库内、无路径穿越的文件，且不覆盖已检出的内容；
- 应用补丁前先 `git apply --check --3way`，主仓不会出现「应用了一半」；
- 所有路由都过信任门禁（`connection` 或回环 + 同源 Origin）。

## 已知边界

- **会话不能在原地搬家**。会话的 `cwd` 写在 immutable 的 header 里，插件改不了当前
  会话。所以「进入检出」的实现是**在检出里新开一个会话**（创建时自动做，或面板上
  随时补一个），而不是把当前会话切过去。
- **自动新建的会话默认是空的**，除非命令里带了 `-- 任务`：任务会作为一条普通用户
  消息走 `agent.followup()`，那一轮就由新会话的 agent 自己跑。「插一句」不等于
  「叫醒」——只有 `followup` 会开一轮，这也是 `/plan` 用的同一套原语。若 Host 没有
  注册 agent 工厂（`ctx.agents`），这一步降级成「工作区已就绪」，任务原因写回回执。
- **不做定时清理**。清理依赖「这个检出属于哪个会话」的可靠信息，当前没有，所以清
  理是显式动作。
- **外部检出只读**。插件不认领 `git worktree add` 创建的目录，也不替 Git 删除它。
- **不做 sparse / symlink 优化**。没有实现 sparse-checkout 或目录链接；大仓库请自行
  用 `git sparse-checkout`。

## 测试

```bash
npm run build
npm test
```

`test/worktree.test.mjs` 在临时目录里建真实 Git 仓库，覆盖检出、状态、diff、应用、
删除、分支/锁的解析与「提交是否只在检出里」的判定，并断言 index 的 stat 缓存确实
被写入（性能回归）。
`test/service.test.mjs` 覆盖隔离检测、submodule 例外、两种布局、两种创建方式、外部
检出只读、未推送拒绝、强制删除的快照引用与 setup / verify 的执行目录。
`test/correctness.test.mjs` 是缺陷回归：基线必须是提交 id、探测缓存不能把检出当主仓、
冲突时主仓一字节不动、删除失败不能报成功、重命名只算一个改动、超时后进程树必须收尾。
