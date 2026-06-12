# 数据库设计与 SQL 规范

## 基本原则

- 表、字段使用小写下划线命名，避开数据库关键字
- 新增表必须包含审计字段：`create_user_id`、`update_user_id`、`create_time`、`update_time`、`is_deleted`
- 所有字段默认必须 `NOT NULL`；确需允许 `NULL` 时，必须有明确业务原因并在表设计评审中说明
- 金额使用 `DECIMAL`，禁止用 `FLOAT` / `DOUBLE`
- 枚举、状态优先使用 `TINYINT`、`SMALLINT` 或稳定字符串，语义由代码枚举维护
- 默认逻辑删除，不直接物理删除业务数据；清理表、日志表、临时表可按项目策略物理删除

## 表设计

标准字段：

| 字段 | 类型建议 | 要求 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | 主键，自增或项目统一 ID 策略 |
| `create_user_id` | `BIGINT UNSIGNED` | `NOT NULL`，系统任务可用 `0` |
| `update_user_id` | `BIGINT UNSIGNED` | `NOT NULL`，系统任务可用 `0` |
| `create_time` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `update_time` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |
| `is_deleted` | `TINYINT` | `NOT NULL DEFAULT 0`，0 未删除，1 已删除 |

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

## 字段类型

- ID、大表外键：`BIGINT UNSIGNED`
- 小范围状态、类型：`TINYINT` / `SMALLINT`
- 金额、费率、精确小数：`DECIMAL(p, s)`
- 短文本：`VARCHAR(n)`，长度按业务上限设计
- 长文本：`TEXT` / `LONGTEXT`，避免和高频字段放在同一热表中
- 固定长度编码：`CHAR(n)`，如国家码、固定业务码
- 时间：优先 `DATETIME`；跨时区审计或日志按项目约定使用 `TIMESTAMP`

## 索引

- 主键使用稳定、短、递增或趋势递增的字段
- 业务唯一约束必须建唯一索引
- 高频查询条件、关联字段、排序字段按查询模式建索引
- 复合索引遵循最左前缀，字段顺序按等值条件、范围条件、排序/分组综合设计
- 避免为低区分度字段单独建过多索引
- 写多读少表要控制索引数量，避免拖慢写入

```sql
UNIQUE KEY uk_order_no (order_no),
KEY idx_user_status_time (user_id, status, create_time)
```

## SQL 编写

- 查询字段必须显式列出，避免 `SELECT *`
- `INSERT` 必须显式指定字段名
- `UPDATE` / `DELETE` 必须有 `WHERE` 条件；业务表删除优先更新 `is_deleted`
- 查询业务表默认过滤 `is_deleted = 0`
- 所有外部输入必须参数化绑定：JDBC `?`、MyBatis `#{}`、JPA 参数
- MyBatis `${}` 只能用于字段名、表名、排序方向等无法参数化的位置，并且必须来自服务端白名单

```sql
SELECT id, order_no, user_id, total_amount, status
FROM order_info
WHERE user_id = ?
  AND is_deleted = 0
ORDER BY create_time DESC
LIMIT ?, ?;
```

## 分页与查询优化

- 大偏移分页避免直接 `LIMIT 100000, 20`，优先游标分页或先查主键再回表
- 慢查询必须用 `EXPLAIN` 看索引、扫描行数、排序、临时表
- JOIN 必须有明确关联条件，禁止隐式笛卡尔积
- 子查询、视图、临时表要以执行计划为准，不机械套用
- 统计、报表、大范围导出不要压垮在线交易库，必要时走只读库、离线表或异步任务

## 事务与锁

- 事务边界放在 Service / ApplicationService 用例层，不在 Controller 层开启事务
- `@Transactional` 只加在公共方法上；加在 `private` 方法上 AOP 不生效
- 读操作显式标记 `@Transactional(readOnly = true)`，可触发只读优化
- 事务内只放必须原子提交的数据库操作，避免远程调用、长时间计算、用户交互
- 库存、余额等并发更新优先使用乐观锁、条件更新或数据库原子更新
- 悲观锁 `SELECT ... FOR UPDATE` 必须在事务内使用，并控制锁范围和顺序
- 事务传播级别要有明确理由，尤其是 `REQUIRES_NEW`

## 批量操作

- 插入、更新、删除应尽量使用批量操作，减少数据库往返次数
- 批量大小必须通过配置项控制，不允许硬编码，默认值根据业务场景设定（常见 `500`–`1000`）
- 超过批量上限的数据必须分批提交，避免大事务、长锁、内存溢出或超过 `max_allowed_packet`
- 分批逻辑统一封装为工具方法或基类，所有模块复用，不要各自写死批次大小

### 配置方式

```yaml
# application.yml
app:
  batch:
    size: 500    # 批量插入/更新/删除的每批条数
```

```java
@Data
@ConfigurationProperties(prefix = "app.batch")
public class BatchProperties {
    /** 每批处理条数，默认 500 */
    private int size = 500;
}
```

### 批量插入

```java
// ❌ 循环单条插入，N 次网络往返
for (Order order : orders) {
    orderMapper.insert(order);
}

// ❌ 批量大小硬编码
Lists.partition(orders, 500).forEach(batch -> orderMapper.batchInsert(batch));

// ✅ 批量插入 + 配置化批次大小
Lists.partition(orders, batchProperties.getSize())
    .forEach(batch -> orderMapper.batchInsert(batch));
```

### 批量更新

```java
// ✅ 批量更新，统一使用配置化批次大小
Lists.partition(updates, batchProperties.getSize())
    .forEach(batch -> orderMapper.batchUpdate(batch));
```

### 批量删除

```java
// ✅ 按 ID 批量删除，分批执行
Lists.partition(ids, batchProperties.getSize())
    .forEach(batch -> orderMapper.batchDeleteByIds(batch));
```

### MyBatis 批量 SQL 示例

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

### 注意事项

- `foreach` 拼接的 `VALUES` 受 `max_allowed_packet` 限制，大批量时分批提交
- JPA `saveAll()` 同样受批次配置影响，通过 `spring.jpa.properties.hibernate.jdbc.batch_size` 设置
- 批量操作应在事务内执行，分批时每批单独提交，避免单事务过大
- 批量查询同样适用：`WHERE id IN (...)` 中的 ID 列表也应分批，避免 SQL 过长

```java
@Service
public class UserService {
    @Transactional(readOnly = true)
    public User getUser(Long id) { ... }

    @Transactional
    public void createUser(UserDto dto) { ... }
}
```

```sql
UPDATE product
SET stock = stock - 1,
    update_user_id = ?,
    update_time = NOW()
WHERE id = ?
  AND stock > 0
  AND is_deleted = 0;
```

## 连接池

- 线程池应显式配置核心线程数、最大线程数、连接超时和空闲超时
- 最小空闲连接数要避免冷启动抖动
- 事务内不能做远程调用、长时间计算或用户交互，避免长时间占用连接
- 监控活跃连接数、等待队列、连接获取耗时，异常时能告警

## 安全与权限

- 应用账号遵循最小权限，不使用 root / DBA 账号连接业务库
- 读写分离账号按职责授权，管理权限仅限运维或迁移流程
- 敏感字段按项目安全方案加密或脱敏，日志和异常不输出明文
- 生产 DDL、批量 UPDATE/DELETE、数据订正必须有评审、备份和回滚方案

## 检查清单

### 表结构

- [ ] 表名、字段名为小写下划线且避开关键字
- [ ] 包含 `id`、`create_user_id`、`update_user_id`、`create_time`、`update_time`、`is_deleted`
- [ ] 所有字段均为 `NOT NULL`，例外字段有明确业务说明
- [ ] 金额使用 `DECIMAL`
- [ ] 字符集使用 `utf8mb4`

### 索引

- [ ] 主键稳定且合理
- [ ] 业务唯一约束有唯一索引
- [ ] 高频查询、关联、排序字段有合适索引
- [ ] 复合索引顺序符合查询模式
- [ ] 无明显冗余索引

### SQL

- [ ] 没有 `SELECT *`
- [ ] 外部输入全部参数化绑定
- [ ] MyBatis `${}` 使用了服务端白名单
- [ ] UPDATE / DELETE 有 WHERE 条件
- [ ] 业务查询默认过滤 `is_deleted = 0`

### 批量操作

- [ ] 批量大小通过配置项控制，未硬编码
- [ ] 超过批次上限的数据已分批提交
- [ ] 分批逻辑复用统一工具方法，未各自实现
- [ ] 批量插入/更新/删除在事务内分批执行
- [ ] `IN (...)` 查询的 ID 列表同样分批，避免 SQL 过长

### 事务与安全

- [ ] 事务范围足够小
- [ ] 读操作标记了 `@Transactional(readOnly = true)`
- [ ] `@Transactional` 未加在 `private` 方法或 Controller 层
- [ ] 并发更新有锁或条件保护
- [ ] 应用数据库账号权限最小化
- [ ] 高风险 DDL / 数据订正有备份和回滚方案

### 连接池

- [ ] 核心线程数、最大线程数、连接超时idleTimeout合理配置
- [ ] 最小空闲连接数避免冷启动抖动
- [ ] 没有在事务内做远程调用或长时间计算

## JPA 与 ORM

### N+1 查询问题

- `FetchType.EAGER` 或在循环中触发懒加载会导致 N+1 查询，严重影响性能
- 使用 `JOIN FETCH`、`@EntityGraph` 或批量查询解决

```java
// ❌ FetchType.EAGER 或循环触发懒加载
@Entity
public class User {
    @OneToMany(fetch = FetchType.EAGER) // 危险！
    private List<Order> orders;
}

List<User> users = userRepo.findAll(); // 1 条 SQL
for (User user : users) {
    user.getOrders().size(); // N 条 SQL
}

// ✅ 使用 JOIN FETCH
@Query("SELECT u FROM User u JOIN FETCH u.orders")
List<User> findAllWithOrders();
```

### Entity 设计

- JPA Entity 不使用 Lombok `@Data`：`@Data` 生成的 `equals`/`hashCode` 包含所有字段，可能触发懒加载导致性能问题或异常
- 使用 `@Getter`、`@Setter`，自定义 `equals`/`hashCode` 通常基于 ID
- Entity 类使用 class，不使用 record

```java
@Entity
@Getter
@Setter
public class User {
    @Id
    private Long id;
    private String userName;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof User)) return false;
        return id != null && id.equals(((User) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
```
