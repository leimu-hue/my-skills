# Java 17 Record 使用规范

## 核心原则

Java 17 项目中，简单不可变数据载体优先使用 `record`；符合 `record` 场景时，优先级高于 Lombok 的 `@Data`、`@Getter`、`@Setter`、`@Value`。不符合 `record` 场景时，再按项目约定使用普通 class 或 Lombok。

## 何时使用

优先使用 `record`：

- 请求、响应、命令、查询参数等 DTO
- 只保存数据、不需要可变状态的值对象
- 方法返回的轻量投影对象
- 测试数据中的简单结果对象
- 多字段组合 key、统计结果、聚合查询结果

不要使用 `record`：

- JPA / MyBatis Plus 等需要无参构造、可变字段、代理增强的实体
- 需要继承父类的类型
- 生命周期中需要反复修改字段的对象
- 字段很多且大多可选，构造参数会变得难读的对象
- 框架或序列化配置尚不支持 record 的旧项目

## 优先级

| 场景 | 优先选择 |
| --- | --- |
| Java 17+ 不可变 DTO / VO / Command | `record` |
| Java 17+ 可变 DTO / 框架要求 setter | class + Lombok |
| JPA Entity / ORM 实体 | class |
| Spring Bean / Service / Component | class + 构造器注入 |
| 需要 Builder 改善可读性的复杂对象 | 项目已有方案，必要时 class + Lombok `@Builder` |

## 写法

新增 `record` 也必须写类型注释，说明用途和边界。组件较少且含义清晰时不必逐个写冗长注释；有约束、单位、格式要求的组件应在类型注释或紧邻校验处说明。

```java
/**
 * 用户创建请求。
 *
 * 用于承接创建用户接口入参；字段在进入业务层前完成 Bean Validation 校验。
 */
public record UserCreateRequest(
    @NotBlank(message = "用户名不能为空")
    @Size(min = 3, max = 50, message = "用户名长度必须在3-50个字符之间")
    String userName,

    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式不正确")
    String email
) {
}
```

## 校验与构造

需要补充不变量时使用 compact constructor。只做轻量、确定的字段规范化或跨字段校验，不在构造器里访问数据库、调用远程服务或写复杂业务流程。

```java
/**
 * 金额区间查询条件。
 */
public record AmountRange(BigDecimal minAmount, BigDecimal maxAmount) {
    public AmountRange {
        if (minAmount == null || maxAmount == null) {
            throw new IllegalArgumentException("金额区间不能为空");
        }
        if (minAmount.compareTo(maxAmount) > 0) {
            throw new IllegalArgumentException("最小金额不能大于最大金额");
        }
    }
}
```

## 使用注意

- record 字段天然 `private final`，不要再加 Lombok 的 `@Data`、`@Getter`、`@Setter`
- 访问器名称是组件名，如 `request.userName()`，不是 `getUserName()`
- record 自动生成 `equals`、`hashCode`、`toString`，避免存放明文密码、token、密钥等敏感字段
- 序列化、反序列化、参数绑定要先确认项目 Jackson、Spring、MyBatis 版本支持
- record 可以实现接口，但不能继承 class
- 不要为了少写 getter/setter 把本应可变的领域实体改成 record

## 检查清单

- [ ] 当前项目使用 Java 17 或更高版本
- [ ] 该类型是不可变数据载体
- [ ] 不依赖无参构造、setter、ORM 代理或继承父类
- [ ] 组件数量适中，构造调用可读
- [ ] 需要的校验已通过 Bean Validation 或 compact constructor 表达
- [ ] 没有在 record 中保存会被 `toString()` 泄露的敏感明文字段
