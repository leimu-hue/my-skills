# 编码规范

## 与主规范的关系

本文补充代码格式、方法设计、注释和常用 API 细节。若本文与 `SKILL.md` 冲突，以 `SKILL.md` 为准：先确认 Java 版本；Java 17+ 简单不可变数据载体优先使用 `record`，不适合 `record` 时再按项目约定使用普通 class 或 Lombok。

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
private static final String ERROR_USER_NOT_FOUND = "USER_NOT_FOUND";
```

## 类与封装

- 成员变量默认 `private`
- Spring 依赖默认 `private final` + 构造器注入
- 对外暴露的可变集合要谨慎，必要时返回不可变视图或副本
- 优先组合而不是继承；只有存在稳定的 `is-a` 关系和可复用模板流程时再使用继承
- `protected` 只在明确面向继承扩展时使用

## 方法设计

- 方法保持单一职责；过长、嵌套深、需要多段注释解释时应拆分
- 参数过多时使用参数对象；Java 17+ 简单不可变参数对象优先 `record`，Java 8/11 项目保持普通 class 或本地 Lombok 风格
- 方法开始处完成参数校验，使用守卫式写法降低嵌套
- 返回值语义要稳定：不存在是返回 `Optional`、`null` 还是抛异常，应跟随项目约定
- 三元表达式只用于简单赋值；复杂分支使用 `if` 或策略拆分
- `switch` 必须覆盖未知分支；枚举 `switch` 也要考虑未来新增枚举值

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

- 新增类必须有类注释，说明职责、适用场景、边界或主要用途
- 新增 public/protected 方法、业务方法、接口方法、复杂私有方法必须有方法注释，说明用途、关键参数、返回值、约束、异常或副作用
- 注释解释业务意图和约束，不复述代码
- 不要求机械添加 `@author`、`@version`、`@since`，除非项目已有要求
- 复杂算法、兼容逻辑、非显然业务规则应补短注释

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

- 集合判空跟随项目工具风格，如 `CollectionUtils.isEmpty(list)` 或 `list == null || list.isEmpty()`
- 已知大容量集合可指定初始容量；普通小集合不必机械指定
- 简单转换、过滤、聚合可用 Stream；复杂流程或需要调试的逻辑可用普通循环
- 返回空集合优先用 `Collections.emptyList()`、`List.of()` 等不可变空集合
- 对外返回集合时考虑是否需要不可变，避免调用方误改内部状态
- 简单遍历不要用 Stream，for-each 更直接且性能更好

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

- `Optional` 仅用于方法返回值，不用于字段、方法参数或集合元素
- 不要用 `isPresent()` + `get()`，使用函数式 API
- 不要用 `Optional` 代替 null 检查做流程控制

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

- 优先守卫式返回，减少多层 `if/else`
- 循环必须有清晰退出条件；重试循环必须限制次数
- 不使用空 `catch`，不吞异常
- `while (true)` 只在退出条件非常明确时使用，并加必要注释

## 检查清单

### 格式

- [ ] 缩进、换行、空行符合项目 formatter
- [ ] 没有无关格式清洗
- [ ] import 没有无用项

### 设计

- [ ] 方法职责单一，参数数量可控
- [ ] 参数校验在边界处完成
- [ ] 组合优先于继承
- [ ] 常量、枚举替代了有业务含义的魔法值

### 注释

- [ ] 新增类有职责说明
- [ ] 新增 public/protected 方法、业务方法、接口方法、复杂私有方法有用途、参数、返回值、异常或副作用说明
- [ ] 注释解释意图，不复述代码

### Record / Lombok

- [ ] 已确认 Java 版本；Java 17+ 简单不可变数据载体优先使用 `record`
- [ ] 不适合 `record` 的场景才使用 Lombok class
- [ ] Spring Bean 使用构造器注入
- [ ] `@Builder` 未用于需要强制校验必填字段的关键业务对象

### 集合、Stream 与 Optional

- [ ] 集合判空完整且风格一致
- [ ] 对外集合没有泄露可变内部状态
- [ ] 简单遍历未滥用 Stream
- [ ] `Optional` 仅用于返回值，未用于字段或参数
- [ ] 使用 `java.time`，时间逻辑有明确时区或 `Clock`
