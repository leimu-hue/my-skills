# AI Project Write File

一个用于整理和编写 Agent Skill 相关内容的轻量工作区，包含技能模板、规范入口以及示例技能，并提供工具把技能同步到各 Agent 的用户级目录，便于快速创建、维护和复用自定义 Skill。

## 目录结构

- `spec/`：技能规范说明入口
- `template/`：新 Skill 的基础模板
- `skills/`：已实现的 Skill 示例（也是同步工具的本地技能目录）
- `sync-skills.mjs`：技能拉取 + 软连接同步脚本
- `skills.config.json`：同步工具配置文件
- `references/`：技能相关的参考文档

## 当前 Skill 列表

| Skill | 说明 |
|---|---|
| `doc-generator` | 文档生成器，支持需求规格、概要设计、详细设计等核心文档及完整文档套件 |
| `java-coding-standards-lite` | Java 编码规范，面向 Spring / MyBatis / JPA / 并发等企业级 Java 项目的轻量规范 |
| `rust-coding-guide` | Rust 编码与审查指南，涵盖所有权/借用、unsafe、异步/并发、取消安全、错误处理、性能、Trait 设计 |
| `skill-creator` | Skill 创建辅助工具，包含评估、打包、改进描述等脚本 |
| `skill-creator-rule` | 创建、编写、更改技能需要遵守的规约 |
| `stop-slop-zh` | 去除中文文本里的 AI 生成痕迹，让散文、文案、博客等更自然、更像真人写 |

---

# Skill 同步工具

`sync-skills.mjs` 是一个零依赖的 Node 脚本，解决两件事：

1. **拉取**：按配置从某个 GitHub 仓库拉取指定目录下的技能到本地 `skills/`。
2. **软连接**：把本地 `skills/` 下的技能以软连接（Windows 用 junction）挂到各 Agent 的**用户级** skills 目录，避免手动复制。

## 环境要求

- Node.js ≥ 18（当前实测 26）
- 已安装 `git` 并加入 `PATH`

## 快速开始

```bash
# 1. 按需修改 skills.config.json
# 2. 从远端拉取技能
node sync-skills.mjs pull

# 3. 软连接到 Agent 目录（可直接指定 agent / 技能）
node sync-skills.mjs link --agents pi,claude --skills grill-me

# 或按配置一步到位
node sync-skills.mjs all
```

## 命令

| 命令 | 说明 |
|---|---|
| `pull` | 按 `sources` 从各仓库拉取指定目录/技能到本地技能目录 |
| `link` | 将本地技能软连接到目标 Agent 目录（幂等，可重复执行） |
| `unlink` | 移除由本工具创建的软连接（真实目录不会被删除） |
| `status` | 查看本地技能、以及每个目标目录的链接状态 |
| `agents` | 列出内置的 Agent 用户级目录预设及是否存在 |
| `all` | 依次执行 `pull` + `link` |

## pull 的选项

| 参数 | 说明 |
|---|---|
| `--skills <a,b>` | 只拉取指定技能（配合目录模式时的过滤） |
| `[技能...]` | 也可直接写位置参数，例如 `pull grill-me` |
| `--config <path>` | 指定配置文件，默认 `skills.config.json` |
| `--dry-run` | 只打印将要执行的操作，不落盘（缓存存在时会列出目录内发现的技能） |

## link / unlink / status 的选项

| 参数 | 说明 |
|---|---|
| `--agents <a,b>` | 使用内置 Agent 预设，逗号分隔可多个：`claude`、`codex`、`pi`、`agents`、`opencode`、`cursor`、`gemini`、`windsurf`、`copilot` |
| `--target <DIR>` | 自定义目标目录，可重复传入；支持 `~` 展开、相对路径 |
| `--skills <a,b>` | 只处理指定技能（本地 `skillsDir` 下的目录名） |
| `[技能...]` | 也可直接写位置参数，例如 `link grill-me` |
| `--config <path>` | 指定配置文件，默认 `skills.config.json` |
| `--force` | 目标已存在（真实目录/他人文件）时也强制覆盖，**谨慎使用** |
| `--dry-run` | 只打印将要执行的操作，不落盘 |

```bash
node sync-skills.mjs link --dry-run --agents pi --target ./tmp-dir --skills grill-me
node sync-skills.mjs link grill-me                 # 未指定目标时走配置 links
node sync-skills.mjs link --agents pi,claude       # 不写 --skills 时默认处理全部本地技能
node sync-skills.mjs link --target ~/.codex/skills # 直接给自定义目录
node sync-skills.mjs unlink --agents pi            # 清理 pi 目录下的链接
node sync-skills.mjs status --agents claude        # 查看某 agent 的链接状态
```

> **优先级**：命令行只要出现 `--agents` / `--target` / `--skills` / 位置技能参数，就完全以命令行为准；否则使用配置文件中的 `links[]`。`link` 未显式指定技能时，默认处理本地全部技能（含 `SKILL.md` 的目录）。

### 内置 Agent 预设（均为用户级目录）

| 名称 | 目录 |
|---|---|
| `claude` | `~/.claude/skills` |
| `codex` | `~/.codex/skills` |
| `pi` | `~/.pi/agent/skills` |
| `agents` | `~/.agents/skills`（通用 Agent Skills 约定） |
| `opencode` | `~/.config/opencode/skill` |
| `cursor` | `~/.cursor/skills` |
| `gemini` | `~/.gemini/skills` |
| `windsurf` | `~/.codeium/windsurf/skills` |
| `copilot` | `~/.copilot/skills` |

用 `node sync-skills.mjs agents` 可查看实际解析路径与是否存在。

## 配置文件说明

```jsonc
{
  "skillsDir": "skills",          // 本地技能存放目录，相对本配置文件；默认 "skills"
  "sources": [
    {
      "name": "mattpocock-skills", // 来源标识（同时用作缓存目录名）
      "enabled": true,             // 为 false 时忽略该来源
      "repo": "https://github.com/mattpocock/skills.git",
      "ref": "main",               // 分支 / tag / commit，默认 HEAD
      "dest": "skills",            // 拉取落地根目录，默认取 skillsDir
      "paths": [                   // 仓库内相对路径，目录或单个技能均可
        "skills/productivity",                       // 目录：自动同步其下所有技能
        "skills/engineering/tdd",                    // 单个技能：只同步这一个
        { "path": "skills/foo/bar", "as": "my-custom-name" } // 单个技能且改名
      ]
    }
  ],
  "links": [
    {
      "skills": ["grill-me", "doc-generator"],
      // 两种目标写法可混用：
      "agents": ["claude", "pi"],           // 内置预设名
      "targets": ["~/.agents/skills"]        // 自定义路径
    }
  ]
}
```

### 拉取行为

`paths` 的每一项既可以指向**单个技能目录**，也可以指向**父目录**：

- **写单个技能目录**（目录内含 `SKILL.md`）：只同步该技能。
  ```jsonc
  "paths": ["skills/productivity/grill-me"]
  ```
- **写父目录**（其下没有 `SKILL.md`）：递归自动发现其中所有含 `SKILL.md` 的技能，全部同步。
  ```jsonc
  "paths": ["skills/productivity"]   // -> grill-me, grilling, handoff, teach ...
  ```
- 想从父目录里只挑几个，用 `--skills` 过滤：
  ```bash
  node sync-skills.mjs pull --skills grill-me,teach
  ```
- 需要改名时用对象形式：`{ "path": "skills/foo/bar", "as": "my-name" }`（仅对单个技能目录有效）。

其他：

- 使用浅克隆（`--depth 1`），缓存位于 `.skills-cache/`，重复执行会复用并更新。
- 发现技能时会自动跳过 `.git` 和隐藏目录；遇到含 `SKILL.md` 的目录即视为技能，不再向下递归。
- 每个落地目录会被**整体替换**为远端最新版本（先删旧再复制），不会残留陈旧文件。

### 软连接行为

- 按 `skills` × `targets`（含 `agents` 展开）建立目录软链。
- 已是正确链接则跳过（幂等）。
- 目标已存在且**不是**本工具创建的链接时，默认跳过并告警；只有 `--force` 才会覆盖。
- `unlink` 只删除软连接本身，不会删除真实目录。

## 实测示例

以 `https://github.com/mattpocock/skills` 为例。

```bash
# 单个技能
#   "paths": ["skills/productivity/grill-me"]
node sync-skills.mjs pull     # -> skills/grill-me/{SKILL.md, agents/openai.yaml}

# 整个目录（自动发现 7 个技能）
#   "paths": ["skills/productivity"]
node sync-skills.mjs pull     # -> grill-me, grilling, handoff, teach, ...

# 目录模式下只挑两个
node sync-skills.mjs pull --skills grill-me,teach

# 再软链到 pi
node sync-skills.mjs link --agents pi --skills grill-me
```

## Windows 说明

- 脚本在 Windows 上自动使用 **junction** 创建目录链接，通常无需管理员权限。
- 若改用符号链接（symlink）遇到权限问题，可开启「开发者模式」或以管理员身份运行。

## 适用场景

这个工作区适合用于：

- 管理自定义 Agent Skills
- 沉淀团队内部提示词能力
- 建立可复用的任务模板
- 快速搭建 Skill 资产库
- 一份技能多端复用，避免在各 Agent 目录间手动复制

## 建议

把缓存目录加入忽略，避免提交：

```gitignore
.skills-cache/
```

## 参考

- 官方规范：<https://agentskills.io/specification>
