# 仓颉（Cangjie）测试参考

核实依据：官方文档 1.2.0（STS，最新；LTS 为 1.0.5），正文在 https://cj-docs.gitcode.com/zh/1.2.0/ （`cangjie-lang.cn/docs` 是它的 iframe 外壳）。本文出现的 API 都可在这份文档里查到；文档未覆盖的能力在「已知限制」里单列，不要凭印象使用。

目录
- [工具链与运行](#工具链与运行)
- [目录布局：同目录同包](#目录布局同目录同包)
- [单元测试：一个方法一个测试类](#单元测试一个方法一个测试类)
- [断言宏](#断言宏)
- [mock / spy](#mock--spy)
- [参数化与随机测试](#参数化与随机测试)
- [生命周期、并行、超时、跳过](#生命周期并行超时跳过)
- [覆盖率](#覆盖率)
- [集成测试：现状与做法](#集成测试现状与做法)
- [已知限制](#已知限制)

## 工具链与运行

```bash
cjpm test                              # 当前模块全部测试
cjpm test src/order                    # 只跑指定包（可写多个）
cjpm test --filter='*.*CreateOrder*'   # 语法：测试类.用例，支持逗号组合与 -排除
cjpm test --filter='MyTest*.*,-*.*slow*'
cjpm test --include-tags=unit --exclude-tags=integration
cjpm test --timeout-each 2m --parallel 4
cjpm test --dry-run                    # 只列用例不执行，确认过滤条件写对了
cjpm test --no-run                     # 只编译，确认测试代码能过编译
cjpm test --skip-build                 # 复用上次构建
cjpm bench                             # 跑 @Bench
cjpm build --mock                      # 依赖里含 mock 的库时需要
```

`--report-format` 只支持 `xml` / `xml-per-package`（JUnit XML 风格，能直接喂 CI）。命令行参数优先于 `cjpm.toml` 的 `[profile.test]`。

在 `cjpm.toml` 里固定团队约定：

```toml
[profile.test]
filter        = "*"
timeout-each  = "2m"
report-format = "xml"
report-path   = "./target/reports"

[test-dependencies]
# 只在测试期需要的依赖放这里，不要污染生产依赖
```

## 目录布局：同目录同包

仓颉的测试文件与被测文件**同目录、同包**，命名 `xxx_test.cj`。`build` / `run` 会忽略这些文件，只有 `cjpm test` 编译它们：

```
src/order/
├── order_create_service.cj
├── order_create_service_test.cj     ← 同目录同包，可直接访问 internal / protected
├── order_cancel_service.cj
├── order_cancel_service_test.cj
└── payment/
    ├── payment_service.cj
    └── payment_service_test.cj
```

**包声明必须写全路径，这是实测中反复出错的点（写错直接编译失败）。** 官方规则：包名 = `cjpm.toml` 里 `name` 指定的 root 包名 + 相对 `src` 的目录路径（用 `.` 连接）。

推导公式：

```
package <cjpm.toml 的 name>.<相对 src 的目录，/ 换成 .>
```

以 `name = "order_service"` 为例：

| 文件位置 | 正确的 package 声明 |
|---|---|
| `src/main.cj` | 可省略（默认 `default`），或 `package order_service` |
| `src/order/order_create_service.cj` | `package order_service.order` |
| `src/order/order_create_service_test.cj` | `package order_service.order`（与同目录源码**完全一致**） |
| `src/order/payment/payment_service.cj` | `package order_service.order.payment` |

```cangjie
// ✗ 错误：漏了 root 包名，编译器报包名与路径不匹配
package order

// ✗ 错误：只写了目录，漏了 name 前缀（实测中最常见）
package payment

// ✓ 正确（对应 name="payment_service"、文件在 src/payment/ 下）
package payment_service.payment
```

**自查**：写完包声明后，回头看一眼 `cjpm.toml` 的 `name`，确认它以 `name.` 开头。列表里的 `name` 是根包名，不是模块描述。

同目录的源码与测试文件包声明必须一模一样——这也是「测试和应用同包」的实现方式。

这与「按功能归档」天然一致：一个功能目录里源码和测试并排，`src/order/` 下全是下单相关的代码。不要另建 `test/` 镜像树——仓颉按包组织源码，镜像树会丢掉对 `internal` 成员的访问权。

同目录的 `_test.cj` 访问不到源码里的 `private`（`private` 是文件级可见）。这是好事：它物理上禁止「直接测私有方法」，与主技能的要求一致，不要为了测试把 `private` 改成 `internal`。

## 单元测试：一个方法一个测试类

仓颉**没有 JUnit 的 `@Nested`**。按方法维度分组用「一个生产方法一个测试类」：类上 `@Test`，用例上 `@TestCase`。

```cangjie
// src/order/order_create_service_test.cj
package order_service.order        // 与同目录的 order_create_service.cj 完全一致

import std.unittest.*
import std.unittest.testmacro.*
import std.unittest.mock.*
import std.unittest.mock.mockmacro.*

@Test
class CreateOrderTest {                                  // 生产方法 createOrder 的测试组
    @TestCase
    func createOrder_validCommand_returnsPendingOrder(): Unit { }

    @TestCase
    func createOrder_insufficientStock_throwsBusinessException(): Unit { }
}

@Test
class CancelOrderTest {                                  // 生产方法 cancelOrder 的测试组
    @TestCase
    func cancelOrder_alreadyPaid_throwsBusinessException(): Unit { }
}
```

约束与要点：
- `@Test` 类必须有无参构造，不能继承其他类（框架会为它引入基类 `unittest.TestCases`）
- 一个类只对应一个生产方法；类名用生产方法名的大驼峰（`CreateOrder`）
- 用例名仍是 `方法名_场景_期望`
- 组之间不共享可变状态；不可变的 `let` 数据可提到类字段，需要重建的放 `@BeforeEach`
- 顶层函数也能直接 `@Test`，但**没有生命周期函数**，只能做无前置数据的简单用例

## 断言宏

| 宏 | 语义 |
|---|---|
| `@Assert(a, b)` / `@Assert(cond)` | 失败即终止本用例（fail-fast；`@Assert(cond)` 等价于 `@Assert(cond, true)`） |
| `@Expect(a, b)` / `@Expect(cond)` | 失败继续执行，一次报告看到全部失败项 |
| `@AssertThrows[T1 \| T2](expr)` / `@ExpectThrows` | 断言抛出指定异常；无类型参数时默认为 `Exception` |
| `@PowerAssert(expr)` | 失败时展开子表达式求值过程，定位最快 |
| `@Fail(msg)` / `@FailExpect(msg)` | 直接判失败 |
| `@CustomAssertion` | 定义可复用的断言宏 |

### `@Assert` 还是 `@Expect`：按「一个用例一个失败原因」选

两者不是风格选项，选错会影响排查效率：

- **`@Assert`（fail-fast）**：用在**前置条件**与**单点断言**。一个用例只验证一个失败原因时，用 `@Assert`——后续断言在首个失败后不再跑，避免读到一堆由同一个根因引起的级联报错。`@AssertThrows` 天然 fail-fast。
- **`@Expect`（继续）**：只用在**同一原因的多组同质检查**，比如同一个方法的多组边界输入。这时一次报告看完所有失败项反而是效率。

反例：在一条用例里串四个不相干的 `@Expect`（校验、查询、状态、库存），第一个失败后后面还在跑，日志里混着多个互不相关的失败，反而更需要猜。

```cangjie
// ✓ 单点断言用 @Assert：失败就停，不产生级联噪音
@Assert(userService.findById("u-1").isSome())

// ✓ 同质的多组边界用 @Expect：一次看到全部
@Expect(isValidQuantity(1))
@Expect(!isValidQuantity(0))
@Expect(!isValidQuantity(-1))
```

```cangjie
@TestCase
func createOrder_insufficientStock_throwsBusinessException(): Unit {
    let stock = FakeStockClient(reject: true)
    let service = OrderCreateService(stock, InMemoryOrderRepo())

    // 断言异常类型，返回值可直接拿到异常对象做进一步断言
    let err = @AssertThrows[BusinessException](service.createOrder(validCommand()))
    @PowerAssert(err.errorCode == ErrorCodes.STOCK_INSUFFICIENT)
}

@TestCase
func createOrder_quantityBoundary(): Unit {
    // 多项检查用 @Expect：一次看到全部失败项，而不是修一个跑一次
    @Expect(isValid(1))
    @Expect(!isValid(0))
    @Expect(!isValid(-1))
}
```

浮点比较用 `delta`：`@Expect(1.0, 1.001, delta: 0.001)`；需要相对误差时用 `RelativeDelta(absolute: ..., relative: ...)`。

**两参数形式的相等断言要求左值类型实现 `Equatable<右值类型>`。** 官方原文：「假设 `a` 的类型为 `A`，`b` 的类型为 `B`，`A` 必须实现了 `Equatable<B>`」。仓颉的 `enum` / 自定义类默认不自动实现 `Equatable`，所以拿两个枚举值或对象直接写 `@Expect(a, b)` 可能编译不过。遇到这种情况用布尔形式断言，或先投影出可比较的字段：

```cangjie
// 可能编译不过：PaymentStatus 未实现 Equatable<PaymentStatus>
@Expect(order.status, PaymentStatus.Paid)

// 稳妥写法一：比较字段
@PowerAssert(order.status == PaymentStatus.Paid)

// 稳妥写法二：转成 Bool / 字符串再比
@Expect(order.status.toString(), "Paid")
```

要保留 `@Expect(a, b)` 的可读性，就在生产代码里为需要的类型扩展 `Equatable<T>`（并实现 `==`），不要只为了测试能编译而随意改业务类型——先看项目里是否已有统一做法。

选择原则与主技能一致：一个用例只验证一个失败原因。同一用例内多条**同质**检查（同一方法的多组边界输入）用 `@Expect` 更省时间；跨场景的检查拆成不同 `@TestCase`。

## mock / spy

官方框架 `std.unittest.mock`（`cjpm test` 下自动启用）。`mock<T>()` 创建无实现的骨架，`spy<T>(obj)` 包装真实实例、默认委托给真实实现。

可打桩：类与接口的实例成员（含 `final` 成员）、静态函数/属性/字段、顶层函数与变量。
不可打桩：构造器、扩展成员、foreign 函数、局部函数与变量、常量、任意私有声明。

```cangjie
@Test
class CancelOrderTest {

    @TestCase
    func cancelOrder_paidOrder_releasesStockOnce(): Unit {
        let client = mock<StockClient>()
        @On(client.release("sku-1", 2)).returns(true)      // 精确参数
        @On(client.notify(_, _)).returns().anyTimes()      // `_` 是 any() 的语法糖

        let result = CancelOrderService(client).cancel("o-1")

        @Expect(result.isOk())
        // 关键交互才验证；基数说明符写在 @Called 里面，不是 Verify.that 外面
        Verify.that(@Called(client.release("sku-1", 2)).once())
        // 需要跨多条验证一起判时，先存成 VerifyStatement
        let stmt: VerifyStatement = @Called(client.notify(_, _)).once()
        Verify.that(stmt)
    }

    @TestCase
    func cancelOrder_clientTimeout_returnsCompensation(): Unit {
        let client = mock<StockClient>()
        @On(client.release(_, _)).throws(TimeoutException())   // 打桩抛异常

        @PowerAssert(CancelOrderService(client).cancel("o-1").isCompensating())
    }
}
```

基数说明符（`once()` / `times(n)` 等）必须链在 **`@Called` 表达式上**，`Verify.that(...)` 只接收一个 `VerifyStatement`。这是实测中最容易写错的一处：

```cangjie
// ✗ 错误：.once() 挂在 Verify.that(...) 外面，编译不过
Verify.that(@Called(client.release("sku-1", 2))).once()

// ✓ 正确：基数说明符在 @Called 里面
Verify.that(@Called(client.release("sku-1", 2)).once())

// ✓ 正确：需要跨多条验证一起判时，先存成 VerifyStatement
let stmt: VerifyStatement = @Called(client.release("sku-1", 2)).once()
Verify.that(stmt)
```

桩的默认预期基数（与 Mockito 的宽松默认不同，这一点必须记住）：

| 操作 | 默认预期 |
|---|---|
| `returns` / `throws` / `doesNothing` / `callsOriginal` 等 | `atLeastOnce` —— **打了桩却从未被调用，用例就失败** |
| `returnsConsecutively` | `times(values.size)` |
| `fails` | 不可调用 |

所以「多余的 stub」在仓颉里会直接变成红测，不需要额外告警——这正是主技能要求「只打必要的桩」的天然执行机制。确实可能不被调用的可选交互，显式加 `.anyTimes()`。其他可用的基数说明符：`once()` / `atLeastOnce()` / `times(n)` / `times(min:, max:)` / `atLeastTimes(n)`。

参数匹配器：`_`（= `any()`）、常量字面量、单个标识符（按结构相等匹配）、`ofType<T>()`、`none()`、`argThat({arg => ...})`。

规则与 Java 侧一致：只 mock 边界（client、repository、MQ、时间/随机源），不 mock 值对象与纯函数；不需要交互验证时就不要 `@Called`。**不能 mock 构造器**，所以依赖一律走构造器注入——如果你发现某个依赖无法在测试中替换，先怀疑它被 `new` 在函数体里了。

## 参数化与随机测试

数据 DSL 写在 `@Test` / `@TestCase` 上，框架自动把参数注入用例：

```cangjie
// 值驱动
@Test[size in [0, 1, 50, 1000], item in (-1 .. 20)]
func testSort(size: Int64, item: Int64): Unit {
    @Expect(size >= 0)
}

// 随机测试（默认约 200 组，偏向边界值）
@Test[array in random()]
func testRandomArrays(array: Array<Int64>): Unit {
    @Expect(array.size >= 0)
}
```

多参数会做**全组合**（上例 4 × 21 = 84 组），组合爆炸会让测试变慢，参数不要太多。

随机测试失败时输出里会带 `randomSeed`，用 `cjpm test --random-seed <n>` 复现同一组输入——这是排查 flaky 的第一手段，别急着改成固定值。

`@Types[T in <Int64, Float64, String>]` 提供类型参数；`std.unittest.prop_test` 提供 `random<T>()`、`randomInRange`、`emptyIterable`；`@Strategy` + `@Configure` 用于组合与复用生成策略。

## 生命周期、并行、超时、跳过

```cangjie
@Test
@Tag[order]                                  // 类级标签会下发给所有用例
class CreateOrderTest {
    @BeforeAll  func setupOnce(): Unit { }   // 不能声明参数
    @AfterAll   func teardownOnce(): Unit { }
    @BeforeEach func setupCase(): Unit { }   // 可声明一个 String 参数（用例名）
    @AfterEach  func teardownCase(): Unit { }

    @TestCase
    @Timeout[Duration.second * 5]             // 防止用例挂死；类级标注则对本类所有用例生效
    func createOrder_validCommand_returnsPendingOrder(): Unit { }

    @TestCase
    @Skip                                     // @Skip[expr] 目前只接受 true
    func createOrder_knownBroken(): Unit { }
}
```

- 生命周期只能标在 `@Test` 测试类里；顶层 `@Test` 函数没有生命周期
- `@Parallel` 标在类上，且必须配合 `cjpm test --parallel N` 才生效；要求用例彼此独立、`@BeforeAll`/`@AfterAll` 可重入，不能与 `@Bench` 同用。并行化的对象是耗时用例，纯 CPU 毫秒级用例并行反而更慢
- `@Tag` 配合 `--include-tags` / `--exclude-tags` 是最实用的分层手段：`@Tag[unit]` 与 `@Tag[integration]` 分两轮跑

## 覆盖率

```bash
cjpm test --coverage
cjcov --root=./ --html-details -o coverage_out    # html
cjcov --root=./ -x -o coverage.xml                # xml
cjcov --root=./ -j -o coverage.json               # json
cjcov --root=./ -b -o coverage_out                # 分支覆盖率（实验性）
```

`--coverage` 下 `main` 不执行，所以 `main` 显示未覆盖是正常的，不要为它写测试。没有覆盖率阈值卡点参数——需要门槛就在 CI 里解析 `coverage.json` 自行判断。

## 集成测试：现状与做法

仓颉生态**没有 Testcontainers 等价物，也没有框架级的数据库或 HTTP 测试支持**（1.2.0 文档中查不到，不是本技能的臆断）。落地方式：

- **数据库**：用 `std.database.sql` 的通用接口，测试里自己建连接、跑建表脚本、清表；driver 放 `[test-dependencies]`。把连接与清理封装成一个 `DbFixture`，避免每个用例重复
- **HTTP**：`net` / `log` / `http` 已从 SDK 移到 `stdx` 模块，需在 `cjpm.toml` 配置。测自己的接口时在进程内起真实 server（随机端口）+ client 发请求；测外部依赖时写一个返回固定响应的本地假 server，不要真连第三方
- **功能间联调**：真实 repo + 真实 service + 真实 DB 连接，只把外部系统换成本地替身，断言**最终状态**（DB 里是什么、发出去的请求体是什么）
- **隔离**：仓颉没有测试事务回滚的基础设施，`@BeforeEach` 清表是主力手段；集成测试打 `@Tag[integration]`，CI 里用 `--include-tags=integration` 单独跑，避免拖慢常规 `cjpm test`

```cangjie
@Test
@Tag[integration]
class OrderCreateFlowIT {
    @BeforeEach
    func cleanDb(): Unit { DbFixture.truncate("orders", "payments") }

    @TestCase
    func createOrder_thenPay_updatesStatus(): Unit {
        let ctx = DbFixture.fresh()
        let service = OrderCreateService(FakeStockClient.ok(), ctx.repo())

        service.createOrder(validCommand())
        service.pay("o-1")

        // 断言跨功能协作后的最终状态，而不是中间调用了几次
        let saved = ctx.repo().findById("o-1")
        @PowerAssert(saved.status == PAID)
    }
}
```

## 已知限制

写测试前对照这张表，避免调用不存在的 API：

- 无 `@Nested`：分组靠「一个生产方法一个测试类」
- 无 `@Disabled`：用 `@Skip`（只接受 `true`）
- 无 Testcontainers、无嵌入式数据库、无数据库测试框架
- 无覆盖率阈值参数；`--report-format` 只有 `xml` / `xml-per-package`
- 不能 mock 构造器、扩展成员、foreign 函数、局部函数、常量、私有声明
- `private` 成员对同目录 `_test.cj` 不可见
- 顶层 `@Test` 函数没有生命周期函数
- 打桩默认 `atLeastOnce`，未触发的桩会让用例失败
- 本机当前**未安装**仓颉工具链（`cjc` / `cjpm` 不在 PATH）。涉及仓颉的测试写完若无法执行，明确标注「未执行 + 原因 + 人工验证方式」，不要假装通过
