# 异常处理与日志规范

## 基本原则

- 异常用于表达失败原因，不用于普通流程控制
- 能在边界处校验的参数，尽早校验并抛出明确异常
- 捕获异常后必须处理、转换或继续抛出，禁止空 `catch`、`printStackTrace()`
- 转换异常时保留原始异常作为 `cause`
- 默认由全局异常处理器统一转换 HTTP 响应，Controller 不手写重复 `try/catch`
- 同一个异常不要在多层重复打 ERROR 日志；优先在最终处理边界记录
- 异常消息使用国际化消息 key（errorCode 即 message key），不在代码中硬编码中文；用户可见消息通过 `MessageSource` 按 locale 解析
- 错误码必须以常量形式集中声明在 `ErrorCodes` 类中，业务代码通过类名引用，禁止内联字符串字面量
- 日志文本统一使用英文，便于国际化团队检索和日志平台关键词告警

## 异常分类

| 类型 | 适用场景 | 建议 |
| --- | --- | --- |
| Checked Exception | 调用方可恢复且必须显式处理的外部失败，如文件、网络、IO | 只在确实需要调用方处理时使用 |
| Runtime Exception | 参数非法、业务规则失败、不可恢复系统错误 | 业务代码默认使用 |
| BusinessException | 业务可预期失败，如用户不存在、余额不足、重复提交 | 携带稳定错误码（即 i18n message key）和插值参数，消息文本由 MessageSource 解析 |
| SystemException | 数据库、缓存、RPC、未知系统失败 | 对外返回泛化消息，日志保留 cause |

业务异常定义（携带 i18n 插值参数，消息文本交给 `MessageSource` 解析）：

```java
public class BusinessException extends RuntimeException {
    private final String errorCode;   // 同时作为 i18n message key
    private final Object[] args;      // 消息插值参数

    public BusinessException(String errorCode, Object... args) {
        super(errorCode);
        this.errorCode = errorCode;
        this.args = args;
    }

    public BusinessException(String errorCode, Throwable cause, Object... args) {
        super(errorCode, cause);
        this.errorCode = errorCode;
        this.args = args;
    }

    public String getErrorCode() { return errorCode; }
    public Object[] getArgs()    { return args; }
}
```

对应的 `ErrorCodes` 常量类（错误码集中声明，业务代码通过类名引用，修改只需改一处）：

```java
public final class ErrorCodes {
    private ErrorCodes() {}

    // --- 用户模块 ---
    public static final String USER_ID_INVALID    = "USER_ID_INVALID";
    public static final String USER_NOT_FOUND     = "USER_NOT_FOUND";
    public static final String USER_EXISTS        = "USER_EXISTS";
    public static final String USER_CREATE_FAILED = "USER_CREATE_FAILED";

    // --- 通用 ---
    public static final String INTERNAL_ERROR = "INTERNAL_ERROR";
}
```

对应的 `messages.properties` 资源文件（key 与 `ErrorCodes` 常量一一对应）：

```properties
# messages.properties（默认 / 英文）
USER_ID_INVALID=User ID must be greater than 0, actual: {0}
USER_NOT_FOUND=User not found: {0}
USER_EXISTS=Username already exists: {0}
USER_CREATE_FAILED=Failed to create user, please try again later
INTERNAL_ERROR=Internal server error

# messages_zh_CN.properties（中文）
USER_ID_INVALID=用户ID必须大于0，实际值：{0}
USER_NOT_FOUND=用户不存在：{0}
USER_EXISTS=用户名已存在：{0}
USER_CREATE_FAILED=用户创建失败，请稍后重试
INTERNAL_ERROR=系统繁忙，请稍后重试
```

## 抛出与转换

### 参数与业务校验

- 参数为空、格式非法、范围非法：优先 `IllegalArgumentException` 或项目统一的 `ValidationException`
- 业务规则不满足：抛出明确的业务异常，错误码保持稳定
- 异常消息包含必要上下文，但不要包含密码、密钥、完整证件号、完整卡号等敏感信息

```java
public User getUserById(Long id) {
    if (id == null || id <= 0) {
        throw new ValidationException(ErrorCodes.USER_ID_INVALID, id);
    }
    return userRepository.findById(id)
        .orElseThrow(() -> new BusinessException(ErrorCodes.USER_NOT_FOUND, id));
}
```

### 底层异常转换

- Repository / Client / Adapter 层可捕获底层异常并转换为项目异常
- 转换时必须传入原始异常，避免丢失堆栈
- 不要把底层错误细节直接暴露给外部用户

```java
public User createUser(UserCreateRequest request) {
    try {
        return userRepository.save(request.toUser());
    } catch (DuplicateKeyException e) {
        throw new BusinessException(ErrorCodes.USER_EXISTS, e, request.getUsername());
    } catch (DataAccessException e) {
        throw new SystemException(ErrorCodes.USER_CREATE_FAILED, e);
    }
}
```

## 捕获边界

推荐处理位置：

- Service：处理业务补偿、异常转换、事务回滚语义
- Adapter / Client：转换第三方、RPC、SDK、IO 异常
- GlobalExceptionHandler：统一 HTTP 状态码、错误响应、最终日志
- Controller：默认不捕获异常，除非该接口有明确局部恢复逻辑

```java
@RestControllerAdvice
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final MessageSource messageSource;

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusiness(BusinessException e, Locale locale) {
        // 通过 MessageSource 按 locale 解析用户可见消息
        String userMessage = messageSource.getMessage(
            e.getErrorCode(), e.getArgs(), e.getErrorCode(), locale);
        // 日志使用英文 + 结构化字段，不记录解析后的本地化文本
        log.warn("Business error code={} args={}", e.getErrorCode(), e.getArgs());
        return ResponseEntity.unprocessableEntity()
            .body(ErrorResponse.of(e.getErrorCode(), userMessage));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnknown(Exception e, Locale locale) {
        log.error("Unexpected system error", e);
        String userMessage = messageSource.getMessage(
            ErrorCodes.INTERNAL_ERROR, null, "Internal server error", locale);
        return ResponseEntity.internalServerError()
            .body(ErrorResponse.of(ErrorCodes.INTERNAL_ERROR, userMessage));
    }
}
```

## 日志级别

| 级别 | 使用场景 | 不要用于 |
| --- | --- | --- |
| DEBUG | 调试细节、入参摘要、分支选择、耗时明细 | 默认生产审计 |
| INFO | 关键业务结果、状态流转、外部任务启动/结束 | 高频循环、敏感参数 |
| WARN | 可恢复失败、业务预期失败、降级、重试、缓存异常 | 已由调用方正常处理的噪声 |
| ERROR | 不可恢复系统错误、未知异常、数据不一致、外部依赖持续失败 | 普通参数校验和可预期业务失败 |

## 日志写法

### 参数化与上下文

- 使用参数化日志，不拼接字符串
- 日志必须包含排查所需上下文，如 `orderNo`、`userId`、`requestId`、`gateway`、`errorCode`
- 异常对象放在最后一个参数，保留完整堆栈

```java
log.info("Order created orderNo={} userId={} amount={}",
    orderNo, userId, amount);

log.error("Payment processing failed orderNo={} gateway={} errorCode={}",
    orderNo, gateway, errorCode, exception);
```

### 敏感信息

禁止记录：

- 密码、token、session、cookie、API key、私钥
- 完整手机号、身份证号、银行卡号、邮箱、地址
- 完整 SQL 参数、完整第三方请求/响应中可能包含隐私的数据

需要记录时必须脱敏：

```java
log.info("User login username={} phone={} ip={}",
    username, maskPhone(phone), clientIp);
```

### 国际化与日志文本

- 日志文本统一使用英文，便于日志平台关键词检索、告警规则配置和国际化团队协作
- 面向用户的错误提示通过 `MessageSource` 按 locale 解析，不写死在日志或异常消息中
- 日志中记录 errorCode + args，不记录解析后的本地化文本（避免同一条日志在不同 locale 下内容不一致，影响检索）

```java
// ✅ 日志：英文 + 结构化字段
log.warn("Business rule violation ruleCode={} userId={} errorCode={}",
    ruleCode, userId, e.getErrorCode());

// ❌ 禁止：日志中硬编码中文
log.error("处理用户订单失败 userId={}", userId, e);

// ❌ 禁止：将解析后的 locale 消息写入日志（不同环境下内容不一致）
log.error(messageSource.getMessage("ORDER_FAILED", null, locale), e);
```

### 性能

- 高频 DEBUG 日志前先判断 `log.isDebugEnabled()`
- 不在日志参数中直接调用昂贵计算、远程请求或序列化大对象
- 大对象只记录摘要、ID、数量、状态，不直接输出完整内容

```java
if (log.isDebugEnabled()) {
    log.debug("Complex rule evaluation result={}", buildDebugSummary(result));
}
```

## 常见反例

```java
catch (Exception e) {
    // Forbidden: silently swallowing exceptions
}

catch (Exception e) {
    e.printStackTrace(); // Forbidden: bypasses logging framework
}

log.error("Processing failed: " + e.getMessage()); // Forbidden: loses stack trace + string concat

// Forbidden: hardcoded Chinese message, loses cause and i18n support
throw new BusinessException("DB_ERROR", "数据库失败");

// Forbidden: inline string literal error code — cannot track usage, easy to typo
throw new BusinessException("DB_ERROR", e, tableName);

// ✅ Correct: reference ErrorCodes constant, pass args, preserve cause
throw new BusinessException(ErrorCodes.DB_ERROR, e, tableName);
```

## 检查清单

### 异常

- [ ] 参数和业务校验尽早失败
- [ ] 捕获的是具体异常，不是无理由捕获 `Exception`
- [ ] 捕获后有处理、转换或继续抛出
- [ ] 异常转换保留原始 `cause`
- [ ] 异常使用错误码（i18n message key）+ 插值参数，不硬编码中文
- [ ] 错误码通过 `ErrorCodes` 常量类引用，不内联字符串字面量
- [ ] Controller 未重复手写全局异常处理逻辑
- [ ] 对外消息通过 `MessageSource` 按 locale 解析，安全、稳定、可理解

### 日志

- [ ] 日志文本统一使用英文
- [ ] 日志级别符合影响范围
- [ ] 使用参数化日志
- [ ] 异常日志带完整堆栈
- [ ] 日志包含排查上下文（errorCode + args，而非解析后的本地化文本）
- [ ] 没有敏感信息明文
- [ ] 高频或复杂日志考虑性能影响

### 国际化

- [ ] `messages.properties` 为每个 `ErrorCodes` 常量提供对应翻译，key 与常量值严格一致
- [ ] 多语言资源文件（`messages_zh_CN.properties` 等）与默认文件 key 保持同步
- [ ] `MessageSource` 配置了合理的 default locale 和 fallback 策略
