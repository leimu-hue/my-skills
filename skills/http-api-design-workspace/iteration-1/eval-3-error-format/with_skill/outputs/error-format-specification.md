# Payment API — Error Response Format Specification

Following [Heroku HTTP API Design](https://github.com/interagent/http-api-design) conventions.

## Error Object Structure

Every error response uses a consistent top-level object:

```json
{
  "id": "<machine_readable_error_code>",
  "message": "<human-readable description>",
  "url": "https://docs.payments.example.com/errors/<error_code>"
}
```

| Field     | Type     | Required | Description |
|-----------|----------|----------|-------------|
| `id`      | string   | yes      | Machine-readable error code. Lowercase, underscores. Document all possible IDs for clients. |
| `message` | string   | yes      | Human-readable description. Safe to display to end users. |
| `url`     | string   | no       | Link to documentation for this specific error. |

### Validation Errors — Multiple Issues

When a request has several invalid fields, include a top-level `errors` array. Each element uses the same three-field shape:

```json
{
  "id": "invalid_params",
  "message": "Request contains invalid parameters.",
  "url": "https://docs.payments.example.com/errors/invalid_params",
  "errors": [
    {
      "id": "missing_field",
      "message": "Amount is required.",
      "url": "https://docs.payments.example.com/errors/missing_field"
    },
    {
      "id": "invalid_format",
      "message": "Currency must be a 3-letter ISO 4217 code.",
      "url": "https://docs.payments.example.com/errors/invalid_format"
    }
  ]
}
```

## Required Response Headers

All error responses MUST include these headers (in addition to `Content-Type: application/json`):

```
Content-Type: application/json
Request-Id: 01234567-89ab-cdef-0123-456789abcdef
RateLimit-Remaining: 499
```

## Error Types

### 1. Validation Errors

**Status:** `422 Unprocessable Entity`

Valid HTTP request, but the parameters fail business validation.

#### Example — Missing Required Fields

```
POST /payments
Content-Type: application/json
Accept: application/vnd.payments+json; version=1

{
  "currency": "USD"
}
```

```json
// 422 Unprocessable Entity
{
  "id": "invalid_params",
  "message": "Request contains invalid parameters.",
  "url": "https://docs.payments.example.com/errors/invalid_params",
  "errors": [
    {
      "id": "missing_field",
      "message": "Amount is required.",
      "url": "https://docs.payments.example.com/errors/missing_field"
    },
    {
      "id": "missing_field",
      "message": "Source account is required.",
      "url": "https://docs.payments.example.com/errors/missing_field"
    }
  ]
}
```

#### Example — Invalid Field Values

```
POST /payments
Content-Type: application/json
Accept: application/vnd.payments+json; version=1

{
  "amount": -50,
  "currency": "us",
  "source": "acct_abc123",
  "destination": "acct_def456"
}
```

```json
// 422 Unprocessable Entity
{
  "id": "invalid_params",
  "message": "Request contains invalid parameters.",
  "url": "https://docs.payments.example.com/errors/invalid_params",
  "errors": [
    {
      "id": "invalid_value",
      "message": "Amount must be greater than zero.",
      "url": "https://docs.payments.example.com/errors/invalid_value"
    },
    {
      "id": "invalid_format",
      "message": "Currency must be a 3-letter ISO 4217 code.",
      "url": "https://docs.payments.example.com/errors/invalid_format"
    }
  ]
}
```

### 2. Insufficient Funds

**Status:** `422 Unprocessable Entity`

The request is structurally valid, but the source account lacks the funds to complete the payment.

```
POST /payments
Content-Type: application/json
Accept: application/vnd.payments+json; version=1

{
  "amount": 10000,
  "currency": "USD",
  "source": "acct_abc123",
  "destination": "acct_def456"
}
```

```json
// 422 Unprocessable Entity
{
  "id": "insufficient_funds",
  "message": "Source account has insufficient funds for this transaction.",
  "url": "https://docs.payments.example.com/errors/insufficient_funds"
}
```

This is a single error, not a list — there are no field-level validation issues, only a business rule violation on the transaction as a whole.

### 3. Rate Limiting

**Status:** `429 Too Many Requests`

The client has exceeded the allowed request rate. The `Retry-After` header tells the client when to retry.

```
POST /payments
Content-Type: application/json
Accept: application/vnd.payments+json; version=1

{ ... }
```

```json
// 429 Too Many Requests
// Headers:
//   RateLimit-Remaining: 0
//   Retry-After: 30
{
  "id": "rate_limit",
  "message": "Account reached its API rate limit.",
  "url": "https://docs.payments.example.com/errors/rate-limits"
}
```

Clients SHOULD:
1. Read the `Retry-After` header (seconds) and wait before retrying.
2. Use exponential backoff if `Retry-After` is absent.

## Error ID Reference

| `id`                  | Status | When |
|-----------------------|--------|------|
| `invalid_params`      | 422    | Request body has one or more validation failures. The `errors` array contains details. |
| `missing_field`       | 422    | (Nested) A required field is absent. |
| `invalid_format`      | 422    | (Nested) A field value does not match the expected format. |
| `invalid_value`       | 422    | (Nested) A field value is out of the acceptable range. |
| `insufficient_funds`  | 422    | Source account balance is below the requested amount. |
| `rate_limit`          | 429    | Client exceeded the allowed request rate. |
| `authentication_required` | 401 | Missing or invalid authentication token. |
| `forbidden`           | 403    | Authenticated but lacks permission for this resource. |
| `not_found`           | 404    | The requested resource does not exist. |
| `server_error`        | 500    | Unexpected internal failure. |

## Design Decisions

1. **Insufficient funds uses 422, not 402.** HTTP 402 (Payment Required) is reserved for actual payment collection (e.g., Stripe-style redirects), not for "you don't have enough money." 422 (Unprocessable Entity) correctly signals that the server understood the request but cannot process it due to a business rule.

2. **Validation errors bundle into `errors` array.** This lets clients display all issues at once instead of forcing round-trip retries per field — consistent with the structured error convention.

3. **No stack traces or internal details.** The `message` field is always safe for end-user display. Internal diagnostics go to server logs correlated by `Request-Id`.

4. **Minified JSON by default.** Clients can request pretty-printed responses via `Accept: application/vnd.payments+json; version=1; indent=2;` query parameter `?pretty=true`.
