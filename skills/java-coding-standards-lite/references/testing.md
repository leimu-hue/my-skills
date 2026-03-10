# 单元测试规范

## 测试基本原则

### 1. 测试金字塔

```
        少
        ↓
    集成测试
        ↓
    单元测试
        ↑
        多
```

- **单元测试**：占比70%，快速、隔离、低成本
- **集成测试**：占比20%，验证组件协作
- **端到端测试**：占比10%，验证完整流程

### 2. FIRST原则

- **F**ast：测试执行要快（毫秒级）
- **I**ndependent：测试之间相互独立
- **R**epeatable：可重复执行，结果一致
- **S**elf-Validating：自验证，通过/失败明确
- **T**imely：及时编写，与代码同步开发

### 3. BCDE原则

- **B**order：边界条件测试
- **C**orrect：正常情况测试
- **D**esign：设计思路测试
- **E**rror：错误情况测试

## 测试框架配置

### 1. 依赖配置

#### Maven配置
```xml
<dependencies>
    <!-- JUnit 5 -->
    <dependency>
        <groupId>org.junit.jupiter</groupId>
        <artifactId>junit-jupiter</artifactId>
        <version>5.9.2</version>
        <scope>test</scope>
    </dependency>

    <!-- Mockito -->
    <dependency>
        <groupId>org.mockito</groupId>
        <artifactId>mockito-core</artifactId>
        <version>5.1.1</version>
        <scope>test</scope>
    </dependency>

    <!-- Mockito JUnit 5支持 -->
    <dependency>
        <groupId>org.mockito</groupId>
        <artifactId>mockito-junit-jupiter</artifactId>
        <version>5.1.1</version>
        <scope>test</scope>
    </dependency>

    <!-- AssertJ -->
    <dependency>
        <groupId>org.assertj</groupId>
        <artifactId>assertj-core</artifactId>
        <version>3.24.2</version>
        <scope>test</scope>
    </dependency>

    <!-- Spring Test -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-surefire-plugin</artifactId>
            <version>3.0.0-M9</version>
        </plugin>
    </plugins>
</build>
```

#### Gradle配置
```groovy
dependencies {
    testImplementation 'org.junit.jupiter:junit-jupiter:5.9.2'
    testImplementation 'org.mockito:mockito-core:5.1.1'
    testImplementation 'org.mockito:mockito-junit-jupiter:5.1.1'
    testImplementation 'org.assertj:assertj-core:3.24.2'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}

test {
    useJUnitPlatform()
}
```

## 单元测试编写

### 1. 测试类结构

#### 基本测试类
```java
// ✅ 正确：标准的测试类结构
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserDao userDao;

    @Mock
    private EmailService emailService;

    @InjectMocks
    private UserService userService;

    @Test
    @DisplayName("创建用户 - 正常情况")
    void testCreateUser_Success() {
        // Given - 准备测试数据
        UserCreateRequest request = createValidUserRequest();
        User savedUser = createSavedUser();
        when(userDao.insert(any(User.class))).thenReturn(savedUser);

        // When - 执行被测试方法
        User result = userService.createUser(request);

        // Then - 验证结果
        assertNotNull(result);
        assertEquals("testuser", result.getUserName());
        assertEquals("test@example.com", result.getEmail());
        verify(userDao, times(1)).insert(any(User.class));
        verify(emailService, times(1)).sendWelcomeEmail(eq(savedUser));
    }

    @Test
    @DisplayName("创建用户 - 用户名为空")
    void testCreateUser_NullUserName() {
        // Given
        UserCreateRequest request = new UserCreateRequest();
        request.setUserName(null);
        request.setEmail("test@example.com");

        // When & Then
        assertThrows(IllegalArgumentException.class, () -> {
            userService.createUser(request);
        });

        verify(userDao, never()).insert(any());
        verify(emailService, never()).sendWelcomeEmail(any());
    }

    // 辅助方法
    private UserCreateRequest createValidUserRequest() {
        UserCreateRequest request = new UserCreateRequest();
        request.setUserName("testuser");
        request.setEmail("test@example.com");
        return request;
    }

    private User createSavedUser() {
        User user = new User();
        user.setId(1L);
        user.setUserName("testuser");
        user.setEmail("test@example.com");
        return user;
    }
}
```

### 2. 测试命名规范

#### 方法命名
```java
// ✅ 正确：描述性测试方法名
@Test
void testGetUserById_UserExists_ReturnsUser() {}

@Test
void testGetUserById_UserNotFound_ThrowsException() {}

@Test
void testCreateUser_ValidRequest_CreatesUser() {}

@Test
void testCreateUser_InvalidEmail_ThrowsValidationException() {}

// ✅ 正确：使用@DisplayName（推荐）
@Test
@DisplayName("根据ID获取用户 - 用户存在")
void testGetUserById_UserExists() {}

@Test
@DisplayName("根据ID获取用户 - 用户不存在")
void testGetUserById_UserNotFound() {}

// ❌ 错误：不清晰的命名
@Test
void test1() {}

@Test
void testUser() {}
```

#### 测试类命名
```java
// ✅ 正确：被测试类 + Test
class UserServiceTest {}
class OrderControllerTest {}
class PaymentProcessorTest {}

// ❌ 错误：不规范的命名
class TestUserService {}
class UserServiceTesting {}
class UserServiceTests {}
```

## 测试数据准备

### 1. 测试数据构建

#### 使用Builder模式
```java
// ✅ 正确：使用Builder模式构建测试数据
public class UserBuilder {
    private Long id = 1L;
    private String userName = "testuser";
    private String email = "test@example.com";
    private String phone = "13800138000";
    private int age = 25;
    private boolean active = true;

    public static UserBuilder aUser() {
        return new UserBuilder();
    }

    public UserBuilder withId(Long id) {
        this.id = id;
        return this;
    }

    public UserBuilder withUserName(String userName) {
        this.userName = userName;
        return this;
    }

    public UserBuilder withEmail(String email) {
        this.email = email;
        return this;
    }

    public UserBuilder withAge(int age) {
        this.age = age;
        return this;
    }

    public UserBuilder inactive() {
        this.active = false;
        return this;
    }

    public User build() {
        User user = new User();
        user.setId(id);
        user.setUserName(userName);
        user.setEmail(email);
        user.setPhone(phone);
        user.setAge(age);
        user.setActive(active);
        return user;
    }
}

// 使用示例
@Test
void testUserStatusChange() {
    // Given
    User user = UserBuilder.aUser()
        .withId(1L)
        .withUserName("john_doe")
        .inactive()
        .build();

    when(userDao.findById(1L)).thenReturn(user);

    // When
    userService.activateUser(1L);

    // Then
    assertTrue(user.isActive());
    verify(userDao, times(1)).update(user);
}
```

#### 使用Test Data Factory
```java
// ✅ 正确：测试数据工厂
@Component
public class TestDataFactory {

    public static UserCreateRequest validUserCreateRequest() {
        UserCreateRequest request = new UserCreateRequest();
        request.setUserName("testuser");
        request.setEmail("test@example.com");
        request.setPassword("Test@123456");
        return request;
    }

    public static User savedUser() {
        return UserBuilder.aUser().build();
    }

    public static User inactiveUser() {
        return UserBuilder.aUser().inactive().build();
    }

    public static OrderCreateRequest validOrderRequest() {
        OrderCreateRequest request = new OrderCreateRequest();
        request.setUserId(1L);
        request.setItems(Arrays.asList(
            OrderItemBuilder.anOrderItem().withProductId(1L).withQuantity(2).build(),
            OrderItemBuilder.anOrderItem().withProductId(2L).withQuantity(1).build()
        ));
        return request;
    }
}

// 使用示例
@Test
void testCreateUser() {
    // Given
    UserCreateRequest request = TestDataFactory.validUserCreateRequest();
    User savedUser = TestDataFactory.savedUser();
    when(userDao.insert(any())).thenReturn(savedUser);

    // When
    User result = userService.createUser(request);

    // Then
    assertNotNull(result);
    assertEquals("testuser", result.getUserName());
}
```

## Mock使用规范

### 1. Mock创建

#### 使用注解
```java
// ✅ 正确：使用@Mock和@InjectMocks
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderDao orderDao;

    @Mock
    private PaymentService paymentService;

    @Mock
    private NotificationService notificationService;

    @InjectMocks
    private OrderService orderService;

    // 测试方法...
}

// ✅ 正确：使用MockitoAnnotations.initMocks()
class LegacyOrderServiceTest {

    @Mock
    private OrderDao orderDao;

    @Mock
    private PaymentService paymentService;

    private OrderService orderService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.initMocks(this);
        orderService = new OrderService(orderDao, paymentService);
    }
}
```

#### 手动创建Mock
```java
// ✅ 正确：手动创建Mock
@Test
void testComplexScenario() {
    // Given
    OrderDao orderDao = mock(OrderDao.class);
    PaymentService paymentService = mock(PaymentService.class);
    NotificationService notificationService = mock(NotificationService.class);

    OrderService orderService = new OrderService(orderDao, paymentService, notificationService);

    Order order = TestDataFactory.validOrder();
    when(orderDao.save(any(Order.class))).thenReturn(order);
    when(paymentService.processPayment(any())).thenReturn(PaymentResult.success());

    // When
    OrderResult result = orderService.createOrder(TestDataFactory.validOrderRequest());

    // Then
    assertTrue(result.isSuccess());
    verify(orderDao, times(1)).save(any());
    verify(paymentService, times(1)).processPayment(any());
    verify(notificationService, times(1)).sendOrderConfirmation(any());
}
```

### 2. Mock行为定义

#### 返回值设置
```java
// ✅ 正确：使用when-thenReturn
@Test
void testFindUserById() {
    // Given
    Long userId = 1L;
    User expectedUser = UserBuilder.aUser().withId(userId).build();
    when(userDao.findById(userId)).thenReturn(expectedUser);

    // When
    User result = userService.getUserById(userId);

    // Then
    assertEquals(expectedUser, result);
    verify(userDao, times(1)).findById(userId);
}

// ✅ 正确：返回多个值
@Test
void testFindAllUsers() {
    // Given
    List<User> users = Arrays.asList(
        UserBuilder.aUser().withId(1L).withUserName("user1").build(),
        UserBuilder.aUser().withId(2L).withUserName("user2").build()
    );
    when(userDao.findAll()).thenReturn(users);

    // When
    List<User> result = userService.getAllUsers();

    // Then
    assertEquals(2, result.size());
    assertEquals("user1", result.get(0).getUserName());
    assertEquals("user2", result.get(1).getUserName());
}

// ✅ 正确：抛出异常
@Test
void testFindUserById_NotFound() {
    // Given
    Long userId = 999L;
    when(userDao.findById(userId)).thenThrow(new UserNotFoundException("User not found"));

    // When & Then
    assertThrows(UserNotFoundException.class, () -> {
        userService.getUserById(userId);
    });
}
```

#### 参数匹配
```java
// ✅ 正确：使用参数匹配器
@Test
void testSaveUser_WithAnyUser() {
    // Given
    User savedUser = UserBuilder.aUser().build();
    when(userDao.save(any(User.class))).thenReturn(savedUser);

    // When
    User result = userService.saveUser(UserBuilder.aUser().build());

    // Then
    assertNotNull(result);
    verify(userDao).save(any(User.class));
}

@Test
void testUpdateUser_WithSpecificId() {
    // Given
    Long userId = 1L;
    User updatedUser = UserBuilder.aUser().withId(userId).build();
    when(userDao.update(argThat(user -> user.getId().equals(userId))))
        .thenReturn(updatedUser);

    // When
    User result = userService.updateUser(userId, UserBuilder.aUser().build());

    // Then
    assertEquals(userId, result.getId());
}

// 常用参数匹配器
any()                    // 匹配任何对象
any(Class<T> clazz)      // 匹配指定类型
eq(value)               // 匹配相等的值
isNull()                // 匹配null
notNull()               // 匹配非null
contains(text)          // 匹配包含指定文本的字符串
matches(regex)          // 匹配正则表达式
```

### 3. Mock验证

#### 方法调用验证
```java
// ✅ 正确：验证方法调用
@Test
void testUserRegistration() {
    // Given
    UserCreateRequest request = TestDataFactory.validUserCreateRequest();
    User savedUser = TestDataFactory.savedUser();
    when(userDao.insert(any(User.class))).thenReturn(savedUser);

    // When
    userService.registerUser(request);

    // Then
    // 验证方法调用次数
    verify(userDao, times(1)).insert(any(User.class));
    verify(emailService, times(1)).sendWelcomeEmail(any(User.class));
    verify(notificationService, times(1)).sendSms(anyString());

    // 验证方法从未调用
    verify(userDao, never()).update(any());
    verify(userDao, never()).delete(any());

    // 验证没有其他交互
    verifyNoMoreInteractions(userDao);
    verifyNoMoreInteractions(emailService);
}

// ✅ 正确：验证调用顺序
@Test
void testOrderProcessingSequence() {
    // Given
    OrderCreateRequest request = TestDataFactory.validOrderRequest();
    Order order = TestDataFactory.validOrder();
    when(orderDao.save(any())).thenReturn(order);
    when(paymentService.processPayment(any())).thenReturn(PaymentResult.success());

    // When
    orderService.processOrder(request);

    // Then
    InOrder inOrder = inOrder(orderDao, paymentService, notificationService);
    inOrder.verify(orderDao).save(any(Order.class));
    inOrder.verify(paymentService).processPayment(any());
    inOrder.verify(notificationService).sendOrderConfirmation(any());
}
```

## 断言使用

### 1. JUnit断言

#### 基本断言
```java
// ✅ 正确：使用JUnit 5断言
@Test
void testBasicAssertions() {
    // Given
    int actualValue = 42;
    String actualString = "Hello World";
    Object actualObject = new Object();

    // Then
    // 相等性断言
    assertEquals(42, actualValue);
    assertEquals("Hello World", actualString);

    // 空值断言
    assertNotNull(actualObject);
    assertNull(null);

    // 布尔断言
    assertTrue(actualValue > 0);
    assertFalse(actualValue < 0);

    // 异常断言
    assertThrows(IllegalArgumentException.class, () -> {
        throw new IllegalArgumentException("Test exception");
    });

    // 超时断言
    assertTimeout(Duration.ofMillis(100), () -> {
        Thread.sleep(50);
    });
}
```

#### 集合断言
```java
// ✅ 正确：集合断言
@Test
void testCollectionAssertions() {
    // Given
    List<String> actualList = Arrays.asList("apple", "banana", "orange");
    Set<Integer> actualSet = Set.of(1, 2, 3);

    // Then
    // 列表断言
    assertEquals(3, actualList.size());
    assertTrue(actualList.contains("apple"));
    assertTrue(actualList.containsAll(Arrays.asList("apple", "banana")));

    // 集合断言
    assertEquals(3, actualSet.size());
    assertTrue(actualSet.contains(1));
    assertTrue(actualSet.containsAll(Set.of(1, 2, 3)));

    // 数组断言
    String[] actualArray = {"apple", "banana", "orange"};
    assertArrayEquals(new String[]{"apple", "banana", "orange"}, actualArray);
}
```

### 2. AssertJ断言

#### 流畅断言
```java
// ✅ 正确：使用AssertJ流畅断言
@Test
void testAssertJAssertions() {
    // Given
    User user = UserBuilder.aUser()
        .withId(1L)
        .withUserName("john_doe")
        .withEmail("john@example.com")
        .withAge(30)
        .build();

    List<User> users = Arrays.asList(
        user,
        UserBuilder.aUser().withId(2L).withUserName("jane_doe").build()
    );

    // Then
    // 对象断言
    assertThat(user)
        .isNotNull()
        .hasFieldOrPropertyWithValue("id", 1L)
        .hasFieldOrPropertyWithValue("userName", "john_doe")
        .hasFieldOrPropertyWithValue("email", "john@example.com");

    // 字符串断言
    assertThat(user.getEmail())
        .isNotNull()
        .isNotEmpty()
        .contains("@")
        .endsWith(".com")
        .doesNotContain(" ");

    // 数值断言
    assertThat(user.getAge())
        .isGreaterThan(18)
        .isLessThan(100)
        .isEqualTo(30);

    // 集合断言
    assertThat(users)
        .isNotNull()
        .hasSize(2)
        .extracting(User::getUserName)
        .containsExactly("john_doe", "jane_doe");

    // 异常断言
    assertThatThrownBy(() -> {
        throw new IllegalArgumentException("Invalid argument");
    })
    .isInstanceOf(IllegalArgumentException.class)
    .hasMessage("Invalid argument");
}
```

## 测试分类

### 1. 单元测试

#### 服务层测试
```java
// ✅ 正确：服务层单元测试
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserDao userDao;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private EmailService emailService;

    @InjectMocks
    private UserService userService;

    @Test
    @DisplayName("创建用户 - 密码加密")
    void testCreateUser_PasswordEncoded() {
        // Given
        UserCreateRequest request = TestDataFactory.validUserCreateRequest();
        User savedUser = UserBuilder.aUser().build();
        when(userDao.insert(any(User.class))).thenReturn(savedUser);
        when(passwordEncoder.encode("password123")).thenReturn("encodedPassword");

        // When
        User result = userService.createUser(request);

        // Then
        verify(passwordEncoder, times(1)).encode("password123");
        verify(userDao).insert(argThat(user ->
            "encodedPassword".equals(user.getPassword())));
    }
}
```

#### 控制器测试
```java
// ✅ 正确：控制器单元测试
@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    @Mock
    private UserService userService;

    private UserController userController;

    @BeforeEach
    void setUp() {
        userController = new UserController(userService);
    }

    @Test
    @DisplayName("获取用户 - 成功")
    void testGetUser_Success() {
        // Given
        Long userId = 1L;
        User user = UserBuilder.aUser().withId(userId).build();
        when(userService.getUserById(userId)).thenReturn(user);

        // When
        ResponseEntity<UserResponse> response = userController.getUser(userId);

        // Then
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(userId, response.getBody().getId());
        assertEquals("testuser", response.getBody().getUserName());
    }

    @Test
    @DisplayName("获取用户 - 用户不存在")
    void testGetUser_NotFound() {
        // Given
        Long userId = 999L;
        when(userService.getUserById(userId)).thenThrow(new UserNotFoundException("User not found"));

        // When & Then
        assertThrows(UserNotFoundException.class, () -> {
            userController.getUser(userId);
        });
    }
}
```

### 2. 集成测试

#### Spring Boot集成测试
```java
// ✅ 正确：Spring Boot集成测试
@SpringBootTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class UserServiceIntegrationTest {

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    @Order(1)
    @DisplayName("创建用户 - 数据库集成")
    void testCreateUser_Integration() {
        // Given
        UserCreateRequest request = TestDataFactory.validUserCreateRequest();

        // When
        User result = userService.createUser(request);

        // Then
        assertNotNull(result);
        assertNotNull(result.getId());
        assertEquals("testuser", result.getUserName());
        assertEquals("test@example.com", result.getEmail());

        // 验证数据库中的数据
        User savedUser = entityManager.find(User.class, result.getId());
        assertNotNull(savedUser);
        assertEquals("testuser", savedUser.getUserName());
    }

    @Test
    @Order(2)
    @DisplayName("查询用户 - 数据库集成")
    void testGetUserById_Integration() {
        // Given
        User user = UserBuilder.aUser().build();
        entityManager.persistAndFlush(user);
        entityManager.clear();

        // When
        User result = userService.getUserById(user.getId());

        // Then
        assertNotNull(result);
        assertEquals(user.getId(), result.getId());
        assertEquals(user.getUserName(), result.getUserName());
    }

    @AfterEach
    void tearDown() {
        userRepository.deleteAll();
    }
}
```

#### Web层集成测试
```java
// ✅ 正确：Web层集成测试
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class UserControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("创建用户 - API集成测试")
    void testCreateUser_ApiIntegration() throws Exception {
        // Given
        UserCreateRequest request = TestDataFactory.validUserCreateRequest();

        // When & Then
        mockMvc.perform(post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.userName").value("testuser"))
                .andExpect(jsonPath("$.email").value("test@example.com"));

        // 验证数据库
        assertTrue(userRepository.findByUserName("testuser").isPresent());
    }

    @Test
    @DisplayName("获取用户 - API集成测试")
    void testGetUser_ApiIntegration() throws Exception {
        // Given
        User user = UserBuilder.aUser().build();
        userRepository.save(user);

        // When & Then
        mockMvc.perform(get("/api/users/{id}", user.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(user.getId().intValue()))
                .andExpect(jsonPath("$.userName").value(user.getUserName()))
                .andExpect(jsonPath("$.email").value(user.getEmail()));
    }
}
```

## 测试覆盖率

### 1. 覆盖率配置

#### JaCoCo配置
```xml
<!-- Maven JaCoCo配置 -->
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.8</version>
    <executions>
        <execution>
            <goals>
                <goal>prepare-agent</goal>
            </goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>test</phase>
            <goals>
                <goal>report</goal>
            </goals>
        </execution>
    </executions>
    <configuration>
        <rules>
            <rule>
                <element>BUNDLE</element>
                <limits>
                    <limit>
                        <counter>LINE</counter>
                        <value>COVEREDRATIO</value>
                        <minimum>0.80</minimum>
                    </limit>
                    <limit>
                        <counter>BRANCH</counter>
                        <value>COVEREDRATIO</value>
                        <minimum>0.70</minimum>
                    </limit>
                </limits>
            </rule>
        </rules>
    </configuration>
</plugin>
```

#### 覆盖率检查
```java
// ✅ 正确：编写覆盖各种情况的测试
@Test
void testCalculateDiscount_AllScenarios() {
    // Given
    Order order1 = OrderBuilder.anOrder().withAmount(new BigDecimal("100")).build();
    Order order2 = OrderBuilder.anOrder().withAmount(new BigDecimal("500")).build();
    Order order3 = OrderBuilder.anOrder().withAmount(new BigDecimal("1000")).build();

    // When & Then
    // 测试不同金额区间的折扣
    assertEquals(new BigDecimal("95"), discountService.calculateDiscount(order1));  // 5%折扣
    assertEquals(new BigDecimal("475"), discountService.calculateDiscount(order2)); // 5%折扣
    assertEquals(new BigDecimal("900"), discountService.calculateDiscount(order3)); // 10%折扣

    // 测试边界值
    Order order4 = OrderBuilder.anOrder().withAmount(new BigDecimal("499.99")).build();
    Order order5 = OrderBuilder.anOrder().withAmount(new BigDecimal("500.00")).build();
    assertEquals(new BigDecimal("474.99"), discountService.calculateDiscount(order4));
    assertEquals(new BigDecimal("475.00"), discountService.calculateDiscount(order5));
}
```

### 2. 测试覆盖率目标

#### 覆盖率标准
```
代码覆盖率目标：
- 行覆盖率（Line Coverage）：≥ 80%
- 分支覆盖率（Branch Coverage）：≥ 70%
- 方法覆盖率（Method Coverage）：≥ 90%
- 类覆盖率（Class Coverage）：≥ 85%

覆盖率报告位置：
target/site/jacoco/index.html
```

## 测试最佳实践

### 1. 测试数据清理

#### 使用@Sql清理数据
```java
// ✅ 正确：使用@Sql管理测试数据
@Test
@Sql(scripts = "/sql/insert-test-data.sql")
@Sql(scripts = "/sql/cleanup-test-data.sql", executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
void testWithPreparedData() {
    // 测试逻辑
}

// ✅ 正确：使用@DirtiesContext
@Test
@DirtiesContext
void testThatModifiesContext() {
    // 会修改Spring上下文状态的测试
}
```

#### 事务管理
```java
// ✅ 正确：使用事务回滚
@Test
@Transactional
@Rollback
void testWithTransaction() {
    // 测试数据会自动回滚
    User user = UserBuilder.aUser().build();
    userRepository.save(user);

    // 执行测试逻辑
    User result = userService.getUserById(user.getId());
    assertNotNull(result);
    // 事务回滚，数据不会持久化
}
```

### 2. 性能测试

#### 性能测试示例
```java
// ✅ 正确：性能测试
@Test
@Timeout(value = 1, unit = TimeUnit.SECONDS)
void testPerformance() {
    // Given
    List<User> users = TestDataFactory.createUsers(1000);
    when(userDao.findAll()).thenReturn(users);

    // When
    long startTime = System.currentTimeMillis();
    List<User> result = userService.getAllActiveUsers();
    long endTime = System.currentTimeMillis();

    // Then
    assertNotNull(result);
    assertTrue((endTime - startTime) < 100); // 执行时间应小于100ms
}

// ✅ 正确：大数据量测试
@Test
@Disabled("性能测试，按需执行")
void testLargeDataSet() {
    // Given
    List<Order> orders = TestDataFactory.createOrders(10000);
    when(orderDao.findOrdersByDateRange(any(), any())).thenReturn(orders);

    // When
    List<Order> result = orderService.getOrdersByDateRange(
        LocalDate.now().minusDays(30),
        LocalDate.now()
    );

    // Then
    assertEquals(10000, result.size());
}
```

## 测试检查清单

### 单元测试检查
- [ ] 测试类命名规范（被测试类+Test）
- [ ] 测试方法使用@DisplayName
- [ ] 遵循Given-When-Then结构
- [ ] 测试覆盖率达标
- [ ] Mock使用正确
- [ ] 断言准确完整

### 集成测试检查
- [ ] 使用@SpringBootTest
- [ ] 配置测试数据库
- [ ] 清理测试数据
- [ ] 验证数据库状态
- [ ] 测试API端点
- [ ] 验证HTTP状态码

### 测试质量检查
- [ ] 测试执行速度快
- [ ] 测试之间相互独立
- [ ] 测试数据准备清晰
- [ ] 异常情况覆盖完整
- [ ] 边界条件测试充分
- [ ] 性能测试合理

### 测试维护检查
- [ ] 测试代码可读性好
- [ ] 使用测试数据工厂
- [ ] 避免重复测试代码
- [ ] 定期清理无用测试
- [ ] 更新过时的测试