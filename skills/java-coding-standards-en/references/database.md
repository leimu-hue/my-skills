# Database Design and SQL Standards

## Basic Principles

- Tables and columns use lowercase snake_case, avoiding database keywords
- New tables must include audit fields: `create_user_id`, `update_user_id`, `create_time`, `update_time`, `is_deleted`
- All columns must be `NOT NULL` by default; nullable columns require a clear business reason documented in the table design review
- Use `DECIMAL` for monetary amounts; never `FLOAT` / `DOUBLE`
- Prefer `TINYINT`, `SMALLINT`, or stable strings for enums and status fields; semantics maintained by code enums
- Default to logical deletion; don't physically delete business data. Cleanup tables, log tables, and temp tables may use physical deletion per project policy

## Table Design

Standard fields:

| Column | Suggested Type | Requirement |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Primary key, auto-increment or project-unified ID strategy |
| `create_user_id` | `BIGINT UNSIGNED` | `NOT NULL`; use `0` for system tasks |
| `update_user_id` | `BIGINT UNSIGNED` | `NOT NULL`; use `0` for system tasks |
| `create_time` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `update_time` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |
| `is_deleted` | `TINYINT` | `NOT NULL DEFAULT 0`; 0 = not deleted, 1 = deleted |

```sql
CREATE TABLE order_info (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_no VARCHAR(32) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status TINYINT NOT NULL DEFAULT 1,
    create_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    update_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_no (order_no),
    KEY idx_user_id (user_id),
    KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Column Types

- IDs, large-table foreign keys: `BIGINT UNSIGNED`
- Small-range status, type: `TINYINT` / `SMALLINT`
- Amounts, rates, exact decimals: `DECIMAL(p, s)`
- Short text: `VARCHAR(n)`; size based on business maximum
- Long text: `TEXT` / `LONGTEXT`; avoid placing in the same hot table as high-frequency columns
- Fixed-length codes: `CHAR(n)`, e.g. country codes, fixed business codes
- Time: prefer `DATETIME`; use `TIMESTAMP` for cross-timezone audits or logs per project conventions

## Indexes

- Primary key should be stable, short, and incrementing or trend-incrementing
- Business unique constraints must have unique indexes
- High-frequency query conditions, join columns, and sort columns should have indexes based on query patterns
- Composite indexes follow the leftmost prefix rule; order columns by equality conditions, range conditions, then sort/group
- Avoid excessive indexes on low-cardinality columns alone
- For write-heavy tables, limit the number of indexes to avoid slowing writes

```sql
UNIQUE KEY uk_order_no (order_no),
KEY idx_user_status_time (user_id, status, create_time)
```

## SQL Writing

- Always list query columns explicitly; avoid `SELECT *`
- `INSERT` must explicitly list column names
- `UPDATE` / `DELETE` must have a `WHERE` clause; for business tables, prefer updating `is_deleted` over physical deletion
- Business queries must filter `is_deleted = 0` by default
- All external input must use parameterized binding: JDBC `?`, MyBatis `#{}`, JPA parameters
- MyBatis `${}` may only be used for column names, table names, sort directions, and other non-parameterizable positions, and must come from a server-side whitelist

```sql
SELECT id, order_no, user_id, total_amount, status
FROM order_info
WHERE user_id = ?
  AND is_deleted = 0
ORDER BY create_time DESC
LIMIT ?, ?;
```

## Pagination and Query Optimization

- For large-offset pagination, avoid direct `LIMIT 100000, 20`; prefer cursor-based pagination or key-based lookback
- Slow queries must be analyzed with `EXPLAIN` for index usage, row scans, sorts, and temp tables
- JOINs must have explicit join conditions; no implicit Cartesian products
- Subqueries, views, and temp tables should be judged by execution plans, not mechanical rules
- Statistics, reports, and large-scale exports should not overload the online transaction database; use read replicas, offline tables, or async tasks when needed

## Transactions and Locks

- Transaction boundaries belong at the Service / ApplicationService use-case layer
- Transactions should only contain database operations that must be atomically committed; avoid remote calls, long computations, and user interaction inside transactions
- For concurrent updates like inventory and balance, prefer optimistic locking, conditional updates, or atomic database updates
- Pessimistic locking (`SELECT ... FOR UPDATE`) must be used within transactions with controlled lock scope and ordering
- Transaction propagation levels must have a clear reason, especially `REQUIRES_NEW`

## Batch Operations

- Inserts, updates, and deletes should use batch operations to reduce database round-trips
- Batch size must be controlled via configuration, not hardcoded; default values depend on business scenario (commonly `500`–`1000`)
- Data exceeding the batch limit must be committed in chunks to avoid large transactions, long locks, memory overflow, or exceeding `max_allowed_packet`
- Chunking logic should be unified into a utility method or base class for all modules to reuse — never hardcode batch size in each module

### Configuration

```yaml
# application.yml
app:
  batch:
    size: 500    # Number of records per batch for insert/update/delete
```

```java
@Data
@ConfigurationProperties(prefix = "app.batch")
public class BatchProperties {
    /** Records per batch, default 500 */
    private int size = 500;
}
```

### Batch Insert

```java
// ❌ Single-row insert in loop — N network round-trips
for (Order order : orders) {
    orderMapper.insert(order);
}

// ❌ Hardcoded batch size
Lists.partition(orders, 500).forEach(batch -> orderMapper.batchInsert(batch));

// ✅ Batch insert with configurable batch size
Lists.partition(orders, batchProperties.getSize())
    .forEach(batch -> orderMapper.batchInsert(batch));
```

### Batch Update

```java
// ✅ Batch update using configurable batch size
Lists.partition(updates, batchProperties.getSize())
    .forEach(batch -> orderMapper.batchUpdate(batch));
```

### Batch Delete

```java
// ✅ Batch delete by IDs in chunks
Lists.partition(ids, batchProperties.getSize())
    .forEach(batch -> orderMapper.batchDeleteByIds(batch));
```

### Batch Query

- When a single-item query method has batch-calling scenarios, a batch query version must also be provided to avoid N+1 problems from callers looping through single queries
- Batch query also applies to cache: if the cache provides a single `get`, a `multiGet` or equivalent batch interface must be provided when batch calling is expected

```java
// ❌ Caller loops through single queries
List<Long> userIds = request.getUserIds();
List<User> users = userIds.stream()
    .map(userMapper::selectById)
    .filter(Objects::nonNull)
    .toList();

// ✅ Provide a batch query method — one round-trip
List<User> users = userMapper.selectByIds(userIds);
```

```java
// ❌ Loop through single cache lookups
Map<Long, User> userMap = userIds.stream()
    .collect(Collectors.toMap(
        id -> id,
        id -> userCache.get(id)  // N network round-trips
    ));

// ✅ Batch retrieval
Map<Long, User> userMap = userCache.multiGet(userIds);
```

### MyBatis Batch SQL Example

```xml
<!-- batchInsert -->
<insert id="batchInsert">
    INSERT INTO order_info (order_no, user_id, total_amount, status)
    VALUES
    <foreach collection="list" item="o" separator=",">
        (#{o.orderNo}, #{o.userId}, #{o.totalAmount}, #{o.status})
    </foreach>
</insert>
```

### Notes

- `foreach`-generated `VALUES` are limited by `max_allowed_packet`; commit in chunks for large datasets
- JPA `saveAll()` is also affected by batch configuration; set via `spring.jpa.properties.hibernate.jdbc.batch_size`
- Batch operations should run inside transactions; commit each chunk separately to avoid oversized transactions
- Batch queries also apply: `WHERE id IN (...)` ID lists should be chunked to avoid overly long SQL

```sql
UPDATE product
SET stock = stock - 1,
    update_user_id = ?,
    update_time = NOW()
WHERE id = ?
  AND stock > 0
  AND is_deleted = 0;
```

## Connection Pool

- Connection pool should explicitly configure max connections, min idle connections, connection timeout, and idle timeout
- Minimum idle connections should avoid cold-start thrashing
- No remote calls, long computations, or user interaction inside transactions; avoid holding connections for extended periods
- Monitor active connections, wait queues, and connection acquisition latency; alert on anomalies

## Security and Permissions

- Application accounts follow least privilege; don't use root / DBA accounts for business database connections
- Read/write split accounts should be authorized by responsibility; admin permissions limited to ops or migration processes
- Sensitive columns should be encrypted or masked per project security policy; don't output plaintext in logs or exceptions
- Production DDL, batch UPDATE/DELETE, and data fixes must have review, backup, and rollback plans
