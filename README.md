# AI Project Write File

一个用于整理和编写 Agent Skill 相关内容的轻量工作区，包含技能模板、规范入口以及示例技能，便于快速创建、维护和复用自定义 Skill。

## 目录结构

- `spec/`：技能规范说明入口
- `template/`：新 Skill 的基础模板
- `skills/`：已实现的 Skill 示例
- `.claude/`：本地工具或运行环境相关配置目录

## 当前 Skill 列表

| Skill | 说明 |
|---|---|
| `doc-generator` | 文档生成器，支持需求规格、概要设计、详细设计、数据库设计、API 文档、测试计划、部署手册等多种文档模板 |
| `frontend-design` | 前端界面设计 Skill，用于生成高质量前端界面 |
| `java-coding-standards-lite` | Java 编码规范（中文版），面向企业 Java 项目的轻量规范，涵盖 Spring、MyBatis、JPA、并发等场景 |
| `java-coding-standards-en` | Java 编码规范（英文版），与中文版结构对齐 |
| `skill-creator` | Skill 创建辅助工具，包含评估、打包、改进描述等脚本 |
| `rust-coding-guide` | Rust 编码与审查指南，编写和审查 Rust 代码时均适用，涵盖所有权/借用、unsafe、异步/并发、取消安全、错误处理、性能、Trait 设计 |
| `vue-options-api-best-practices` | Vue Options API 最佳实践，涵盖 TypeScript 类型、响应式陷阱、生命周期等规范 |

## 如何新增一个 Skill

1. 复制 `template/SKILL.md`
2. 放入新的目录，例如 `skills/my-skill/SKILL.md`
3. 按需修改头部元信息：
   - `name`：Skill 名称
   - `description`：Skill 用途与触发场景
4. 在正文中补充具体使用说明、工作流程和约束
5. 如需深入某一领域的详细内容，可在 `references/` 子目录下拆分独立文档

## 推荐编写格式

一个典型的 `SKILL.md` 通常包含：

- YAML 头部元信息（`name`、`description`、`license`）
- Skill 的目标说明
- 核心规则摘要（详细内容拆分至 `references/` 目录）
- 工作方式 / 执行步骤
- 常见违规点或注意事项
- 参考文件索引

## 适用场景

这个工作区适合用于：

- 管理自定义 Agent Skills
- 沉淀团队内部提示词能力
- 建立可复用的任务模板
- 快速搭建 Skill 资产库

## 参考

- 官方规范：<https://agentskills.io/specification>
