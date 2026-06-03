# Java 17 Record Usage

## Core Principle

In Java 17+ projects, prefer `record` for simple immutable data carriers. When a record fits, it takes priority over Lombok's `@Data`, `@Getter`, `@Setter`, and `@Value`. When record does not fit, fall back to plain class or Lombok per project conventions.

## When to Use

Prefer `record`:

- DTOs: request, response, command, query parameter objects
- Value objects that only hold data and don't need mutable state
- Lightweight projection objects returned from methods
- Simple result objects in test data
- Multi-field composite keys, statistics results, aggregation query results

Do not use `record`:

- JPA / MyBatis Plus entities that require no-arg constructors, mutable fields, or proxy enhancement
- Types that need to extend a parent class
- Objects whose fields must change repeatedly during their lifecycle
- Objects with many mostly-optional fields, making constructor calls unreadable
- Legacy projects where the framework or serialization config doesn't support records

## Priority

| Scenario | Preferred Choice |
| --- | --- |
| Java 17+ immutable DTO / VO / Command | `record` |
| Java 17+ mutable DTO / framework requires setters | class + Lombok |
| JPA Entity / ORM entity | class |
| Spring Bean / Service / Component | class + constructor injection |
| Complex objects needing Builder for readability | Use existing project solution; class + Lombok `@Builder` if needed |

## Writing Style

New records must include a type-level Javadoc explaining their purpose and boundaries. When a record has few components with clear meaning, verbose per-component docs are unnecessary. Components with constraints, units, or format requirements should be documented in the type-level Javadoc or adjacent validation.

```java
/**
 * User creation request.
 *
 * Carries the input for the create-user endpoint; fields undergo Bean Validation
 * before entering the business layer.
 */
public record UserCreateRequest(
    @NotBlank(message = "Username must not be empty")
    @Size(min = 3, max = 50, message = "Username must be between 3 and 50 characters")
    String userName,

    @NotBlank(message = "Email must not be empty")
    @Email(message = "Invalid email format")
    String email
) {
}
```

## Validation and Construction

Use a compact constructor when invariants need to be enforced. Only perform lightweight, deterministic field normalization or cross-field validation. Do not access databases, call remote services, or run complex business logic in a record constructor.

```java
/**
 * Amount range query criteria.
 */
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
```

## Usage Notes

- Record fields are implicitly `private final`; do not add Lombok `@Data`, `@Getter`, or `@Setter`
- Accessor names match component names, e.g. `request.userName()`, not `getUserName()`
- Records auto-generate `equals`, `hashCode`, and `toString`; avoid storing plaintext passwords, tokens, keys, or other sensitive fields
- Confirm framework version support for serialization, deserialization, and parameter binding:
  - Spring Boot 3.x (Spring Framework 6): full support for records as HTTP request bodies
  - Jackson 2.14+: supports record serialization/deserialization
  - MyBatis 3.5.10+ or MyBatis-Plus 3.5.3+: supports records as Mapper parameters and return values
- Records can implement interfaces but cannot extend classes
- Do not turn inherently mutable domain entities into records just to avoid writing getters/setters

## Checklist

- [ ] Project uses Java 17 or higher
- [ ] The type is an immutable data carrier
- [ ] Does not depend on no-arg constructors, setters, ORM proxies, or class inheritance
- [ ] Component count is moderate; constructor calls remain readable
- [ ] Required validation is expressed via Bean Validation or compact constructor
- [ ] No sensitive plaintext fields that would be leaked by `toString()`
- [ ] Spring Boot, Jackson, and MyBatis versions confirmed to support records
