---
name: java-coding-standards-lite
description: Use when creating, modifying, or reviewing Java/Spring code, tests, DTOs, controllers, services, repositories, exception handling, validation, MyBatis XML, SQL, or DDL in Java projects.
license: MIT
---

# Java 编码规范（轻量版）

面向企业 Java 项目的轻量规范，目标是在不打乱现有项目风格的前提下，产出稳定、清晰、好维护的代码。

## 核心规则

> 完整规则说明与代码示例见 `./references/core-rules.md`

1. **优先使用守卫式写法** — 尽早拒绝非法输入，保持正常流程平直
2. **跟随项目既有工具风格** — 沿用项目已有工具类，不额外引入依赖
3. **空值处理以可读性为先** — 贴近本地风格，外部输入解引用前先校验
4. **优先使用 import** — 避免无理由全路径类名
5. **Java 17+ 优先使用 switch 表达式** — 消除 break 穿透风险，强制覆盖所有分支
6. **Java 17+ 优先使用文本块** — 多行字符串、JSON、SQL 使用 `"""` 文本块，所见即所得
7. **Java 17+ 简单不可变数据载体优先用 record** — 优先级高于 Lombok，不适合时再用 class

## 工作方式

1. 确认项目 Java 版本（`pom.xml` / `build.gradle`），跟随附近 2-3 个类的本地风格
2. 名字清晰、方法简短、职责单一；不做无必要的框架改造或风格清洗
3. Java 17+ 简单不可变数据载体优先用 record；不适合 record 时再用普通 class 或 Lombok
4. Controller 保持薄，业务逻辑放到 Service 等业务层
5. 行为变更时同步补测试或更新测试
6. 编辑完成后清理未使用的 import

## 常见违规点

- 新增类 / public 方法缺少注释
- Java 17+ 简单数据载体仍用 Lombok class 堆 getter / setter
- 使用字段注入 `@Autowired`
- 生产代码出现空 `catch` 或 `printStackTrace()`
- SQL 通过字符串拼接构造
- 新增业务表缺少审计字段或字段未声明 `NOT NULL`
- 业务查询遗漏 `is_deleted = 0`
- 外部输入未校验就直接使用
- JPA Entity 使用 `@Data` 或未自定义 `equals`/`hashCode`
- N+1 查询：`FetchType.EAGER` 或循环触发懒加载
- `@Transactional` 加在 `private` 方法或 Controller 层
- 读操作未标记 `@Transactional(readOnly = true)`
- 配置值硬编码或 `@Value` 散落各处
- `Optional` 用作字段或方法参数
- 简单遍历滥用 `Stream`

## 参考文件

深入某一领域时优先查阅对应文档：

- `./references/core-rules.md`：核心规则详细说明与代码示例
- `./references/naming-conventions.md`：命名规范
- `./references/coding-standards.md`：格式、注释、Lombok、结构细节
- `./references/exception-logging.md`：异常与日志
- `./references/security.md`：参数校验与安全编码
- `./references/testing.md`：Java 测试规范
- `./references/database.md`：SQL 与数据库规范
- `./references/concurrency.md`：并发与多线程注意事项
- `./references/design.md`：分层、设计与模式示例

## 输出要求

安静应用规范，不输出多余套话。生成代码时把注释直接写进代码，仅说明真正影响本次修改的规则。
