# 异常处理与日志规范

## 基本原则

- 异常用于表达失败原因，不用于普通流程控制
- 能在边界处校验的参数，尽早校验并抛出明确异常
- 捕获异常后必须处理、转换或继续抛出，禁止空 `catch`、`printStackTrace()`
- 转换异常时保留原始异常作为 `cause`
- 默认由全局异常处理器统一转换 HTTP 响应，Controller 不手写重复 `try/catch`
- 同一个异常不要在多层重复打 ERROR 日志；优先在最终处理边界记录

## 异常分类

| 类型 | 适用场景 | 建议 |
| --- | --- | --- |
| Checked Exception | 调用方可恢复且必须显式处理的外部失败，如文件、网络、IO | 只在确实需要调用方处理时使用 |
| Runtime Exception | 参数非法、业务规则失败、不可恢复系统错误 | 业务代码默认使用 |
| BusinessException | 业务可预期失败，如用户不存在、余额不足、重复提交 | 带稳定错误码和用户可理解消息 |
| SystemException | 数据库、缓存、RPC、未知系统失败 | 对外返回泛化消息，日志保留 cause |

业务异常示例：

```java
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
}
```

## 抛出与转换

### 参数与业务校验

- 参数为空、格式非法、范围非法：优先 `IllegalArgumentException` 或项目统一的 `ValidationException`
- 业务规则不满足：抛出明确的业务异常，错误码保持稳定
- 异常消息包含必要上下文，但不要包含密码、密钥、完整证件号、完整卡号等敏感信息

```java
public User getUserById(Long id) {
    if (id == null || id <= 0) {
        throw new IllegalArgumentException("用户ID必须大于0");
    }
    return userRepository.findById(id)
        .orElseThrow(() -> new UserNotFoundException(id));
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
        throw new BusinessException("USER_EXISTS", "用户名已存在", e);
    } catch (DataAccessException e) {
        throw new SystemException("USER_CREATE_FAILED", "用户创建失败", e);
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
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusiness(BusinessException e) {
        log.warn("业务处理失败 code={} message={}", e.getErrorCode(), e.getMessage());
        return ResponseEntity.unprocessableEntity()
            .body(ErrorResponse.of(e.getErrorCode(), e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnknown(Exception e) {
        log.error("未预期系统异常", e);
        return ResponseEntity.internalServerError()
            .body(ErrorResponse.of("INTERNAL_ERROR", "系统繁忙，请稍后重试"));
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
log.info("订单创建成功 orderNo={} userId={} amount={}",
    orderNo, userId, amount);

log.error("支付处理失败 orderNo={} gateway={} errorCode={}",
    orderNo, gateway, errorCode, exception);
```

### 敏感信息

禁止记录：

- 密码、token、session、cookie、API key、私钥
- 完整手机号、身份证号、银行卡号、邮箱、地址
- 完整 SQL 参数、完整第三方请求/响应中可能包含隐私的数据

需要记录时必须脱敏：

```java
log.info("用户登录 username={} phone={} ip={}",
    username, maskPhone(phone), clientIp);
```

### 性能

- 高频 DEBUG 日志前先判断 `log.isDebugEnabled()`
- 不在日志参数中直接调用昂贵计算、远程请求或序列化大对象
- 大对象只记录摘要、ID、数量、状态，不直接输出完整内容

```java
if (log.isDebugEnabled()) {
    log.debug("复杂规则计算结果 result={}", buildDebugSummary(result));
}
```

## 常见反例

```java
catch (Exception e) {
    // 禁止：静默吞掉异常
}

catch (Exception e) {
    e.printStackTrace(); // 禁止：绕过日志框架
}

log.error("处理失败: " + e.getMessage()); // 禁止：丢堆栈且字符串拼接

throw new BusinessException("DB_ERROR", "数据库失败"); // 避免：丢失 cause
```

## 检查清单

### 异常

- [ ] 参数和业务校验尽早失败
- [ ] 捕获的是具体异常，不是无理由捕获 `Exception`
- [ ] 捕获后有处理、转换或继续抛出
- [ ] 异常转换保留原始 `cause`
- [ ] Controller 未重复手写全局异常处理逻辑
- [ ] 对外消息安全、稳定、可理解

### 日志

- [ ] 日志级别符合影响范围
- [ ] 使用参数化日志
- [ ] 异常日志带完整堆栈
- [ ] 日志包含排查上下文
- [ ] 没有敏感信息明文
- [ ] 高频或复杂日志考虑性能影响
