---
name: java-coding-standards-en
description: Use this skill when working with Java or Spring code — writing, reviewing, refactoring, generating, or fixing it. Applies to Spring Boot controllers, services, repositories, DTOs, tests, exception handling, validation, MyBatis XML, SQL, DDL, JPA entities, and Lombok classes. Always consult this skill for Java code generation, code review, architecture decisions, naming, error handling patterns, database schema design, or any task where Java coding quality matters. Also use when the user mentions Spring, Spring Boot, MyBatis, MyBatis-Plus, JPA, Hibernate, Bean Validation, Lombok, or Maven/Gradle Java projects. Does not apply to Kotlin, Android, or non-JVM projects.
license: MIT
---

# Java Coding Standards (Lite)

Lightweight standard for enterprise Java projects. Goal: stable, clear, maintainable code without disrupting existing project style.

## Core Rules

> Detailed descriptions and code examples in `./references/core-rules.md`

1. **Guard clauses** — reject invalid input early, keep happy path flat. Deep nesting = hard to read, test, maintain
2. **Follow project tooling conventions** — reuse existing utility classes (StringUtils / CollectionUtils), don't introduce new dependencies. Stay consistent within a file
3. **Null defense** — validate external input and third-party returns before dereferencing. Follow local code style (`== null` vs `Objects.isNull` both fine)
4. **Use imports, not fully qualified names** — FQN only allowed for same-name class conflicts, must comment explaining why
5. **Switch expressions (Java 17+)** — arrow syntax eliminates fall-through risk, enforces exhaustive branches. Don't rewrite stable existing switches; only use for new/modified logic
6. **Text blocks (Java 17+)** — multi-line JSON/SQL/XML use `"""`, WYSIWYG. Don't force for single-line strings
7. **Record first (Java 17+)** — simple immutable DTO/VO/Command/Response use record, higher priority than Lombok. Use class for JPA Entity, types needing setter/inheritance/ORM proxy

## Workflow

> Only lists practices not overlapping with core rules

1. Confirm Java version (`pom.xml` / `build.gradle`); follow local style of 2–3 nearby classes
2. Keep Controllers thin — routing, parameter binding, response status codes. Business logic goes in Service
3. When changing behavior, add or update tests accordingly
4. After editing, clean up unused imports

## Common Violations

Grouped by category for quick lookup.

### Code Standards

- New classes / public methods missing Javadoc (responsibility, parameters, return values, exceptions)
- Using field injection `@Autowired` (use constructor injection + `@RequiredArgsConstructor`)
- Empty `catch` blocks or `printStackTrace()` in production code
- `Optional` used as field or method parameter (return values only)
- Simple iteration using `Stream` unnecessarily (for-each is more direct)

### Error Handling and i18n

- Error codes as inline string literals (must reference `ErrorCodes` constants class)
- Exception or log messages hardcoded (must use i18n message keys + `MessageSource`)

### Database and SQL

- SQL constructed via string concatenation (must parameterize: `#{}` / `?` / JPA parameter binding)
- Batch operation size hardcoded (must be controlled via configuration)
- New business tables missing audit fields or fields not declared `NOT NULL`
- Business queries missing `is_deleted = 0` filter

### Security and Validation

- External input used without validation
- JPA Entity using `@Data` (`equals`/`hashCode` triggers lazy loading; customize based on ID)
- N+1 queries: `FetchType.EAGER` or lazy loading triggered in loops

### Transactions

- `@Transactional` on `private` methods (AOP won't intercept) or Controller layer
- Read operations missing `@Transactional(readOnly = true)`
- Hardcoded config values or `@Value` scattered across services (use `@ConfigurationProperties`)

## Reference Files

Consult by domain:

| File | Domain |
|---|---|
| `./references/core-rules.md` | Core rules with detailed descriptions and code examples |
| `./references/naming-conventions.md` | Naming conventions (Java / DB / generics / annotations) |
| `./references/coding-standards.md` | Formatting, comments, Lombok, record, collections, Optional |
| `./references/exception-logging.md` | Exception classification, ErrorCodes, i18n, log levels and writing |
| `./references/security.md` | Parameter validation, SQL injection, XSS, CSRF, sensitive data |
| `./references/testing.md` | Test types, structure, mocking, assertions, Spring test selection |
| `./references/database.md` | Table design, indexes, SQL, pagination, transactions, batch ops, connection pool |
| `./references/concurrency.md` | Thread pools, shared state, locks, ThreadLocal, async tasks |
| `./references/design.md` | Layered architecture, design patterns, API design, config management, DDD |

## Output Requirements

Apply standards quietly. Embed comments directly in generated code. Only mention rules that actually affected the current change.
