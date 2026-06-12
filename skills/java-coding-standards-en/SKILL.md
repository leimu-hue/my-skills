---
name: java-coding-standards-en
description: Use when creating, modifying, or reviewing Java/Spring code, tests, DTOs, controllers, services, repositories, exception handling, validation, MyBatis XML, SQL, or DDL in Java projects.
license: MIT
---

# Java Coding Standards (Lite)

A lightweight standard for enterprise Java projects. The goal is to produce stable, clear, and maintainable code without disrupting the existing project style.

## Core Rules

> Full rule descriptions and code examples are in `./references/core-rules.md`

1. **Prefer guard clauses** — reject invalid input early, keep the happy path flat
2. **Follow existing project tooling conventions** — use existing utility classes, do not introduce new dependencies
3. **Prioritize readability in null handling** — follow local style, validate external input before dereferencing
4. **Prefer imports** — avoid fully qualified class names without reason
5. **Java 17+ prefer switch expressions** — eliminate fall-through risk, enforce exhaustive branches
6. **Java 17+ prefer text blocks** — use `"""` for multi-line strings, JSON, SQL; WYSIWYG
7. **Java 17+ prefer record for simple immutable data carriers** — higher priority than Lombok; fall back to class when unsuitable

## Workflow

1. Confirm the project Java version (`pom.xml` / `build.gradle`); follow the local style of 2–3 nearby classes
2. Clear names, short methods, single responsibilities; avoid unnecessary framework refactors or style rewrites
3. Java 17+ prefer `record` for simple immutable data carriers; fall back to plain class or Lombok when unsuitable
4. Keep Controllers thin; place business logic in Service layer
5. When changing behavior, add or update tests accordingly
6. After editing, clean up unused imports

## Common Violations

- New classes / public methods without Javadoc
- Java 17+ simple data carriers still using Lombok class with getter/setter boilerplate
- Using field injection (`@Autowired`)
- Empty `catch` blocks or `printStackTrace()` in production code
- Error codes as inline string literals instead of referencing `ErrorCodes` constants class
- Exception or log messages with hardcoded text instead of i18n message keys
- SQL constructed via string concatenation
- New business tables missing audit fields or fields not declared `NOT NULL`
- Business queries missing `is_deleted = 0` filter
- Using external input without validation
- JPA Entity using `@Data` or missing custom `equals`/`hashCode`
- N+1 queries: `FetchType.EAGER` or lazy loading triggered in loops
- `@Transactional` on `private` methods or Controller layer
- Read operations missing `@Transactional(readOnly = true)`
- Hardcoded config values or `@Value` scattered across services
- `Optional` used as field or method parameter
- Simple iteration using `Stream` unnecessarily

## Reference Files

Consult the corresponding document for deeper coverage:

- `./references/core-rules.md` — Core rules with detailed descriptions and code examples
- `./references/naming-conventions.md` — Naming conventions
- `./references/coding-standards.md` — Formatting, comments, Lombok, structural details
- `./references/exception-logging.md` — Exceptions and logging (i18n error codes, `ErrorCodes` constants, English log text)
- `./references/security.md` — Parameter validation and secure coding
- `./references/testing.md` — Java testing standards
- `./references/database.md` — SQL and database standards
- `./references/concurrency.md` — Concurrency and multithreading guidelines
- `./references/design.md` — Layering, design patterns, and examples

## Output Requirements

Apply standards quietly; do not output boilerplate or filler text. Embed required comments directly in generated code; only mention the rules that actually affected the current change.
