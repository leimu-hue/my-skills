---
name: java-coding-standards-lite
description: Use when creating, modifying, or reviewing Java/Spring code, tests, DTOs, controllers, services, repositories, exception handling, validation, MyBatis XML, SQL, or DDL in Java projects.
license: MIT
---

# Java 编码规范（轻量版）

这是一份面向企业 Java 项目的轻量规范，适合在日常生成代码、补丁修复、功能迭代时直接套用。目标不是追求教条，而是在不打乱现有项目风格的前提下，尽量产出稳定、清晰、好维护的代码。

## 适用场景

处理以下内容时默认应用本规范：

- Java 类、接口、枚举、record
- Spring Controller、Service、Repository、Configuration
- DTO、请求对象、响应对象、校验逻辑
- 异常处理、日志输出、防御式编程
- Java 中内嵌 SQL、注解 SQL、MyBatis XML SQL、SQL builder、DDL
- 单元测试、集成测试、测试辅助代码

## 核心规则

### 1. 优先使用守卫式写法

尽早拒绝非法输入，让正常流程保持平直，避免层层嵌套。

```java
public void process(User user) {
    if (user == null) {
        throw new IllegalArgumentException("user must not be null");
    }
    if (StringUtils.isBlank(user.getName())) {
        throw new IllegalArgumentException("user name must not be blank");
    }

    executeLogic(user);
}
```

如果 `return`、`continue`、`throw` 能明显降低嵌套层级，就优先这样写。命令型业务和边界校验默认抛出明确异常；批处理、查询兜底、可跳过单条数据等场景才使用 `return` / `continue` 静默跳过，并记录必要上下文。

### 2. 跟随项目既有工具风格

- 项目已经使用 Apache Commons 或 Spring 工具类时，字符串处理优先使用 `StringUtils`
- 集合、Map 判空优先沿用项目里已有的 `CollectionUtils`、`MapUtils` 或 JDK 风格
- 不要为了一个小判断额外引入新的工具依赖
- 同一个文件内保持一致，不要混用多种风格

```java
if (StringUtils.isBlank(request.getUserName())) {
    throw new ValidationException("userName", "用户名不能为空");
}

if (CollectionUtils.isEmpty(users)) {
    return Collections.emptyList();
}
```

### 3. 空值处理以可读性为先

- `obj == null` / `obj != null` 与 `Objects.isNull` / `Objects.nonNull` 都可以，优先贴近本地代码风格
- 集合与 Map 优先走单一路径做空值与空集合判断，不要重复分叉
- 外部输入、第三方返回值、反序列化对象，在解引用前先校验

```java
if (request == null) {
    throw new IllegalArgumentException("request must not be null");
}

if (id <= 0) {
    throw new IllegalArgumentException("id must be greater than 0");
}
```

### 4. 优先使用 import，避免全路径类名

- 优先在文件头部 `import` 后使用短类名，如 `new TypeReference<T>()`
- 禁止无理由使用全路径写法：`new com.alibaba.fastjson.TypeReference<T>()`
- 仅当同一个类中存在来自不同包的同名类、且无法通过 import 同时引入时，才允许使用全路径；此时必须在全路径处用注释标明原因

```java
// GOOD
import com.alibaba.fastjson.TypeReference;
new TypeReference<List<User>>() {};

// BAD — 无理由全路径
new com.alibaba.fastjson.TypeReference<List<User>>() {};

// ALLOWED — 同名冲突时必须注释说明
import com.fasterxml.jackson.core.type.TypeReference;
// com.alibaba.fastjson.TypeReference 与 Jackson TypeReference 同名冲突，需用全路径区分
new com.alibaba.fastjson.TypeReference<List<User>>() {};
```

## 工作方式

生成或修改 Java 代码时，按下面顺序思考：

1. 先确认项目 Java 版本：检查 `pom.xml` 的 `maven-compiler-plugin`、`release`、`sourceCompatibility`、`targetCompatibility`，或 `build.gradle` 的 `sourceCompatibility` / `targetCompatibility`
2. 先读附近 2-3 个类，跟随本地风格
3. 优先保证名字清晰、方法简短、职责单一
4. 新增类型和关键方法补齐解释业务意图的注释（详见 `./references/coding-standards.md`）
5. 先确认 Java 版本；Java 17+ 简单不可变数据载体优先用 record；不适合 record 时再用普通 class 或 Lombok 减少样板代码（详见 `./references/record.md`）
6. Controller 保持薄，业务逻辑放到 Service、Manage、Master、Helper 等业务层（详见 `./references/design.md`）
7. 没有必要时不要做大范围框架改造或风格清洗
8. 行为变更时同步补测试或更新测试（详见 `./references/testing.md`）
9. 编辑完成后检查当前文件是否存在未使用的 import，如有则清理

## 常见违规点

- `if` 嵌套过深，本可使用守卫式返回
- 新增类没有类注释
- 新增 public/protected 方法、业务方法或复杂私有方法没有方法注释
- Java 17+ 简单不可变数据载体仍用 Lombok class 堆 getter / setter
- 在 Lombok 友好的模块里手写重复 constructor / getter / setter / logger
- 使用字段注入 `@Autowired`
- 生产代码里出现空 `catch` 或 `printStackTrace()`
- SQL 通过字符串拼接构造
- 新增业务表缺少审计字段或字段未声明 `NOT NULL`
- 业务查询遗漏 `is_deleted = 0`
- 外部输入未校验就直接使用
- 同一文件里混用多套空值判断风格
- 没有项目先例却额外引入新工具库
- 无理由使用全路径类名（如 `new com.alibaba.fastjson.TypeReference()`）
- 文件中存在未使用的 import

## 参考文件

深入某一领域时优先查阅对应文档：

- `./references/naming-conventions.md`：命名规范
- `./references/record.md`：Java 17 record 使用规范
- `./references/coding-standards.md`：格式、注释、Lombok、结构细节
- `./references/exception-logging.md`：异常与日志
- `./references/security.md`：参数校验与安全编码
- `./references/testing.md`：Java 测试规范
- `./references/database.md`：SQL 与数据库规范
- `./references/concurrency.md`：并发与多线程注意事项
- `./references/design.md`：分层、设计与模式示例

## 输出要求

不要输出固定横幅或多余套话。默认安静应用这些规范，只在最终说明中提到真正影响本次修改的规则。生成新的 Java 类或方法时，把必须的注释直接写进代码；先确认 Java 版本，Java 17+ 简单不可变数据载体优先输出 `record`，不适合 `record` 时再按项目约定使用普通 class 或 Lombok。
