# Secure Coding Standards

## Basic Principles

- All external input is untrusted by default: HTTP parameters, headers, cookies, files, message queues, third-party callbacks, database query results
- Prefer framework security capabilities and mature libraries; don't hand-write crypto algorithms, HTML/JS encoders, or auth frameworks
- Place security controls at boundaries and shared layers: parameter validation, authentication/authorization, exception responses, log masking, SQL parameter binding
- Whitelist over blacklist; when whitelisting is impossible, at least constrain length, format, range, and character set
- Never expose passwords, tokens, keys, full ID numbers, full card numbers, or full phone numbers in logs, exceptions, or responses

## Input Validation

| Input Type | Required Validation |
| --- | --- |
| String | Non-empty, length, character set, business format |
| Numeric | Min, max, precision, unit |
| Enum | Must be in known enum or whitelist |
| List | Max count, element format, deduplication rules |
| File | Size, extension, MIME, content signature, storage path |
| URL / Callback | Protocol, domain, port, internal network address restriction |

```java
public void createUser(UserCreateRequest request) {
    if (request == null || StringUtils.isBlank(request.getUserName())) {
        throw new ValidationException(ErrorCodes.USER_NAME_BLANK);
    }
    if (!USERNAME_PATTERN.matcher(request.getUserName()).matches()) {
        throw new ValidationException(ErrorCodes.USER_NAME_INVALID_FORMAT);
    }
}
```

## SQL Injection Prevention

- Always parameterize SQL values: JDBC `PreparedStatement`, MyBatis `#{}`, JPA parameter binding
- Never concatenate user input to construct SQL
- MyBatis `${}` may only be used for table names, column names, sort directions, and other non-parameterizable positions, and must be mapped from a server-side whitelist
- `LIKE` queries also use bound parameters; don't concatenate raw input
- Database accounts should use least privilege; don't grant DDL or cross-schema access to application accounts

```java
@Select("SELECT id, user_name FROM sys_user WHERE user_name = #{userName}")
User findByUserName(@Param("userName") String userName);

private static final Map<String, String> SORT_FIELD = Map.of(
    "createTime", "create_time",
    "userName", "user_name"
);

public String resolveSortField(String field) {
    return SORT_FIELD.getOrDefault(field, "create_time");
}
```

## XSS and Output Encoding

- XSS prevention focuses on "encoding per output context," not just filtering on input
- HTML content, HTML attributes, JavaScript strings, and URL parameters use different encoding methods
- Prefer template engine auto-escaping or OWASP Java Encoder
- Rich text must use a reliable HTML sanitizer, allowing only a limited set of tags and attributes
- Start CSP from a strict policy; `unsafe-inline` is only a compatibility exception and should have a migration plan

```java
String html = Encode.forHtml(userInput);
String attr = Encode.forHtmlAttribute(userInput);
String js = Encode.forJavaScript(userInput);
String url = URLEncoder.encode(userInput, StandardCharsets.UTF_8);
```

Recommended security response headers:

```text
Content-Security-Policy: default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

## CSRF

- When browser cookies automatically carry identity credentials, mutating requests must consider CSRF
- Spring Security form login and session cookie scenarios should enable CSRF by default
- Pure Bearer Token APIs that don't rely on cookies may disable CSRF per the project security plan, but the reason must be documented
- Cookies should set `HttpOnly`, `Secure`, and an appropriate `SameSite`
- GET, HEAD, and OPTIONS must not perform side-effect operations

## Sensitive Data and Passwords

- Store only strong password hashes: BCrypt, Argon2, PBKDF2; never use MD5, SHA-1, or raw SHA-256 for password hashing
- Password policy includes min/max length and weak-password interception; error messages should avoid revealing whether an account exists
- Tokens, keys, and secrets go in config centers, KMS, environment variables, or secret management systems; never hardcode in the repository
- For reversible encryption, prefer a security-reviewed unified encryption component; self-implementation must at minimum use an authenticated mode like AES-GCM with proper random IV/nonce management
- Logs and responses should only output masked phone numbers, emails, ID numbers, and card numbers

```java
String encoded = passwordEncoder.encode(rawPassword);
boolean matched = passwordEncoder.matches(rawPassword, encoded);
```

## Access Control

- Default deny, explicitly allow
- Authentication only proves "who"; authorization must determine "whether this resource can be accessed"
- Validate both interface permissions and data-level permissions; don't rely solely on hiding UI buttons
- Object-level permissions should be checked at the Service or method security layer, e.g. an order can only be accessed by its owner or an admin
- High-risk operations (admin actions, exports, approvals, payments, deletions) require stricter auditing and, when necessary, secondary confirmation or MFA

```java
@PreAuthorize("hasRole('ADMIN') or @orderPermission.canRead(authentication, #orderId)")
public Order getOrder(Long orderId) {
    return orderRepository.findById(orderId)
        .orElseThrow(() -> new OrderNotFoundException(orderId));
}
```

## Sessions and Cookies

- Renew the Session ID after login to prevent session fixation
- On logout, clear server-side session and related cookies
- Cookie-based auth scenarios should set `HttpOnly`, `Secure`, and `SameSite`
- Remember-me, refresh tokens, and long-lived sessions must be revocable with limited lifetimes
- High-risk operations should not fully trust long-lived sessions; require re-authentication when necessary

## Files and Paths

- Uploaded files: limit size, extension, MIME, and content signature
- Generate filenames server-side; don't trust user-supplied original filenames
- Use a fixed root directory and normalized paths for storage; prevent `../` path traversal
- Validate access permissions when downloading files; don't expose real server paths directly
- Zip extraction must prevent Zip Slip and limit total extracted size and file count

## Rate Limiting and Abuse Prevention

- High-risk entry points (login, registration, password reset, sensitive APIs) must be rate-limited
- Prefer gateway or filter-layer unified rate limiting; for single-node fallback, use Bucket4j or Guava RateLimiter
- Rate limit thresholds should vary by scenario: looser for public endpoints, stricter for internal ones
- Rate limit failures return `429 Too Many Requests`; logs should include source IP, userId, and interface path

## Security Logging

Must log:

- Login success/failure, logout, password reset, MFA changes
- Permission denied, unauthorized access attempts, critical config changes
- High-risk operations: payments, exports, deletions, approvals
- Security policy hits: rate limiting, CAPTCHA, risk engine, anomalous IPs

Log requirements:

- Use a dedicated security/audit logger or queryable fields
- Include `userId`, `requestId`, `ip`, `resource`, `action`, `result`
- Sensitive data must be masked
- Define explicit retention periods and access controls
