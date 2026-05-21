# 安全编程规范

## 基本原则

- 所有外部输入默认不可信：HTTP 参数、Header、Cookie、文件、消息队列、第三方回调、数据库反查结果
- 优先使用框架安全能力和成熟库，不手写密码算法、HTML/JS 编码器、鉴权框架
- 安全控制放在边界和公共层：参数校验、认证授权、异常响应、日志脱敏、SQL 参数绑定
- 白名单优先于黑名单；无法白名单时，至少限制长度、格式、范围和字符集
- 不在日志、异常、响应中暴露密码、token、密钥、完整证件号、完整卡号、完整手机号等敏感数据

## 输入验证

| 输入类型 | 必做校验 |
| --- | --- |
| 字符串 | 非空、长度、字符集、业务格式 |
| 数值 | 最小值、最大值、精度、单位 |
| 枚举 | 必须落在已知枚举或白名单内 |
| 列表 | 最大数量、元素格式、去重规则 |
| 文件 | 大小、扩展名、MIME、内容签名、存储路径 |
| URL / 回调地址 | 协议、域名、端口、内网地址限制 |

```java
public void createUser(UserCreateRequest request) {
    if (request == null || StringUtils.isBlank(request.getUserName())) {
        throw new ValidationException("用户名不能为空");
    }
    if (!USERNAME_PATTERN.matcher(request.getUserName()).matches()) {
        throw new ValidationException("用户名格式不正确");
    }
}
```

## SQL 注入防护

- SQL 值一律参数化：JDBC `PreparedStatement`、MyBatis `#{}`、JPA 参数绑定
- 禁止拼接用户输入构造 SQL
- MyBatis `${}` 只能用于表名、字段名、排序方向等无法参数化的位置，且必须先映射到服务端白名单值
- `LIKE` 查询也使用绑定参数，不拼接原始输入
- 数据库账号使用最小权限，不给应用账号 DDL 或越权库表权限

```java
@Select("SELECT id, user_name FROM sys_user WHERE user_name = #{userName}")
User findByUserName(@Param("userName") String userName);

private static final Map<String, String> SORT_FIELD = Map.of(
    "createTime", "create_time",
    "userName", "user_name"
);

public String resolveSortField(String field) {
    return Optional.ofNullable(SORT_FIELD.get(field)).orElse("create_time");
}
```

## XSS 与输出编码

- XSS 防护重点是“按输出上下文编码”，不是只在输入时过滤
- HTML 内容、HTML 属性、JavaScript 字符串、URL 参数使用不同编码方法
- 优先使用模板引擎自动转义或 OWASP Java Encoder
- 富文本必须使用可靠 HTML sanitizer，仅允许有限标签和属性
- CSP 默认从严格策略开始；`unsafe-inline` 只能作为兼容例外，并应有迁移计划

```java
String html = Encode.forHtml(userInput);
String attr = Encode.forHtmlAttribute(userInput);
String js = Encode.forJavaScript(userInput);
String url = URLEncoder.encode(userInput, StandardCharsets.UTF_8);
```

推荐安全响应头：

```text
Content-Security-Policy: default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

## CSRF

- 浏览器 Cookie 会自动携带身份凭证时，修改类请求必须考虑 CSRF
- Spring Security 表单登录、Session Cookie 场景默认启用 CSRF
- 纯 Bearer Token 且不依赖 Cookie 的 API 可按项目安全方案关闭 CSRF，但要明确原因
- Cookie 应设置 `HttpOnly`、`Secure`、合适的 `SameSite`
- GET、HEAD、OPTIONS 不执行有副作用操作

## 敏感数据与密码

- 密码只存强哈希结果：BCrypt、Argon2、PBKDF2；禁止 MD5、SHA-1、SHA-256 直接哈希密码
- 密码策略包含最小长度、最大长度、弱密码拦截；错误提示避免泄露账号是否存在
- token、密钥、私钥放配置中心、KMS、环境变量或密钥管理系统，禁止硬编码进仓库
- 需要可逆加密时优先使用经安全评审的统一加密组件；自实现至少使用带认证的模式如 AES-GCM，并正确管理随机 IV/nonce
- 日志和响应只输出脱敏后的手机号、邮箱、证件号、卡号

```java
String encoded = passwordEncoder.encode(rawPassword);
boolean matched = passwordEncoder.matches(rawPassword, encoded);
```

## 访问控制

- 默认拒绝，显式放行
- 认证只证明“是谁”，授权必须判断“能否访问该资源”
- 接口权限和数据权限都要校验，不能只依赖前端隐藏按钮
- 对象级权限在 Service 或方法安全层校验，如订单只能由所有者或管理员访问
- 管理员、导出、审批、支付、删除等高风险操作需要更严格审计，必要时二次确认或 MFA

```java
@PreAuthorize("hasRole('ADMIN') or @orderPermission.canRead(authentication, #orderId)")
public Order getOrder(Long orderId) {
    return orderRepository.findById(orderId)
        .orElseThrow(() -> new OrderNotFoundException(orderId));
}
```

## 会话与 Cookie

- 登录后更新 Session ID，防止 session fixation
- 退出登录清理服务端会话和相关 Cookie
- Cookie 认证场景设置 `HttpOnly`、`Secure`、`SameSite`
- 记住我、刷新 token、长期会话必须可撤销，并限制有效期
- 高风险操作不完全信任长期会话，必要时要求重新认证

## 文件与路径

- 上传文件限制大小、扩展名、MIME 和内容签名
- 文件名由服务端生成，不信任用户原始文件名
- 存储路径使用固定根目录和规范化路径，防止 `../` 路径穿越
- 下载文件时校验访问权限，不直接暴露服务器真实路径
- 压缩包解压需防 Zip Slip，并限制解压总大小和文件数量

## 限流与防滥用

- 登录、注册、密码重置、敏感 API 等高风险入口必须限流
- 优先使用网关或 filter 层统一限流；单机兜底可用 Bucket4j、Guava RateLimiter
- 限流阈值按业务场景差异化：公共接口宽松，内部接口严格
- 限流失败返回 `429 Too Many Requests`，日志记录来源 IP、userId、接口路径

## 安全日志

必须记录：

- 登录成功/失败、登出、密码重置、MFA 变更
- 权限拒绝、越权访问、关键配置变更
- 支付、导出、删除、审批等高风险操作
- 安全策略命中：限流、验证码、风控、异常 IP

日志要求：

- 使用独立 security/audit logger 或可检索字段
- 包含 `userId`、`requestId`、`ip`、`resource`、`action`、`result`
- 敏感数据必须脱敏
- 明确保留期限和访问权限

## 检查清单

### 输入与输出

- [ ] 外部输入做白名单、长度、范围校验
- [ ] SQL 值使用参数绑定
- [ ] MyBatis `${}` 只使用服务端白名单映射结果
- [ ] 输出按 HTML、属性、JS、URL 上下文编码
- [ ] 文件上传和路径访问有边界校验

### 限流与防滥用

- [ ] 高风险入口有限流措施
- [ ] 限流阈值按场景差异化配置
- [ ] 限流失败返回 429，日志包含来源标识

### 身份与权限

- [ ] 默认拒绝，显式授权
- [ ] 同时校验接口权限和对象级数据权限
- [ ] CSRF 策略与认证方式匹配
- [ ] Cookie、Session、Token 有安全属性和有效期

### 敏感数据

- [ ] 密码使用 BCrypt、Argon2 或 PBKDF2
- [ ] 密钥不硬编码
- [ ] 可逆加密使用统一安全组件或认证加密模式
- [ ] 日志、异常、响应无敏感信息明文

### 审计

- [ ] 关键安全事件有日志
- [ ] 审计日志字段可检索
- [ ] 日志有保留期限和访问控制
