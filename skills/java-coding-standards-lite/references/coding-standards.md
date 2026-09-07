# 编码规范

## 与主规范的关系

本文补充代码格式、方法设计、注释和常用 API 细节。与 `SKILL.md` 冲突时，以 `SKILL.md` 为准。

## 代码格式

- 缩进使用 4 个空格，不使用 Tab
- 单行尽量不超过 120 字符；超过时按参数、链式调用、逻辑条件自然换行
- 类成员之间、方法之间、方法内不同逻辑块之间用空行分隔
- import 顺序和格式优先交给项目 formatter / IDE / Checkstyle
- 不做无意义格式清洗；只格式化本次修改相关代码

```java
List<User> users = userList.stream()
    .filter(user -> user.getAge() >= 18)
    .sorted(Comparator.comparing(User::getUserName))
    .toList();
```

## 常量与魔法值

- 常量使用 `UPPER_SNAKE_CASE`
- 重复出现、业务含义明确、影响规则判断的字面量应提取为常量
- 一次性局部值、测试样例值、明显自解释的小数字不必机械提取
- 状态、类型、错误码优先使用枚举或稳定常量，不散落裸数字/裸字符串

```java
private static final int MAX_RETRY_COUNT = 3;
private static final String USER_NOT_FOUND = "USER_NOT_FOUND";
```

## 类与封装

- 成员变量默认 `private`
- Spring 依赖默认 `private final` + 构造器注入
- 对外暴露的可变集合要谨慎，必要时返回不可变视图或副本
- 优先组合而不是继承；只有存在稳定的 `is-a` 关系和可复用模板流程时再使用继承
- `protected` 只在明确面向继承扩展时使用
- record / DTO / VO / Command / Response 必须放在独立 `.java` 文件中，归属 dto / domain / vo 等对应包。禁止作为内部类塞进 Service 或 Controller。仅当类型与外部类有强耦合的实现细节（如 Builder 内部状态）时才允许 private static inner class

## 方法设计

- 单一职责；过长、嵌套深、需要多段注释时拆分
- 参数过多用参数对象；Java 17+ 优先 `record`
- 方法开头用守卫式写法校验参数
- 返回值语义跟项目约定走（`Optional` / `null` / 抛异常）
- 三元表达式只用于简单赋值；复杂分支用 `if` 或策略拆分
- `switch` 覆盖未知分支；枚举 `switch` 考虑未来新增值

```java
public User updateUser(Long id, UserUpdateRequest request) {
    if (id == null || id <= 0) {
        throw new IllegalArgumentException("用户ID必须大于0");
    }
    if (request == null) {
        throw new IllegalArgumentException("更新请求不能为空");
    }

    User user = loadUser(id);
    applyUpdate(user, request);
    return userRepository.save(user);
}
```

## 注释规范

- 新增类加类注释：职责、适用场景、边界
- public/protected 方法、业务方法、接口方法、复杂私有方法加方法注释：用途、参数、返回值、异常
- 注释说业务意图和约束，不复述代码
- 不机械加 `@author`、`@version`、`@since`，除非项目要求
- 复杂算法、兼容逻辑、非显然业务规则补短注释

```java
/**
 * 用户注册服务。
 *
 * 负责注册参数校验、用户落库以及注册后的通知动作。
 */
@Service
public class UserRegisterService {

    /**
     * 创建新用户并返回持久化结果。
     *
     * @param request 用户创建请求，不能为空
     * @return 已保存的用户对象
     * @throws ValidationException 当用户名或邮箱不合法时抛出
     */
    public User createUser(UserCreateRequest request) {
        // ...
    }
}
```

## Record 与 Lombok

- 先确认项目 Java 版本；Java 17+ 简单不可变 DTO / VO / Command / Response 优先使用 `record`
- record 必须放在独立 `.java` 文件中，归属 dto / domain / vo 等对应包，不作为 Service 或 Controller 的内部类
- `record` 不要叠加 `@Data`、`@Getter`、`@Setter`
- JPA Entity、需要 setter/无参构造、ORM 代理、复杂 Builder 的类型使用 class
- 不适合 `record` 且项目已使用 Lombok 时，再用 `@Getter`、`@Setter`、`@Builder`、`@RequiredArgsConstructor` 减少样板
- Spring Bean 使用 `@RequiredArgsConstructor`，日志使用 `@Slf4j`
- `@Builder` 无法强制校验必填字段，关键业务对象建议手写 Builder 或构造函数，或在 `build()` 中补充校验

```java
/**
 * 用户创建请求。
 */
public record UserCreateRequest(String userName, String email) {
}
```

## 日期和时间

- 默认使用 `java.time`，避免新增 `Date` / `Calendar`
- 跨系统、持久化、消息传递优先使用 `Instant` 或明确时区的时间
- 展示层再转换为用户时区和格式
- 测试中不要直接依赖 `now()`，可注入 `Clock`

```java
Instant now = clock.instant();
ZonedDateTime beijingTime = now.atZone(ZoneId.of("Asia/Shanghai"));
```

## 集合与 Stream

- 判空跟项目工具风格走（`CollectionUtils.isEmpty` 或 `list == null || list.isEmpty()`）
- 已知大容量集合指定初始容量；小集合不必
- 简单转换、过滤、聚合用 Stream；复杂流程用普通循环
- 返回空集合用 `Collections.emptyList()`、`List.of()` 等不可变空集合
- 对外返回集合考虑不可变，避免调用方误改内部状态
- 简单遍历用 for-each，不用 Stream

```java
// ✅ 简单遍历用 for-each
for (var item : items) {
    process(item);
}

// ❌ 简单遍历用 Stream：多余开销且可读性差
items.stream().forEach(item -> process(item));

// ❌ 过长的 Stream 链难以调试，拆分为有意义的步骤
var filtered = list.stream().filter(...).toList();
var result = filtered.stream().map(...).collect(...);
```

## Optional

- `Optional` 只用于返回值，不用作字段、参数或集合元素
- 用函数式 API（`map` / `orElse` / `orElseThrow`），不用 `isPresent()` + `get()`
- 不用 `Optional` 代替 null 检查做流程控制

```java
// ✅ Optional 仅用于返回值
public Optional<User> findUser(Long id) { ... }

// ✅ 使用函数式 API
return findUser(id)
    .map(User::getUserName)
    .orElse("unknown");

// ❌ 用作字段或参数（序列化问题，增加调用复杂度）
public void process(Optional<String> name) { ... }
private Optional<String> email; // 不推荐

// ❌ 用了 Optional 还用 isPresent() + get()
Optional<User> userOpt = findUser(id);
if (userOpt.isPresent()) {
    return userOpt.get().getUserName();
}
return "unknown";
```

## 控制语句

- 守卫式返回，减少多层 `if/else`
- 循环有清晰退出条件；重试循环限制次数
- 不空 `catch`，不吞异常
- `while (true)` 退出条件必须明确，加必要注释
