# AI Project Write File

一个用于整理和编写 Agent Skill 相关内容的轻量工作区，包含技能模板、规范入口以及示例技能，便于快速创建、维护和复用自定义 Skill。

## 目录结构

- `spec/`：技能规范说明入口。
- `template/`：新 Skill 的基础模板。
- `skills/`：已实现的 Skill 示例。
- `.claude/`、`.opencode/`：本地工具或运行环境相关配置目录。

## 当前内容

### 1. Skill 规范

- `spec/agent-skills-spec.md`：指向官方规范说明地址 <https://agentskills.io/specification>

### 2. Skill 模板

- `template/SKILL.md`：用于创建新 Skill 的最小模板，包含 `name` 和 `description` 元信息。

### 3. 示例 Skill

- `skills/frontend-design/SKILL.md`：一个用于生成高质量前端界面的 Skill 示例。

## 如何新增一个 Skill

1. 复制 `template/SKILL.md`
2. 放入新的目录，例如 `skills/my-skill/SKILL.md`
3. 按需修改头部元信息：
   - `name`：Skill 名称
   - `description`：Skill 用途与触发场景
4. 在正文中补充具体使用说明、工作流程和约束

## 推荐编写格式

一个典型的 `SKILL.md` 通常包含：

- YAML 头部元信息
- Skill 的目标说明
- 使用时机
- 执行步骤或最佳实践
- 注意事项、限制条件或示例

## 适用场景

这个工作区适合用于：

- 管理自定义 Agent Skills
- 沉淀团队内部提示词能力
- 建立可复用的任务模板
- 快速搭建 Skill 资产库

## 参考

- 官方规范：<https://agentskills.io/specification>
