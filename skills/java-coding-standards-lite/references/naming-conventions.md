# 命名规范

## 总体原则

1. **见名知意**：命名应清晰表达其用途和含义
2. **英文命名**：使用标准英文，避免拼音
3. **简洁性**：在保持清晰的前提下尽量简洁
4. **一致性**：在整个项目中保持命名风格一致

## 包命名

### 基本规则
- 全部小写，单数形式
- 多个单词直接连接，不使用分隔符
- 域名反转作为包名前缀

### 示例
```
com.company.project.module
com.alibaba.platform.service
org.springframework.util
```

### 分层规范
```
com.company.project.biz          // 业务层
com.company.project.biz.dao      // 数据访问层
com.company.project.biz.service  // 服务层
com.company.project.biz.controller // 控制层
com.company.project.biz.model    // 模型层
com.company.project.biz.util     // 工具类
com.company.project.biz.exception // 异常类
```

## 类命名

### 基本规则
- 使用UpperCamelCase（大驼峰命名法）
- 名词或名词短语
- 避免缩写，除非是广泛接受的缩写

### 各类命名规范

#### 普通类
- 名词，如：`User`, `Order`, `Product`

#### 抽象类
- `Abstract` 或 `Base` 前缀
- 如：`AbstractController`, `BaseService`

#### 异常类
- `Exception` 后缀
- 如：`BusinessException`, `ValidationException`

#### 测试类
- `Test` 后缀
- 如：`UserServiceTest`, `OrderControllerTest`

#### 接口实现类
- `Impl` 后缀
- 如：`UserServiceImpl`, `OrderServiceImpl`

#### 设计模式相关
- 体现设计模式特征
- 如：`UserFactory`, `OrderBuilder`, `PaymentStrategy`

## 方法命名

### 基本规则
- 使用lowerCamelCase（小驼峰命名法）
- 动词或动宾短语

### 常用方法命名模式

#### 数据访问方法
```java
// 查询方法
User getUserById(Long id);           // 单个对象
List<User> listUsers();              // 列表
List<User> listUsersByStatus(int status); // 条件查询
Page<User> pageUsers(int page, int size); // 分页查询
int countUsers();                    // 计数
boolean existsUserById(Long id);     // 存在性检查

// 增删改方法
User saveUser(User user);            // 保存（新增或更新）
User createUser(User user);          // 新增
User updateUser(User user);          // 更新
void deleteUserById(Long id);        // 删除
void removeUserById(Long id);        // 删除（别名）
```

#### 业务方法
```java
void processOrder(Order order);      // 处理订单
void cancelOrder(Long orderId);      // 取消订单
void approveOrder(Long orderId);     // 审批订单
```

#### 布尔返回值方法
```java
boolean isValid(String input);       // 验证
boolean hasPermission(String perm);  // 权限检查
boolean isActive(User user);         // 状态检查
```

### 常见动词前缀
- `get`：获取数据
- `set`：设置数据
- `is`：布尔判断（POJO类中避免使用）
- `has`：拥有判断
- `can`：能力判断
- `create`：创建
- `update`：更新
- `delete/remove`：删除
- `process`：处理
- `validate`：验证

## 变量命名

### 基本规则
- 使用lowerCamelCase
- 避免单个字符（循环变量除外）
- 布尔变量不使用`is`前缀（POJO类除外）

### 常用变量命名

#### 普通变量
```java
String userName;        // 用户名称
int maxRetryCount;      // 最大重试次数
double totalAmount;     // 总金额
date createTime;        // 创建时间
```

#### 集合变量
```java
List<User> userList;           // 用户列表
Set<String> permissionSet;     // 权限集合
Map<Long, User> userMap;       // 用户映射
```

#### 布尔变量
```java
boolean active;          // 活跃状态（POJO类）
boolean deleted;         // 删除状态（POJO类）
boolean valid;           // 有效性
boolean hasPermission;   // 是否有权限
```

## 常量命名

### 基本规则
- 全部大写
- 单词间用下划线分隔
- 使用UPPER_SNAKE_CASE

### 常量类型

#### 静态常量
```java
public static final int MAX_RETRY_COUNT = 3;
public static final String DEFAULT_ENCODING = "UTF-8";
public static final long ONE_DAY_MILLIS = 24 * 60 * 60 * 1000L;
```

#### 枚举常量
```java
public enum OrderStatus {
    PENDING_PAYMENT,
    PAID,
    SHIPPED,
    DELIVERED,
    CANCELLED
}
```

#### 配置常量
```java
public static final String DB_URL = "jdbc:mysql://localhost:3306/db";
public static final int DB_MAX_CONNECTIONS = 100;
```

## 数据库命名

### 表命名
- 小写字母，单词间用下划线分隔
- 复数形式
- 避免数据库关键字

```sql
-- 用户相关
table user
user_profile
user_permission

-- 订单相关
order_info
order_item
order_payment

-- 系统相关
system_config
operation_log
```

### 字段命名
- 小写字母，单词间用下划线分隔
- 常用字段：`id`, `create_time`, `update_time`
- 布尔字段：`is_`前缀

```sql
-- 基础字段
id                  -- 主键
create_time         -- 创建时间
update_time         -- 更新时间
is_deleted          -- 删除标志

-- 业务字段
user_name           -- 用户名
email_address       -- 邮箱地址
phone_number        -- 电话号码
```

## 特殊命名约定

### 泛型命名
```java
T  // 单个泛型类型
K, V  // 键值对
E  // 集合元素类型
```

### 注解命名
```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Loggable {
    String value() default "";
}
```

### 配置文件命名
```properties
application.properties     # Spring Boot配置文件
logback-spring.xml        # 日志配置文件
mybatis-config.xml        # MyBatis配置文件
```

## 避免的命名

### ❌ 不推荐的命名
```java
// 过于简单
String s;
int a, b, c;

// 使用拼音
String yongHuMing;

// 使用缩写（除非广泛接受）
String pwd;  // 应该是 password
String usr;  // 应该是 user

// 使用下划线分隔的驼峰命名
String user_name;  // 应该是 userName
```

### ✅ 推荐的命名
```java
String userName;
String password;
int maxRetryCount;
List<User> userList;
```

## 命名检查清单

- [ ] 是否使用英文命名
- [ ] 是否符合驼峰命名法
- [ ] 是否见名知意
- [ ] 是否避免使用缩写
- [ ] 常量是否使用大写
- [ ] 包名是否使用小写
- [ ] 布尔变量命名是否合适
- [ ] 方法名是否使用动词开头