# Naming Conventions

## General Principles

- Follow existing project naming first; keep new code consistent with the same package and module
- Use standard English; avoid pinyin and non-standard abbreviations
- Names should express business meaning, not pad with type, layer, or technical details
- Clarity over brevity; short names only for local loop variables, lambda parameters, and generics

## Java Naming

| Element | Rule | Example | Avoid |
| --- | --- | --- | --- |
| Package | All lowercase, reversed domain; no separators between words | `com.company.project.order` | `com.company.Project`, `order_service` |
| Class / Interface | UpperCamelCase, noun or noun phrase | `UserService`, `OrderRepository` | `userService`, `Data` |
| Method | lowerCamelCase, verb or verb phrase | `createUser`, `cancelOrder` | `userCreate`, `doIt` |
| Variable / Field | lowerCamelCase, expresses business meaning | `userName`, `maxRetryCount` | `s`, `usr`, `user_name` |
| Constant | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` | `maxRetryCount` |
| Enum Value | UPPER_SNAKE_CASE (consistent with constants) | `PENDING_PAYMENT` | `PendingPayment` |
| Test Class | Tested class name + `Test` | `UserServiceTest` | `TestUserService` |
| Exception Class | Semantic name + `Exception` | `BusinessException` | `BusinessError` |

## Class Name Suffixes

- `Controller`: HTTP interface layer
- `Service` / `ApplicationService`: Business use-case orchestration
- `Repository` / `Mapper` / `Dao`: Data access; choose based on the project's existing tech stack
- `Client`: External service calls
- `Adapter`: Third-party, legacy system, or protocol adaptation
- `Factory`, `Builder`, `Strategy`, `Policy`: Only when there is a genuine pattern or rule meaning
- `Impl`: Only when the project already uses this style, or when an interface has multiple implementations with no business-distinguishable names; prefer `AlipayPaymentProcessor`, `CreditCardPaymentProcessor` when business differences exist
- `Base` / `Abstract`: Abstract base classes; do not overuse on plain parent classes

## Method Naming

| Scenario | Recommended Prefix | Notes |
| --- | --- | --- |
| Single query | `get` / `find` | `get` may imply exception if absent; `find` may return `Optional` or allow null |
| List query | `list` / `find...By` | Service commonly uses `listUsers`; Repository follows framework like `findByStatus` |
| Paged query | `page` | `pageUsers(query)` |
| Count | `count` | `countUsersByStatus` |
| Existence | `exists` | `existsUserById` |
| Create | `create` | Clear creation semantics |
| Save | `save` | Use when it may insert or update |
| Update | `update` | Modifying an existing object |
| Delete | `delete` / `remove` | Physical deletion commonly `delete`; removal from collection/relationship may use `remove` |
| Validate | `validate` / `check` | `validate` usually throws on failure; `check` may return result or throw |
| Boolean check | `is` / `has` / `can` / `should` | For boolean-returning methods |

## Boolean Naming

- Boolean methods use `is`, `has`, `can`, `should`: `isActive()`, `hasPermission()`
- Java fields follow project serialization conventions; prefer `active`, `deleted` for plain fields to avoid Lombok/JavaBean generating accessors like `isIsActive()`
- If the interface or database column is already `is_deleted`, use `deleted` for DTO/Entity and map via annotations
- Avoid negated boolean names like `notDeleted`, `disableFlag`; prefer `deleted`, `enabled`

## Collections and Maps

- When business semantics are clear, type suffixes are not required: `users`, `permissions`
- Add suffixes when distinguishing multiple collections or when type is important: `userList`, `permissionSet`
- Map names should express key/value relationships: `userById`, `orderNoToOrder`
- Avoid meaningless names like `list`, `map`, `dataList`

## Database Naming

- Tables and columns use lowercase snake_case: `order_item`, `create_time`
- Table singular/plural must follow existing project convention; for new projects, prefer singular business names or clear prefixes, avoiding keywords
- Avoid database keywords: don't use `user`, `order`; use `sys_user`, `order_info` instead
- Primary key defaults to `id`; timestamp fields default to `create_time`, `update_time`
- Logical delete field may use `is_deleted`, mapped to `deleted` in Java

```sql
sys_user(id, user_name, email, create_time, update_time, is_deleted)
order_info(id, order_no, user_id, status, create_time)
order_item(id, order_id, product_id, quantity)
```

## Generics, Annotations, Configuration

- Generics: `T` for general type, `E` for collection element, `K`/`V` for key-value; use meaningful names like `REQ`, `RESP` for complex scenarios
- Annotations: UpperCamelCase, expressing capability or semantics, e.g. `Loggable`, `Idempotent`
- Configuration files: follow framework conventions, e.g. `application.yml`, `logback-spring.xml`, `mybatis-config.xml`

## Common Anti-Patterns

```java
String s;              // meaningless
String yongHuMing;     // pinyin
String usr;            // non-standard abbreviation
String user_name;      // Java variables don't use underscores
boolean notDeleted;    // negated names increase cognitive load
Map<Long, User> map;   // missing key/value semantics
```
