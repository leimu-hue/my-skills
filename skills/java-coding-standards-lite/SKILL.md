---
name: java-coding-standards-lite
description: Practical Java coding standards for everyday Java and Spring development. Use this skill whenever you create or edit `.java` files, service logic, controller code, repository code, DTOs, exception handling, validation, tests, or SQL-related Java snippets. Focus on clear guard clauses, consistent null and collection checks, safe string handling, constructor injection, parameterized SQL, and readable production code that matches the existing project stack.
license: MIT
compatibility:
  - requires: "**/*.java"
---

# Java Coding Standards Lite

Practical Java guidance distilled from common enterprise conventions and Alibaba Java Coding Guidelines. Keep the main rules short, predictable, and easy to apply in normal code generation.

## When to apply

Apply these rules whenever working on:

- Java classes, interfaces, enums, and records
- Spring controllers, services, repositories, and configuration
- DTOs, request/response objects, and validation logic
- Exception handling, logging, and defensive coding
- SQL embedded in Java annotations, XML, or builder code
- Unit tests and integration tests for Java code

## Core rules

### 1. Prefer guard clauses

Reject invalid input early and keep the happy path flat.

```java
public void process(User user) {
    if (user == null) {
        log.warn("User is null");
        return;
    }
    if (StringUtils.isBlank(user.getName())) {
        log.warn("User name is blank");
        return;
    }

    executeLogic(user);
}
```

Avoid deep nesting when a return, continue, or throw makes the flow clearer.

### 2. Follow the project's utility style

- Use `StringUtils` for blank, empty, trim, and default-string handling when the project already depends on Apache Commons or Spring string utilities.
- Use `CollectionUtils` or `MapUtils` when those utilities are already part of the codebase.
- Do not introduce a new utility dependency just for a small check if the project uses plain JDK style.
- Be consistent inside the file you are editing.

```java
if (StringUtils.isBlank(request.getUserName())) {
    throw new ValidationException("userName", "用户名不能为空");
}

if (CollectionUtils.isEmpty(users)) {
    return Collections.emptyList();
}
```

### 3. Null safety over dogma

- Use whichever null-check style matches the existing project: `obj == null` / `obj != null` or `Objects.isNull` / `Objects.nonNull`.
- Prefer the most readable form in the local context.
- For collections and maps, prefer a single clear empty-check path instead of repeated null branching.
- Validate external input before dereferencing.

```java
if (request == null) {
    throw new IllegalArgumentException("request must not be null");
}

if (id <= 0) {
    throw new IllegalArgumentException("id must be greater than 0");
}
```

### 4. Handle exceptions deliberately

- Never use empty `catch` blocks.
- Catch specific exceptions when you can do something meaningful.
- Log with business context.
- Re-throw or translate low-level exceptions into domain-friendly exceptions.
- Preserve the original exception as `cause`.

```java
try {
    processOrder(order);
} catch (BusinessException e) {
    log.warn("Business error processing order: {}", order.getId(), e);
    throw e;
} catch (Exception e) {
    log.error("System error processing order: {}", order.getId(), e);
    throw new BusinessException("SYSTEM_ERROR", "System busy, please retry", e);
}
```

### 5. Prefer constructor injection

Use constructor injection for Spring beans. It makes dependencies explicit and improves testability.

```java
@Service
public class UserService {

    private final UserRepository userRepository;
    private final EmailService emailService;

    public UserService(UserRepository userRepository, EmailService emailService) {
        this.userRepository = userRepository;
        this.emailService = emailService;
    }
}
```

### 6. Validate input at boundaries

Validate controller input, message payloads, scheduled job parameters, and third-party responses before business processing.

```java
public void createUser(UserCreateRequest request) {
    if (request == null) {
        throw new IllegalArgumentException("request must not be null");
    }
    if (StringUtils.isBlank(request.getUserName())) {
        throw new ValidationException("userName", "用户名不能为空");
    }
    if (!InputValidator.isValidEmail(request.getEmail())) {
        throw new ValidationException("email", "邮箱格式不正确");
    }
}
```

### 7. Prevent SQL injection

- Use parameterized SQL and framework placeholders.
- Never concatenate user input into SQL.
- Prefer explicit column lists over `SELECT *`.

```java
@Select("SELECT id, user_name, email FROM users WHERE user_name = #{userName}")
User findByUserName(@Param("userName") String userName);

String sql = "SELECT id, user_name, email FROM users WHERE user_name = '" + userName + "'";
// Never build SQL this way.
```

### 8. Keep tests focused and readable

- Test success, validation failure, and important edge cases.
- Keep setup data obvious.
- Verify behavior, not incidental implementation details.

```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @Test
    void createUser_success() {
        UserCreateRequest request = TestDataFactory.validUserCreateRequest();
        User savedUser = UserBuilder.aUser().build();
        when(userRepository.save(any())).thenReturn(savedUser);

        User result = userService.createUser(request);

        assertNotNull(result);
        verify(userRepository).save(any());
    }
}
```

## Working style

When generating or editing Java code:

1. Read nearby code first and match the project's existing idioms.
2. Prefer clear names and short methods over clever abstractions.
3. Keep controller logic thin and service logic cohesive.
4. Avoid broad framework changes unless the task requires them.
5. Add or update tests when behavior changes.

## Common violations to avoid

- Deeply nested `if` blocks where guard clauses are clearer
- Empty catch blocks or `printStackTrace()` in production code
- Field injection with `@Autowired`
- SQL built by string concatenation
- Unvalidated external input
- Inconsistent null-check style inside the same file
- Introducing new helper libraries without project precedent

## Reference files

Read these when the task needs more depth:

- `./references/naming-conventions.md` for naming and identifier rules
- `./references/coding-standards.md` for formatting and structure details
- `./references/exception-logging.md` for exception and logging patterns
- `./references/security.md` for validation and secure coding guidance
- `./references/testing.md` for Java testing examples
- `./references/database.md` for SQL and schema guidance
- `./references/concurrency.md` for multithreading concerns
- `./references/design.md` for design and layering decisions

## Output expectations

Do not print fixed banners or boilerplate status lines. Apply the standards quietly and explain only the rules that materially affected the change.
