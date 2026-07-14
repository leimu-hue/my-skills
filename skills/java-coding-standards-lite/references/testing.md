# 单元测试规范

## 基本原则

- 测试应证明行为，不锁死无关实现细节
- 新增或修改业务逻辑时，至少覆盖成功路径、参数错误、关键边界、异常分支
- 单元测试默认快速、隔离、可重复；集成测试只在需要验证组件协作时使用
- 先跟随项目已有测试框架、命名、断言风格；不要为单个测试引入新工具链
- 覆盖率是质量信号，不是唯一目标；硬性阈值以项目 CI 配置为准

## 测试类型

| 类型 | 目标 | 常用工具 | 使用边界 |
| --- | --- | --- | --- |
| 单元测试 | 验证单个类或方法行为 | JUnit 5、Mockito、AssertJ | 不启动 Spring 或只使用极轻量扩展 |
| 切片测试 | 验证 Web、Repository 等局部框架集成 | `@WebMvcTest`、`@DataJpaTest` | 比 `@SpringBootTest` 更优先 |
| 集成测试 | 验证多个组件、数据库、消息、外部适配协作 | `@SpringBootTest`、Testcontainers、MockMvc | 成本高，只测关键流程 |
| 端到端测试 | 验证真实用户流程 | API/UI 测试工具 | 数量少，覆盖主链路 |

## 测试结构

- 测试类命名：被测类 + `Test`，如 `UserServiceTest`
- 测试方法命名：表达场景和结果，如 `createUser_invalidEmail_throwsValidationException`
- 可使用 `@DisplayName` 补充中文业务描述
- 推荐 Given / When / Then 分段
- 每个测试只验证一个明确行为，避免一个测试塞多个无关场景

```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @Test
    @DisplayName("创建用户 - 邮箱为空时抛出校验异常")
    void createUser_blankEmail_throwsValidationException() {
        // record 不可变，通过构造器传入非法值
        UserCreateRequest request = new UserCreateRequest("alice", "", null);

        assertThatThrownBy(() -> userService.createUser(request))
            .isInstanceOf(ValidationException.class);

        verifyNoInteractions(userRepository);
    }
}
```

## 测试数据

- 简单对象可在测试内直接构造，保持一眼可读
- 多处复用或字段较多时使用 Test Data Factory / Builder
- Factory 默认生成合法对象，单个测试只改和场景相关的字段
- 不要把测试数据藏得过深，导致断言看不出业务含义

```java
// record 通过构造器创建；工厂方法返回新实例
UserCreateRequest request = TestDataFactory.userCreateRequest("alice", "alice@example.com");
```

## Mock 规则

- Mock 外部依赖：Repository、Client、消息、邮件、支付、文件系统、时间服务
- 不 Mock 被测对象自身；优先通过构造器注入依赖
- 不为纯值对象、简单 DTO、无副作用工具类制造 Mock
- 验证关键交互，不验证所有内部调用；过度 `verify` 会让重构困难
- 使用 `any()` 时确认不会掩盖关键参数；关键参数用 `eq()`、`argThat()` 或捕获器验证
- 默认不用 `verifyNoMoreInteractions()`，除非“不能有额外交互”本身就是业务规则

```java
verify(emailClient).sendWelcomeEmail(argThat(email ->
    email.getRecipient().equals("alice@example.com")
));
```

## 断言

- 优先断言外部可观察结果：返回值、状态变化、异常、持久化结果、对外调用
- 异常测试同时关注异常类型和关键消息/错误码
- 集合断言关注数量、顺序、关键字段；不要只断言非空
- AssertJ 可读性更好时优先使用项目既有 AssertJ 风格

```java
assertThat(result)
    .extracting(User::getUserName, User::getEmail)
    .containsExactly("alice", "alice@example.com");
```

## Spring 测试选择

- Controller 只验证路由、参数绑定、状态码、响应体时，用 `@WebMvcTest`
- Repository 只验证 JPA/MyBatis 映射和 SQL 时，用 `@DataJpaTest` 或项目已有数据库测试方案
- 需要完整 Bean、事务、配置、过滤器链时，再用 `@SpringBootTest`
- 数据库集成优先使用测试库、Testcontainers 或事务回滚，不污染本地/共享环境
- 避免 `@TestMethodOrder` 让测试依赖执行顺序；确需顺序时说明原因

```java
@WebMvcTest(UserController.class)
class UserControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;
}
```

## 数据清理与稳定性

- 每个测试独立准备数据，独立清理数据
- 集成测试可用事务回滚、`@Sql`、专用 schema、容器重建等方式隔离
- 测试不依赖当前时间、随机数、线程调度、外部网络；必要时注入 Clock、Random、Client
- 不使用 `Thread.sleep()` 等待异步结果；使用条件等待或可控执行器
- 性能测试与普通单元测试分离，避免让默认测试套件变慢或不稳定

## 覆盖范围

重点覆盖：

- 正常成功路径
- null、空字符串、空集合、非法枚举、越界数值
- 权限不足、资源不存在、重复提交、余额不足等业务失败
- 外部依赖失败、超时、返回异常数据
- 金额、时间、分页、排序、状态流转等边界

覆盖率建议：

- 新增核心业务逻辑应有直接测试
- 复杂分支优先补分支测试
- 仅 getter/setter、简单配置、框架样板不强求机械覆盖
- 项目有 JaCoCo 阈值时，以 CI 阈值为准
