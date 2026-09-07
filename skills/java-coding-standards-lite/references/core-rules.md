# 核心规则

## 1. 优先使用守卫式写法

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

`return`、`continue`、`throw` 能降低嵌套就用。边界校验默认抛异常；批处理、查询兜底等场景用 `return` / `continue` 跳过，记必要上下文。

## 2. 跟随项目既有工具风格

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

## 3. 空值处理以可读性为先

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

## 4. 优先使用 import，避免全路径类名

- 用 import 短类名，不用全路径
- 同名类冲突时才用全路径，必须注释说明原因

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

## 5. Java 17+ 优先使用 switch 表达式

- Java 17+ 项目中，新增或修改的 `switch` 逻辑优先使用 **switch 表达式**（箭头语法 `->`）
- switch 表达式无穿透风险，强制要求穷举所有分支（或显式 `default`），代码更安全
- 模式匹配（`case Type t`）在 Java 21 才正式稳定；Java 17 项目中谨慎使用，以项目实际版本为准
- `case null` 为 Java 21 特性，Java 17 项目不支持
- 不要把已有稳定运行的传统 `switch` 全量改写，只在新增、修改或重构时切换

```java
// ✅ Switch 表达式：无穿透风险，强制返回值（Java 14+ 稳定，Java 17+ 推荐）
String description = switch (status) {
    case PENDING   -> "等待支付";
    case PAID      -> "准备发货";
    case SHIPPED   -> "运输中";
    case DELIVERED -> "已完成";
    case CANCELLED -> "已取消";
};

// ✅ default 分支处理未知枚举值（Java 17+ switch 表达式）
String fallback = switch (unknownStatus) {
    case PENDING   -> "等待支付";
    case PAID      -> "准备发货";
    default        -> "未知状态";
};

// ❌ 传统 switch：容易漏掉 break，冗长且易错
String description = "";
switch (status) {
    case PENDING:
        description = "等待支付";
        break;
    case PAID:
        description = "准备发货";
        break;
    default:
        description = "未知状态";
}
```

> **注意**：模式匹配（`case Integer i`）在 Java 21 才正式稳定。Java 17 项目中仅对枚举和已知类型使用 switch 表达式；跨类型模式匹配以项目实际版本为准。

## 6. Java 17+ 优先使用文本块

- 多行字符串、JSON、SQL、XML 等内嵌结构化文本，优先使用文本块 `"""` 而不是 `+` 拼接
- 文本块所见即所得，避免了转义符和换行符的混乱拼接
- Java 15+ 稳定，Java 17+ 项目默认适用
- 单行字符串仍用普通字符串，不要强行使用文本块
- 需要变量插值时结合 `formatted()` 或 `String.format()` 使用

```java
// ✅ 文本块：所见即所得，清晰易维护
String json = """
    {
      "name": "Alice",
      "age": 20
    }
    """;

// ✅ 结合 formatted() 插值
String json = """
    {
      "name": "%s",
      "age": %d
    }
    """.formatted(name, age);

// ✅ MyBatis 注解 SQL 同样适用
@Select("""
    SELECT id, user_name, email
    FROM t_user
    WHERE status = 'ACTIVE'
      AND is_deleted = 0
    """)
List<User> findActiveUsers();

// ❌ 拼接多行字符串：难读、难维护、易出错
String json = "{\n" +
              "  \"name\": \"Alice\",\n" +
              "  \"age\": 20\n" +
              "}";
```

## 7. Java 17+ 简单不可变数据载体优先使用 record

- Java 17+ 项目中，简单不可变 DTO / VO / Command / Response 优先使用 `record`，优先级高于 Lombok `@Data`、`@Getter`、`@Setter`、`@Value`
- 不要使用 `record`：JPA / MyBatis Plus 实体、需要继承父类、需要可变状态、框架不支持的旧项目
- record 必须放在独立 `.java` 文件中，归属 dto / domain / vo 等对应包。禁止作为内部类塞进 Service 或 Controller
- record 字段天然 `private final`，不要再加 Lombok 注解
- 访问器名称是组件名（`request.userName()`），不是 `getUserName()`
- record 自动生成 `equals`/`hashCode`/`toString`，避免存放敏感明文字段
- 需要字段校验时使用 compact constructor，不在构造器里访问数据库或远程服务
- 序列化支持需确认框架版本：Spring Boot 3.x、Jackson 2.14+、MyBatis 3.5.10+ 或 MyBatis-Plus 3.5.3+

```java
// ✅ record：简洁、不可变、语义清晰
public record UserCreateRequest(
    @NotBlank(message = "用户名不能为空")
    @Size(min = 3, max = 50)
    String userName,

    @NotBlank(message = "邮箱不能为空")
    @Email
    String email
) {
}

// ✅ compact constructor 做轻量校验
public record AmountRange(BigDecimal minAmount, BigDecimal maxAmount) {
    public AmountRange {
        if (minAmount == null || maxAmount == null) {
            throw new IllegalArgumentException("金额区间不能为空");
        }
        if (minAmount.compareTo(maxAmount) > 0) {
            throw new IllegalArgumentException("最小金额不能大于最大金额");
        }
    }
}

## 8. 不要写没被要求的抽象

- 一个实现的接口、一个产品的工厂、一个永不改变的配置值 → 不要建
- 用接口做扩展点的前提是：当前已有或确定会有多个实现
- 抽象是为了解耦真实的变化点，不是为了"以后可能需要"

```java
// ❌ 只有一个实现的接口 — 纯粹增加间接层
public interface UserValidator {
    void validate(User user);
}
@Service
public class UserValidatorImpl implements UserValidator { ... }

// ✅ 直接用 Service 方法，需要多实现时再抽接口
@Service
public class UserService {
    public void validate(User user) { ... }
}
```

## 9. 删除优于新增，最短可行 diff 赢

- 先看能不能删掉冗余代码，再考虑加新代码
- 项目已有工具方法/常量/模式能覆盖需求 → 复用，不重写
- 标准库或已装依赖能一行解决 → 不写工具类
- 最懒的可行方案就是对的方案

```java
// ❌ 手写日期格式化工具类
public class DateUtil {
    public static String format(LocalDate date) {
        return date.getYear() + "-" + String.format("%02d", date.getMonthValue()) + ...
    }
}

// ✅ 标准库一行搞定
String formatted = date.toString(); // ISO-8601
String formatted = DateTimeFormatter.ofPattern("yyyy-MM-dd").format(date);
```

## 10. Bug 修复 = 根因，不是症状

- 修复前先 grep 所有调用方，在共享函数里修一次
- 不要只修 ticket 描述的那条路径，留着的兄弟调用方会继续坏

```java
// ❌ 只在报错的调用方加空值检查
public void createOrder(Long userId) {
    if (userId == null) { throw ...; } // 只在这里加了
    orderService.create(userId);
}
// 但 updateOrder、cancelOrder 里 userId 同样可能为 null

// ✅ 在共享函数入口加一次守卫
public void create(Long userId) {
    if (userId == null || userId <= 0) {
        throw new IllegalArgumentException("userId must be positive");
    }
    // ...
}
```
