# 数据库设计与SQL规范

## 数据库设计原则

### 1. 表设计规范

#### 表命名规则
```sql
-- ✅ 正确：小写字母，下划线分隔，复数形式
CREATE TABLE user_orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    order_no VARCHAR(32) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status TINYINT NOT NULL DEFAULT 1,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_no (order_no),
    KEY idx_user_id (user_id),
    KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ❌ 错误：使用大写、单数、驼峰命名
CREATE TABLE UserOrder (
    ID BIGINT NOT NULL AUTO_INCREMENT,
    UserId BIGINT NOT NULL,
    OrderNo VARCHAR(32) NOT NULL,
    ...
);
```

#### 字段命名规范
```sql
-- ✅ 正确：小写字母，下划线分隔
CREATE TABLE user_profiles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email_address VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NULL,
    is_verified TINYINT NOT NULL DEFAULT 0,
    is_deleted TINYINT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- ❌ 错误：使用驼峰、大写、简写
CREATE TABLE user_profiles (
    Id BIGINT NOT NULL,
    UserId BIGINT NOT NULL,
    firstName VARCHAR(50) NOT NULL,
    Email VARCHAR(100) NOT NULL,
    Phone VARCHAR(20) NULL,
    ...
);
```

### 2. 字段类型选择

#### 数值类型
```sql
-- ✅ 正确：根据数据范围选择合适的类型
CREATE TABLE products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,  -- 大表使用BIGINT
    category_id INT UNSIGNED NOT NULL,          -- 中等范围使用INT
    sort_order SMALLINT NOT NULL DEFAULT 0,     -- 小范围使用SMALLINT
    status TINYINT NOT NULL DEFAULT 1,          -- 状态使用TINYINT
    stock_count INT NOT NULL DEFAULT 0,         -- 库存数量
    price DECIMAL(10,2) NOT NULL,              -- 价格使用DECIMAL
    score DECIMAL(3,2) NULL,                   -- 评分
    PRIMARY KEY (id)
);

-- ❌ 错误：过度使用BIGINT或使用浮点数存储金额
CREATE TABLE products (
    id BIGINT UNSIGNED NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,  -- 过度使用BIGINT
    price DOUBLE NOT NULL,                 -- 不应使用浮点数存储金额
    ...
);
```

#### 字符串类型
```sql
-- ✅ 正确：根据数据长度选择合适的类型
CREATE TABLE articles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,           -- 短文本使用VARCHAR
    summary VARCHAR(500) NULL,             -- 中等长度文本
    content LONGTEXT NULL,                 -- 长文本使用TEXT类型
    author_name VARCHAR(50) NOT NULL,
    tags VARCHAR(200) NULL,                -- 标签，逗号分隔
    PRIMARY KEY (id)
);

-- 固定长度使用CHAR
CREATE TABLE countries (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    country_code CHAR(2) NOT NULL,         -- ISO国家代码，固定2位
    country_name VARCHAR(100) NOT NULL,
    phone_code CHAR(4) NULL,               -- 国际电话区号
    PRIMARY KEY (id)
);
```

#### 时间类型
```sql
-- ✅ 正确：使用合适的时间类型
CREATE TABLE user_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    login_time DATETIME NOT NULL,          -- 登录时间
    last_active_time DATETIME NULL,        -- 最后活跃时间
    expire_time DATETIME NOT NULL,         -- 过期时间
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- 时间戳使用TIMESTAMP（如果需要时区转换）
CREATE TABLE system_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    log_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ...
);
```

### 3. 索引设计

#### 主键设计
```sql
-- ✅ 正确：使用BIGINT UNSIGNED自增主键
CREATE TABLE orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ...
    PRIMARY KEY (id)
);

-- ✅ 正确：使用业务主键（当业务字段能唯一标识时）
CREATE TABLE user_accounts (
    user_id BIGINT UNSIGNED NOT NULL,
    account_type TINYINT NOT NULL,
    ...
    PRIMARY KEY (user_id, account_type)  -- 复合主键
);

-- ❌ 错误：使用不稳定的业务字段作为主键
CREATE TABLE users (
    email VARCHAR(100) NOT NULL,  -- 邮箱可能变更
    ...
    PRIMARY KEY (email)
);
```

#### 唯一索引
```sql
-- ✅ 正确：为业务唯一约束创建唯一索引
CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_name (user_name),
    UNIQUE KEY uk_email (email),
    UNIQUE KEY uk_phone (phone)
);

-- 复合唯一索引
CREATE TABLE user_roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    role_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_role (user_id, role_id)
);
```

#### 普通索引
```sql
-- ✅ 正确：为查询条件创建索引
CREATE TABLE orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    order_no VARCHAR(32) NOT NULL,
    status TINYINT NOT NULL,
    create_time DATETIME NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_no (order_no),
    KEY idx_user_id (user_id),
    KEY idx_status (status),
    KEY idx_create_time (create_time),
    KEY idx_user_status (user_id, status),  -- 复合索引
    KEY idx_amount (amount)
);
```

#### 索引设计原则
```sql
-- 1. 查询频率高的字段建索引
-- 2. 区分度高的字段优先
-- 3. 复合索引注意字段顺序
-- 4. 避免过多索引影响写入性能

-- ✅ 正确：合理的复合索引
CREATE TABLE order_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    create_time DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_order_id (order_id),           -- 按订单查询
    KEY idx_product_id (product_id),       -- 按商品查询
    KEY idx_create_time (create_time),     -- 按时间查询
    KEY idx_order_product (order_id, product_id)  -- 复合查询
);
```

## SQL编写规范

### 1. 基本SQL规范

#### SELECT语句
```sql
-- ✅ 正确：明确指定字段，避免SELECT *
SELECT
    o.id,
    o.order_no,
    o.total_amount,
    o.status,
    u.user_name,
    u.email
FROM orders o
INNER JOIN users u ON o.user_id = u.id
WHERE o.status = 1
    AND o.create_time >= '2023-01-01'
ORDER BY o.create_time DESC
LIMIT 0, 20;

-- ❌ 错误：使用SELECT *
SELECT * FROM orders;

-- ❌ 错误：字段列表不明确
SELECT o.*, u.* FROM orders o, users u WHERE o.user_id = u.id;
```

#### INSERT语句
```sql
-- ✅ 正确：明确指定字段名
INSERT INTO users (
    user_name,
    email,
    phone,
    password,
    status,
    create_time
) VALUES (
    'john_doe',
    'john@example.com',
    '13800138000',
    'encrypted_password',
    1,
    NOW()
);

-- ❌ 错误：不指定字段名
INSERT INTO users VALUES ('john_doe', 'john@example.com', ...);
```

#### UPDATE语句
```sql
-- ✅ 正确：UPDATE语句包含WHERE条件
UPDATE users
SET
    email = 'new_email@example.com',
    update_time = NOW()
WHERE id = 123
    AND is_deleted = 0;

-- ❌ 错误：缺少WHERE条件（会更新所有记录）
UPDATE users SET email = 'new_email@example.com';
```

#### DELETE语句
```sql
-- ✅ 正确：逻辑删除优于物理删除
UPDATE users
SET
    is_deleted = 1,
    update_time = NOW()
WHERE id = 123;

-- 物理删除（谨慎使用）
DELETE FROM user_sessions WHERE expire_time < NOW();
```

### 2. 查询优化

#### 避免全表扫描
```sql
-- ✅ 正确：使用索引字段作为查询条件
SELECT * FROM orders WHERE user_id = 123;
SELECT * FROM orders WHERE order_no = 'ORDER123456';

-- ❌ 错误：在非索引字段上查询
SELECT * FROM orders WHERE total_amount > 1000;  -- 如果amount没有索引
```

#### 合理使用JOIN
```sql
-- ✅ 正确：使用合适的JOIN类型
-- INNER JOIN：只返回匹配的记录
SELECT u.user_name, COUNT(o.id) as order_count
FROM users u
INNER JOIN orders o ON u.id = o.user_id
WHERE o.status = 2
GROUP BY u.id;

-- LEFT JOIN：返回左表所有记录
SELECT u.user_name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id AND o.status = 2
GROUP BY u.id;

-- ❌ 错误：笛卡尔积
SELECT * FROM users, orders;  -- 会产生笛卡尔积
```

#### 分页查询优化
```sql
-- ✅ 正确：使用游标分页（推荐）
SELECT * FROM orders
WHERE id > 1000
ORDER BY id
LIMIT 20;

-- ✅ 正确：使用覆盖索引优化分页
SELECT * FROM orders o
INNER JOIN (
    SELECT id FROM orders
    WHERE status = 1
    ORDER BY create_time DESC
    LIMIT 10000, 20
) temp ON o.id = temp.id;

-- ❌ 错误：大偏移量分页
SELECT * FROM orders
ORDER BY create_time DESC
LIMIT 10000, 20;  -- 性能差
```

### 3. 子查询和视图

#### 子查询优化
```sql
-- ✅ 正确：使用EXISTS替代IN（当子查询结果集大时）
SELECT * FROM users u
WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = u.id
    AND o.status = 2
);

-- ✅ 正确：使用JOIN替代相关子查询
SELECT u.*, o.order_count
FROM users u
LEFT JOIN (
    SELECT user_id, COUNT(*) as order_count
    FROM orders
    WHERE status = 2
    GROUP BY user_id
) o ON u.id = o.user_id;

-- ❌ 错误：相关子查询性能差
SELECT u.*,
    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 2) as order_count
FROM users u;
```

#### 视图使用
```sql
-- ✅ 正确：创建业务视图简化查询
CREATE VIEW user_order_summary AS
SELECT
    u.id as user_id,
    u.user_name,
    u.email,
    COUNT(o.id) as total_orders,
    SUM(o.total_amount) as total_amount,
    MAX(o.create_time) as last_order_time
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.status = 2
GROUP BY u.id, u.user_name, u.email;

-- 使用视图
SELECT * FROM user_order_summary WHERE total_orders > 5;
```

## 事务处理

### 1. 事务使用原则

#### 事务边界
```java
// ✅ 正确：合理的事务边界
@Service
@Transactional
public class OrderService {

    public OrderResult createOrder(OrderCreateRequest request) {
        // 1. 验证参数
        validateRequest(request);

        // 2. 创建订单
        Order order = buildOrder(request);
        orderDao.save(order);

        // 3. 创建订单项
        for (OrderItem item : request.getItems()) {
            OrderItem orderItem = buildOrderItem(order.getId(), item);
            orderItemDao.save(orderItem);

            // 4. 扣减库存
            updateProductStock(item.getProductId(), item.getQuantity());
        }

        // 5. 处理支付
        processPayment(order);

        return OrderResult.success(order);
    }
}

// ❌ 错误：事务范围过大
@Transactional
public void processAllOrders() {
    // 处理所有订单的逻辑都在一个事务中
    // 可能导致事务过长，锁等待
}
```

#### 事务传播
```java
// ✅ 正确：使用合适的事务传播级别
@Service
public class PaymentService {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void processPayment(PaymentRequest request) {
        // 支付处理需要独立事务
        // 即使外层事务回滚，支付记录也应该保留
    }
}

@Service
public class OrderService {

    @Transactional
    public void createOrder(OrderCreateRequest request) {
        try {
            // 创建订单
            Order order = createOrderInternal(request);

            // 处理支付（独立事务）
            paymentService.processPayment(buildPaymentRequest(order));

        } catch (Exception e) {
            // 订单创建失败，但支付记录可能已经存在
            throw e;
        }
    }
}
```

### 2. 锁机制

#### 乐观锁
```sql
-- ✅ 正确：使用版本号实现乐观锁
CREATE TABLE products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    stock INT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    PRIMARY KEY (id)
);

-- 更新时检查版本号
UPDATE products
SET
    stock = stock - 1,
    version = version + 1
WHERE id = 123
    AND version = 5;  -- 期望的版本号

-- 检查影响行数
-- 如果返回0，说明版本号不匹配，更新失败
```

#### 悲观锁
```sql
-- ✅ 正确：使用SELECT FOR UPDATE
START TRANSACTION;

-- 查询并锁定记录
SELECT * FROM accounts
WHERE user_id = 123
FOR UPDATE;

-- 执行业务逻辑
UPDATE accounts
SET balance = balance - 100
WHERE user_id = 123;

COMMIT;

-- ❌ 错误：不加锁的并发更新
START TRANSACTION;
SELECT balance FROM accounts WHERE user_id = 123;  -- 不加锁
-- 其他事务可能同时修改
doSomeBusinessLogic();
UPDATE accounts SET balance = balance - 100 WHERE user_id = 123;
COMMIT;
```

## 数据库性能优化

### 1. 查询性能

#### 执行计划分析
```sql
-- 使用EXPLAIN分析查询计划
EXPLAIN SELECT * FROM orders WHERE user_id = 123;

-- 关注的关键指标：
-- type: 访问类型（system > const > eq_ref > ref > range > index > ALL）
-- key: 使用的索引
-- rows: 扫描行数
-- Extra: 额外信息（Using filesort, Using temporary等）
```

#### 索引优化
```sql
-- ✅ 正确：覆盖索引优化
-- 创建包含查询所需所有字段的索引
CREATE INDEX idx_user_status_amount ON orders(user_id, status, total_amount);

-- 查询可以直接从索引获取数据，无需回表
SELECT user_id, status, total_amount
FROM orders
WHERE user_id = 123 AND status = 1;

-- ✅ 正确：索引下推优化
-- MySQL 5.6+支持，减少回表次数
SELECT * FROM orders
WHERE user_id = 123
    AND create_time >= '2023-01-01'
    AND total_amount > 1000;
-- 如果索引是(user_id, create_time, total_amount)，可以在索引层过滤total_amount
```

### 2. 表结构优化

#### 分区表
```sql
-- ✅ 正确：按时间分区
CREATE TABLE order_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(50) NOT NULL,
    create_time DATETIME NOT NULL,
    PRIMARY KEY (id, create_time)
) PARTITION BY RANGE (YEAR(create_time)) (
    PARTITION p2022 VALUES LESS THAN (2023),
    PARTITION p2023 VALUES LESS THAN (2024),
    PARTITION p2024 VALUES LESS THAN (2025)
);

-- 查询特定年份的数据只需要扫描对应分区
SELECT * FROM order_logs
WHERE create_time >= '2023-01-01'
    AND create_time < '2024-01-01';
```

#### 垂直拆分
```sql
-- ✅ 正确：将大表按列拆分
-- 主表：经常访问的字段
CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    status TINYINT NOT NULL,
    create_time DATETIME NOT NULL,
    PRIMARY KEY (id)
);

-- 详情表：不常访问的大字段
CREATE TABLE user_profiles (
    user_id BIGINT UNSIGNED NOT NULL,
    avatar_url TEXT NULL,
    bio TEXT NULL,
    preferences JSON NULL,
    PRIMARY KEY (user_id)
);
```

### 3. 连接池配置

#### 连接池参数
```properties
# HikariCP配置示例
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.idle-timeout=300000
spring.datasource.hikari.max-lifetime=1800000
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.connection-test-query=SELECT 1
```

## 数据库安全

### 1. SQL注入防护

#### 参数化查询
```java
// ✅ 正确：使用预编译语句
String sql = "SELECT * FROM users WHERE user_name = ? AND status = ?";
PreparedStatement ps = connection.prepareStatement(sql);
ps.setString(1, userName);
ps.setInt(2, status);

// MyBatis参数绑定
@Select("SELECT * FROM users WHERE user_name = #{userName} AND status = #{status}")
List<User> findUsers(@Param("userName") String userName, @Param("status") int status);

// ❌ 错误：字符串拼接（SQL注入风险）
String sql = "SELECT * FROM users WHERE user_name = '" + userName + "'";
```

#### 输入验证
```java
// ✅ 正确：验证输入参数
public List<User> searchUsers(String keyword, Integer page, Integer size) {
    // 验证参数
    if (keyword != null && keyword.length() > 100) {
        throw new ValidationException("搜索关键词过长");
    }
    if (page != null && (page < 1 || page > 1000)) {
        throw new ValidationException("页码超出范围");
    }
    if (size != null && (size < 1 || size > 100)) {
        throw new ValidationException("每页条数超出范围");
    }

    // 执行查询
    return userDao.search(keyword, page, size);
}
```

### 2. 权限控制

#### 数据库用户权限
```sql
-- ✅ 正确：最小权限原则
-- 只读用户
CREATE USER 'app_read'@'%' IDENTIFIED BY 'password';
GRANT SELECT ON database.* TO 'app_read'@'%';

-- 读写用户
CREATE USER 'app_write'@'%' IDENTIFIED BY 'password';
GRANT SELECT, INSERT, UPDATE ON database.* TO 'app_write'@'%';

-- 管理用户（仅限DBA）
CREATE USER 'dba'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON *.* TO 'dba'@'localhost';

-- ❌ 错误：应用使用root账户
GRANT ALL PRIVILEGES ON *.* TO 'app'@'%';
```

## 数据库检查清单

### 表设计检查
- [ ] 表名使用小写字母和下划线
- [ ] 字段名使用小写字母和下划线
- [ ] 包含必要的字段（id, create_time, update_time）
- [ ] 使用合适的数据类型
- [ ] 避免使用浮点数存储金额
- [ ] 设置合适的字符集（utf8mb4）

### 索引检查
- [ ] 主键设计合理
- [ ] 为查询条件创建索引
- [ ] 为外键创建索引
- [ ] 避免过多索引
- [ ] 复合索引字段顺序合理

### SQL编写检查
- [ ] 避免使用SELECT *
- [ ] 使用参数化查询
- [ ] UPDATE/DELETE语句包含WHERE条件
- [ ] 合理使用JOIN
- [ ] 分页查询优化

### 性能检查
- [ ] 使用EXPLAIN分析慢查询
- [ ] 避免全表扫描
- [ ] 合理使用事务
- [ ] 连接池配置合理
- [ ] 定期维护索引

### 安全检查
- [ ] 防止SQL注入
- [ ] 输入参数验证
- [ ] 数据库用户权限控制
- [ ] 敏感数据加密
- [ ] 定期备份