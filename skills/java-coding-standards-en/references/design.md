# Software Design Standards

## Usage Boundaries

This document guides Java / Spring design decisions. It does not mandate patterns or DDD terminology. When an existing project has stable conventions, stay consistent first; only introduce new abstractions for new modules, refactoring shared capabilities, or eliminating obvious complexity.

- Layering, interfaces, and design patterns serve to reduce coupling — they are not goals in themselves
- Examples only express responsibility boundaries; return formats, exception types, and package structure should follow project conventions
- New abstractions must correspond to real variation points: multiple implementations, channels, algorithms, or external system adapters
- Enum persistence defaults to `EnumType.STRING` to prevent enum ordinal changes from corrupting historical data

## Architectural Principles

### SOLID

| Principle | Requirement | Avoid |
| --- | --- | --- |
| SRP Single Responsibility | A class has one clear responsibility | Service handling HTTP, business logic, persistence, reports, and notifications simultaneously |
| OCP Open/Closed | Extend variation points via interfaces, strategies, registries | Modifying the main `if/else` flow for every new type |
| LSP Liskov Substitution | Subclasses must honor parent contracts | Subclass overriding a method and throwing `UnsupportedOperationException` |
| ISP Interface Segregation | Split interfaces by caller needs | Large interfaces forcing implementations to write meaningless methods |
| DIP Dependency Inversion | High-level modules depend on interfaces; concrete implementations provided by injection | Business classes `new`-ing concrete Repository, SDK, Client instances |

Typical extension point pattern:

```java
public interface PaymentProcessor {
    boolean supports(PaymentType type);
    PaymentResult process(Payment payment);
}

@Service
@RequiredArgsConstructor
public class PaymentService {
    private final List<PaymentProcessor> processors;

    public PaymentResult processPayment(Payment payment) {
        PaymentProcessor processor = processors.stream()
            .filter(p -> p.supports(payment.getType()))
            .findFirst()
            .orElseThrow(UnsupportedPaymentTypeException::new);
        return processor.process(payment);
    }
}
```

### Layered Architecture

Standard responsibilities:

- Controller: HTTP parameters, responses, status codes; no business rules
- Service / ApplicationService: use-case orchestration, transactions, domain object invocation, external collaboration
- Repository: data access; no business orchestration
- Model / Entity / DTO: data structure and self-rules; don't mix in controller-layer details

```java
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;

    @PostMapping
    public ResponseEntity<UserResponse> createUser(@Valid @RequestBody UserCreateRequest request) {
        User user = userService.createUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(user));
    }
}
```

## Design Patterns

Use patterns only when there are real variation points. When there is a single implementation, no reuse plan, or unstable rules, keep the code simple. Abstract only when types, channels, algorithms, or third-party adapters cause continuously growing branching.

| Pattern | Applicable Scenario | Notes |
| --- | --- | --- |
| Factory | Obtaining multiple registered implementations by type | Type classification declared by the implementation itself; unknown types fail explicitly |
| Builder | Many construction parameters, many defaults, complex object creation | Java 17+ simple immutable DTOs prefer `record`; use `@Builder` only when record is unsuitable and the project already uses Lombok |
| Adapter | Shielding third-party SDK, external protocol, or legacy interface differences | Conversion logic stays in the adapter; don't leak to the business layer |
| Decorator | Adding capabilities without modifying the original implementation | Don't create multi-layer wrappers for one-off enhancements |
| Strategy | Switchable algorithms, rules, or channels | Strategy selection is centrally managed; business flows don't scatter type checks |
| Observer / Event | One action triggers multiple follow-up actions | Events carry only necessary facts; listeners avoid mutual dependencies |

Factory example:

```java
public interface Notification {
    NotificationType type();
    void send(String message);
}

@Component
public class NotificationFactory {
    private final Map<NotificationType, Notification> notifications;

    public NotificationFactory(List<Notification> notificationList) {
        this.notifications = notificationList.stream()
            .collect(Collectors.toMap(Notification::type, Function.identity()));
    }

    public Notification getNotification(NotificationType type) {
        Notification notification = notifications.get(type);
        if (notification == null) {
            throw new IllegalArgumentException("Unsupported notification type: " + type);
        }
        return notification;
    }
}
```

## API Design

### RESTful Resources

- Use noun resources: `/api/users`, `/api/users/{id}`, `/api/users/{id}/orders`
- Avoid verb paths: `/api/getUsers`, `/api/createUser`, `/api/updateUser`
- Common status codes: `201` for creation, `200` for query/update, `204` for deletion, `400` for bad request, `401` for unauthorized, `403` for forbidden, `404` for not found, `409` for conflict

### Request and Response

- Request DTOs use Bean Validation for boundary checks
- Response DTOs must not directly expose entities; avoid leaking persistence structures
- Response format must be consistent within the same project
- If the project already uses a unified `ApiResponse<T>`, Controllers should wrap responses uniformly; if the project uses pure HTTP semantics with direct DTO returns, don't locally introduce a wrapping layer
- Error responses are generated by the global exception handler; Controllers should not write inconsistent error bodies
- Paginated responses must include at minimum: `content`, `pageNumber`, `pageSize`, `totalElements`, `totalPages`, `hasNext`

```java
// Java 17+ prefer record
public record UserCreateRequest(
    @NotBlank
    @Size(min = 3, max = 50)
    String userName,

    @NotBlank
    @Email
    String email
) {}

// Java 8/11 fallback
@Data
@Builder
public class UserCreateRequest {
    @NotBlank
    @Size(min = 3, max = 50)
    private String userName;

    @NotBlank
    @Email
    private String email;
}
```

### API Versioning

- Public APIs default to URL versioning: `/api/v1/users`
- Header versioning suits internal APIs, gateway-based routing, or client-controllable scenarios: `X-API-Version=1`
- Don't mix multiple versioning strategies within the same business domain unless the gateway or compatibility plan explicitly requires it

## Global Exception Handling

Choose by scenario; stay consistent within a project:

| Solution | Applicable Scenario | Advantage |
| --- | --- | --- |
| `ErrorResponse` + `MessageSource` | Internal management systems, multi-language enterprise projects | Full i18n support, errorCode as message key |
| `ProblemDetail` (RFC 7807) | Open platforms, inter-microservice REST APIs | Spring Boot 3 standard, structured error body |

### Solution 1: ErrorResponse + MessageSource (i18n-first)

Detailed implementation in `./exception-logging.md` Exception Handling section.

### Solution 2: ProblemDetail (RFC 7807)

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(UserNotFoundException.class)
    public ProblemDetail handleNotFound(UserNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(BusinessException.class)
    public ProblemDetail handleBusiness(BusinessException e) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(
            HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
        detail.setProperty("errorCode", e.getErrorCode());
        return detail;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnknown(Exception e) {
        log.error("Unexpected system error", e);
        return ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
    }
}
```

## Domain-Driven Design

### Domain Objects

| Concept | Criteria | Rules |
| --- | --- | --- |
| Entity | Has identity; state may change over its lifecycle | Business rules should be placed in entity methods |
| Value Object | No identity; equality by attribute values | Keep immutable; implement `equals` / `hashCode` |
| Aggregate Root | Sole external modification entry point for the aggregate | External code only modifies aggregate internals through the root |

Entity example:

```java
@Entity
public class Order {
    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    public void confirm() {
        if (status != OrderStatus.PENDING) {
            throw new IllegalStateException("Only pending orders can be confirmed");
        }
        this.status = OrderStatus.CONFIRMED;
    }
}
```

### Application Services and Domain Services

- Application Service: orchestrates use cases, transactions, repositories, notifications, payments, and other external collaboration
- Domain Service: carries business rules that don't naturally belong to a single entity or value object
- Spring `@Service` is just a component role; it is not equivalent to a DDD Domain Service
- Rules that the domain model can handle itself should be placed in entities or value objects first

```java
@Service
@RequiredArgsConstructor
public class OrderApplicationService {
    private final OrderRepository orderRepository;
    private final InventoryPolicy inventoryPolicy;

    @Transactional
    public Order createOrder(OrderCreateCommand command) {
        inventoryPolicy.checkEnoughStock(command.items());
        Order order = Order.create(command);
        return orderRepository.save(order);
    }
}
```
