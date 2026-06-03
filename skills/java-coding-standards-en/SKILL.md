---
name: java-coding-standards-en
description: Use when creating, modifying, or reviewing Java/Spring code, tests, DTOs, controllers, services, repositories, exception handling, validation, MyBatis XML, SQL, or DDL in Java projects.
license: MIT
---

# Java Coding Standards (Lite)

A lightweight standard for enterprise Java projects, suitable for daily code generation, patches, and feature iteration. The goal is to produce stable, clear, and maintainable code without disrupting the existing project style.

## Applicable Scenarios

Apply this standard by default when working with:

- Java classes, interfaces, enums, records
- Spring Controller, Service, Repository, Configuration
- DTOs, request objects, response objects, validation logic
- Exception handling, logging, defensive programming
- Embedded SQL in Java, annotation-based SQL, MyBatis XML SQL, SQL builders, DDL
- Unit tests, integration tests, test utilities

## Core Rules

### 1. Prefer Guard Clauses

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

### 2. Follow Existing Project Tooling Conventions

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

### 3. Prioritize Readability in Null Handling

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

### 4. Prefer Imports Over Fully Qualified Class Names

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

## Workflow

When generating or modifying Java code, follow this order:

1. Confirm the project Java version: check `pom.xml` for `maven-compiler-plugin`, `release`, `sourceCompatibility`, `targetCompatibility`, or `build.gradle` for `sourceCompatibility` / `targetCompatibility`
2. Read 2–3 nearby classes first; follow the local style
3. Prioritize clear names, short methods, and single responsibilities
4. Add business-intent comments for new types and key methods (see `./references/coding-standards.md`)
5. Confirm Java version; for Java 17+, prefer `record` for simple immutable data carriers; fall back to plain class or Lombok where record is unsuitable (see `./references/record.md`)
6. Keep Controllers thin; place business logic in Service, Manager, Master, Helper, etc. (see `./references/design.md`)
7. Avoid large-scale framework refactors or style rewrites unless necessary
8. When changing behavior, add or update tests accordingly (see `./references/testing.md`)
9. After editing, check the current file for unused imports and clean them up

## Common Violations

- Deep `if` nesting where guard clauses would suffice
- New classes without class-level Javadoc
- New public/protected methods, business methods, or complex private methods without Javadoc
- Java 17+ simple immutable DTOs still using Lombok class with getter/setter boilerplate
- Manually writing constructor/getter/setter/logger in Lombok-friendly modules
- Using field injection (`@Autowired`)
- Empty `catch` blocks or `printStackTrace()` in production code
- SQL constructed via string concatenation
- New business tables missing audit fields or fields not declared `NOT NULL`
- Business queries missing `is_deleted = 0` filter
- Using external input without validation
- Mixing multiple null-checking styles within the same file
- Introducing new utility libraries without existing project precedent
- Using fully qualified class names without reason (e.g. `new com.alibaba.fastjson.TypeReference()`)
- Unused imports left in the file

## Reference Files

Consult the corresponding document for deeper coverage:

- `./references/naming-conventions.md` — Naming conventions
- `./references/record.md` — Java 17 record usage
- `./references/coding-standards.md` — Formatting, comments, Lombok, structural details
- `./references/exception-logging.md` — Exceptions and logging
- `./references/security.md` — Parameter validation and secure coding
- `./references/testing.md` — Java testing standards
- `./references/database.md` — SQL and database standards
- `./references/concurrency.md` — Concurrency and multithreading guidelines
- `./references/design.md` — Layering, design patterns, and examples

## Output Requirements

Do not output boilerplate banners or filler text. Apply these standards quietly by default; only mention the rules that actually affected the current change. When generating new Java classes or methods, embed required comments directly in the code. Confirm the Java version first; for Java 17+, output `record` for simple immutable data carriers; fall back to plain class or Lombok per project conventions when record is unsuitable.
