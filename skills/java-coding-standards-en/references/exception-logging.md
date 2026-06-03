# Exception Handling and Logging Standards

## Basic Principles

- Exceptions express failure reasons; don't use them for normal flow control
- Validate parameters at boundaries as early as possible and throw explicit exceptions
- After catching an exception, you must handle, transform, or rethrow it; no empty `catch` blocks or `printStackTrace()`
- When transforming exceptions, preserve the original exception as the `cause`
- By default, a global exception handler should uniformly convert to HTTP responses; Controllers should not write repetitive `try/catch`
- Don't log the same exception at ERROR level across multiple layers; log primarily at the final handling boundary

## Exception Classification

| Type | Applicable Scenario | Recommendation |
| --- | --- | --- |
| Checked Exception | External failures that callers can recover from and must explicitly handle: files, network, IO | Use only when the caller truly needs to handle it |
| Runtime Exception | Illegal parameters, business rule failures, unrecoverable system errors | Default choice for business code |
| BusinessException | Expected business failures: user not found, insufficient balance, duplicate submission | Include a stable error code and user-understandable message |
| SystemException | Database, cache, RPC, unknown system failures | Return generic message externally; preserve cause in logs |

Business exception example:

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

## Throwing and Transformation

### Parameter and Business Validation

- Null, invalid format, or out-of-range parameters: prefer `IllegalArgumentException` or the project's unified `ValidationException`
- Unsatisfied business rules: throw explicit business exceptions with stable error codes
- Exception messages should include necessary context but must not contain sensitive data like passwords, keys, full ID numbers, or full card numbers

```java
public User getUserById(Long id) {
    if (id == null || id <= 0) {
        throw new IllegalArgumentException("User ID must be greater than 0");
    }
    return userRepository.findById(id)
        .orElseThrow(() -> new UserNotFoundException(id));
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
        throw new BusinessException("USER_EXISTS", "Username already exists", e);
    } catch (DataAccessException e) {
        throw new SystemException("USER_CREATE_FAILED", "User creation failed", e);
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
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusiness(BusinessException e) {
        log.warn("Business failure code={} message={}", e.getErrorCode(), e.getMessage());
        return ResponseEntity.unprocessableEntity()
            .body(ErrorResponse.of(e.getErrorCode(), e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnknown(Exception e) {
        log.error("Unexpected system error", e);
        return ResponseEntity.internalServerError()
            .body(ErrorResponse.of("INTERNAL_ERROR", "System busy, please retry later"));
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
log.info("Order created successfully orderNo={} userId={} amount={}",
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

throw new BusinessException("DB_ERROR", "Database failure"); // AVOID: loses the cause
```

## Checklist

### Exceptions

- [ ] Parameter and business validation fails early
- [ ] Specific exceptions are caught, not blanket `Exception`
- [ ] After catching, the exception is handled, transformed, or rethrown
- [ ] Exception transformation preserves the original `cause`
- [ ] Controller does not duplicate global exception handling logic
- [ ] External messages are safe, stable, and understandable

### Logging

- [ ] Log level matches the impact scope
- [ ] Uses parameterized logging
- [ ] Exception logs include full stack trace
- [ ] Logs contain troubleshooting context
- [ ] No sensitive information in plaintext
- [ ] High-frequency or complex logging considers performance impact
