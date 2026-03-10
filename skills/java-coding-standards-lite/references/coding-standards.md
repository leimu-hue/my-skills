# 编码规范

## 代码格式

### 缩进和对齐

#### 缩进规则
- 使用4个空格进行缩进，不使用Tab
- 保持一致的缩进层级

```java
// ✅ 正确：4空格缩进
public class UserService {
    public User getUserById(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("ID不能为空");
        }
        return userDao.selectById(id);
    }
}

// ❌ 错误：使用Tab或空格数不一致
public class UserService {
	public User getUserById(Long id) {
    if (id == null) {
		throw new IllegalArgumentException("ID不能为空");
    }
		return userDao.selectById(id);
	}
}
```

#### 行长度
- 单行代码不超过120个字符
- 超过限制时需要合理换行

```java
// ✅ 正确：合理换行
String sql = "SELECT id, user_name, email, phone_number " +
             "FROM user_info " +
             "WHERE status = ? AND create_time >= ?";

// ✅ 正确：方法链调用换行
List<User> users = userList.stream()
    .filter(user -> user.getAge() >= 18)
    .sorted(Comparator.comparing(User::getUserName))
    .collect(Collectors.toList());

// ❌ 错误：单行过长
String sql = "SELECT id, user_name, email, phone_number FROM user_info WHERE status = ? AND create_time >= ? AND is_deleted = 0 ORDER BY create_time DESC";
```

### 空行规则

#### 类级别空行
- 类定义与成员变量之间空一行
- 方法与方法之间空一行
- 逻辑代码块之间空一行

```java
public class UserService {

    private static final Logger logger = LoggerFactory.getLogger(UserService.class);

    private final UserDao userDao;

    public UserService(UserDao userDao) {
        this.userDao = userDao;
    }

    public User getUserById(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("ID不能为空");
        }

        User user = userDao.selectById(id);
        if (user == null) {
            logger.warn("用户不存在，ID: {}", id);
            throw new UserNotFoundException("用户不存在");
        }

        return user;
    }

    public List<User> listActiveUsers() {
        return userDao.selectActiveUsers();
    }
}
```

#### 方法内部空行
- 不同逻辑块之间使用空行分隔
- 变量声明与执行语句之间空行

```java
public void processOrder(Order order) {
    // 参数验证
    if (order == null) {
        throw new IllegalArgumentException("订单不能为空");
    }

    // 业务逻辑处理
    validateOrder(order);
    calculateAmount(order);

    // 数据持久化
    orderDao.save(order);
    logger.info("订单处理完成，订单号: {}", order.getOrderNo());
}
```

## 常量定义

### 常量命名
- 使用UPPER_SNAKE_CASE
- 添加有意义的注释

```java
// 系统配置常量
public static final int MAX_RETRY_COUNT = 3;
public static final long DEFAULT_TIMEOUT = 5000L;
public static final String DEFAULT_ENCODING = "UTF-8";

// 业务常量
public static final int ORDER_STATUS_PENDING = 1;
public static final int ORDER_STATUS_PAID = 2;
public static final int ORDER_STATUS_SHIPPED = 3;

// 错误码常量
public static final String ERROR_USER_NOT_FOUND = "USER_NOT_FOUND";
public static final String ERROR_ORDER_EXPIRED = "ORDER_EXPIRED";
```

### 魔法数字处理

#### ❌ 避免魔法数字
```java
// ❌ 错误：直接使用魔法数字
if (status == 1) {
    // 处理逻辑
}

for (int i = 0; i < 10; i++) {
    // 循环逻辑
}
```

#### ✅ 使用命名常量
```java
// ✅ 正确：使用命名常量
private static final int ORDER_STATUS_ACTIVE = 1;
private static final int MAX_BATCH_SIZE = 10;

if (status == ORDER_STATUS_ACTIVE) {
    // 处理逻辑
}

for (int i = 0; i < MAX_BATCH_SIZE; i++) {
    // 循环逻辑
}
```

## 面向对象编程

### 访问修饰符

#### 基本原则
- 成员变量使用`private`
- 仅在需要时使用`protected`
- 避免使用`public`成员变量

```java
public class User {

    // ✅ 正确：private成员变量
    private Long id;
    private String userName;
    private String email;

    // ❌ 错误：public成员变量
    public String password;

    // ✅ 正确：protected用于子类访问
    protected Date createTime;
}
```

#### 方法访问级别
```java
public class UserService {

    // public方法：对外提供服务
    public User getUserById(Long id) {
        return doGetUser(id);
    }

    // private方法：内部实现细节
    private User doGetUser(Long id) {
        // 实现逻辑
    }

    // protected方法：允许子类重写
    protected void validateUser(User user) {
        // 验证逻辑
    }
}
```

### 封装原则

#### 数据封装
```java
public class BankAccount {
    private BigDecimal balance;
    private String accountNumber;

    // 提供受控的访问方法
    public BigDecimal getBalance() {
        return balance;
    }

    // 不提供setBalance方法，通过业务方法修改余额
    public void deposit(BigDecimal amount) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("存款金额必须大于0");
        }
        this.balance = this.balance.add(amount);
    }

    public void withdraw(BigDecimal amount) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("取款金额必须大于0");
        }
        if (amount.compareTo(this.balance) > 0) {
            throw new InsufficientBalanceException("余额不足");
        }
        this.balance = this.balance.subtract(amount);
    }
}
```

### 继承和多态

#### 合理使用继承
```java
// ✅ 正确：合理的继承关系
public abstract class AbstractPaymentProcessor {
    protected final Logger logger = LoggerFactory.getLogger(getClass());

    public final PaymentResult process(PaymentRequest request) {
        validateRequest(request);
        PaymentResult result = doProcess(request);
        logResult(result);
        return result;
    }

    protected abstract PaymentResult doProcess(PaymentRequest request);

    private void validateRequest(PaymentRequest request) {
        // 通用验证逻辑
    }

    private void logResult(PaymentResult result) {
        // 通用日志逻辑
    }
}

public class AlipayProcessor extends AbstractPaymentProcessor {
    @Override
    protected PaymentResult doProcess(PaymentRequest request) {
        // 支付宝特定的处理逻辑
    }
}
```

#### 避免过度继承
```java
// ❌ 错误：过度继承，违反组合优于继承原则
public class UserService extends BaseService {
    // 继承了不必要的功能
}

// ✅ 正确：使用组合
public class UserService {
    private final BaseServiceHelper helper;

    public UserService(BaseServiceHelper helper) {
        this.helper = helper;
    }
}
```

## 日期和时间处理

### 使用Java 8+时间API

#### ❌ 避免使用旧的日期API
```java
// ❌ 错误：使用旧的Date和Calendar
Date now = new Date();
Calendar calendar = Calendar.getInstance();
calendar.add(Calendar.DAY_OF_MONTH, 7);
Date future = calendar.getTime();
```

#### ✅ 使用新的时间API
```java
// ✅ 正确：使用Java 8时间API
LocalDateTime now = LocalDateTime.now();
LocalDateTime future = now.plusDays(7);

// 时间格式化
DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
String formattedDate = now.format(formatter);

// 时间解析
LocalDateTime parsed = LocalDateTime.parse("2023-01-01 12:00:00", formatter);
```

### 时区处理
```java
// 明确指定时区
ZonedDateTime beijingTime = ZonedDateTime.now(ZoneId.of("Asia/Shanghai"));
ZonedDateTime utcTime = ZonedDateTime.now(ZoneOffset.UTC);

// 时区转换
ZonedDateTime converted = beijingTime.withZoneSameInstant(ZoneOffset.UTC);
```

### 时间戳处理
```java
// 获取当前时间戳
long currentTimestamp = System.currentTimeMillis();

// LocalDateTime转时间戳
long timestamp = now.toInstant(ZoneOffset.ofHours(8)).toEpochMilli();

// 时间戳转LocalDateTime
LocalDateTime dateTime = LocalDateTime.ofInstant(
    Instant.ofEpochMilli(timestamp),
    ZoneOffset.ofHours(8)
);
```

## 集合处理

### 集合初始化

#### 指定初始容量
```java
// ✅ 正确：指定初始容量
List<User> users = new ArrayList<>(100);
Map<Long, User> userMap = new HashMap<>(100);

// ❌ 错误：未指定容量
List<User> users = new ArrayList<>();
Map<Long, User> userMap = new HashMap<>();
```

#### 不可变集合
```java
// 创建不可变集合
List<String> immutableList = Collections.unmodifiableList(Arrays.asList("a", "b", "c"));
Map<String, String> immutableMap = Collections.unmodifiableMap(new HashMap<>());

// Java 9+
List<String> list = List.of("a", "b", "c");
Map<String, Integer> map = Map.of("key1", 1, "key2", 2);
```

### 集合操作最佳实践

#### 流式操作
```java
// ✅ 正确：使用Stream API
List<String> names = users.stream()
    .filter(user -> user.getAge() >= 18)
    .map(User::getUserName)
    .sorted()
    .collect(Collectors.toList());

// ❌ 错误：传统循环方式
List<String> names = new ArrayList<>();
for (User user : users) {
    if (user.getAge() >= 18) {
        names.add(user.getUserName());
    }
}
Collections.sort(names);
```

#### 集合判空
```java
// ✅ 正确：使用CollectionUtils或Stream
if (CollectionUtils.isEmpty(users)) {
    return Collections.emptyList();
}

// 或者
if (users == null || users.isEmpty()) {
    return Collections.emptyList();
}

// ❌ 错误：只检查null
if (users == null) {
    return Collections.emptyList();
}
// users可能为空集合
```

## 控制语句

### if-else语句

#### 简洁的if语句
```java
// ✅ 正确：提前返回减少嵌套
public User getUserById(Long id) {
    if (id == null) {
        throw new IllegalArgumentException("ID不能为空");
    }

    User user = userDao.selectById(id);
    if (user == null) {
        return null;
    }

    return user;
}

// ❌ 错误：过度嵌套
public User getUserById(Long id) {
    if (id != null) {
        User user = userDao.selectById(id);
        if (user != null) {
            return user;
        } else {
            return null;
        }
    } else {
        throw new IllegalArgumentException("ID不能为空");
    }
}
```

#### 三元运算符
```java
// ✅ 正确：简单的条件赋值
String status = order.getAmount() > 1000 ? "VIP" : "NORMAL";

// ❌ 错误：复杂的三元运算
String result = condition1 ? (condition2 ? "A" : "B") : (condition3 ? "C" : "D");
```

### switch语句

#### 完整的switch语句
```java
// ✅ 正确：包含default分支
public String getStatusText(int status) {
    switch (status) {
        case 1:
            return "待支付";
        case 2:
            return "已支付";
        case 3:
            return "已发货";
        case 4:
            return "已完成";
        default:
            throw new IllegalArgumentException("未知状态: " + status);
    }
}

// ❌ 错误：缺少default分支
public String getStatusText(int status) {
    switch (status) {
        case 1:
            return "待支付";
        case 2:
            return "已支付";
        // 缺少default处理
    }
}
```

### 循环语句

#### for循环
```java
// ✅ 正确：增强for循环遍历集合
for (User user : users) {
    processUser(user);
}

// ✅ 正确：传统for循环用于数组
for (int i = 0; i < array.length; i++) {
    process(array[i]);
}

// ✅ 正确：while循环处理条件
while (iterator.hasNext()) {
    User user = iterator.next();
    processUser(user);
}
```

#### 避免无限循环
```java
// ✅ 正确：明确的循环条件
int retryCount = 0;
while (retryCount < MAX_RETRY_COUNT) {
    try {
        performOperation();
        break;
    } catch (Exception e) {
        retryCount++;
        if (retryCount >= MAX_RETRY_COUNT) {
            throw e;
        }
    }
}

// ❌ 错误：可能导致无限循环
while (true) {
    if (shouldBreak()) {
        break;
    }
    // 如果shouldBreak()永远返回false，将无限循环
}
```

## 方法设计

### 方法长度
- 单个方法不超过80行
- 保持方法单一职责

```java
// ✅ 正确：职责单一的小方法
public void processOrder(Order order) {
    validateOrder(order);
    calculateAmount(order);
    updateInventory(order);
    saveOrder(order);
    sendNotification(order);
}

private void validateOrder(Order order) {
    // 验证逻辑
}

private void calculateAmount(Order order) {
    // 计算逻辑
}

// ❌ 错误：方法过长，职责过多
public void processOrder(Order order) {
    // 验证、计算、更新、保存、通知等所有逻辑都在一个方法中
    // 方法可能超过200行
}
```

### 参数设计

#### 参数数量
- 方法参数不超过5个
- 过多参数考虑使用参数对象

```java
// ✅ 正确：使用参数对象
public void createUser(UserCreateRequest request) {
    // 处理请求
}

// ❌ 错误：参数过多
public void createUser(String userName, String email, String phone,
                      String password, int age, String address) {
    // 处理逻辑
}
```

#### 参数验证
```java
// ✅ 正确：方法开始处验证参数
public User updateUser(Long id, UserUpdateRequest request) {
    if (id == null) {
        throw new IllegalArgumentException("用户ID不能为空");
    }
    if (request == null) {
        throw new IllegalArgumentException("更新请求不能为空");
    }

    // 业务逻辑
}

// ❌ 错误：缺少参数验证
public User updateUser(Long id, UserUpdateRequest request) {
    // 直接使用参数，可能导致NPE
    User user = userDao.selectById(id);
    user.setUserName(request.getUserName());
}
```

## 注释规范

### 类级别注释
```java
/**
 * 用户服务类
 *
 * 提供用户相关的业务操作，包括用户的增删改查、
 * 用户状态管理、用户权限验证等功能。
 *
 * @author 开发者姓名
 * @version 1.0
 * @since 2023-01-01
 */
public class UserService {
    // 类实现
}
```

### 方法级别注释
```java
/**
 * 根据用户ID获取用户信息
 *
 * @param id 用户ID，不能为空
 * @return 用户对象，如果不存在返回null
 * @throws IllegalArgumentException 当id为null时抛出
 * @throws UserNotFoundException 当用户不存在时抛出
 */
public User getUserById(Long id) {
    // 方法实现
}
```

### 行内注释
```java
// ✅ 正确：解释复杂逻辑
if (user.getStatus() == USER_STATUS_ACTIVE &&
    user.getLastLoginTime().isAfter(LocalDateTime.now().minusDays(30))) {
    // 活跃用户且最近30天内有登录行为
    sendWelcomeBackEmail(user);
}

// ❌ 错误：注释过于简单
int count = 0; // 设置count为0
```

## 代码质量检查清单

### 格式检查
- [ ] 使用4空格缩进
- [ ] 行长度不超过120字符
- [ ] 合理使用空行分隔逻辑块
- [ ] 导入语句按字母顺序排列

### 常量检查
- [ ] 避免魔法数字
- [ ] 常量使用大写命名
- [ ] 常量有明确的业务含义

### OOP检查
- [ ] 成员变量使用private修饰
- [ ] 合理使用封装
- [ ] 避免过度继承
- [ ] 使用组合优于继承

### 方法检查
- [ ] 方法长度不超过80行
- [ ] 方法参数不超过5个
- [ ] 方法职责单一
- [ ] 参数验证完整

### 集合检查
- [ ] 集合初始化指定容量
- [ ] 使用合适的集合类型
- [ ] 集合判空处理完整
- [ ] 合理使用Stream API

### 异常检查
- [ ] 异常处理完整
- [ ] 避免空的catch块
- [ ] 异常信息明确
- [ ] 合理使用自定义异常