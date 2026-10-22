---
name: unit-integration-testing
description: 提供单元测试与集成测试的组织方式、可直接复制的测试模板，以及 Java/Spring（JUnit 5、Mockito、AssertJ、@WebMvcTest、@DataJpaTest、@SpringBootTest、Testcontainers）与仓颉（Cangjie，@Test/@TestCase、cjpm test、std.unittest.mock）的测试 API 事实。在新增功能、写新方法、改 bug、重构、补测试、审查测试质量时使用，也用于用户提到单元测试、集成测试、测试覆盖、测试用例、测试类怎么放、测试写法、mock 用法时。即使用户没说"写测试"，只要改动涉及业务逻辑，也按本技能同步产出或更新测试。
---

# 单元测试与集成测试

本技能解决两类问题，别把它当通用测试教程读：

1. **事实正确性**：仓颉测试框架、Spring 测试切片的真实 API 与约束。这些是模型的常识盲区，写错直接编译不过或测试不生效。见 `references/`。
2. **本团队的组织约定**：方法维度分组、按功能归档、断言强度标准。见下方模板。

测试设计的基础（一个用例一个失败原因、只 mock 边界、断言外部可观察结果）属通用常识，本技能不赘述，只在模板里体现。

## 模板优先于规则

模型逐条遵守规则时，会在规则的相邻情形上出错——写好了边界值却漏了 id 前缀，写好了透传却漏了对象身份。所以这里给的是**可直接抄的模板**，不是规则清单。套模板时把占位符替换成真实内容，不要凭记忆重写结构。

### 单元测试模板（Java / JUnit 5 + Mockito + AssertJ）

一个生产类一个测试类，`@Nested` 一个生产方法一组。模板里的注释标注了每个位置必须锁住什么，抄的时候逐条对照。

```java
@ExtendWith(MockitoExtension.class)
class OrderCreateServiceTest {

    private static final Instant NOW = Instant.parse("2025-01-01T00:00:00Z");
    private static final String USER_ID = "user-1";
    private static final String SKU = "sku-1";

    @Mock private OrderRepository orderRepository;
    @Mock private StockClient stockClient;

    private OrderCreateService service;

    // 显式构造：构造参数变化时编译期就报错，而不是运行时静默注入 null
    @BeforeEach
    void setUp() {
        service = new OrderCreateService(orderRepository, stockClient, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Nested
    @DisplayName("createOrder 创建订单")
    class CreateOrder {

        private OrderCreateCommand validCommand() {
            return new OrderCreateCommand(USER_ID, SKU, 2);
        }

        @Test
        void createOrder_validCommand_persistsPendingOrderWithConcreteValues() {
            when(stockClient.reserve(SKU, 2)).thenReturn(true);
            when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));

            service.createOrder(validCommand());

            ArgumentCaptor<Order> saved = ArgumentCaptor.forClass(Order.class);
            verify(orderRepository).save(saved.capture());
            // 锁具体值：id 拼接口径是业务契约，isNotBlank() 拦不住 "o-" → "order-" 这类变更
            assertThat(saved.getValue().getId()).isEqualTo("o-" + USER_ID);
            assertThat(saved.getValue().getSkuId()).isEqualTo(SKU);
            assertThat(saved.getValue().getQuantity()).isEqualTo(2);
            assertThat(saved.getValue().getStatus()).isEqualTo(OrderStatus.PENDING_PAYMENT);
            assertThat(saved.getValue().getCreatedAt()).isEqualTo(NOW);
            // 参数精确匹配，不用 any()
            verify(stockClient).reserve(SKU, 2);
        }

        @Test
        void createOrder_validCommand_returnsWhatRepositorySaved() {
            when(stockClient.reserve(SKU, 2)).thenReturn(true);
            // stub 返回与入参不同的实例，才能区分「透传 save 结果」与「自己 new 一个返回」
            Order persisted = new Order("db-1001", SKU, 2, OrderStatus.PENDING_PAYMENT, NOW);
            when(orderRepository.save(any(Order.class))).thenReturn(persisted);

            Order result = service.createOrder(validCommand());

            assertThat(result).isSameAs(persisted);
        }

        // 边界成对出现：既有非法侧 0，也有合法侧 1
        @ParameterizedTest(name = "quantity={0}")
        @ValueSource(ints = {0, -1, Integer.MIN_VALUE})
        void createOrder_nonPositiveQuantity_throwsValidationException(int quantity) {
            assertThatThrownBy(() -> service.createOrder(new OrderCreateCommand(USER_ID, SKU, quantity)))
                    .isInstanceOf(ValidationException.class)
                    .extracting(e -> ((ValidationException) e).getErrorCode())
                    .isEqualTo(ErrorCodes.QUANTITY_INVALID);   // 断言错误码，不只断言异常类型

            verifyNoInteractions(stockClient, orderRepository);  // 副作用不该发生
        }

        @Test
        void createOrder_minimumValidQuantity_succeeds() {
            when(stockClient.reserve(SKU, 1)).thenReturn(true);
            when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));

            assertThatCode(() -> service.createOrder(new OrderCreateCommand(USER_ID, SKU, 1)))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("cancelOrder 取消订单")
    class CancelOrder {

        @Test
        void cancelOrder_pendingOrder_savesSameInstanceItLoaded() {
            Order loaded = new Order("o-1", SKU, 2, OrderStatus.PENDING_PAYMENT, NOW);
            when(orderRepository.findById("o-1")).thenReturn(Optional.of(loaded));
            when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));

            service.cancelOrder("o-1");

            // 锁同一性：save 的必须是 load 出来的那个实例，不是同内容的新对象
            verify(orderRepository).save(loaded);
            verify(stockClient).release(SKU, 2);
            assertThat(loaded.getStatus()).isEqualTo(OrderStatus.CANCELLED);
        }
    }
}
```

### 集成测试模板（真实上下文 + Testcontainers）

只覆盖关键主链路。单表 CRUD 留在切片测试，不要升级成全链路。

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

    @BeforeEach
    void clean() { orderRepository.deleteAll(); }

    @Test
    void createOrder_thenPay_updatesStatusInDatabase() throws Exception {
        String orderId = mockMvc.perform(post("/orders").contentType(APPLICATION_JSON)
                .content("""{"userId":"u-1","skuId":"sku-1","quantity":1}"""))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString()
            .transform(body -> JsonPath.read(body, "$.id"));

        mockMvc.perform(post("/payments/callback").contentType(APPLICATION_JSON)
                .content("""{"orderId":"%s","result":"SUCCESS"}""".formatted(orderId)))
            .andExpect(status().isOk());

        // 断言跨功能协作后的最终状态，不是中间调用次数
        assertThat(orderRepository.findById(orderId))
            .get()
            .extracting(Order::getStatus)
            .isEqualTo(OrderStatus.PAID);
    }
}
```

### 仓颉模板

仓颉没有 `@Nested`，用「一个生产方法一个 `@Test` 类」达到同样的分组粒度。完整可运行的结构见 `references/cangjie.md` 的示例段落——那里同时给出了包声明、`Verify` 基数说明符位置、打桩默认预期这些容易写错的地方。

## 模型确实会写错的四件事

下面是实测中反复出现的错误，不是风格偏好：

**1. 断言只锁内容，不锁身份**

```java
verify(orderRepository).save(any());                        // ✗ 不关心是哪个对象
verify(orderRepository).save(saved.capture());
assertThat(saved.getValue().getId()).isNotBlank();          // ✗ 占位符，不是断言

verify(orderRepository).save(loadedFromRepository);         // ✓ 锁同一性
assertThat(saved.getValue().getId()).isEqualTo("o-user-1"); // ✓ 锁具体值
```

更新类方法（cancel / update / pay）尤其要锁同一性：「查到实体 → 改属性 → 保存」是标准写法，任何一次累赘地 `new` 都会静默丢掉关联或版本号。

**2. stub 让缺陷不可观测**

给 `save` 写 `thenAnswer(inv -> inv.getArgument(0))` 时，「返回 save 的结果」与「自己 new 一个返回」产生完全相同的结果。需要验证透传就用与入参不同的对象 + `isSameAs`。

**3. 边界只测了非法侧**

`quantity = {0, -1, MIN}` 不构成边界覆盖。把 `<= 0` 改成 `<= 1` 这类差一缺陷要靠合法侧 `quantity = 1` 才能抓住。边界值成对：`0` 与 `1`、空串与单字符、长度上限与上限+1。

**4. 把疑似缺陷写成绿用例**

```java
// ✗ 名字里带 currentBehavior 也救不了：后来的人只看到一条绿的用例，据此认为这是正确行为
@Test
void alreadyCancelled_orderIsReleasedAgain_currentBehavior() {
    assertThatCode(() -> service.cancelOrder("o-1")).doesNotThrowAnyException();
    verify(stockClient, times(1)).release(SKU, 2);
}
```

测试的职责是表达期望，不是记录现状。按期望行为写让它红（并在交付说明里列为已知缺陷），或用 `@Disabled("已知缺陷 #123：...，修复后移除")` 挂起。不要为了凑绿而降低断言强度。持续红的套件会让人习惯性忽略红灯，那比没有测试更糟。

## 交付前

必须真的跑一遍（`mvn -Dtest=... test`、`./gradlew test --tests ...`、`cjpm test`），并确认测试**真的在跑**：

- `*IT` 结尾的类默认不被 surefire 执行，需要 failsafe
- `@Disabled` 的用例不算通过
- `0 failures` 可能是 `0 tests run`

跑不起来时（无 DB、无 Docker、无编译环境）显式标注「未执行」+ 原因 + 人工验证方式，不要假装通过。

**自查盲区**：问自己「把我刚写的生产代码里哪一行改坏，这套测试不会红？」不会红的地方就是盲区。时间允许就真改一行跑一次再还原。常见的漏网点：边界差一、save 返回值被丢弃、保存前 new 了新对象、id 拼接口径变了、错误码串号、`verify` 里用了 `any()`、初始状态写错、依赖调用被删。

覆盖率是信号不是门槛，项目 CI 有阈值时以 CI 为准。

## 按功能归档

测试目录跟随**功能边界**，不按 `controller/service/repository` 三层切。Java 里目录必须等于 `package`，所以这件事等价于「生产代码本身按功能分包」（`com.x.order.create`），测试包原样镜像。若项目现状是分层包，不要靠测试侧造假包结构来满足规范——那会让测试失去对包私有成员的访问权，收益是负的。

```
src/test/java/com/x/order/create/
├── OrderCreateServiceTest.java        // 单元测试
├── OrderCreateControllerTest.java     // 切片测试
└── OrderCreateFlowIT.java             // 集成测试（*IT，与单测分开跑）
```

## 审查已有测试

审查先取证，再下结论。跑一遍测试（看用例数量、看 `target/surefire-reports/`、必要时写临时探针验证猜想），每条 P0 结论都要有可复现依据。**探针文件用完就删**，别留在 `src/test/`。

按优先级查：

| 症状 | 后果 |
|---|---|
| 测试从没被执行（`*IT` 无 failsafe、命名不匹配、`@Disabled`） | 绿灯是假的，以为有保护 |
| 断言恒真（`assertNotNull(Optional)`、`isNotBlank()`、断言自己 new 的对象） | 错误数据也能通过 |
| 用例名带 `currentBehavior` / 注释写「记录现状」 | bug 被固化成期望，修它时反而变红 |
| `@InjectMocks` 与依赖数量不匹配 | 缺的依赖静默注入 null，报错指向业务代码 |
| 只测 happy path，分支与异常出口 0 覆盖 | 「一个方法报错整条链路断掉」 |
| 大量 `verify` / `argThat(any())` / `verifyNoMoreInteractions` | 重构即红，断言失去意义 |
| `Thread.sleep` / 依赖执行顺序 | 随机失败 |
| 集成测试名 `IT` 但没连任何基础设施，或用 H2 冒充生产库 | 假绿灯、方言差异藏 bug |

补测优先级：先补**改动过的方法**和**出过 bug 的方法**的缺失分支，再补主干功能，最后才考虑历史覆盖率洼地。

## 参考文件

| 文件 | 内容 | 何时读 |
|---|---|---|
| `./references/java-spring.md` | JUnit 5 / Mockito / AssertJ 用法、参数化、四种切片测试（`@WebMvcTest` / `@DataJpaTest` / `@MybatisTest` / `@JsonTest`）、Testcontainers 集成测试、运行命令、红测排查表 | 项目是 Java / Spring / Spring Boot / MyBatis / JPA 时 |
| `./references/cangjie.md` | 仓颉测试宏全表、`cjpm test` 参数与 `--filter` 语法、包声明规则、`_test.cj` 布局、mock/spy 与桩的默认预期、参数化与随机测试、覆盖率、已知限制 | 项目是仓颉（有 `cjpm.toml`）时，或不确定某个仓颉测试 API 时 |
