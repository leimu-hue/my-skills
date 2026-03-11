# 软件设计规范

## 架构设计原则

### 1. SOLID原则

#### 单一职责原则（SRP）
```java
// ❌ 错误：一个类负责多个职责
public class UserManager {
    public void createUser(User user) {
        // 创建用户逻辑
    }

    public void sendEmail(User user) {
        // 发送邮件逻辑
    }

    public void saveToDatabase(User user) {
        // 数据库操作
    }

    public void generateReport(User user) {
        // 生成报告
    }
}

// ✅ 正确：每个类只有一个职责
/**
 * 用户领域服务。
 *
 * 负责用户创建流程中的业务编排，不直接承载控制层或持久层细节。
 */
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final EmailService emailService;
    private final ReportService reportService;

    /**
     * 创建用户并在成功后发送欢迎邮件。
     *
     * @param request 用户创建请求
     * @return 创建后的用户对象
     */
    public User createUser(UserCreateRequest request) {
        User user = buildUser(request);
        user = userRepository.save(user);
        emailService.sendWelcomeEmail(user);
        return user;
    }
}

/**
 * 邮件发送服务。
 */
@Service
public class EmailService {
    /**
     * 发送欢迎邮件。
     *
     * @param user 新注册用户
     */
    public void sendWelcomeEmail(User user) {
        // 只负责发送邮件
    }
}

/**
 * 报表生成服务。
 */
@Service
public class ReportService {
    /**
     * 生成用户报表。
     *
     * @param user 用户对象
     */
    public void generateUserReport(User user) {
        // 只负责生成报告
    }
}
```

#### 开闭原则（OCP）
```java
// ❌ 错误：修改现有代码来添加新功能
public class PaymentProcessor {
    public void processPayment(Payment payment) {
        if (payment.getType() == PaymentType.CREDIT_CARD) {
            processCreditCard(payment);
        } else if (payment.getType() == PaymentType.ALIPAY) {
            processAlipay(payment);
        }
        // 添加新支付方式需要修改此类
    }
}

// ✅ 正确：通过扩展来添加新功能
public interface PaymentProcessor {
    boolean supports(PaymentType type);
    PaymentResult process(Payment payment);
}

@Component
public class CreditCardProcessor implements PaymentProcessor {
    @Override
    public boolean supports(PaymentType type) {
        return type == PaymentType.CREDIT_CARD;
    }

    @Override
    public PaymentResult process(Payment payment) {
        // 信用卡支付逻辑
        return PaymentResult.success();
    }
}

@Component
public class AlipayProcessor implements PaymentProcessor {
    @Override
    public boolean supports(PaymentType type) {
        return type == PaymentType.ALIPAY;
    }

    @Override
    public PaymentResult process(Payment payment) {
        // 支付宝支付逻辑
        return PaymentResult.success();
    }
}

@Service
@RequiredArgsConstructor
public class PaymentService {
    private final List<PaymentProcessor> processors;

    /**
     * 根据支付类型选择处理器并执行支付。
     *
     * @param payment 支付请求
     * @return 支付结果
     */
    public PaymentResult processPayment(Payment payment) {
        PaymentProcessor processor = processors.stream()
            .filter(p -> p.supports(payment.getType()))
            .findFirst()
            .orElseThrow(() -> new UnsupportedPaymentTypeException());

        return processor.process(payment);
    }
}
```

#### 里氏替换原则（LSP）
```java
// ❌ 错误：子类改变了父类的行为
public class Bird {
    public void fly() {
        // 鸟类都会飞
    }
}

public class Penguin extends Bird {
    @Override
    public void fly() {
        throw new UnsupportedOperationException("企鹅不会飞");
    }
}

// ✅ 正确：合理的继承关系
public abstract class Bird {
    public abstract void makeSound();
}

public class FlyingBird extends Bird {
    public void fly() {
        // 会飞的鸟
    }
}

public class Eagle extends FlyingBird {
    @Override
    public void makeSound() {
        // 鹰的叫声
    }
}

public class Penguin extends Bird {
    @Override
    public void makeSound() {
        // 企鹅的叫声
    }

    public void swim() {
        // 企鹅游泳
    }
}
```

#### 接口隔离原则（ISP）
```java
// ❌ 错误：大而全的接口
public interface Worker {
    void work();
    void eat();
    void sleep();
    void attendMeeting();
    void writeReport();
}

public class Robot implements Worker {
    @Override
    public void work() { /* 机器人工作 */ }

    @Override
    public void eat() {
        throw new UnsupportedOperationException("机器人不需要吃饭");
    }

    @Override
    public void sleep() {
        throw new UnsupportedOperationException("机器人不需要睡觉");
    }
    // ...
}

// ✅ 正确：细粒度的接口
public interface Workable {
    void work();
}

public interface Eatable {
    void eat();
}

public interface Sleepable {
    void sleep();
}

public interface Reportable {
    void writeReport();
}

public class HumanWorker implements Workable, Eatable, Sleepable, Reportable {
    @Override
    public void work() { /* 人类工作 */ }

    @Override
    public void eat() { /* 人类吃饭 */ }

    @Override
    public void sleep() { /* 人类睡觉 */ }

    @Override
    public void writeReport() { /* 人类写报告 */ }
}

public class Robot implements Workable {
    @Override
    public void work() { /* 机器人工作 */ }
}
```

#### 依赖倒置原则（DIP）
```java
// ❌ 错误：高层模块依赖低层模块
public class UserService {
    private MySQLUserRepository userRepository = new MySQLUserRepository();

    public User createUser(User user) {
        return userRepository.save(user);
    }
}

// ✅ 正确：依赖抽象
public interface UserRepository {
    User save(User user);
    User findById(Long id);
    List<User> findAll();
}

@Repository
public class MySQLUserRepository implements UserRepository {
    @Override
    public User save(User user) {
        // MySQL实现
    }
}

@Repository
public class OracleUserRepository implements UserRepository {
    @Override
    public User save(User user) {
        // Oracle实现
    }
}

@Service
public class UserService {
    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User createUser(User user) {
        return userRepository.save(user);
    }
}
```

### 2. 分层架构

#### 标准分层结构
```
┌─────────────────────────────────┐
│         Controller Layer        │  ← HTTP请求/响应
├─────────────────────────────────┤
│          Service Layer          │  ← 业务逻辑
├─────────────────────────────────┤
│           Repository Layer      │  ← 数据访问
├─────────────────────────────────┤
│            Model Layer          │  ← 数据模型
└─────────────────────────────────┘
```

#### 各层职责
```java
// Controller层：处理HTTP请求
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    @PostMapping
    public ResponseEntity<UserResponse> createUser(
        @Valid @RequestBody UserCreateRequest request
    ) {
        User user = userService.createUser(request);
        return ResponseEntity.ok(UserResponse.from(user));
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> getUser(@PathVariable Long id) {
        User user = userService.getUserById(id);
        return ResponseEntity.ok(UserResponse.from(user));
    }
}

// Service层：业务逻辑
/**
 * 用户应用服务。
 *
 * 负责承接控制层请求并组织用户创建相关流程。
 */
@Service
@Transactional
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final EmailService emailService;

    /**
     * 创建用户。
     *
     * @param request 用户创建请求
     * @return 创建成功后的用户
     */
    public User createUser(UserCreateRequest request) {
        // 业务验证
        validateUserCreateRequest(request);

        // 创建用户
        User user = User.builder()
            .userName(request.getUserName())
            .email(request.getEmail())
            .build();

        user = userRepository.save(user);

        // 发送欢迎邮件
        emailService.sendWelcomeEmail(user);

        return user;
    }
}

// Repository层：数据访问
@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUserName(String userName);
    Optional<User> findByEmail(String email);
    List<User> findByStatus(UserStatus status);
}

// Model层：数据模型
@Entity
@Table(name = "users")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String userName;

    @Column(nullable = false, unique = true)
    private String email;

    @Enumerated(EnumType.ORDINAL)
    private UserStatus status;

    @CreationTimestamp
    private LocalDateTime createTime;

    @UpdateTimestamp
    private LocalDateTime updateTime;
}
```

## 设计模式应用

### 1. 创建型模式

#### 工厂模式
```java
// ✅ 正确：工厂模式创建对象
public interface Notification {
    void send(String message);
}

@Component
public class EmailNotification implements Notification {
    @Override
    public void send(String message) {
        // 发送邮件
    }
}

@Component
public class SmsNotification implements Notification {
    @Override
    public void send(String message) {
        // 发送短信
    }
}

@Component
public class NotificationFactory {
    private final Map<NotificationType, Notification> notifications;

    /**
     * 基于已注册的通知实现创建通知查找表。
     *
     * <p>示例：
     * <pre>{@code
     * Notification notification = notificationFactory.getNotification(NotificationType.EMAIL);
     * }</pre>
     */
    public NotificationFactory(List<Notification> notificationList) {
        this.notifications = notificationList.stream()
            .collect(Collectors.toMap(
                notification -> getNotificationType(notification),
                Function.identity()
            ));
    }

    /**
     * 根据通知类型返回对应实现。
     *
     * @param type 通知类型
     * @return 通知实现
     */
    public Notification getNotification(NotificationType type) {
        return notifications.get(type);
    }

    private NotificationType getNotificationType(Notification notification) {
        if (notification instanceof EmailNotification) {
            return NotificationType.EMAIL;
        } else if (notification instanceof SmsNotification) {
            return NotificationType.SMS;
        }
        throw new IllegalArgumentException("未知的通知类型");
    }
}
```

#### 建造者模式
```java
// ✅ 正确：建造者模式构建复杂对象
public class Order {
    private final Long id;
    private final Long userId;
    private final List<OrderItem> items;
    private final BigDecimal totalAmount;
    private final OrderStatus status;
    private final LocalDateTime createTime;

    private Order(Builder builder) {
        this.id = builder.id;
        this.userId = builder.userId;
        this.items = builder.items;
        this.totalAmount = builder.totalAmount;
        this.status = builder.status;
        this.createTime = builder.createTime;
    }

    public static class Builder {
        private Long id;
        private Long userId;
        private List<OrderItem> items = new ArrayList<>();
        private BigDecimal totalAmount = BigDecimal.ZERO;
        private OrderStatus status = OrderStatus.PENDING;
        private LocalDateTime createTime = LocalDateTime.now();

        public Builder id(Long id) {
            this.id = id;
            return this;
        }

        public Builder userId(Long userId) {
            this.userId = userId;
            return this;
        }

        public Builder items(List<OrderItem> items) {
            this.items = items;
            return this;
        }

        public Builder addItem(OrderItem item) {
            this.items.add(item);
            this.totalAmount = this.totalAmount.add(item.getAmount());
            return this;
        }

        public Builder totalAmount(BigDecimal totalAmount) {
            this.totalAmount = totalAmount;
            return this;
        }

        public Builder status(OrderStatus status) {
            this.status = status;
            return this;
        }

        public Builder createTime(LocalDateTime createTime) {
            this.createTime = createTime;
            return this;
        }

        public Order build() {
            return new Order(this);
        }
    }
}

// 使用示例
Order order = new Order.Builder()
    .userId(1L)
    .addItem(new OrderItem(1L, 2, new BigDecimal("99.99")))
    .addItem(new OrderItem(2L, 1, new BigDecimal("199.99")))
    .status(OrderStatus.CONFIRMED)
    .build();
```

### 2. 结构型模式

#### 适配器模式
```java
// ✅ 正确：适配器模式集成第三方服务
public interface PaymentGateway {
    PaymentResult process(PaymentRequest request);
}

// 第三方支付SDK
public class ThirdPartyPaymentSDK {
    public ThirdPartyPaymentResult pay(ThirdPartyPaymentRequest request) {
        // 第三方支付逻辑
        return new ThirdPartyPaymentResult();
    }
}

// 适配器
@Component
public class ThirdPartyPaymentAdapter implements PaymentGateway {
    private final ThirdPartyPaymentSDK sdk;

    @Override
    public PaymentResult process(PaymentRequest request) {
        ThirdPartyPaymentRequest thirdPartyRequest = convertToThirdPartyRequest(request);
        ThirdPartyPaymentResult thirdPartyResult = sdk.pay(thirdPartyRequest);
        return convertToPaymentResult(thirdPartyResult);
    }

    private ThirdPartyPaymentRequest convertToThirdPartyRequest(PaymentRequest request) {
        // 转换请求格式
        return new ThirdPartyPaymentRequest();
    }

    private PaymentResult convertToPaymentResult(ThirdPartyPaymentResult result) {
        // 转换结果格式
        return new PaymentResult();
    }
}
```

#### 装饰器模式
```java
// ✅ 正确：装饰器模式增强功能
public interface DataSource {
    void writeData(String data);
    String readData();
}

public class FileDataSource implements DataSource {
    private String filename;

    public FileDataSource(String filename) {
        this.filename = filename;
    }

    @Override
    public void writeData(String data) {
        // 写入文件
    }

    @Override
    public String readData() {
        // 读取文件
        return "";
    }
}

public abstract class DataSourceDecorator implements DataSource {
    protected DataSource wrappee;

    public DataSourceDecorator(DataSource source) {
        this.wrappee = source;
    }
}

public class EncryptionDecorator extends DataSourceDecorator {
    public EncryptionDecorator(DataSource source) {
        super(source);
    }

    @Override
    public void writeData(String data) {
        String encryptedData = encrypt(data);
        wrappee.writeData(encryptedData);
    }

    @Override
    public String readData() {
        String data = wrappee.readData();
        return decrypt(data);
    }

    private String encrypt(String data) {
        // 加密逻辑
        return data;
    }

    private String decrypt(String data) {
        // 解密逻辑
        return data;
    }
}

public class CompressionDecorator extends DataSourceDecorator {
    public CompressionDecorator(DataSource source) {
        super(source);
    }

    @Override
    public void writeData(String data) {
        String compressedData = compress(data);
        wrappee.writeData(compressedData);
    }

    @Override
    public String readData() {
        String data = wrappee.readData();
        return decompress(data);
    }

    private String compress(String data) {
        // 压缩逻辑
        return data;
    }

    private String decompress(String data) {
        // 解压缩逻辑
        return data;
    }
}

// 使用示例
DataSource source = new FileDataSource("data.txt");
DataSource encrypted = new EncryptionDecorator(source);
DataSource compressedAndEncrypted = new CompressionDecorator(encrypted);

compressedAndEncrypted.writeData("Hello World");
String result = compressedAndEncrypted.readData();
```

### 3. 行为型模式

#### 策略模式
```java
// ✅ 正确：策略模式实现算法切换
public interface DiscountStrategy {
    BigDecimal calculateDiscount(Order order);
}

@Component
public class RegularCustomerDiscount implements DiscountStrategy {
    @Override
    public BigDecimal calculateDiscount(Order order) {
        return order.getTotalAmount().multiply(new BigDecimal("0.95"));
    }
}

@Component
public class VIPCustomerDiscount implements DiscountStrategy {
    @Override
    public BigDecimal calculateDiscount(Order order) {
        return order.getTotalAmount().multiply(new BigDecimal("0.85"));
    }
}

@Component
public class HolidayDiscount implements DiscountStrategy {
    @Override
    public BigDecimal calculateDiscount(Order order) {
        return order.getTotalAmount().multiply(new BigDecimal("0.80"));
    }
}

@Service
public class DiscountService {
    private final Map<CustomerType, DiscountStrategy> strategies;

    public DiscountService(List<DiscountStrategy> strategyList) {
        this.strategies = new HashMap<>();
        strategies.put(CustomerType.REGULAR, findStrategy(RegularCustomerDiscount.class, strategyList));
        strategies.put(CustomerType.VIP, findStrategy(VIPCustomerDiscount.class, strategyList));
        strategies.put(CustomerType.HOLIDAY, findStrategy(HolidayDiscount.class, strategyList));
    }

    public BigDecimal calculateDiscount(Order order, CustomerType customerType) {
        DiscountStrategy strategy = strategies.get(customerType);
        if (strategy == null) {
            return order.getTotalAmount(); // 无折扣
        }
        return strategy.calculateDiscount(order);
    }

    private DiscountStrategy findStrategy(Class<?> strategyClass, List<DiscountStrategy> strategies) {
        return strategies.stream()
            .filter(strategyClass::isInstance)
            .findFirst()
            .orElse(null);
    }
}
```

#### 观察者模式
```java
// ✅ 正确：观察者模式实现事件通知
public interface EventListener {
    void onEvent(Event event);
}

public class OrderCreatedEvent {
    private final Long orderId;
    private final Long userId;
    private final LocalDateTime timestamp;

    public OrderCreatedEvent(Long orderId, Long userId) {
        this.orderId = orderId;
        this.userId = userId;
        this.timestamp = LocalDateTime.now();
    }

    // getters...
}

@Component
public class EmailNotificationListener implements EventListener {
    @Override
    public void onEvent(Event event) {
        if (event instanceof OrderCreatedEvent) {
            OrderCreatedEvent orderEvent = (OrderCreatedEvent) event;
            // 发送邮件通知
            System.out.println("发送订单创建邮件通知");
        }
    }
}

@Component
public class InventoryUpdateListener implements EventListener {
    @Override
    public void onEvent(Event event) {
        if (event instanceof OrderCreatedEvent) {
            OrderCreatedEvent orderEvent = (OrderCreatedEvent) event;
            // 更新库存
            System.out.println("更新库存");
        }
    }
}

@Component
public class EventManager {
    private final List<EventListener> listeners = new ArrayList<>();

    public void subscribe(EventListener listener) {
        listeners.add(listener);
    }

    public void unsubscribe(EventListener listener) {
        listeners.remove(listener);
    }

    public void notify(Event event) {
        for (EventListener listener : listeners) {
            listener.onEvent(event);
        }
    }
}

@Service
public class OrderService {
    private final EventManager eventManager;

    public Order createOrder(OrderCreateRequest request) {
        // 创建订单逻辑
        Order order = buildOrder(request);
        order = orderRepository.save(order);

        // 发布事件
        eventManager.notify(new OrderCreatedEvent(order.getId(), order.getUserId()));

        return order;
    }
}
```

## API设计规范

### 1. RESTful API设计

#### 资源命名
```
// ✅ 正确：RESTful资源命名
GET    /api/users                    → 获取用户列表
POST   /api/users                    → 创建用户
GET    /api/users/{id}               → 获取指定用户
PUT    /api/users/{id}               → 更新用户
DELETE /api/users/{id}               → 删除用户

GET    /api/users/{id}/orders        → 获取用户订单
POST   /api/users/{id}/orders        → 为用户创建订单

GET    /api/orders                   → 获取订单列表
GET    /api/orders/{id}              → 获取指定订单
PUT    /api/orders/{id}              → 更新订单

// ❌ 错误：非RESTful命名
GET    /api/getUsers
POST   /api/createUser
GET    /api/userInfo?id=123
POST   /api/updateUser
```

#### HTTP状态码
```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @PostMapping
    public ResponseEntity<UserResponse> createUser(@Valid @RequestBody UserCreateRequest request) {
        User user = userService.createUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(user));
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> getUser(@PathVariable Long id) {
        User user = userService.getUserById(id);
        return ResponseEntity.ok(UserResponse.from(user));
    }

    @PutMapping("/{id}")
    public ResponseEntity<UserResponse> updateUser(
        @PathVariable Long id,
        @Valid @RequestBody UserUpdateRequest request
    ) {
        User user = userService.updateUser(id, request);
        return ResponseEntity.ok(UserResponse.from(user));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<Page<UserResponse>> getUsers(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Page<User> users = userService.getUsers(PageRequest.of(page, size));
        Page<UserResponse> response = users.map(UserResponse::from);
        return ResponseEntity.ok(response);
    }
}
```

### 2. 请求响应格式

#### 请求格式
```java
// ✅ 正确：标准的请求格式
/**
 * 用户创建请求。
 */
@Data
@Builder
public class UserCreateRequest {
    @NotBlank(message = "用户名不能为空")
    @Size(min = 3, max = 50, message = "用户名长度必须在3-50个字符之间")
    private String userName;

    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式不正确")
    private String email;

    @NotBlank(message = "密码不能为空")
    @Size(min = 8, message = "密码长度不能少于8个字符")
    private String password;
}

/**
 * 用户更新请求。
 */
@Data
public class UserUpdateRequest {
    @Size(min = 3, max = 50, message = "用户名长度必须在3-50个字符之间")
    private String userName;

    @Email(message = "邮箱格式不正确")
    private String email;
}
```

#### 响应格式
```java
// ✅ 正确：统一的响应格式
/**
 * 通用接口响应体。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {
    private int code;
    private String message;
    private T data;
    private long timestamp;

    /**
     * 返回成功响应。
     *
     * @param data 响应数据
     * @return 成功响应
     */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(200, "success", data, System.currentTimeMillis());
    }

    /**
     * 返回带消息的成功响应。
     *
     * @param message 成功消息
     * @param data 响应数据
     * @return 成功响应
     */
    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<>(200, message, data, System.currentTimeMillis());
    }

    /**
     * 返回无数据成功响应。
     *
     * @return 成功响应
     */
    public static ApiResponse<Void> success() {
        return new ApiResponse<>(200, "success", null, System.currentTimeMillis());
    }

    /**
     * 返回失败响应。
     *
     * @param code 错误码
     * @param message 错误信息
     * @return 失败响应
     */
    public static ApiResponse<Void> error(int code, String message) {
        return new ApiResponse<>(code, message, null, System.currentTimeMillis());
    }
}

// 错误响应格式
/**
 * 错误响应体。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ErrorResponse {
    private int code;
    private String message;
    private String details;
    private long timestamp;
}
```

#### 分页响应
```java
// ✅ 正确：分页响应格式
/**
 * 分页响应对象。
 */
@Data
public class PageResponse<T> {
    private List<T> content;
    private int pageNumber;
    private int pageSize;
    private long totalElements;
    private int totalPages;
    private boolean first;
    private boolean last;
    private boolean hasNext;
    private boolean hasPrevious;

    /**
     * 根据 Spring Data 分页对象构建分页响应。
     *
     * @param page 原始分页对象
     * @return 分页响应
     */
    public static <T> PageResponse<T> from(Page<T> page) {
        PageResponse<T> response = new PageResponse<>();
        response.setContent(page.getContent());
        response.setPageNumber(page.getNumber());
        response.setPageSize(page.getSize());
        response.setTotalElements(page.getTotalElements());
        response.setTotalPages(page.getTotalPages());
        response.setFirst(page.isFirst());
        response.setLast(page.isLast());
        response.setHasNext(page.hasNext());
        response.setHasPrevious(page.hasPrevious());
        return response;
    }
}

// 使用示例
@GetMapping
public ResponseEntity<ApiResponse<PageResponse<UserResponse>>> getUsers(
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "20") int size
) {
    Page<User> users = userService.getUsers(PageRequest.of(page, size));
    PageResponse<UserResponse> pageResponse = PageResponse.from(
        users.map(UserResponse::from)
    );
    return ResponseEntity.ok(ApiResponse.success(pageResponse));
}
```

### 3. API版本控制

#### URL版本控制
```java
// ✅ 正确：URL版本控制
@RestController
@RequestMapping("/api/v1/users")
public class UserControllerV1 {
    // v1版本API
}

@RestController
@RequestMapping("/api/v2/users")
public class UserControllerV2 {
    // v2版本API
}
```

#### Header版本控制
```java
// ✅ 正确：Header版本控制
@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping(headers = "X-API-Version=1")
    public ResponseEntity<UserResponseV1> getUserV1(@PathVariable Long id) {
        // v1版本响应
    }

    @GetMapping(headers = "X-API-Version=2")
    public ResponseEntity<UserResponseV2> getUserV2(@PathVariable Long id) {
        // v2版本响应
    }
}
```

## 领域驱动设计

### 1. 领域模型

#### 实体（Entity）
```java
// ✅ 正确：实体设计
@Entity
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String orderNo;

    @Column(name = "user_id")
    private Long userId;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> items = new ArrayList<>();

    @Column(precision = 10, scale = 2)
    private BigDecimal totalAmount;

    @Enumerated(EnumType.ORDINAL)
    private OrderStatus status;

    @CreationTimestamp
    private LocalDateTime createTime;

    // 领域方法
    public void addItem(Product product, int quantity) {
        BigDecimal itemAmount = product.getPrice().multiply(BigDecimal.valueOf(quantity));
        OrderItem item = new OrderItem(this, product.getId(), quantity, itemAmount);
        this.items.add(item);
        this.totalAmount = this.totalAmount.add(itemAmount);
    }

    public void confirm() {
        if (this.status != OrderStatus.PENDING) {
            throw new IllegalStateException("只有待确认的订单才能确认");
        }
        this.status = OrderStatus.CONFIRMED;
    }

    public void cancel() {
        if (this.status == OrderStatus.SHIPPED || this.status == OrderStatus.DELIVERED) {
            throw new IllegalStateException("已发货或已完成的订单不能取消");
        }
        this.status = OrderStatus.CANCELLED;
    }
}
```

#### 值对象（Value Object）
```java
// ✅ 正确：值对象设计
public class Money {
    private final BigDecimal amount;
    private final String currency;

    public Money(BigDecimal amount, String currency) {
        if (amount.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("金额不能为负数");
        }
        this.amount = amount.setScale(2, RoundingMode.HALF_UP);
        this.currency = currency;
    }

    public Money add(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new IllegalArgumentException("货币类型不一致");
        }
        return new Money(this.amount.add(other.amount), this.currency);
    }

    public Money subtract(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new IllegalArgumentException("货币类型不一致");
        }
        BigDecimal result = this.amount.subtract(other.amount);
        if (result.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("余额不足");
        }
        return new Money(result, this.currency);
    }

    public boolean isGreaterThan(Money other) {
        return this.amount.compareTo(other.amount) > 0;
    }

    // equals和hashCode方法
    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (!(obj instanceof Money)) return false;
        Money other = (Money) obj;
        return amount.equals(other.amount) && currency.equals(other.currency);
    }

    @Override
    public int hashCode() {
        return Objects.hash(amount, currency);
    }
}
```

#### 聚合根（Aggregate Root）
```java
// ✅ 正确：聚合根设计
@Entity
public class ShoppingCart {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @OneToMany(mappedBy = "cart", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<CartItem> items = new ArrayList<>();

    @Enumerated(EnumType.ORDINAL)
    private CartStatus status;

    // 聚合根方法：管理聚合内部的一致性
    public void addItem(Product product, int quantity) {
        if (this.status != CartStatus.ACTIVE) {
            throw new IllegalStateException("购物车已关闭");
        }

        if (quantity <= 0) {
            throw new IllegalArgumentException("数量必须大于0");
        }

        // 检查是否已存在该商品
        Optional<CartItem> existingItem = findItemByProductId(product.getId());
        if (existingItem.isPresent()) {
            existingItem.get().increaseQuantity(quantity);
        } else {
            CartItem newItem = new CartItem(this, product.getId(), quantity, product.getPrice());
            this.items.add(newItem);
        }
    }

    public void removeItem(Long productId) {
        this.items.removeIf(item -> item.getProductId().equals(productId));
    }

    public void updateItemQuantity(Long productId, int quantity) {
        if (quantity <= 0) {
            removeItem(productId);
            return;
        }

        CartItem item = findItemByProductId(productId)
            .orElseThrow(() -> new IllegalArgumentException("购物车中不存在该商品"));
        item.updateQuantity(quantity);
    }

    public void clear() {
        this.items.clear();
    }

    public BigDecimal getTotalAmount() {
        return items.stream()
            .map(CartItem::getTotalPrice)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Optional<CartItem> findItemByProductId(Long productId) {
        return items.stream()
            .filter(item -> item.getProductId().equals(productId))
            .findFirst();
    }
}
```

### 2. 领域服务

#### 领域服务设计
```java
// ✅ 正确：领域服务
public interface OrderService {
    Order createOrder(Long userId, List<OrderItemCreateRequest> items);
    void confirmOrder(Long orderId);
    void cancelOrder(Long orderId);
    Order findOrderById(Long orderId);
}

@Service
public class OrderServiceImpl implements OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final PaymentService paymentService;
    private final NotificationService notificationService;

    @Override
    @Transactional
    public Order createOrder(Long userId, List<OrderItemCreateRequest> items) {
        // 验证商品库存
        validateProductStock(items);

        // 创建订单
        Order order = new Order();
        order.setUserId(userId);
        order.setOrderNo(generateOrderNo());
        order.setStatus(OrderStatus.PENDING);

        // 添加订单项
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (OrderItemCreateRequest itemRequest : items) {
            Product product = productRepository.findById(itemRequest.getProductId())
                .orElseThrow(() -> new ProductNotFoundException("商品不存在"));

            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setProductId(product.getId());
            item.setQuantity(itemRequest.getQuantity());
            item.setUnitPrice(product.getPrice());
            item.setTotalPrice(product.getPrice().multiply(BigDecimal.valueOf(itemRequest.getQuantity())));

            order.getItems().add(item);
            totalAmount = totalAmount.add(item.getTotalPrice());
        }

        order.setTotalAmount(totalAmount);

        // 保存订单
        order = orderRepository.save(order);

        // 发送订单创建通知
        notificationService.sendOrderCreatedNotification(order);

        return order;
    }

    private void validateProductStock(List<OrderItemCreateRequest> items) {
        for (OrderItemCreateRequest item : items) {
            Product product = productRepository.findById(item.getProductId())
                .orElseThrow(() -> new ProductNotFoundException("商品不存在"));

            if (product.getStock() < item.getQuantity()) {
                throw new InsufficientStockException(
                    String.format("商品[%s]库存不足，当前库存: %d，需要: %d",
                        product.getName(), product.getStock(), item.getQuantity())
                );
            }
        }
    }

    private String generateOrderNo() {
        return "ORDER" + System.currentTimeMillis() + ThreadLocalRandom.current().nextInt(1000, 9999);
    }
}
```

## 设计检查清单

### 架构设计检查
- [ ] 遵循SOLID原则
- [ ] 合理的分层架构
- [ ] 依赖倒置原则
- [ ] 单一职责原则
- [ ] 开闭原则

### 设计模式检查
- [ ] 选择合适的设计模式
- [ ] 避免过度设计
- [ ] 模式应用符合场景
- [ ] 代码可读性好
- [ ] 易于维护和扩展

### API设计检查
- [ ] RESTful规范
- [ ] 资源命名合理
- [ ] HTTP状态码正确
- [ ] 请求响应格式统一
- [ ] 版本控制策略
- [ ] 错误处理完整

### 领域设计检查
- [ ] 领域模型清晰
- [ ] 聚合边界合理
- [ ] 实体和值对象区分
- [ ] 领域服务职责明确
- [ ] 业务规则内聚
- [ ] 数据一致性保证
