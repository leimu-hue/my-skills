# 安全编程规范

## 输入验证

### 1. 数据验证原则

#### 白名单验证
```java
// ✅ 正确：使用白名单验证
public class InputValidator {

    // 验证邮箱格式
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
        "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"
    );

    // 验证手机号格式
    private static final Pattern MOBILE_PATTERN = Pattern.compile(
        "^1[3-9]\\d{9}$"
    );

    // 验证用户名（只允许字母、数字、下划线）
    private static final Pattern USERNAME_PATTERN = Pattern.compile(
        "^[a-zA-Z0-9_]{3,20}$"
    );

    public static boolean isValidEmail(String email) {
        return email != null && EMAIL_PATTERN.matcher(email).matches();
    }

    public static boolean isValidMobile(String mobile) {
        return mobile != null && MOBILE_PATTERN.matcher(mobile).matches();
    }

    public static boolean isValidUsername(String username) {
        return username != null && USERNAME_PATTERN.matcher(username).matches();
    }
}

// 使用验证器
public void createUser(UserCreateRequest request) {
    if (!InputValidator.isValidUsername(request.getUserName())) {
        throw new ValidationException("用户名格式不正确");
    }
    if (!InputValidator.isValidEmail(request.getEmail())) {
        throw new ValidationException("邮箱格式不正确");
    }
    if (!InputValidator.isValidMobile(request.getMobile())) {
        throw new ValidationException("手机号格式不正确");
    }
    // 继续处理...
}
```

#### 长度和范围验证
```java
// ✅ 正确：验证长度和范围
public void validateProduct(ProductCreateRequest request) {
    // 字符串长度验证
    if (StringUtils.isBlank(request.getName())) {
        throw new ValidationException("商品名称不能为空");
    }
    if (request.getName().length() > 100) {
        throw new ValidationException("商品名称不能超过100个字符");
    }

    // 数值范围验证
    if (request.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
        throw new ValidationException("商品价格必须大于0");
    }
    if (request.getPrice().compareTo(new BigDecimal("999999.99")) > 0) {
        throw new ValidationException("商品价格不能超过999999.99");
    }

    // 整数范围验证
    if (request.getStock() < 0) {
        throw new ValidationException("库存不能为负数");
    }
    if (request.getStock() > 999999) {
        throw new ValidationException("库存不能超过999999");
    }
}
```

### 2. 特殊字符处理

#### HTML转义
```java
// ✅ 正确：HTML特殊字符转义
public class HtmlUtils {

    private static final Map<Character, String> HTML_ESCAPE_MAP = new HashMap<>();
    static {
        HTML_ESCAPE_MAP.put('&', "&amp;");
        HTML_ESCAPE_MAP.put('<', "&lt;");
        HTML_ESCAPE_MAP.put('>', "&gt;");
        HTML_ESCAPE_MAP.put('"', "&quot;");
        HTML_ESCAPE_MAP.put('\'', "&#x27;");
    }

    public static String escapeHtml(String input) {
        if (input == null) {
            return null;
        }

        StringBuilder result = new StringBuilder();
        for (char c : input.toCharArray()) {
            String escaped = HTML_ESCAPE_MAP.get(c);
            result.append(escaped != null ? escaped : c);
        }
        return result.toString();
    }

    // 使用示例
    public String generateUserProfileHtml(User user) {
        StringBuilder html = new StringBuilder();
        html.append("<div class='user-profile'>");
        html.append("<h2>").append(HtmlUtils.escapeHtml(user.getName())).append("</h2>");
        html.append("<p>").append(HtmlUtils.escapeHtml(user.getBio())).append("</p>");
        html.append("</div>");
        return html.toString();
    }
}

// 使用OWASP Java Encoder（推荐）
import org.owasp.encoder.Encode;
public String safeHtmlOutput(String userInput) {
    return Encode.forHtml(userInput);
}
```

#### JavaScript转义
```java
// ✅ 正确：JavaScript字符串转义
public class JavaScriptUtils {

    public static String escapeJavaScript(String input) {
        if (input == null) {
            return null;
        }

        return input
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
            .replace("/", "\\/");
    }

    // 使用示例
    public String generateJavaScript(String userName) {
        return String.format("var userName = '%s';", escapeJavaScript(userName));
    }
}
```

## SQL注入防护

### 1. 参数化查询

#### JDBC预编译语句
```java
// ✅ 正确：使用PreparedStatement
public User findUserByUserName(String userName) {
    String sql = "SELECT id, user_name, email FROM users WHERE user_name = ? AND status = ?";

    try (Connection conn = dataSource.getConnection();
         PreparedStatement ps = conn.prepareStatement(sql)) {

        ps.setString(1, userName);
        ps.setInt(2, UserStatus.ACTIVE.getValue());

        try (ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                User user = new User();
                user.setId(rs.getLong("id"));
                user.setUserName(rs.getString("user_name"));
                user.setEmail(rs.getString("email"));
                return user;
            }
        }
    } catch (SQLException e) {
        throw new DatabaseException("查询用户失败", e);
    }

    return null;
}

// ❌ 错误：字符串拼接（SQL注入风险）
public User findUserByUserName(String userName) {
    String sql = "SELECT * FROM users WHERE user_name = '" + userName + "'";
    // 如果userName是 "' OR '1'='1"，将导致SQL注入
}
```

#### MyBatis参数绑定
```java
// ✅ 正确：使用#{}参数绑定
@Mapper
public interface UserMapper {

    @Select("SELECT * FROM users WHERE user_name = #{userName} AND status = #{status}")
    User findByUserName(@Param("userName") String userName, @Param("status") int status);

    @Select("SELECT * FROM users WHERE id IN <foreach item='id' collection='ids' open='(' separator=',' close=')'>#{id}</foreach>")
    List<User> findByIds(@Param("ids") List<Long> ids);

    @Insert("INSERT INTO users (user_name, email, create_time) VALUES (#{userName}, #{email}, #{createTime})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(User user);
}

// ❌ 错误：使用${}（存在SQL注入风险）
@Select("SELECT * FROM users WHERE user_name = '${userName}'")
User findByUserNameUnsafe(@Param("userName") String userName);
```

### 2. 动态SQL安全

#### MyBatis动态SQL
```java
// ✅ 正确：安全的动态SQL
@Select("<script>" +
       "SELECT * FROM users WHERE 1=1" +
       "<if test='userName != null'> AND user_name = #{userName}</if>" +
       "<if test='email != null'> AND email = #{email}</if>" +
       "<if test='status != null'> AND status = #{status}</if>" +
       "</script>")
List<User> searchUsers(@Param("userName") String userName,
                      @Param("email") String email,
                      @Param("status") Integer status);

// ✅ 正确：安全的排序
@Select("<script>" +
       "SELECT * FROM users" +
       "<where>" +
       "<if test='userName != null'> AND user_name LIKE CONCAT('%', #{userName}, '%')</if>" +
       "</where>" +
       "ORDER BY ${sortField} ${sortOrder}" +
       "</script>")
List<User> searchUsersWithSort(@Param("userName") String userName,
                              @Param("sortField") String sortField,
                              @Param("sortOrder") String sortOrder);

// 注意：${}用于表名、字段名等无法参数化的地方，但要严格控制输入
```

#### 白名单验证排序字段
```java
// ✅ 正确：验证排序字段
public List<User> searchUsers(String userName, String sortField, String sortOrder) {
    // 验证排序字段
    Set<String> allowedSortFields = Set.of("id", "user_name", "email", "create_time");
    if (!allowedSortFields.contains(sortField)) {
        sortField = "id"; // 默认排序字段
    }

    // 验证排序方向
    if (!"ASC".equalsIgnoreCase(sortOrder) && !"DESC".equalsIgnoreCase(sortOrder)) {
        sortOrder = "ASC"; // 默认排序方向
    }

    return userDao.searchUsersWithSort(userName, sortField, sortOrder);
}
```

## XSS防护

### 1. 输出编码

#### HTML上下文编码
```java
// ✅ 正确：根据输出上下文进行编码
public class XssProtection {

    // HTML内容编码
    public static String encodeForHtml(String input) {
        return Encode.forHtml(input);
    }

    // HTML属性编码
    public static String encodeForHtmlAttribute(String input) {
        return Encode.forHtmlAttribute(input);
    }

    // JavaScript编码
    public static String encodeForJavaScript(String input) {
        return Encode.forJavaScript(input);
    }

    // URL参数编码
    public static String encodeForUrl(String input) {
        try {
            return URLEncoder.encode(input, StandardCharsets.UTF_8.name());
        } catch (UnsupportedEncodingException e) {
            return input;
        }
    }
}

// 使用示例
public String generateUserCard(User user) {
    StringBuilder html = new StringBuilder();
    html.append("<div class='user-card' data-user-id='")
        .append(XssProtection.encodeForHtmlAttribute(user.getId().toString()))
        .append("'>;")
        .append("<h3>")
        .append(XssProtection.encodeForHtml(user.getName()))
        .append("</h3>")
        .append("<p>")
        .append(XssProtection.encodeForHtml(user.getBio()))
        .append("</p>")
        .append("</div>");
    return html.toString();
}
```

### 2. CSP策略

#### 设置CSP头
```java
// ✅ 正确：设置内容安全策略
@Configuration
public class WebSecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.headers()
            .contentSecurityPolicy(
                "default-src 'self'; " +
                "script-src 'self' 'unsafe-inline' https://trusted-cdn.com; " +
                "style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data: https:; " +
                "font-src 'self' https://fonts.googleapis.com; " +
                "frame-ancestors 'none'; " +
                "form-action 'self';"
            )
            .and()
            .frameOptions()
            .deny();

        return http.build();
    }
}

// 或者使用过滤器设置响应头
@Component
public class SecurityHeadersFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletResponse httpResponse = (HttpServletResponse) response;
        httpResponse.setHeader("Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';" +
            "img-src 'self' data:; font-src 'self'; frame-ancestors 'none';"
        );
        httpResponse.setHeader("X-Content-Type-Options", "nosniff");
        httpResponse.setHeader("X-Frame-Options", "DENY");
        httpResponse.setHeader("X-XSS-Protection", "1; mode=block");

        chain.doFilter(request, response);
    }
}
```

## CSRF防护

### 1. Spring Security CSRF防护

#### 启用CSRF防护
```java
// ✅ 正确：启用CSRF防护
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
            )
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/**").permitAll()
                .anyRequest().authenticated()
            )
            .formLogin(withDefaults());

        return http.build();
    }
}
```

#### CSRF Token使用
```html
<!-- ✅ 正确：在表单中包含CSRF token -->
<form method="post" action="/api/users">
    <input type="hidden" name="_csrf" value="${_csrf.token}" />
    <input type="text" name="userName" />
    <input type="email" name="email" />
    <button type="submit">创建用户</button>
</form>

<!-- AJAX请求中的CSRF token -->
<script>
$.ajaxSetup({
    beforeSend: function(xhr, settings) {
        if (!/^(GET|HEAD|OPTIONS|TRACE)$/i.test(settings.type) && !this.crossDomain) {
            xhr.setRequestHeader("X-CSRF-TOKEN", $("#csrfToken").val());
        }
    }
});
</script>
```

### 2. 自定义CSRF防护

#### CSRF Token生成和验证
```java
// ✅ 正确：自定义CSRF防护
@Component
public class CsrfTokenManager {

    private static final String CSRF_TOKEN_ATTRIBUTE = "CSRF_TOKEN";
    private static final SecureRandom random = new SecureRandom();

    public String generateToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }

    public void validateToken(String token, HttpSession session) {
        if (StringUtils.isBlank(token)) {
            throw new CsrfException("CSRF token不能为空");
        }

        String sessionToken = (String) session.getAttribute(CSRF_TOKEN_ATTRIBUTE);
        if (sessionToken == null || !sessionToken.equals(token)) {
            throw new CsrfException("CSRF token验证失败");
        }
    }

    public void setToken(HttpSession session) {
        String token = generateToken();
        session.setAttribute(CSRF_TOKEN_ATTRIBUTE, token);
    }
}

@Controller
public class UserController {

    @Autowired
    private CsrfTokenManager csrfTokenManager;

    @GetMapping("/form")
    public String showForm(Model model, HttpSession session) {
        csrfTokenManager.setToken(session);
        return "user-form";
    }

    @PostMapping("/users")
    public String createUser(@RequestParam String userName,
                           @RequestParam String email,
                           @RequestParam String _csrf,
                           HttpSession session) {
        csrfTokenManager.validateToken(_csrf, session);
        // 处理用户创建
        return "redirect:/users";
    }
}
```

## 敏感数据处理

### 1. 密码安全

#### 密码哈希
```java
// ✅ 正确：使用BCrypt加密密码
@Component
public class PasswordEncoder {

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public String encode(String rawPassword) {
        return encoder.encode(rawPassword);
    }

    public boolean matches(String rawPassword, String encodedPassword) {
        return encoder.matches(rawPassword, encodedPassword);
    }
}

// 用户注册
public void registerUser(UserRegisterRequest request) {
    // 验证密码强度
    if (!isPasswordStrong(request.getPassword())) {
        throw new ValidationException("密码强度不够");
    }

    User user = new User();
    user.setUserName(request.getUserName());
    user.setEmail(request.getEmail());
    user.setPassword(passwordEncoder.encode(request.getPassword()));

    userDao.save(user);
}

// 密码强度验证
private boolean isPasswordStrong(String password) {
    if (password == null || password.length() < 8) {
        return false;
    }

    // 检查是否包含数字、字母、特殊字符
    boolean hasDigit = password.matches(".*[0-9].*");
    boolean hasLetter = password.matches(".*[a-zA-Z].*");
    boolean hasSpecial = password.matches(".*[!@#$%^&*()].*");

    return hasDigit && hasLetter && hasSpecial;
}
```

#### 密码策略
```java
// ✅ 正确：密码策略管理
@Component
public class PasswordPolicy {

    private static final int MIN_LENGTH = 8;
    private static final int MAX_LENGTH = 128;
    private static final Pattern DIGIT_PATTERN = Pattern.compile(".*[0-9].*");
    private static final Pattern LETTER_PATTERN = Pattern.compile(".*[a-zA-Z].*");
    private static final Pattern SPECIAL_PATTERN = Pattern.compile(".*[!@#$%^&*()_+\\-=\\[\\]{};':.,<>?].*");

    public void validate(String password) {
        if (password == null) {
            throw new ValidationException("密码不能为空");
        }

        if (password.length() < MIN_LENGTH) {
            throw new ValidationException("密码长度不能少于" + MIN_LENGTH + "位");
        }

        if (password.length() > MAX_LENGTH) {
            throw new ValidationException("密码长度不能超过" + MAX_LENGTH + "位");
        }

        if (!DIGIT_PATTERN.matcher(password).matches()) {
            throw new ValidationException("密码必须包含数字");
        }

        if (!LETTER_PATTERN.matcher(password).matches()) {
            throw new ValidationException("密码必须包含字母");
        }

        if (!SPECIAL_PATTERN.matcher(password).matches()) {
            throw new ValidationException("密码必须包含特殊字符");
        }

        // 检查常见弱密码
        if (isCommonWeakPassword(password)) {
            throw new ValidationException("不能使用常见弱密码");
        }
    }

    private boolean isCommonWeakPassword(String password) {
        Set<String> weakPasswords = Set.of(
            "123456", "password", "123456789", "12345678",
            "12345", "1234567", "1234567890", "qwerty"
        );
        return weakPasswords.contains(password.toLowerCase());
    }
}
```

### 2. 敏感信息脱敏

#### 数据脱敏工具
```java
// ✅ 正确：敏感信息脱敏
@Component
public class DataMasking {

    // 手机号脱敏：138****8000
    public static String maskMobile(String mobile) {
        if (StringUtils.isBlank(mobile) || mobile.length() != 11) {
            return mobile;
        }
        return mobile.substring(0, 3) + "****" + mobile.substring(7);
    }

    // 邮箱脱敏：joh***@example.com
    public static String maskEmail(String email) {
        if (StringUtils.isBlank(email) || !email.contains("@")) {
            return email;
        }

        String[] parts = email.split("@");
        String username = parts[0];
        String domain = parts[1];

        if (username.length() <= 2) {
            return email;
        }

        String maskedUsername = username.substring(0, 2) +
            "***" + username.substring(username.length() - 1);

        return maskedUsername + "@" + domain;
    }

    // 身份证号脱敏：110101********1234
    public static String maskIdCard(String idCard) {
        if (StringUtils.isBlank(idCard) || idCard.length() < 8) {
            return idCard;
        }
        return idCard.substring(0, 6) + "********" + idCard.substring(idCard.length() - 4);
    }

    // 银行卡号脱敏：6222****1234
    public static String maskBankCard(String bankCard) {
        if (StringUtils.isBlank(bankCard) || bankCard.length() < 8) {
            return bankCard;
        }
        return bankCard.substring(0, 4) + "****" + bankCard.substring(bankCard.length() - 4);
    }
}

// 使用示例
@Service
public class UserService {

    private static final Logger logger = LoggerFactory.getLogger(UserService.class);

    public void processUserLogin(User user) {
        // 记录日志时脱敏
        logger.info("用户登录成功，用户名: {}, 手机号: {}, 邮箱: {}",
            user.getUserName(),
            DataMasking.maskMobile(user.getMobile()),
            DataMasking.maskEmail(user.getEmail()));
    }
}
```

### 3. 加密存储

#### AES加密
```java
// ✅ 正确：使用AES加密敏感数据
@Component
public class AesEncryption {

    private static final String ALGORITHM = "AES";
    private static final String TRANSFORMATION = "AES/CBC/PKCS5Padding";
    private final SecretKey secretKey;
    private final IvParameterSpec ivParameterSpec;

    public AesEncryption(@Value("${encryption.key}") String keyString,
                        @Value("${encryption.iv}") String ivString) {
        this.secretKey = new SecretKeySpec(Base64.getDecoder().decode(keyString), ALGORITHM);
        this.ivParameterSpec = new IvParameterSpec(Base64.getDecoder().decode(ivString));
    }

    public String encrypt(String data) {
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, ivParameterSpec);
            byte[] encrypted = cipher.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            throw new EncryptionException("加密失败", e);
        }
    }

    public String decrypt(String encryptedData) {
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, ivParameterSpec);
            byte[] decoded = Base64.getDecoder().decode(encryptedData);
            byte[] decrypted = cipher.doFinal(decoded);
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new EncryptionException("解密失败", e);
        }
    }
}

// 使用示例
@Entity
@Table(name = "user_sensitive_data")
public class UserSensitiveData {

    @Id
    private Long id;

    @Column(name = "encrypted_credit_card")
    private String encryptedCreditCard;

    @Transient
    private String creditCard;

    // 在Service层处理加密解密
    public void setCreditCard(String creditCard, AesEncryption encryption) {
        this.creditCard = creditCard;
        this.encryptedCreditCard = encryption.encrypt(creditCard);
    }

    public String getCreditCard(AesEncryption encryption) {
        if (this.creditCard == null && this.encryptedCreditCard != null) {
            this.creditCard = encryption.decrypt(this.encryptedCreditCard);
        }
        return this.creditCard;
    }
}
```

## 访问控制

### 1. 认证与授权

#### Spring Security配置
```java
// ✅ 正确：细粒度权限控制
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/users/**").hasAnyRole("USER", "ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/orders/**").hasAnyRole("USER", "ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/orders/**").hasRole("USER")
                .anyRequest().authenticated()
            )
            .formLogin(withDefaults())
            .logout(withDefaults());

        return http.build();
    }
}

// 方法级别权限控制
@Service
public class OrderService {

    @PreAuthorize("hasRole('USER') and #order.userId == authentication.principal.id")
    public Order getOrder(Long orderId, Order order) {
        // 只有订单所有者才能查看
        return orderDao.findById(orderId);
    }

    @PreAuthorize("hasRole('ADMIN') or (#order.userId == authentication.principal.id)")
    public Order updateOrder(Order order) {
        // 管理员或订单所有者才能更新
        return orderDao.save(order);
    }

    @PreAuthorize("hasRole('ADMIN')")
    public void deleteOrder(Long orderId) {
        // 只有管理员才能删除
        orderDao.deleteById(orderId);
    }
}
```

### 2. 会话管理

#### 安全的会话配置
```java
// ✅ 正确：安全的会话管理
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .sessionManagement(session -> session
                .maximumSessions(1)  // 同一用户最多1个会话
                .maxSessionsPreventsLogin(false)  // 新登录踢掉旧会话
                .expiredUrl("/login?expired")
            )
            .sessionManagement(session -> session
                .sessionFixation().migrateSession()  // 登录后会话ID变更
                .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
            )
            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login?logout")
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID", "remember-me")
            );

        return http.build();
    }
}

// 记住我功能
@Configuration
public class RememberMeConfig {

    @Bean
    public RememberMeConfigurer rememberMeConfigurer() {
        return new RememberMeConfigurer()
            .key("uniqueAndSecret")  // 安全的key
            .tokenValiditySeconds(86400)  // 24小时
            .rememberMeParameter("remember-me")
            .useSecureCookie(true);  // 仅HTTPS传输
    }
}
```

## 安全日志

### 1. 安全事件记录

#### 安全日志记录
```java
// ✅ 正确：记录安全相关事件
@Component
public class SecurityLogger {

    private static final Logger logger = LoggerFactory.getLogger("security");

    public void logLoginSuccess(String username, String ip) {
        logger.info("LOGIN_SUCCESS username={} ip={} timestamp={}",
            username, ip, System.currentTimeMillis());
    }

    public void logLoginFailure(String username, String ip, String reason) {
        logger.warn("LOGIN_FAILURE username={} ip={} reason={} timestamp={}",
            username, ip, reason, System.currentTimeMillis());
    }

    public void logAccessDenied(String username, String resource, String ip) {
        logger.warn("ACCESS_DENIED username={} resource={} ip={} timestamp={}",
            username, resource, ip, System.currentTimeMillis());
    }

    public void logSuspiciousActivity(String username, String activity, String ip) {
        logger.error("SUSPICIOUS_ACTIVITY username={} activity={} ip={} timestamp={}",
            username, activity, ip, System.currentTimeMillis());
    }
}

// 使用示例
@Service
public class AuthenticationService {

    @Autowired
    private SecurityLogger securityLogger;

    public LoginResult login(String username, String password, String ip) {
        try {
            User user = authenticate(username, password);
            securityLogger.logLoginSuccess(username, ip);
            return LoginResult.success(user);
        } catch (AuthenticationException e) {
            securityLogger.logLoginFailure(username, ip, e.getMessage());
            throw e;
        }
    }
}
```

### 2. 日志配置

#### 安全日志配置
```xml
<!-- logback-security.xml -->
<configuration>
    <!-- 安全日志文件 -->
    <appender name="SECURITY_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>logs/security.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>logs/security.%d{yyyy-MM-dd}.log</fileNamePattern>
            <maxHistory>90</maxHistory>  <!-- 保留90天 -->
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- 安全日志logger -->
    <logger name="security" level="INFO" additivity="false">
        <appender-ref ref="SECURITY_FILE" />
    </logger>

    <!-- 审计日志 -->
    <appender name="AUDIT_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>logs/audit.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>logs/audit.%d{yyyy-MM-dd}.log</fileNamePattern>
            <maxHistory>365</maxHistory>  <!-- 保留1年 -->
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} AUDIT - %msg%n</pattern>
        </encoder>
    </appender>

    <logger name="audit" level="INFO" additivity="false">
        <appender-ref ref="AUDIT_FILE" />
    </logger>
</configuration>
```

## 安全检查清单

### 输入验证检查
- [ ] 所有外部输入都经过验证
- [ ] 使用白名单验证格式
- [ ] 验证数据长度和范围
- [ ] 特殊字符正确转义
- [ ] 文件上传类型和大小验证

### SQL注入防护检查
- [ ] 使用参数化查询
- [ ] 避免字符串拼接SQL
- [ ] MyBatis使用#{}参数绑定
- [ ] 动态SQL字段白名单验证
- [ ] 数据库用户权限控制

### XSS防护检查
- [ ] 输出根据上下文编码
- [ ] 设置CSP策略
- [ ] 使用安全的模板引擎
- [ ] Cookie设置HttpOnly
- [ ] 避免内联JavaScript

### CSRF防护检查
- [ ] 启用CSRF防护
- [ ] 关键操作验证CSRF token
- [ ] AJAX请求包含CSRF token
- [ ] 使用SameSite Cookie属性

### 敏感数据保护检查
- [ ] 密码使用强哈希算法
- [ ] 敏感信息加密存储
- [ ] 日志中敏感数据脱敏
- [ ] HTTPS传输敏感数据
- [ ] 定期轮换加密密钥

### 访问控制检查
- [ ] 实施最小权限原则
- [ ] 细粒度权限控制
- [ ] 安全的会话管理
- [ ] 多因素认证
- [ ] 定期审计权限

### 安全日志检查
- [ ] 记录关键安全事件
- [ ] 日志文件权限控制
- [ ] 定期备份安全日志
- [ ] 监控异常登录行为
- [ ] 安全日志保留策略
