# 异常处理与日志规范

## 异常处理原则

### 异常分类

#### 检查型异常（Checked Exception）
- 编译时检查，必须处理
- 用于可恢复的错误情况
- 调用者需要处理或声明抛出

```java
// ✅ 正确：检查型异常用于可恢复错误
public void readFile(String path) throws FileNotFoundException {
    if (!Files.exists(Paths.get(path))) {
        throw new FileNotFoundException("文件不存在: " + path);
    }
    // 读取文件
}
```

#### 运行时异常（Unchecked Exception）
- 运行时检查，不强制处理
- 用于编程错误或不可恢复错误
- 通常表示代码逻辑问题

```java
// ✅ 正确：运行时异常用于编程错误
public int divide(int a, int b) {
    if (b == 0) {
        throw new IllegalArgumentException("除数不能为零");
    }
    return a / b;
}
```

### 异常层次结构

#### 自定义异常设计
```java
// 基础业务异常
public class BusinessException extends RuntimeException {
    private final String errorCode;

    public BusinessException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public BusinessException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}

// 特定业务异常
public class UserNotFoundException extends BusinessException {
    public UserNotFoundException(String userId) {
        super("USER_NOT_FOUND", "用户不存在: " + userId);
    }
}

public class ValidationException extends BusinessException {
    public ValidationException(String message) {
        super("VALIDATION_ERROR", message);
    }

    public ValidationException(String field, String message) {
        super("VALIDATION_ERROR", String.format("字段[%s]验证失败: %s", field, message));
    }

    public ValidationException(String field, String message, Throwable cause) {
        super("VALIDATION_ERROR", String.format("字段[%s]验证失败: %s", field, message), cause);
    }
}

public class InsufficientBalanceException extends BusinessException {
    public InsufficientBalanceException(BigDecimal balance, BigDecimal amount) {
        super("INSUFFICIENT_BALANCE",
              String.format("余额不足，当前余额: %s, 需要金额: %s", balance, amount));
    }
}
```

## 异常处理最佳实践

### 1. 异常抛出原则

#### 尽早抛出
```java
// ✅ 正确：尽早验证参数并抛出异常
public User getUserById(Long id) {
    if (id == null) {
        throw new IllegalArgumentException("用户ID不能为空");
    }
    if (id <= 0) {
        throw new IllegalArgumentException("用户ID必须大于0");
    }

    User user = userDao.selectById(id);
    if (user == null) {
        throw new UserNotFoundException(id.toString());
    }

    return user;
}

// ❌ 错误：延迟验证
public User getUserById(Long id) {
    // 直接使用id，可能在后续操作中才发现问题
    User user = userDao.selectById(id); // 如果id为null，可能抛出NPE
    return user;
}
```

#### 提供详细信息
```java
// ✅ 正确：异常信息包含详细信息
public void transferMoney(Long fromAccountId, Long toAccountId, BigDecimal amount) {
    if (fromAccountId == null) {
        throw new IllegalArgumentException("转出账户ID不能为空");
    }
    if (toAccountId == null) {
        throw new IllegalArgumentException("转入账户ID不能为空");
    }
    if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
        throw new IllegalArgumentException("转账金额必须大于0，当前金额: " + amount);
    }
    if (fromAccountId.equals(toAccountId)) {
        throw new IllegalArgumentException("转出账户和转入账户不能相同");
    }

    // 业务逻辑
}
```

### 2. 异常捕获原则

#### 不要捕获异常后什么都不做
```java
// ❌ 错误：空的catch块
try {
    processOrder(order);
} catch (Exception e) {
    // 什么都没做，静默失败
}

// ❌ 错误：只打印堆栈，没有处理
try {
    processOrder(order);
} catch (Exception e) {
    e.printStackTrace();
}

// ✅ 正确：适当的异常处理
try {
    processOrder(order);
} catch (BusinessException e) {
    // 业务异常，记录日志并返回错误信息
    logger.warn("订单处理失败，订单号: {}, 错误: {}", order.getOrderNo(), e.getMessage());
    throw e;
} catch (Exception e) {
    // 系统异常，记录详细日志并转换为业务异常
    logger.error("订单处理发生系统错误，订单号: {}", order.getOrderNo(), e);
    throw new BusinessException("SYSTEM_ERROR", "系统繁忙，请稍后重试", e);
}
```

#### 捕获特定异常
```java
// ✅ 正确：捕获特定异常类型
public void processFile(String filePath) {
    try {
        readFile(filePath);
    } catch (FileNotFoundException e) {
        // 处理文件不存在的情况
        logger.warn("文件不存在: {}", filePath);
        createDefaultFile(filePath);
    } catch (IOException e) {
        // 处理IO异常
        logger.error("读取文件失败: {}", filePath, e);
        throw new BusinessException("FILE_READ_ERROR", "文件读取失败", e);
    }
}

// ❌ 错误：捕获过于宽泛的异常
public void processFile(String filePath) {
    try {
        readFile(filePath);
    } catch (Exception e) { // 捕获所有异常
        logger.error("处理文件失败", e);
    }
}
```

### 3. 异常转换

#### 将底层异常转换为业务异常
```java
// ✅ 正确：异常转换
public User createUser(UserCreateRequest request) {
    try {
        return userDao.insert(request.toUser());
    } catch (DuplicateKeyException e) {
        // 数据库异常转换为业务异常
        throw new BusinessException("USER_EXISTS", "用户名已存在", e);
    } catch (DataIntegrityViolationException e) {
        // 数据完整性异常
        throw new ValidationException("data", "数据格式不正确", e);
    } catch (Exception e) {
        // 其他数据库异常
        logger.error("创建用户失败，请求: {}", request, e);
        throw new BusinessException("SYSTEM_ERROR", "系统错误，请稍后重试", e);
    }
}
```

#### 保留原始异常信息
```java
// ✅ 正确：保留原始异常作为cause
public void serviceMethod() {
    try {
        daoMethod();
    } catch (SQLException e) {
        throw new BusinessException("DATABASE_ERROR", "数据库操作失败", e);
    }
}

// ❌ 错误：丢失原始异常信息
public void serviceMethod() {
    try {
        daoMethod();
    } catch (SQLException e) {
        throw new BusinessException("DATABASE_ERROR", "数据库操作失败");
        // 原始SQLException信息丢失
    }
}
```

### 4. 异常传播

#### 适当传播异常
```java
// ✅ 正确：在合适层级处理异常
@Service
public class OrderService {

    @Transactional
    public OrderResult createOrder(OrderCreateRequest request) {
        try {
            // 业务逻辑
            validateRequest(request);
            Order order = buildOrder(request);
            orderDao.save(order);
            processPayment(order);
            return OrderResult.success(order);
        } catch (ValidationException e) {
            // 验证异常直接抛出
            throw e;
        } catch (PaymentException e) {
            // 支付异常，可能需要特殊处理
            logger.error("订单支付失败，订单: {}", request, e);
            throw new BusinessException("PAYMENT_FAILED", "支付失败，请检查支付信息", e);
        } catch (Exception e) {
            // 系统异常，记录日志并抛出
            logger.error("创建订单失败，请求: {}", request, e);
            throw new BusinessException("ORDER_CREATE_FAILED", "订单创建失败", e);
        }
    }
}

@Controller
public class OrderController {

    @PostMapping("/orders")
    public ResponseEntity<?> createOrder(@RequestBody OrderCreateRequest request) {
        try {
            OrderResult result = orderService.createOrder(request);
            return ResponseEntity.ok(result);
        } catch (ValidationException e) {
            // 参数验证错误，返回400
            return ResponseEntity.badRequest().body(
                ErrorResponse.of(e.getErrorCode(), e.getMessage()));
        } catch (BusinessException e) {
            // 业务错误，返回422
            return ResponseEntity.unprocessableEntity().body(
                ErrorResponse.of(e.getErrorCode(), e.getMessage()));
        } catch (Exception e) {
            // 系统错误，返回500
            logger.error("创建订单发生未预期错误", e);
            return ResponseEntity.internalServerError().body(
                ErrorResponse.of("INTERNAL_ERROR", "系统繁忙，请稍后重试"));
        }
    }
}
```

## 日志规范

### 日志级别使用

#### DEBUG级别
```java
// 用于调试信息，生产环境通常关闭
logger.debug("开始处理用户请求，用户ID: {}", userId);
logger.debug("SQL查询: {}, 参数: {}", sql, parameters);
logger.debug("方法执行时间: {} ms", executionTime);
```

#### INFO级别
```java
// 用于重要业务操作记录
logger.info("用户登录成功，用户名: {}, IP: {}", username, ip);
logger.info("订单创建成功，订单号: {}, 金额: {}", orderNo, amount);
logger.info("支付处理完成，交易号: {}, 状态: {}", transactionId, status);
```

#### WARN级别
```java
// 用于可恢复的异常或需要注意的情况
logger.warn("用户尝试使用已过期token，用户ID: {}", userId);
logger.warn("支付网关响应超时，订单号: {}, 超时时间: {}ms", orderNo, timeout);
logger.warn("缓存未命中，key: {}, 将查询数据库", cacheKey);
```

#### ERROR级别
```java
// 用于系统错误或不可恢复的异常
logger.error("数据库连接失败，连接信息: {}", connectionInfo, exception);
logger.error("支付处理失败，订单号: {}, 错误码: {}", orderNo, errorCode, exception);
logger.error("用户认证失败，用户名: {}, 原因: {}", username, reason, exception);
```

### 日志格式规范

#### 结构化日志
```java
// ✅ 正确：结构化日志，便于解析
logger.info("订单创建成功 orderNo={} userId={} amount={} status={}",
    order.getOrderNo(),
    order.getUserId(),
    order.getAmount(),
    order.getStatus());

logger.error("支付处理失败 orderNo={} errorCode={} errorMessage={}",
    orderNo,
    errorCode,
    errorMessage,
    exception);

// ❌ 错误：字符串拼接，不利于解析
logger.info("订单创建成功: " + order.getOrderNo() + ", 用户: " + order.getUserId());
```

#### 敏感信息处理
```java
// ✅ 正确：敏感信息脱敏
logger.info("用户登录，用户名: {}, 密码: [PROTECTED], IP: {}",
    username, clientIp);

logger.info("支付信息，卡号: {}, 金额: {}",
    maskCardNumber(cardNumber), amount);

// 密码、密钥等敏感信息不应该记录
// ❌ 错误：记录敏感信息
logger.debug("用户登录，用户名: {}, 密码: {}", username, password);
```

### 日志配置

#### SLF4J + Logback配置
```xml
<!-- logback-spring.xml -->
<configuration>
    <!-- 控制台输出 -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- 文件输出 -->
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>logs/application.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>logs/application.%d{yyyy-MM-dd}.log</fileNamePattern>
            <maxHistory>30</maxHistory>
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- 异步日志 -->
    <appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
        <appender-ref ref="FILE" />
        <queueSize>1000</queueSize>
        <discardingThreshold>0</discardingThreshold>
    </appender>

    <!-- 包级别日志配置 -->
    <logger name="com.company" level="INFO" />
    <logger name="org.springframework" level="WARN" />
    <logger name="org.mybatis" level="DEBUG" />

    <root level="INFO">
        <appender-ref ref="CONSOLE" />
        <appender-ref ref="ASYNC" />
    </root>
</configuration>
```

### 日志最佳实践

#### 1. 日志位置
```java
// ✅ 正确：在方法开始和结束处记录日志
public User getUserById(Long id) {
    logger.debug("开始获取用户信息，用户ID: {}", id);

    try {
        User user = userDao.selectById(id);
        if (user == null) {
            logger.warn("用户不存在，用户ID: {}", id);
            throw new UserNotFoundException(id.toString());
        }

        logger.debug("成功获取用户信息，用户ID: {}, 用户名: {}", id, user.getUserName());
        return user;
    } catch (Exception e) {
        logger.error("获取用户信息失败，用户ID: {}", id, e);
        throw e;
    }
}
```

#### 2. 性能考虑
```java
// ✅ 正确：避免在日志语句中进行复杂计算
if (logger.isDebugEnabled()) {
    logger.debug("复杂计算结果: {}", expensiveCalculation());
}

// ✅ 正确：使用参数化日志
logger.info("用户操作，操作类型: {}, 操作对象: {}", operationType, targetObject);

// ❌ 错误：字符串拼接影响性能
logger.debug("计算结果: " + expensiveCalculation());
```

#### 3. 异常日志
```java
// ✅ 正确：记录异常的完整信息
logger.error("业务处理失败，参数: {}", parameters, exception);

// ✅ 正确：包含上下文信息
logger.error("订单支付失败，订单号: {}, 支付网关: {}, 错误码: {}",
    orderNo, gateway, errorCode, exception);

// ❌ 错误：只记录异常消息
logger.error("处理失败: " + exception.getMessage());

// ❌ 错误：只记录异常对象，没有消息
logger.error("处理失败", exception); // 缺少上下文信息
```

## 异常和日志检查清单

### 异常处理检查
- [ ] 异常分类正确（Checked vs Unchecked）
- [ ] 异常信息详细且有意义
- [ ] 避免空的catch块
- [ ] 捕获特定异常类型
- [ ] 异常转换时保留原始异常
- [ ] 在合适层级处理异常
- [ ] 自定义异常有清晰的层次结构

### 日志检查
- [ ] 正确使用日志级别
- [ ] 使用参数化日志格式
- [ ] 避免记录敏感信息
- [ ] 异常日志包含完整堆栈信息
- [ ] 日志信息包含足够的上下文
- [ ] 考虑日志性能影响
- [ ] 配置合适的日志输出

### 安全考虑
- [ ] 不记录密码、密钥等敏感信息
- [ ] 对卡号、手机号等敏感数据进行脱敏
- [ ] 避免记录完整的SQL语句（可能包含敏感数据）
- [ ] 控制日志文件访问权限
