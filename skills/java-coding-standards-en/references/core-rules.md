# Core Rules

## 1. Prefer Guard Clauses

Reject invalid input early to keep the happy path flat and avoid deep nesting.

```java
public void process(User user) {
    if (user == null) {
        throw new IllegalArgumentException("user must not be null");
    }
    if (StringUtils.isBlank(user.getName())) {
        throw new IllegalArgumentException("user name must not be blank");
    }

    executeLogic(user);
}
```

Use `return`, `continue`, or `throw` whenever they significantly reduce nesting depth. Command-style business logic and boundary validation should throw explicit exceptions by default. Use `return` / `continue` for silent skipping only in batch processing, query fallbacks, or skippable single-record scenarios, and log necessary context.

## 2. Follow Existing Project Tooling Conventions

- When the project already uses Apache Commons or Spring utilities, prefer `StringUtils` for string handling
- For collection and Map emptiness checks, follow the project's existing `CollectionUtils`, `MapUtils`, or JDK style
- Do not introduce a new utility dependency just for a trivial check
- Stay consistent within the same file — don't mix multiple styles

```java
if (StringUtils.isBlank(request.getUserName())) {
    throw new ValidationException("userName", "Username must not be empty");
}

if (CollectionUtils.isEmpty(users)) {
    return Collections.emptyList();
}
```

## 3. Prioritize Readability in Null Handling

- `obj == null` / `obj != null` and `Objects.isNull` / `Objects.nonNull` are all acceptable — prefer the local code style
- For collections and Maps, use a single path for null-and-empty checks; avoid branching twice
- Validate external input, third-party return values, and deserialized objects before dereferencing

```java
if (request == null) {
    throw new IllegalArgumentException("request must not be null");
}

if (id <= 0) {
    throw new IllegalArgumentException("id must be greater than 0");
}
```

## 4. Prefer Imports Over Fully Qualified Class Names

- Prefer short class names via file-level `import`, e.g. `new TypeReference<T>()`
- Do not use fully qualified names without reason: `new com.alibaba.fastjson.TypeReference<T>()`
- Only use fully qualified names when the same file requires same-named classes from different packages that cannot both be imported; in such cases, add a comment explaining the conflict

```java
// GOOD
import com.alibaba.fastjson.TypeReference;
new TypeReference<List<User>>() {};

// BAD — fully qualified name without reason
new com.alibaba.fastjson.TypeReference<List<User>>() {};

// ALLOWED — name collision, must comment
import com.fasterxml.jackson.core.type.TypeReference;
// com.alibaba.fastjson.TypeReference conflicts with Jackson TypeReference;
// fully qualified name required to disambiguate
new com.alibaba.fastjson.TypeReference<List<User>>() {};
```

## 5. Java 17+ Prefer Switch Expressions

- In Java 17+ projects, prefer **switch expressions** (arrow syntax `->`) for new or modified `switch` logic
- Switch expressions eliminate fall-through risk and require exhaustive branches (or an explicit `default`)
- Pattern matching (`case Type t`) is only stable in Java 21+; use cautiously in Java 17 projects based on actual version
- `case null` is a Java 21 feature, not available in Java 17
- Do not rewrite existing stable traditional `switch` statements; only switch when adding, modifying, or refactoring

```java
// ✅ Switch expression: no fall-through risk, forced return value (stable since Java 14, recommended for Java 17+)
String description = switch (status) {
    case PENDING   -> "Awaiting payment";
    case PAID      -> "Preparing shipment";
    case SHIPPED   -> "In transit";
    case DELIVERED -> "Completed";
    case CANCELLED -> "Cancelled";
};

// ✅ default branch for unknown enum values (Java 17+ switch expression)
String fallback = switch (unknownStatus) {
    case PENDING   -> "Awaiting payment";
    case PAID      -> "Preparing shipment";
    default        -> "Unknown status";
};

// ❌ Traditional switch: easy to miss break, verbose and error-prone
String description = "";
switch (status) {
    case PENDING:
        description = "Awaiting payment";
        break;
    case PAID:
        description = "Preparing shipment";
        break;
    default:
        description = "Unknown status";
}
```

> **Note**: Pattern matching (`case Integer i`) is only stable in Java 21+. In Java 17 projects, use switch expressions only with enums and known types; cross-type pattern matching depends on actual project version.

## 6. Java 17+ Prefer Text Blocks

- For multi-line strings, JSON, SQL, XML and other embedded structured text, prefer text blocks `"""` over `+` concatenation
- Text blocks are WYSIWYG, avoiding messy escape sequences and newline concatenation
- Stable since Java 15, applicable by default in Java 17+ projects
- Single-line strings should still use regular string literals; do not force text blocks
- For variable interpolation, combine with `formatted()` or `String.format()`

```java
// ✅ Text block: WYSIWYG, clear and maintainable
String json = """
    {
      "name": "Alice",
      "age": 20
    }
    """;

// ✅ Combined with formatted() for interpolation
String json = """
    {
      "name": "%s",
      "age": %d
    }
    """.formatted(name, age);

// ✅ Also works with MyBatis annotation SQL
@Select("""
    SELECT id, user_name, email
    FROM t_user
    WHERE status = 'ACTIVE'
      AND is_deleted = 0
    """)
List<User> findActiveUsers();

// ❌ Concatenating multi-line strings: hard to read, maintain, and error-prone
String json = "{\n" +
              "  \"name\": \"Alice\",\n" +
              "  \"age\": 20\n" +
              "}";
```

## 7. Java 17+ Prefer Record for Simple Immutable Data Carriers

- In Java 17+ projects, prefer `record` for simple immutable DTO / VO / Command / Response; takes priority over Lombok `@Data`, `@Getter`, `@Setter`, `@Value`
- Do not use `record` for: JPA / MyBatis Plus entities, types requiring inheritance, mutable state, or legacy projects with unsupported frameworks
- Record fields are inherently `private final`; do not add Lombok annotations
- Accessor names match component names (`request.userName()`), not `getUserName()`
- Record auto-generates `equals`/`hashCode`/`toString`; avoid storing sensitive plaintext fields
- Use compact constructor for field validation; do not access databases or remote services inside constructors
- Verify framework version support for serialization: Spring Boot 3.x, Jackson 2.14+, MyBatis 3.5.10+ or MyBatis-Plus 3.5.3+

```java
// ✅ record: concise, immutable, semantically clear
public record UserCreateRequest(
    @NotBlank(message = "Username must not be empty")
    @Size(min = 3, max = 50)
    String userName,

    @NotBlank(message = "Email must not be empty")
    @Email
    String email
) {
}

// ✅ Compact constructor for lightweight validation
public record AmountRange(BigDecimal minAmount, BigDecimal maxAmount) {
    public AmountRange {
        if (minAmount == null || maxAmount == null) {
            throw new IllegalArgumentException("Amount range must not be null");
        }
        if (minAmount.compareTo(maxAmount) > 0) {
            throw new IllegalArgumentException("Min amount must not exceed max amount");
        }
    }
}

// ❌ Unsuitable for record: JPA Entity, requires setter/no-arg constructor, ORM proxy
@Entity
public class User { // must use class
    @Id
    private Long id;
    private String userName;
}
```
