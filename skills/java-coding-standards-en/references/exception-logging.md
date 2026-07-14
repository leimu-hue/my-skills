# Exception Handling and Logging Standards

## Basic Principles

- Exceptions express failure reasons; don't use them for normal flow control
- Validate parameters at boundaries as early as possible and throw explicit exceptions
- After catching an exception, you must handle, transform, or rethrow it; no empty `catch` blocks or `printStackTrace()`
- When transforming exceptions, preserve the original exception as the `cause`
- By default, a global exception handler should uniformly convert to HTTP responses; Controllers should not write repetitive `try/catch`
- Don't log the same exception at ERROR level across multiple layers; log primarily at the final handling boundary
- Exception messages use i18n message keys (errorCode doubles as message key); no hardcoded text in code. User-visible messages are resolved by `MessageSource` per locale
- Error codes must be declared as constants in a centralized `ErrorCodes` class; reference them by class name in business code — inline string literals are forbidden
- Log text must be in English for international team searchability and log-platform alerting rules

## Global Exception Handling Solution Selection

Choose by scenario; stay consistent within a project:

| Solution | Applicable Scenario | Advantage |
| --- | --- | --- |
| `ErrorResponse` + `MessageSource` | Internal management systems, multi-language enterprise projects | Full i18n support, errorCode as message key, resolved per locale |
| `ProblemDetail` (RFC 7807) | Open platforms, inter-microservice REST APIs | Spring Boot 3 standard, structured error body, cross-language |

This document uses `ErrorResponse` + `MessageSource`. `ProblemDetail` examples in `./design.md` Global Exception Handling section.

## Exception Classification

| Type | Applicable Scenario | Recommendation |
| --- | --- | --- |
| Checked Exception | External failures that callers can recover from and must explicitly handle: files, network, IO | Use only when the caller truly needs to handle it |
| Runtime Exception | Illegal parameters, business rule failures, unrecoverable system errors | Default choice for business code |
| BusinessException | Expected business failures: user not found, insufficient balance, duplicate submission | Carry a stable error code (i18n message key) and interpolation args; message text resolved by MessageSource |
| SystemException | Database, cache, RPC, unknown system failures | Return generic message externally; preserve cause in logs |

Business exception definition (carries i18n interpolation args; message text delegated to `MessageSource`):

```java
public class BusinessException extends RuntimeException {
    private final String errorCode;   // also serves as i18n message key
    private final Object[] args;      // interpolation arguments

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

Centralized `ErrorCodes` constants class (error codes declared once, referenced by class name everywhere — change one place, update everywhere):

```java
public final class ErrorCodes {
    private ErrorCodes() {}

    // --- User module ---
    public static final String USER_ID_INVALID    = "USER_ID_INVALID";
    public static final String USER_NOT_FOUND     = "USER_NOT_FOUND";
    public static final String USER_EXISTS        = "USER_EXISTS";
    public static final String USER_CREATE_FAILED = "USER_CREATE_FAILED";

    // --- General ---
    public static final String INTERNAL_ERROR = "INTERNAL_ERROR";
    public static final String DB_ERROR       = "DB_ERROR";
```

Corresponding `messages.properties` resource files (keys match `ErrorCodes` constants one-to-one):

```properties
# messages.properties (default / English)
USER_ID_INVALID=User ID must be greater than 0, actual: {0}
USER_NOT_FOUND=User not found: {0}
USER_EXISTS=Username already exists: {0}
USER_CREATE_FAILED=Failed to create user, please try again later
INTERNAL_ERROR=Internal server error
DB_ERROR=Database operation failed, please try again later

# messages_zh_CN.properties (Chinese)
USER_ID_INVALID=用户ID必须大于0，实际值：{0}
USER_NOT_FOUND=用户不存在：{0}
USER_EXISTS=用户名已存在：{0}
USER_CREATE_FAILED=用户创建失败，请稍后重试
INTERNAL_ERROR=系统繁忙，请稍后重试
DB_ERROR=数据库操作失败，请稍后重试
```

## Throwing and Transformation

### Parameter and Business Validation

- Null, invalid format, or out-of-range parameters: prefer `IllegalArgumentException` or the project's unified `ValidationException`
- Unsatisfied business rules: throw explicit business exceptions with stable error codes
- Exception messages should include necessary context but must not contain sensitive data like passwords, keys, full ID numbers, or full card numbers

```java
public User getUserById(Long id) {
    if (id == null || id <= 0) {
        throw new ValidationException(ErrorCodes.USER_ID_INVALID, id);
    }
    return userRepository.findById(id)
        .orElseThrow(() -> new BusinessException(ErrorCodes.USER_NOT_FOUND, id));
}
```

### Low-Level Exception Transformation

- Repository / Client / Adapter layers may catch low-level exceptions and transform them into project exceptions
- When transforming, always pass the original exception to preserve the stack trace
- Do not expose low-level error details directly to external users

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

## Catch Boundaries

Recommended handling locations:

- Service: handle business compensation, exception transformation, transaction rollback semantics
- Adapter / Client: transform third-party, RPC, SDK, and IO exceptions
- GlobalExceptionHandler: unify HTTP status codes, error responses, and final logging
- Controller: by default, don't catch exceptions unless the endpoint has explicit local recovery logic

```java
@RestControllerAdvice
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final MessageSource messageSource;

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusiness(BusinessException e, Locale locale) {
        // Resolve user-visible message via MessageSource per locale
        String userMessage = messageSource.getMessage(
            e.getErrorCode(), e.getArgs(), e.getErrorCode(), locale);
        // Log in English + structured fields; do not log resolved locale-specific text
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

## Log Levels

| Level | Usage | Do NOT Use For |
| --- | --- | --- |
| DEBUG | Debug details, parameter summaries, branch decisions, timing breakdowns | Default production audit |
| INFO | Key business results, state transitions, external task start/end | High-frequency loops, sensitive parameters |
| WARN | Recoverable failures, expected business failures, degradation, retries, cache misses | Noise already handled by callers |
| ERROR | Unrecoverable system errors, unknown exceptions, data inconsistencies, persistent external dependency failures | Routine parameter validation and expected business failures |

## Log Writing

### Parameterized Logging and Context

- Use parameterized logging; don't concatenate strings
- Logs must include troubleshooting context: `orderNo`, `userId`, `requestId`, `gateway`, `errorCode`
- Put the exception object as the last parameter to preserve the full stack trace

```java
log.info("Order created orderNo={} userId={} amount={}",
    orderNo, userId, amount);

log.error("Payment processing failed orderNo={} gateway={} errorCode={}",
    orderNo, gateway, errorCode, exception);
```

### Sensitive Information

Prohibited in logs:

- Passwords, tokens, sessions, cookies, API keys, private keys
- Full phone numbers, ID numbers, bank card numbers, email addresses, physical addresses
- Complete SQL parameters, complete third-party request/response bodies that may contain private data

When logging is necessary, mask the data:

```java
log.info("User login username={} phone={} ip={}",
    username, maskPhone(phone), clientIp);
```

### Internationalization and Log Text

- Log text must be in English for log-platform keyword search, alerting rule configuration, and international team collaboration
- User-facing error messages are resolved by `MessageSource` per locale; never hardcoded in log or exception messages
- Logs record errorCode + args, not resolved locale-specific text (avoids inconsistency across locales, which hinders search)

```java
// ✅ Log: English + structured fields
log.warn("Business rule violation ruleCode={} userId={} errorCode={}",
    ruleCode, userId, e.getErrorCode());

// ❌ Forbidden: hardcoded non-English text in logs
log.error("处理用户订单失败 userId={}", userId, e);

// ❌ Forbidden: writing resolved locale message to log (content differs across environments)
log.error(messageSource.getMessage("ORDER_FAILED", null, locale), e);
```

### Performance

- Check `log.isDebugEnabled()` before high-frequency DEBUG logs
- Don't invoke expensive computations, remote calls, or large-object serialization directly in log parameters
- For large objects, log only summaries, IDs, counts, and status — not the full content

```java
if (log.isDebugEnabled()) {
    log.debug("Complex rule evaluation result={}", buildDebugSummary(result));
}
```

## Common Anti-Patterns

```java
catch (Exception e) {
    // FORBIDDEN: silently swallowing the exception
}

catch (Exception e) {
    e.printStackTrace(); // FORBIDDEN: bypasses the logging framework
}

log.error("Processing failed: " + e.getMessage()); // FORBIDDEN: loses stack trace and uses string concatenation

// FORBIDDEN: hardcoded message text, loses cause and i18n support
throw new BusinessException("DB_ERROR", "Database failure");

// FORBIDDEN: inline string literal error code — cannot track usage, easy to typo
throw new BusinessException("DB_ERROR", e, tableName);

// ✅ Correct: reference ErrorCodes constant, pass args, preserve cause
throw new BusinessException(ErrorCodes.DB_ERROR, e, tableName);
```