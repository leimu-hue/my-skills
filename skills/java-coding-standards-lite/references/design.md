# 软件设计规范

## 使用边界

本文用于指导 Java / Spring 设计取舍，不要求强行套模式或 DDD 术语。已有项目存在稳定约定时优先保持一致；只有在新增模块、重构公共能力或消除明显复杂度时，再引入新抽象。

- 分层、接口、设计模式用于降低耦合，不是目标本身
- 示例只表达职责边界；返回格式、异常类型、包结构跟随项目约定
- 新增抽象必须对应真实变化点：多实现、多渠道、多算法、多外部系统适配
- 枚举持久化默认使用 `EnumType.STRING`，避免枚举顺序变化污染历史数据

## 架构原则

### SOLID

| 原则 | 要求 | 避免 |
| --- | --- | --- |
| SRP 单一职责 | 一个类只承担一个清晰职责 | Service 同时处理 HTTP、业务、持久化、报表、通知 |
| OCP 开闭原则 | 用接口、策略、注册表扩展变化点 | 每新增类型都修改既有 `if/else` 主流程 |
| LSP 里氏替换 | 子类必须保持父类契约 | 子类覆盖方法后抛 `UnsupportedOperationException` |
| ISP 接口隔离 | 接口按调用方需要拆小 | 大接口迫使实现类写无意义方法 |
| DIP 依赖倒置 | 高层依赖接口，具体实现由注入提供 | 业务类 `new` 具体 Repository、SDK、Client |

典型扩展点写法：

```java
public interface PaymentProcessor {
    boolean supports(PaymentType type);
    PaymentResult process(Payment payment);
}

@Service
@RequiredArgsConstructor
public class PaymentService {
    private final List<PaymentProcessor> processors;

    public PaymentResult processPayment(Payment payment) {
        PaymentProcessor processor = processors.stream()
            .filter(p -> p.supports(payment.getType()))
            .findFirst()
            .orElseThrow(UnsupportedPaymentTypeException::new);
        return processor.process(payment);
    }
}
```

### 分层架构

标准职责：

- Controller：HTTP 入参、响应、状态码；不写业务规则
- Service / ApplicationService：用例编排、事务、领域对象调用、外部协作
- Repository：数据访问；不写业务编排
- Model / Entity / DTO：数据结构与自身规则；不要混入控制层细节

```java
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;

    @PostMapping
    public ResponseEntity<UserResponse> createUser(@Valid @RequestBody UserCreateRequest request) {
        User user = userService.createUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(user));
    }
}
```

## 设计模式

只在存在真实变化点时使用模式。只有一个实现、无复用计划、规则仍不稳定时，保持简单代码；当类型、渠道、算法或第三方适配导致分支持续增长，再抽象。

| 模式 | 适用场景 | 注意点 |
| --- | --- | --- |
| 工厂 | 按类型获取多个已注册实现 | 类型归属由实现自身声明，未知类型明确失败 |
| Builder | 构建参数多、默认值多、对象创建过程复杂 | Java 17+ 简单不可变 DTO 优先 `record`；不适合 `record` 且项目已有 Lombok 风格时再用 `@Builder` |
| 适配器 | 屏蔽第三方 SDK、外部协议、遗留接口差异 | 转换逻辑留在适配器内，不泄漏到业务层 |
| 装饰器 | 在不改原实现的前提下叠加能力 | 不要为一次性增强制造多层包装 |
| 策略 | 算法、规则、渠道可切换 | 策略选择集中管理，业务流程不散落类型判断 |
| 观察者 / 事件 | 一个动作触发多个后续动作 | 事件只携带必要事实，监听器避免互相依赖 |

工厂示例：

```java
public interface Notification {
    NotificationType type();
    void send(String message);
}

@Component
public class NotificationFactory {
    private final Map<NotificationType, Notification> notifications;

    public NotificationFactory(List<Notification> notificationList) {
        this.notifications = notificationList.stream()
            .collect(Collectors.toMap(Notification::type, Function.identity()));
    }

    public Notification getNotification(NotificationType type) {
        Notification notification = notifications.get(type);
        if (notification == null) {
            throw new IllegalArgumentException("Unsupported notification type: " + type);
        }
        return notification;
    }
}
```

## API 设计

### RESTful 资源

- 使用名词资源：`/api/users`、`/api/users/{id}`、`/api/users/{id}/orders`
- 避免动词路径：`/api/getUsers`、`/api/createUser`、`/api/updateUser`
- 常用状态码：创建 `201`，查询/更新 `200`，删除 `204`，参数错误 `400`，未授权 `401`，无权限 `403`，不存在 `404`，冲突 `409`

### 请求与响应

- Request DTO 使用 Bean Validation 表达边界校验
- Response DTO 不直接暴露 Entity，避免泄漏持久化结构
- 响应格式必须在同一项目内一致
- 若项目已统一 `ApiResponse<T>`，Controller 应统一包装；若项目采用纯 HTTP 语义和直接 DTO 返回，不要局部引入包装层
- 错误响应由全局异常处理器生成，避免 Controller 手写不一致错误体
- 分页响应至少包含：`content`、`pageNumber`、`pageSize`、`totalElements`、`totalPages`、`hasNext`

```java
// Java 17+ 优先 record
public record UserCreateRequest(
    @NotBlank
    @Size(min = 3, max = 50)
    String userName,

    @NotBlank
    @Email
    String email
) {}

// Java 8/11 备选
@Data
@Builder
public class UserCreateRequest {
    @NotBlank
    @Size(min = 3, max = 50)
    private String userName;

    @NotBlank
    @Email
    private String email;
}
```

### API 版本

- 开放 API 默认优先 URL 版本：`/api/v1/users`
- Header 版本适合内部 API、网关统一路由或客户端可控场景：`X-API-Version=1`
- 不要在同一业务域内混用多套版本策略，除非网关或兼容计划明确要求

## 配置管理

- 配置属性优先使用 `@ConfigurationProperties` 集中管理，类型安全且可验证
- 避免将 `@Value` 散落在各个 Service 中，难以追踪和维护
- 禁止在代码中硬编码配置值（API Key、URL、超时等）

```java
// ✅ 使用 @ConfigurationProperties 集中管理
@ConfigurationProperties(prefix = "app.payment")
public record PaymentProperties(String apiKey, int timeout, String url) {}

// ❌ @Value 散落各处
@Value("${app.payment.api-key}")
private String apiKey;

// ❌ 硬编码
private String apiKey = "sk_live_12345";
```

## 全局异常处理

两种方案按场景选用，同一项目内保持统一：

| 方案 | 适用场景 | 优势 |
| --- | --- | --- |
| `ErrorResponse` + `MessageSource` | 内部管理系统、多语言企业项目 | i18n 完整支持，errorCode 即 message key |
| `ProblemDetail`（RFC 7807） | 开放平台、微服务间 REST API | Spring Boot 3 标准，结构化错误体 |

### 方案一：ErrorResponse + MessageSource（i18n 优先）

详细实现见 `./exception-logging.md` 异常处理章节。

### 方案二：ProblemDetail（RFC 7807）

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(UserNotFoundException.class)
    public ProblemDetail handleNotFound(UserNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(BusinessException.class)
    public ProblemDetail handleBusiness(BusinessException e) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(
            HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
        detail.setProperty("errorCode", e.getErrorCode());
        return detail;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnknown(Exception e) {
        log.error("Unexpected system error", e);
        return ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
    }
}
```

## 领域驱动设计

### 领域对象

| 概念 | 判断标准 | 规则 |
| --- | --- | --- |
| Entity | 有身份标识，生命周期内状态可变 | 业务规则优先放进实体方法 |
| Value Object | 无身份，以属性值判断相等 | 保持不可变，实现 `equals` / `hashCode` |
| Aggregate Root | 聚合对外唯一修改入口 | 外部只通过根对象维护聚合内部一致性 |

实体示例要点：

```java
@Entity
public class Order {
    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    public void confirm() {
        if (status != OrderStatus.PENDING) {
            throw new IllegalStateException("只有待确认的订单才能确认");
        }
        this.status = OrderStatus.CONFIRMED;
    }
}
```

### 应用服务与领域服务

- 应用服务：编排用例、事务、仓储、通知、支付等外部协作
- 领域服务：承载不自然归属于单个实体或值对象的业务规则
- Spring `@Service` 只是组件角色，不等同于 DDD 领域服务
- 领域模型能自己完成的规则，优先放在实体或值对象中

```java
@Service
@RequiredArgsConstructor
public class OrderApplicationService {
    private final OrderRepository orderRepository;
    private final InventoryPolicy inventoryPolicy;

    @Transactional
    public Order createOrder(OrderCreateCommand command) {
        inventoryPolicy.checkEnoughStock(command.items());
        Order order = Order.create(command);
        return orderRepository.save(order);
    }
}
```
