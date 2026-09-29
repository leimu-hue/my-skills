---
name: java-coding-standards-lite
description: Use this skill when working with Java or Spring code — writing, reviewing, refactoring, generating, or fixing it. Applies to Spring Boot controllers, services, repositories, DTOs, tests, exception handling, validation, MyBatis XML, SQL, DDL, JPA entities, and Lombok classes. Always consult this skill for Java code generation, code review, architecture decisions, naming, error handling patterns, database schema design, or any task where Java coding quality matters. Also use when the user mentions Spring, Spring Boot, MyBatis, MyBatis-Plus, JPA, Hibernate, Bean Validation, Lombok, or Maven/Gradle Java projects. Does not apply to Kotlin, Android, or non-JVM projects.
license: MIT
---

# Java 编码规范（轻量版）

面向企业 Java 项目。目标：不打乱现有风格，产出稳定、清晰、好维护的代码。

## 写码前决策梯（Lazy Ladder）

每次写代码前，从第一级停住：

1. **这东西需要存在吗？** 推测性需求 → 跳过，一句话说明
2. **项目里已经有了？** helper / util / 类型 / 模式已经存在 → 复用，不要重写
3. **标准库能做？** `java.time`、`Collections`、`Stream`、`String` 方法等 → 直接用
4. **平台原生特性覆盖？** Bean Validation 注解替代手写校验、DB 约束替代应用层检查、`record` 替代手写 DTO → 用原生
5. **已安装的依赖能解决？** 项目已有的 Spring / Commons / Guava → 用它，不加新依赖
6. **一行能搞定？** 一行
7. **以上都不行：** 写最小可行代码

梯子在理解问题**之后**运行，不是代替理解。先读任务涉及的代码、追踪真实流程，再爬梯子。

## 核心规则

> **优先级：硬性规则 > 项目现有风格。** 已明确禁止的写法（字段注入、空 catch、硬编码中文消息、单实现接口等）禁止跟随项目现有风格。

## 工作方式

1. 确认 Java 版本（`pom.xml` / `build.gradle`），跟随附近 2-3 个类的本地风格
2. 行为变更同步补测试或更新测试
3. 编辑完成后清理未使用 import
4. **刻意简化的已知天花板**用注释标记：`// ponytail: 全局锁，吞吐量不够时改账户级锁`

## 输出风格

代码优先。最多三行说明：跳过了什么、什么时候补。

模式：`[代码] → 跳过: [X], 需要时加: [Y].`

如果解释比代码还长，删掉解释。用户明确要求的说明（报告、走查、阶段备注）不受此限。

## 不偷懒的边界

以下永远不能简化掉：

- 信任边界处的输入校验
- 防止数据丢失的错误处理
- 安全措施（SQL 注入、XSS、CSRF）
- 先理解问题再动手（读完涉及的代码、追踪完整流程，再决定方案）
- 用户的明确要求

## 参考文件

按领域查阅：

| 文件 | 领域 |
|---|---|
| `./references/core-rules.md` | 核心规则详细说明与代码示例 |
| `./references/naming-conventions.md` | 命名规范（Java / DB / 泛型 / 注解） |
| `./references/coding-standards.md` | 格式、注释、Lombok、record、集合、Optional |
| `./references/exception-logging.md` | 异常分类、ErrorCodes、i18n、日志级别与写法（全局异常处理的权威定义） |
| `./references/security.md` | 参数校验、SQL 注入、XSS、CSRF、敏感数据 |
| `./references/testing.md` | 测试类型、结构、Mock、断言、Spring 测试选择 |
| `./references/database.md` | 表设计、索引、SQL、分页、事务、批量操作、连接池 |
| `./references/concurrency.md` | 线程池、共享状态、锁、ThreadLocal、异步任务 |
| `./references/design.md` | 分层架构、设计模式、API 设计、配置管理、DDD（全局异常处理仅列方案选型，实现见 `exception-logging.md`） |

## 输出要求

安静应用规范。代码注释直接写进代码。只说明影响本次修改的规则。

## 执行 Todo 清单

处理 Java 任务时按顺序走这张单子，每项完成后再进下一项：

**动手前**
- [ ] 读完任务涉及的代码、追踪完整调用流程（见「不偷懒的边界」）
- [ ] 读 `./references/core-rules.md`（十条核心规则，写码前必读）
- [ ] 走一遍「写码前决策梯」，从第一级停住
- [ ] 确认 Java 版本与附近 2-3 个类的本地风格（见「工作方式」）
- [ ] 涉及某领域（异常/i18n、SQL、安全、事务、测试等）时，查阅「参考文件」表中对应的参考文件

**写码时**
- [ ] 遵循已查阅参考文件中的领域规则写码，禁止凭记忆写规范
- [ ] 守卫式写法：先拒绝非法输入，正常流程平直（core-rules.md §1）
- [ ] 复用项目已有工具 / 标准库 / 已安装依赖，不加新东西（core-rules.md §2、§8、§9）
- [ ] 硬性规则优先于项目现有风格（见「核心规则」优先级）

**交付前**
- [ ] 对照本次涉及领域的参考文件自查改动
- [ ] 清理未使用 import；行为变更已同步测试（见「工作方式」）
- [ ] 输出符合「输出风格」：代码优先，最多三行说明
