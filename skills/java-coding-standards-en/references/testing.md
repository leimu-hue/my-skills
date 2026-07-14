# Unit Testing Standards

## Basic Principles

- Tests should prove behavior, not lock down irrelevant implementation details
- When adding or modifying business logic, at minimum cover: happy path, parameter errors, key boundaries, and exception branches
- Unit tests are fast, isolated, and repeatable by default; integration tests are only for verifying component collaboration
- Follow existing project test frameworks, naming, and assertion styles first; don't introduce new toolchains for a single test
- Coverage is a quality signal, not the only goal; hard thresholds should follow project CI configuration

## Test Types

| Type | Goal | Common Tools | Boundaries |
| --- | --- | --- | --- |
| Unit Test | Verify single class or method behavior | JUnit 5, Mockito, AssertJ | Don't start Spring, or use only minimal extensions |
| Slice Test | Verify partial framework integration (Web, Repository) | `@WebMvcTest`, `@DataJpaTest` | Preferred over `@SpringBootTest` |
| Integration Test | Verify collaboration of multiple components, DB, messaging, external adapters | `@SpringBootTest`, Testcontainers, MockMvc | High cost; test only critical flows |
| End-to-End Test | Verify real user flows | API/UI test tools | Small number; cover main happy paths |

## Test Structure

- Test class naming: tested class + `Test`, e.g. `UserServiceTest`
- Test method naming: express scenario and outcome, e.g. `createUser_invalidEmail_throwsValidationException`
- Use `@DisplayName` for supplementary Chinese business descriptions when helpful
- Recommended Given / When / Then structure
- Each test verifies one clear behavior; avoid cramming unrelated scenarios into a single test

```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @Test
    @DisplayName("Create user - blank email throws validation exception")
    void createUser_blankEmail_throwsValidationException() {
        // record is immutable; pass invalid values via constructor
        UserCreateRequest request = new UserCreateRequest("alice", "", null);

        assertThatThrownBy(() -> userService.createUser(request))
            .isInstanceOf(ValidationException.class);

        verifyNoInteractions(userRepository);
    }
}
```

## Test Data

- Simple objects can be constructed directly in the test for immediate readability
- Use Test Data Factory / Builder when reused across multiple tests or when fields are numerous
- Factories should produce valid objects by default; individual tests only modify fields relevant to their scenario
- Don't bury test data so deep that assertions lose business meaning

```java
// record created via constructor; factory returns new instance
UserCreateRequest request = TestDataFactory.userCreateRequest("alice", "alice@example.com");
```

## Mocking Rules

- Mock external dependencies: Repository, Client, messaging, email, payment, filesystem, time services
- Don't mock the subject under test; prefer constructor injection for dependencies
- Don't mock plain value objects, simple DTOs, or side-effect-free utility classes
- Verify key interactions, not every internal call; excessive `verify` makes refactoring difficult
- When using `any()`, confirm it doesn't mask critical parameters; use `eq()`, `argThat()`, or captors for important parameters
- Don't use `verifyNoMoreInteractions()` by default unless "no additional interactions" is itself a business rule

```java
verify(emailClient).sendWelcomeEmail(argThat(email ->
    email.getRecipient().equals("alice@example.com")
));
```

## Assertions

- Prefer asserting externally observable outcomes: return values, state changes, exceptions, persistence results, external calls
- For exception tests, check both exception type and key message/error code
- For collection assertions, check count, order, and key fields; don't just assert non-empty
- Use AssertJ for better readability when the project already uses AssertJ style

```java
assertThat(result)
    .extracting(User::getUserName, User::getEmail)
    .containsExactly("alice", "alice@example.com");
```

## Choosing Spring Test Scope

- For Controllers, verifying only routing, parameter binding, status codes, and response bodies, use `@WebMvcTest`
- For Repositories, verifying only JPA/MyBatis mapping and SQL, use `@DataJpaTest` or the project's existing DB test approach
- Use `@SpringBootTest` only when the full set of beans, transactions, config, and filter chain is needed
- For database integration, prefer test databases, Testcontainers, or transaction rollback; don't pollute local/shared environments
- Avoid `@TestMethodOrder` that makes tests order-dependent; if ordering is truly needed, document the reason

```java
@WebMvcTest(UserController.class)
class UserControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;
}
```

## Data Cleanup and Stability

- Each test independently prepares and cleans up its data
- Integration tests can isolate via transaction rollback, `@Sql`, dedicated schemas, or container recreation
- Tests shouldn't depend on current time, random numbers, thread scheduling, or external networks; inject Clock, Random, or Client as needed
- Don't use `Thread.sleep()` to wait for async results; use conditional waits or controllable executors
- Separate performance tests from regular unit tests; don't let the default test suite become slow or flaky

## Coverage Scope

Focus on covering:

- Normal success paths
- null, empty string, empty collection, invalid enum, out-of-range values
- Business failures: insufficient permissions, resource not found, duplicate submission, insufficient balance
- External dependency failures, timeouts, abnormal data returns
- Boundaries: amounts, time, pagination, sorting, state transitions

Coverage recommendations:

- New core business logic should have direct tests
- Complex branches should prioritize branch coverage
- Plain getters/setters, simple config, and framework boilerplate don't need mechanical coverage
- When the project has JaCoCo thresholds, follow CI thresholds
