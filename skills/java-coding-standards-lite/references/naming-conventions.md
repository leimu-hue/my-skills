# 命名规范

## 总体原则

- 优先跟随项目已有命名；新增代码保持同包、同模块风格一致
- 使用标准英文，避免拼音和不通用缩写
- 名称表达业务含义，不用类型、层级或技术细节凑长度
- 清晰优先于短；短名称只用于局部循环变量、lambda 参数、泛型

## Java 命名

| 对象 | 规则 | 示例 | 避免 |
| --- | --- | --- | --- |
| 包 | 全小写，域名反转；多词不加分隔符 | `com.company.project.order` | `com.company.Project`, `order_service` |
| 类 / 接口 | UpperCamelCase，名词或名词短语 | `UserService`, `OrderRepository` | `userService`, `Data` |
| 方法 | lowerCamelCase，动词或动宾短语 | `createUser`, `cancelOrder` | `userCreate`, `doIt` |
| 变量 / 字段 | lowerCamelCase，表达业务含义 | `userName`, `maxRetryCount` | `s`, `usr`, `user_name` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` | `maxRetryCount` |
| 枚举值 | UPPER_SNAKE_CASE（与常量一致） | `PENDING_PAYMENT` | `PendingPayment` |
| 测试类 | 被测类名 + `Test` | `UserServiceTest` | `TestUserService` |
| 异常类 | 语义名 + `Exception` | `BusinessException` | `BusinessError` |

## 类名后缀

- `Controller`：HTTP 接口层
- `Service` / `ApplicationService`：业务用例编排
- `Repository` / `Mapper` / `Dao`：数据访问，按项目既有技术栈选择
- `Client`：外部服务调用
- `Adapter`：第三方、遗留系统或协议适配
- `Factory`、`Builder`、`Strategy`、`Policy`：仅在确有模式或规则含义时使用
- `Impl`：只有项目已有该风格，或接口有多个实现且实现名无业务差异时使用；能表达业务差异时优先 `AlipayPaymentProcessor`、`CreditCardPaymentProcessor`
- `Base` / `Abstract`：抽象基类；不要给普通父类滥用

## 方法命名

| 场景 | 推荐前缀 | 说明 |
| --- | --- | --- |
| 单个查询 | `get` / `find` | `get` 可表示不存在即异常；`find` 可表示返回 `Optional` 或允许为空 |
| 列表查询 | `list` / `find...By` | Service 常用 `listUsers`，Repository 跟随框架如 `findByStatus` |
| 分页查询 | `page` | `pageUsers(query)` |
| 计数 | `count` | `countUsersByStatus` |
| 是否存在 | `exists` | `existsUserById` |
| 新增 | `create` | 有明确创建语义 |
| 保存 | `save` | 可新增或更新时使用 |
| 更新 | `update` | 修改已有对象 |
| 删除 | `delete` / `remove` | 物理删除常用 `delete`；移出集合或关系可用 `remove` |
| 校验 | `validate` / `check` | `validate` 通常失败抛异常；`check` 可返回结果或抛异常 |
| 判断 | `is` / `has` / `can` / `should` | 布尔返回方法使用 |

## 布尔命名

- 布尔方法用 `is`、`has`、`can`、`should`：`isActive()`、`hasPermission()`
- Java 字段按项目序列化约定选择；普通字段优先 `active`、`deleted`，避免 Lombok / JavaBean 生成 `isIsActive()` 一类访问器
- 如果接口或数据库字段已经是 `is_deleted`，DTO / Entity 可用 `deleted` 并通过注解映射
- 不要用否定式布尔名，如 `notDeleted`、`disableFlag`；优先 `deleted`、`enabled`

## 集合与 Map

- 业务语义清楚时，不强制加类型后缀：`users`、`permissions`
- 需要区分多个集合或类型重要时可加后缀：`userList`、`permissionSet`
- Map 名称体现 key/value 关系：`userById`、`orderNoToOrder`
- 不用 `list`、`map`、`dataList` 这类无业务含义名称

## 数据库命名

- 表、字段使用小写下划线：`order_item`、`create_time`
- 表名用单数或复数必须跟随项目既有约定；新项目建议使用单数业务名或明确前缀，避免关键字
- 避免数据库关键字：不用 `user`、`order`，可用 `sys_user`、`order_info`
- 主键默认 `id`；时间字段默认 `create_time`、`update_time`
- 逻辑删除字段可用 `is_deleted`，Java 字段映射为 `deleted`

```sql
sys_user(id, user_name, email, create_time, update_time, is_deleted)
order_info(id, order_no, user_id, status, create_time)
order_item(id, order_id, product_id, quantity)
```

## 泛型、注解、配置

- 泛型：通用类型用 `T`，集合元素用 `E`，键值用 `K` / `V`；复杂场景用有意义名称如 `REQ`、`RESP`
- 注解：UpperCamelCase，表达能力或语义，如 `Loggable`、`Idempotent`
- 配置文件：跟随框架约定，如 `application.yml`、`logback-spring.xml`、`mybatis-config.xml`

## 常见反例

```java
String s;              // 含义不明
String yongHuMing;     // 拼音
String usr;            // 非通用缩写
String user_name;      // Java 变量不使用下划线
boolean notDeleted;    // 否定命名增加理解成本
Map<Long, User> map;   // 缺少 key/value 语义
```
