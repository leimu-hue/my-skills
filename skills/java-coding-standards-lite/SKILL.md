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

**Bug 修复 = 根因，不是症状。** 先 grep 所有调用方，在共享函数里修一次，而不是每个调用方各打一个补丁。

## 核心规则

> 详细说明与代码示例见 `./references/core-rules.md`

1. **守卫式写法** — 尽早拒绝非法输入，正常流程保持平直。嵌套深 = 难读、难测、难维护
2. **跟随项目工具风格** — 沿用项目已有工具类（StringUtils / CollectionUtils），不额外引入依赖。同一文件内风格统一
3. **空值防御** — 外部输入、第三方返回值解引用前先校验。风格贴近本地代码（`== null` vs `Objects.isNull` 都行）
4. **用 import，不用全路径** — 全路径只在同名类冲突时允许，且必须注释说明原因
5. **switch 表达式（Java 17+）** — 箭头语法无穿透风险，强制穷举分支。已有稳定 switch 不改，只在新增/修改时用
6. **文本块（Java 17+）** — 多行 JSON / SQL / XML 用 `"""`，所见即所得。单行字符串不用
7. **record 优先（Java 17+）** — 简单不可变 DTO/VO/Command/Response 用 record，优先级高于 Lombok。JPA Entity、需要 setter / 继承 / ORM 代理的场景用 class
8. **类型独立成文件** — record、DTO、VO、Command、Response 等数据载体必须放在独立 `.java` 文件中，归属 dto / domain / vo 等对应包。禁止作为内部类塞进 Service 或 Controller
9. **不要写没被要求的抽象** — 一个实现的接口、一个产品的工厂、一个永不改变的配置值 → 不要建
10. **删除优于新增** — 最短可行 diff 赢。先删冗余，再加必要。最懒的可行方案就是对的方案

## 工作方式

> 以下只列与核心规则不重叠的实践要点

1. 确认 Java 版本（`pom.xml` / `build.gradle`），跟随附近 2-3 个类的本地风格
2. Controller 保持薄 — 路由、参数绑定、响应状态码。业务逻辑放 Service
3. 行为变更同步补测试或更新测试
4. 编辑完成后清理未使用 import
5. **刻意简化的已知天花板**用注释标记：`// ponytail: 全局锁，吞吐量不够时改账户级锁`

## 输出风格

代码优先。最多三行说明：跳过了什么、什么时候补。

模式：`[代码] → 跳过: [X], 需要时加: [Y].`

如果解释比代码还长，删掉解释。用户明确要求的说明（报告、走查、阶段备注）不受此限。

## 常见违规点

按类别分组，便于检索。

### 代码规范

- 新增类 / public 方法缺少注释（职责、参数、返回值、异常）
- 用字段注入 `@Autowired`（用构造器注入 + `@RequiredArgsConstructor`）
- 生产代码空 `catch` 或 `printStackTrace()`
- `Optional` 用作字段或方法参数（仅限返回值）
- 简单遍历用 `Stream`（for-each 更直接）
- record / DTO / VO 作为内部类放在 Service 或 Controller 中（必须独立成文件）
- **写了一个接口却只有一个实现**（不要为假想的扩展点建抽象）
- **手写工具方法而标准库/项目已有等价实现**

### 错误处理与国际化

- 错误码内联字符串字面量（用 `ErrorCodes` 常量类引用）
- 异常或日志消息硬编码中文（用 i18n message key + `MessageSource`）

### 数据库与 SQL

- SQL 通过字符串拼接构造（参数化：`#{}` / `?` / JPA 参数绑定）
- 批量操作大小硬编码（用配置项控制）
- 新增业务表缺少审计字段或字段未声明 `NOT NULL`
- 业务查询遗漏 `is_deleted = 0` 过滤

### 安全与校验

- 外部输入未校验就直接使用
- JPA Entity 使用 `@Data`（`equals`/`hashCode` 会触发懒加载，应基于 ID 自定义）
- N+1 查询：`FetchType.EAGER` 或循环触发懒加载

### 事务

- `@Transactional` 加在 `private` 方法（AOP 不生效）或 Controller 层
- 读操作未标记 `@Transactional(readOnly = true)`
- 配置值硬编码或 `@Value` 散落各处（应用 `@ConfigurationProperties` 集中管理）

## 不偷懒的边界

以下永远不能简化掉：

- 信任边界处的输入校验
- 防止数据丢失的错误处理
- 安全措施（SQL 注入、XSS、CSRF）
- 先理解问题再动手（读完涉及的代码、追踪完整流程，再决定方案）
- 用户明确要求的东西

## 参考文件

按领域查阅：

| 文件 | 领域 |
|---|---|
| `./references/core-rules.md` | 核心规则详细说明与代码示例 |
| `./references/naming-conventions.md` | 命名规范（Java / DB / 泛型 / 注解） |
| `./references/coding-standards.md` | 格式、注释、Lombok、record、集合、Optional |
| `./references/exception-logging.md` | 异常分类、ErrorCodes、i18n、日志级别与写法 |
| `./references/security.md` | 参数校验、SQL 注入、XSS、CSRF、敏感数据 |
| `./references/testing.md` | 测试类型、结构、Mock、断言、Spring 测试选择 |
| `./references/database.md` | 表设计、索引、SQL、分页、事务、批量操作、连接池 |
| `./references/concurrency.md` | 线程池、共享状态、锁、ThreadLocal、异步任务 |
| `./references/design.md` | 分层架构、设计模式、API 设计、配置管理、DDD |

## 输出要求

安静应用规范。代码注释直接写进代码。只说明影响本次修改的规则。
