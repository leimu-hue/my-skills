# Coding Standards

## Relationship to Main Spec

This document supplements code formatting, method design, comments, and common API details. If it conflicts with `SKILL.md`, `SKILL.md` takes precedence: confirm Java version first; for Java 17+, prefer `record` for simple immutable data carriers; fall back to plain class or Lombok where record is unsuitable.

## Code Formatting

- Indent with 4 spaces, not tabs
- Keep lines to ~120 characters max; wrap longer lines naturally at parameters, chained calls, or logical conditions
- Separate class members, methods, and logical blocks within methods with blank lines
- Import ordering and formatting should defer to the project formatter / IDE / Checkstyle
- No meaningless formatting churn; only format code related to the current change

```java
List<User> users = userList.stream()
    .filter(user -> user.getAge() >= 18)
    .sorted(Comparator.comparing(User::getUserName))
    .toList();
```

## Constants and Magic Values

- Constants use `UPPER_SNAKE_CASE`
- Extract repeated literals with business meaning that affect rule decisions into constants
- One-off local values, test fixture values, and obviously self-explanatory small numbers don't need mechanical extraction
- Status, type, and error codes should use enums or stable constants instead of scattered bare numbers/strings

```java
private static final int MAX_RETRY_COUNT = 3;
private static final String USER_NOT_FOUND = "USER_NOT_FOUND";
```

## Class Design and Encapsulation

- Member variables default to `private`
- Spring dependencies default to `private final` + constructor injection
- Be cautious when exposing mutable collections externally; return immutable views or copies when needed
- Prefer composition over inheritance; use inheritance only when there is a stable `is-a` relationship and reusable template flow
- Use `protected` only when explicitly designing for inheritance-based extension
- Do not accumulate excessive inner classes in a single file; types with independent business responsibilities should be placed in their own packages, following existing project conventions

## Method Design

- Methods should have a single responsibility; split when too long, deeply nested, or requiring multiple paragraphs of comments to explain
- Use parameter objects when there are too many parameters; for Java 17+, prefer `record` for simple immutable parameter objects; for Java 8/11, follow the local plain class or Lombok style
- Validate parameters at the start of methods using guard clauses to reduce nesting
- Return value semantics should be stable: whether absence means `Optional`, `null`, or an exception should follow project conventions
- Ternary expressions only for simple assignments; use `if` or strategy decomposition for complex branching
- `switch` must cover unknown branches; even enum switches should consider future enum additions

```java
public User updateUser(Long id, UserUpdateRequest request) {
    if (id == null || id <= 0) {
        throw new IllegalArgumentException("User ID must be greater than 0");
    }
    if (request == null) {
        throw new IllegalArgumentException("Update request must not be null");
    }

    User user = loadUser(id);
    applyUpdate(user, request);
    return userRepository.save(user);
}
```

## Comment Standards

- New classes must have class-level Javadoc explaining responsibility, applicable scenarios, boundaries, or primary purpose
- New public/protected methods, business methods, interface methods, and complex private methods must have Javadoc explaining purpose, key parameters, return values, constraints, exceptions, or side effects
- Comments should explain business intent and constraints, not restate the code
- Do not mechanically add `@author`, `@version`, `@since` unless the project already requires them
- Add brief inline comments for complex algorithms, compatibility logic, and non-obvious business rules

```java
/**
 * User registration service.
 *
 * Responsible for registration parameter validation, user persistence,
 * and post-registration notification actions.
 */
@Service
public class UserRegisterService {

    /**
     * Creates a new user and returns the persisted result.
     *
     * @param request user creation request, must not be null
     * @return the saved user object
     * @throws ValidationException when username or email is invalid
     */
    public User createUser(UserCreateRequest request) {
        // ...
    }
}
```

## Records and Lombok

- Confirm project Java version first; for Java 17+, prefer `record` for simple immutable DTO / VO / Command / Response
- Do not stack `@Data`, `@Getter`, or `@Setter` on a `record`
- Use class for JPA entities, types requiring setters/no-arg constructors, ORM proxies, or complex Builder objects
- When record is unsuitable and the project already uses Lombok, use `@Getter`, `@Setter`, `@Builder`, `@RequiredArgsConstructor` to reduce boilerplate
- Use `@RequiredArgsConstructor` for Spring Beans and `@Slf4j` for logging

```java
/**
 * User creation request.
 */
public record UserCreateRequest(String userName, String email) {
}
```

## Date and Time

- Default to `java.time`; avoid adding new `Date` / `Calendar` usage
- Prefer `Instant` or explicitly zoned times for cross-system communication, persistence, and messaging
- Convert to user timezone and format only at the presentation layer
- In tests, don't depend on `now()` directly; inject a `Clock`

```java
Instant now = clock.instant();
ZonedDateTime beijingTime = now.atZone(ZoneId.of("Asia/Shanghai"));
```

## Collections and Streams

- Follow project tooling style for collection emptiness checks, e.g. `CollectionUtils.isEmpty(list)` or `list == null || list.isEmpty()`
- Specify initial capacity for known large collections; small collections don't need mechanical sizing
- Use Streams for simple transformations, filtering, and aggregation; plain loops are fine for complex flows or debugging
- Prefer immutable empty collections like `Collections.emptyList()`, `List.of()` for empty returns
- Consider whether returned collections should be immutable to prevent callers from mutating internal state

```java
if (CollectionUtils.isEmpty(users)) {
    return Collections.emptyList();
}
```

## Control Flow

- Prefer guard clause returns; reduce multi-level `if/else`
- Loops must have clear exit conditions; retry loops must limit attempts
- No empty `catch` blocks; don't swallow exceptions
- Use `while (true)` only when the exit condition is crystal clear, and add a comment
