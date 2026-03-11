---
name: java-coding-standards-lite
description: 面向日常 Java 与 Spring 开发的实用编码规范。创建或修改 `.java` 文件、服务逻辑、控制器、仓储、DTO、异常处理、校验、测试或 SQL 相关代码时都应应用此 skill。重点关注：清晰的守卫式写法、新增类和方法必须补充注释、优先使用 Lombok 减少样板代码、安全的字符串处理、构造器注入、参数化 SQL，以及符合项目现有风格的可读性。
license: MIT
compatibility:
  - requires: "**/*.java"
---

# Java 编码规范（轻量版）

这是一份面向企业 Java 项目的轻量规范，适合在日常生成代码、补丁修复、功能迭代时直接套用。目标不是追求教条，而是在不打乱现有项目风格的前提下，尽量产出稳定、清晰、好维护的代码。

## 适用场景

处理以下内容时默认应用本规范：

- Java 类、接口、枚举、record
- Spring Controller、Service、Repository、Configuration
- DTO、请求对象、响应对象、校验逻辑
- 异常处理、日志输出、防御式编程
- Java 中内嵌 SQL、注解 SQL、XML SQL、SQL builder
- 单元测试、集成测试、测试辅助代码

## 核心规则

### 1. 优先使用守卫式写法

尽早拒绝非法输入，让正常流程保持平直，避免层层嵌套。

```java
public void process(User user) {
    if (user == null) {
        log.warn("User is null");
        return;
    }
    if (StringUtils.isBlank(user.getName())) {
        log.warn("User name is blank");
        return;
    }

    executeLogic(user);
}
```

如果 `return`、`continue`、`throw` 能明显降低嵌套层级，就优先这样写。

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

### 4. 异常处理要有明确意图

- 禁止空 `catch`
- 能精确捕获就不要只写大而全的 `Exception`
- 日志里带上业务上下文，如单号、ID、模块键、数量等
- 低层异常向上抛出时，要么保留原异常，要么转换成更贴近业务的异常

```java
try {
    processOrder(order);
} catch (BusinessException e) {
    log.warn("Business error processing order: {}", order.getId(), e);
    throw e;
} catch (Exception e) {
    log.error("System error processing order: {}", order.getId(), e);
    throw new BusinessException("SYSTEM_ERROR", "System busy, please retry", e);
}
```

### 5. 新增类和新增方法必须写注释

- 新增类必须有类注释，说明职责、适用场景、边界或主要用途
- 新增方法必须有方法注释，说明用途、关键参数、返回值、约束、异常或副作用
- 注释要解释业务意图，不要只是把类名或方法名换个说法复述一遍
- 新增可复用类、工具类、适配器、策略类时，合适的话补一个简短示例

```java
/**
 * Handles user registration requests and coordinates validation, persistence,
 * and notification steps for the account onboarding flow.
 *
 * <p>Example:
 * <pre>{@code
 * UserAccount account = userRegistrationService.register(request);
 * }</pre>
 */
@Service
public class UserRegistrationService {

    /**
     * Creates a new user account from the incoming request.
     *
     * @param request registration payload from the client
     * @return persisted user account
     * @throws ValidationException when required fields are missing or invalid
     */
    public UserAccount register(UserRegisterRequest request) {
        validateRequest(request);
        return saveUser(request);
    }
}
```

### 6. 优先使用构造器注入，并结合 Lombok 减少样板代码

构造器注入能让依赖更明确，也更利于测试；在项目已使用 Lombok 的前提下，优先用 Lombok 消除重复代码。

- Spring Bean 默认优先 `final` 字段 + `@RequiredArgsConstructor`
- DTO、VO、命令对象、返回对象等简单数据载体，优先用 `@Data`、`@Getter`、`@Setter`、`@Builder`
- 需要日志时优先用 `@Slf4j`
- 如果当前模块或包明确不使用 Lombok，就遵循本地约定，不要强推

```java
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final EmailService emailService;
}

@Data
@Builder
public class UserCreateCommand {
    private String userName;
    private String email;
}
```

### 7. 在边界处完成参数校验

控制层入参、消息体、定时任务参数、第三方响应结果，都应在进入核心业务前先校验。

```java
public void createUser(UserCreateRequest request) {
    if (request == null) {
        throw new IllegalArgumentException("request must not be null");
    }
    if (StringUtils.isBlank(request.getUserName())) {
        throw new ValidationException("userName", "用户名不能为空");
    }
    if (!InputValidator.isValidEmail(request.getEmail())) {
        throw new ValidationException("email", "邮箱格式不正确");
    }
}
```

### 8. 防止 SQL 注入

- 使用参数化 SQL、占位符、框架绑定参数
- 禁止直接拼接用户输入
- 查询语句优先写明确字段，避免 `SELECT *`

```java
@Select("SELECT id, user_name, email FROM users WHERE user_name = #{userName}")
User findByUserName(@Param("userName") String userName);

String sql = "SELECT id, user_name, email FROM users WHERE user_name = '" + userName + "'";
// Never build SQL this way.
```

### 9. 测试保持聚焦、直观、可维护

- 至少覆盖成功路径、参数校验失败、关键边界情况
- 准备数据要一眼能看懂
- 断言行为，不要过度绑定实现细节

```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @Test
    void createUser_success() {
        UserCreateRequest request = TestDataFactory.validUserCreateRequest();
        User savedUser = UserBuilder.aUser().build();
        when(userRepository.save(any())).thenReturn(savedUser);

        User result = userService.createUser(request);

        assertNotNull(result);
        verify(userRepository).save(any());
    }
}
```

## 工作方式

生成或修改 Java 代码时，按下面顺序思考：

1. 先读附近 2-3 个类，跟随本地风格
2. 优先保证名字清晰、方法简短、职责单一
3. 只要是新增类或新增方法，就补齐注释
4. 模块已使用 Lombok 时，优先减少重复构造器、getter、setter、logger 样板代码
5. Controller 保持薄，业务逻辑放到 Service、Manage、Master、Helper 等业务层
6. 没有必要时不要做大范围框架改造或风格清洗
7. 行为变更时同步补测试或更新测试

## 常见违规点

- `if` 嵌套过深，本可使用守卫式返回
- 新增类没有类注释
- 新增方法没有方法注释
- 在 Lombok 友好的模块里手写重复 constructor / getter / setter / logger
- 使用字段注入 `@Autowired`
- 生产代码里出现空 `catch` 或 `printStackTrace()`
- SQL 通过字符串拼接构造
- 外部输入未校验就直接使用
- 同一文件里混用多套空值判断风格
- 没有项目先例却额外引入新工具库

## 参考文件

需要更细规则时，继续阅读这些文档：

- `./references/naming-conventions.md`：命名规范
- `./references/coding-standards.md`：格式、注释、Lombok、结构细节
- `./references/exception-logging.md`：异常与日志
- `./references/security.md`：参数校验与安全编码
- `./references/testing.md`：Java 测试示例
- `./references/database.md`：SQL 与数据库规范
- `./references/concurrency.md`：并发与多线程注意事项
- `./references/design.md`：分层、设计与模式示例

## 输出要求

不要输出固定横幅或多余套话。默认安静应用这些规范，只在最终说明中提到真正影响本次修改的规则。生成新的 Java 类或方法时，把必须的注释直接写进代码；模块已使用 Lombok 时，优先输出基于 Lombok 的实现。
