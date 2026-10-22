# Java / Spring 测试参考

目录
- [依赖与工具链](#依赖与工具链)
- [单元测试：@Nested 按方法分组](#单元测试nested-按方法分组)
- [断言与异常](#断言与异常)
- [Mock 边界](#mock-边界)
- [切片测试](#切片测试)
- [集成测试](#集成测试)
- [运行命令](#运行命令)
- [红测排查表](#红测排查表)

## 依赖与工具链

先读 `pom.xml` / `build.gradle`，已有的就用。缺失时才建议补（版本跟随 Spring Boot BOM，不要手写版本号）：

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-test</artifactId>
  <scope>test</scope>
</dependency>
<dependency>
  <groupId>org.testcontainers</groupId>
  <artifactId>mysql</artifactId>
  <scope>test</scope>
</dependency>
<dependency>
  <groupId>org.awaitility</groupId>
  <artifactId>awaitility</artifactId>
  <scope>test</scope>
</dependency>
```

`spring-boot-starter-test` 已含 JUnit 5、Mockito、AssertJ、MockMvc、JSONassert。不要额外引入 JUnit 4、PowerMock、Hamcrest。

Surefire 跑 `*Test`，Failsafe 跑 `*IT`；没有 Failsafe 时集成测试命名为 `*IT` 并单独配置，否则 `mvn test` 会变慢且需要 Docker。

## 单元测试：@Nested 按方法分组

一个生产类一个测试类，`@Nested` 一个生产方法一个组。组名用方法名，`@DisplayName` 写业务语义（可选中文），这样测试报告一栏就是一个方法。

```java
@ExtendWith(MockitoExtension.class)
class OrderCreateServiceTest {

    @Mock private OrderRepository orderRepository;
    @Mock private StockClient stockClient;
    @Mock private Clock clock;
    @InjectMocks private OrderCreateService service;

    private static final Instant NOW = Instant.parse("2025-01-01T00:00:00Z");

    @Nested
    @DisplayName("createOrder 创建订单")
    class CreateOrder {

        private OrderCreateCommand validCommand() {
            return new OrderCreateCommand("user-1", "sku-1", 2);
        }

        @Test
        void createOrder_validCommand_returnsOrderWithPendingStatus() {
            when(stockClient.reserve("sku-1", 2)).thenReturn(StockReservation.ok());
            when(clock.instant()).thenReturn(NOW);

            Order order = service.createOrder(validCommand());

            assertThat(order.getStatus()).isEqualTo(OrderStatus.PENDING_PAYMENT);
            assertThat(order.getCreatedAt()).isEqualTo(NOW);
            assertThat(order.getQuantity()).isEqualTo(2);
        }

        @Test
        void createOrder_insufficientStock_throwsBusinessException() {
            when(stockClient.reserve("sku-1", 2)).thenReturn(StockReservation.rejected());

            assertThatThrownBy(() -> service.createOrder(validCommand()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCodes.STOCK_INSUFFICIENT);

            verify(orderRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("cancelOrder 取消订单")
    class CancelOrder { /* 同一套结构，独立构造数据 */ }
}
```

要点：
- 组内构造数据的 helper 写在组内（`validCommand()`），组之间不共享可变对象；不可变的 record / DTO 可以提到类级常量
- 测试方法名 `方法名_场景_期望`；项目已有风格就跟随
- `@MockitoSettings(strictness = Strictness.LENIENT)` 不是解决 stub 多余的方案，多余的 stub 说明测试多余，删掉它

### 参数化测试
同一逻辑多组输入，用 `@ParameterizedTest`，别复制 5 个方法：

```java
@ParameterizedTest(name = "quantity={0} -> {1}")
@CsvSource({"1, ok", "99, ok", "0, INVALID_QUANTITY", "-1, INVALID_QUANTITY"})
void createOrder_quantityBoundary(int quantity, String expected) { /* ... */ }
```

## 断言与异常

AssertJ 优先（项目里已有 hamcrest / junit assertions 就别混着用）。

```java
// 集合：断言内容与顺序，不是「非空」
assertThat(orders)
    .extracting(Order::getId, Order::getStatus)
    .containsExactly(tuple("o-1", PAID), tuple("o-2", PENDING_PAYMENT));

// 异常：类型 + 错误码，必要时断言消息
assertThatThrownBy(() -> service.getUserById(-1L))
    .isInstanceOf(ValidationException.class)
    .hasMessageContaining(ErrorCodes.USER_ID_INVALID);

// 无异常且需要拿返回值
assertThatCode(() -> service.cancel("o-1")).doesNotThrowAnyException();
```

不要断言 `toString()`、日志内容、私有字段反射值、HashMap 迭代顺序、`LocalDateTime.now()` 附近的精确等于。

## Mock 边界

Mock：Repository、RPC/HTTP client、MQ 生产者、邮件/短信、支付、文件系统、`Clock`、`Random`、缓存客户端。

不 mock：被测类自身、record/DTO、纯函数工具类、`List`/`Optional` 这类值对象。需要替身就手写一个假实现（fake），比 mock 更可读。

```java
// 关键参数精确断言，不要 any()
verify(stockClient).reserve(eq("sku-1"), eq(2));
verify(orderRepository).save(argThat(o -> o.getStatus() == PENDING_PAYMENT));
```

`@InjectMocks` 用构造器注入的类最稳；有多个同类型依赖时改用 `@SpringBootTest` 之外的显式构造：

```java
@BeforeEach
void setUp() {
    service = new OrderCreateService(orderRepository, stockClient, clock);
}
```

## 切片测试

只在需要验证「框架接线」时才用；纯逻辑用单元测试。

| 场景 | 注解 | 说明 |
|---|---|---|
| Controller 路由、参数绑定、校验、状态码、响应体 | `@WebMvcTest(OrderCreateController.class)` + `MockMvc` | 不启 Service/Repository，Service 用 `@MockBean`（Boot 3.4+ 用 `@MockitoBean`） |
| JPA 映射、查询派生方法 | `@DataJpaTest` | 默认回滚；需要真实方言时用 Testcontainers + `@AutoConfigureTestDatabase(replace = NONE)` |
| MyBatis / SQL 正确性 | `@MybatisTest`（mybatis-spring-boot-starter-test） | 同上，勿用 H2 验 MySQL 方言特性 |
| JSON 序列化契约 | `@JsonTest` | 字段名、日期格式、null 策略 |

```java
@WebMvcTest(OrderCreateController.class)
class OrderCreateControllerTest {

    @Autowired private MockMvc mockMvc;
    @MockitoBean private OrderCreateService service;   // Boot <3.4 用 @MockBean

    @Test
    void createOrder_invalidBody_returns400WithFieldError() throws Exception {
        mockMvc.perform(post("/orders").contentType(APPLICATION_JSON)
                .content("""{"userId":"","skuId":"sku-1","quantity":0}"""))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[?(@.field=='quantity')]").exists());
    }
}
```

切片测试断言的是契约（状态码、字段名、错误结构），不是业务分支——业务分支在 Service 单元测试里测。

## 集成测试

真实 Spring 上下文 + 真实数据库。单一 `@SpringBootTest` 基类复用容器，避免每个类起一个数据库。

```java
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@ActiveProfiles("it")
class OrderCreateFlowIT {

    @Container
    @ServiceConnection
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4");

    @Autowired private MockMvc mockMvc;
    @Autowired private OrderRepository orderRepository;
    @Autowired private PaymentClient paymentClient;

    @BeforeEach
    void clean() { orderRepository.deleteAll(); }

    @Test
    void createOrder_thenPay_updatesStatusAndPersistsPayment() throws Exception {
        // 1. 建单（真实 HTTP -> Service -> DB）
        String orderId = mockMvc.perform(post("/orders").contentType(APPLICATION_JSON)
                .content("""{"userId":"u-1","skuId":"sku-1","quantity":1}"""))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString()
            .transform(body -> JsonPath.read(body, "$.id"));

        // 2. 支付回调（外部系统用 stub 挡掉）
        mockMvc.perform(post("/payments/callback").contentType(APPLICATION_JSON)
                .content("""{"orderId":"%s","result":"SUCCESS"}""".formatted(orderId)))
            .andExpect(status().isOk());

        // 3. 断言跨功能的最终状态，而不是中间调用
        assertThat(orderRepository.findById(orderId))
            .get()
            .extracting(Order::getStatus)
            .isEqualTo(OrderStatus.PAID);
    }
}
```

要点：
- `@ServiceConnection`（Boot 3.1+）自动注入连接信息，不要再手写 `@DynamicPropertySource`
- 容器用 `static`，一个测试类一个容器；容器贵，别让它每方法重启
- 外部支付/短信/物流用 WireMock / MockServer 挡掉，不要真连
- 断言**最终状态**（DB 里是什么、下游收到什么），不要断言中间 Service 调用了几次
- 隔离用「每测试自建自清」或 `@Transactional` 回滚（注意：跨线程、MQ 消费、HTTP 真实调用下回滚失效，此时必须显式清理）

## 运行命令

```bash
mvn test                              # 单元 + 切片
mvn -Dtest=OrderCreateServiceTest test             # 单类
mvn -Dtest='OrderCreateServiceTest$CreateOrder' test   # 单个 @Nested 组
mvn -Dtest='OrderCreateServiceTest#createOrder_insufficientStock_throwsBusinessException' test
mvn verify                            # 含 Failsafe 的集成测试（*IT）
./gradlew test --tests '*CreateOrder*'
./gradlew integrationTest
```

先跑窄范围（单个嵌套组）再跑全量，可以减少一次失败的搜索成本。

## 红测排查表

| 现象 | 常见原因 | 处理 |
|---|---|---|
| `UnnecessaryStubbingException` | stub 了没走的路径 | 删掉多余 stub，或说明为什么不 strict |
| `NullPointerException` 在被测方法内 | `@Mock` 未注入该字段 / 构造器少传 | 检查 `@InjectMocks` 或改显式构造 |
| 只有全量跑才红 | 共享静态状态 / 数据库残留 / 顺序依赖 | 独立数据 + 清理，禁用 `@TestMethodOrder` |
| 偶发失败 | `Thread.sleep`、真实时钟、并发 | 注入 `Clock`，用 Awaitility 条件等待 |
| `@SpringBootTest` 起不来 | 缺 profile / 缺容器 / 配置引用了外部服务 | 用 `@ActiveProfiles("it")` + stub 外部依赖 |
| 重构后一片红 | 断言了内部实现或过度 `verify` | 改断言外部可观察结果 |
| 本地绿 CI 红 | H2 与真实库差异、时区、字符集 | 换 Testcontainers，固定 `TimeZone` 与 `Locale` |
