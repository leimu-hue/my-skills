# Payment API Error Response Format Specification

## 1. Overview

This document defines the standard error response format for the Payment API. All error responses share a consistent envelope structure, with type-specific extensions for each error category.

## 2. Base Error Envelope

All error responses follow this top-level structure:

```json
{
  "error": {
    "type": "string",
    "code": "string",
    "message": "string",
    "details": [ ... ],
    "request_id": "string",
    "timestamp": "string (ISO 8601)"
  }
}
```

| Field         | Type     | Required | Description |
|---------------|----------|----------|-------------|
| `type`        | `string` | Yes      | Machine-readable error category. Always uppercase, underscore-delimited. |
| `code`        | `string` | Yes      | Machine-readable specific error code. Always uppercase, underscore-delimited. |
| `message`     | `string` | Yes      | Human-readable summary. Safe to display to end users. |
| `details`     | `array`  | No       | Array of detail objects providing field-level or contextual information. Empty array or omitted when not applicable. |
| `request_id`  | `string` | Yes      | Unique identifier for the request, for support correlation. |
| `timestamp`   | `string` | Yes      | ISO 8601 timestamp of when the error occurred (UTC). |

### 2.1 Detail Object

```json
{
  "field": "string",
  "code": "string",
  "message": "string"
}
```

| Field     | Type     | Required | Description |
|-----------|----------|----------|-------------|
| `field`   | `string` | No       | Dot-notation path to the field causing the error (e.g., `amount`, `card.number`). Omitted for non-field errors. |
| `code`    | `string` | Yes      | Machine-readable detail code. |
| `message` | `string` | Yes      | Human-readable explanation of the specific issue. |

---

## 3. Error Types

### 3.1 Validation Errors

- **HTTP Status:** `422 Unprocessable Entity`
- **Type:** `VALIDATION_ERROR`
- **When:** Request body or parameters fail schema or business-rule validation.
- **Details array:** One entry per invalid field.

#### Example: Multiple Validation Errors

```http
POST /v1/payments
Content-Type: application/json

{
  "amount": -50,
  "currency": "XYZ",
  "card": {
    "number": "1234",
    "exp_month": 13,
    "exp_year": 2020
  }
}
```

**Response:**

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json
X-Request-Id: req_a1b2c3d4e5

{
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "INVALID_REQUEST",
    "message": "The request contains invalid fields. Please correct them and retry.",
    "details": [
      {
        "field": "amount",
        "code": "INVALID_VALUE",
        "message": "Amount must be a positive number."
      },
      {
        "field": "currency",
        "code": "UNSUPPORTED_CURRENCY",
        "message": "Currency 'XYZ' is not supported. Supported currencies: USD, EUR, GBP, JPY."
      },
      {
        "field": "card.number",
        "code": "INVALID_CARD_NUMBER",
        "message": "Card number must be 13-19 digits."
      },
      {
        "field": "card.exp_month",
        "code": "INVALID_VALUE",
        "message": "Expiration month must be between 1 and 12."
      },
      {
        "field": "card.exp_year",
        "code": "EXPIRED_CARD",
        "message": "Card has expired."
      }
    ],
    "request_id": "req_a1b2c3d4e5",
    "timestamp": "2026-07-16T10:30:00Z"
  }
}
```

#### Example: Missing Required Fields

```http
POST /v1/payments
Content-Type: application/json

{
  "currency": "USD"
}
```

**Response:**

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json
X-Request-Id: req_f6g7h8i9j0

{
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "MISSING_REQUIRED_FIELD",
    "message": "Required fields are missing from the request.",
    "details": [
      {
        "field": "amount",
        "code": "REQUIRED",
        "message": "The 'amount' field is required."
      },
      {
        "field": "card",
        "code": "REQUIRED",
        "message": "Payment method details are required."
      }
    ],
    "request_id": "req_f6g7h8i9j0",
    "timestamp": "2026-07-16T10:31:00Z"
  }
}
```

---

### 3.2 Insufficient Funds

- **HTTP Status:** `402 Payment Required`
- **Type:** `PAYMENT_ERROR`
- **Code:** `INSUFFICIENT_FUNDS`
- **When:** The payer's account or card does not have enough balance to complete the transaction.
- **Details array:** Optionally includes available balance context (only if safe to expose).

#### Example: Insufficient Funds on Card

```http
POST /v1/payments
Content-Type: application/json

{
  "amount": 5000.00,
  "currency": "USD",
  "source": "card_abc123",
  "description": "Large purchase"
}
```

**Response:**

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
X-Request-Id: req_k1l2m3n4o5

{
  "error": {
    "type": "PAYMENT_ERROR",
    "code": "INSUFFICIENT_FUNDS",
    "message": "The payment could not be completed due to insufficient funds. Please use a different payment method or reduce the amount.",
    "details": [
      {
        "code": "BALANCE_SHORTFALL",
        "message": "Available balance is insufficient for the requested amount."
      }
    ],
    "request_id": "req_k1l2m3n4o5",
    "timestamp": "2026-07-16T10:32:00Z"
  }
}
```

#### Example: Insufficient Funds — Wallet Transfer

```http
POST /v1/transfers
Content-Type: application/json

{
  "from_wallet": "wallet_001",
  "to_wallet": "wallet_002",
  "amount": 1200.00,
  "currency": "USD"
}
```

**Response:**

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
X-Request-Id: req_p6q7r8s9t0

{
  "error": {
    "type": "PAYMENT_ERROR",
    "code": "INSUFFICIENT_FUNDS",
    "message": "The source wallet does not have sufficient funds to complete this transfer.",
    "details": [
      {
        "field": "amount",
        "code": "BALANCE_SHORTFALL",
        "message": "Requested amount ($1,200.00) exceeds available balance ($850.00)."
      }
    ],
    "request_id": "req_p6q7r8s9t0",
    "timestamp": "2026-07-16T10:33:00Z"
  }
}
```

---

### 3.3 Rate Limiting

- **HTTP Status:** `429 Too Many Requests`
- **Type:** `RATE_LIMIT_ERROR`
- **Code:** `RATE_LIMIT_EXCEEDED`
- **When:** Client has exceeded the allowed number of requests in the current time window.
- **Headers:** Response MUST include `Retry-After` header (seconds) and standard rate limit headers.

#### Example: Rate Limit Exceeded

```http
POST /v1/payments
Content-Type: application/json

{
  "amount": 25.00,
  "currency": "USD",
  "source": "card_xyz789"
}
```

**Response:**

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 30
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-07-16T10:35:00Z
X-Request-Id: req_u1v2w3x4y5

{
  "error": {
    "type": "RATE_LIMIT_ERROR",
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please wait before retrying.",
    "details": [
      {
        "code": "RATE_LIMIT_EXCEEDED",
        "message": "You have exceeded the rate limit of 100 requests per minute. Please retry after 30 seconds."
      }
    ],
    "request_id": "req_u1v2w3x4y5",
    "timestamp": "2026-07-16T10:34:30Z"
  }
}
```

#### Example: Rate Limit on Specific Endpoint

```http
POST /v1/payments/pay_abc123/capture
```

**Response:**

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 12
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-07-16T10:35:12Z
X-Request-Id: req_z6a7b8c9d0

{
  "error": {
    "type": "RATE_LIMIT_ERROR",
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many capture requests for this payment. Please wait before retrying.",
    "details": [
      {
        "code": "ENDPOINT_RATE_LIMIT_EXCEEDED",
        "message": "This endpoint is limited to 20 requests per minute. Retry after 12 seconds."
      }
    ],
    "request_id": "req_z6a7b8c9d0",
    "timestamp": "2026-07-16T10:35:00Z"
  }
}
```

---

## 4. Error Code Registry

| Type | Code | HTTP Status | Description |
|------|------|-------------|-------------|
| `VALIDATION_ERROR` | `INVALID_REQUEST` | 422 | General request validation failure. |
| `VALIDATION_ERROR` | `MISSING_REQUIRED_FIELD` | 422 | One or more required fields are absent. |
| `VALIDATION_ERROR` | `INVALID_VALUE` | 422 | A field value is outside the allowed range or format. |
| `VALIDATION_ERROR` | `UNSUPPORTED_CURRENCY` | 422 | The currency code is not supported. |
| `VALIDATION_ERROR` | `INVALID_CARD_NUMBER` | 422 | Card number fails format or Luhn check. |
| `VALIDATION_ERROR` | `EXPIRED_CARD` | 422 | Card expiration date is in the past. |
| `PAYMENT_ERROR` | `INSUFFICIENT_FUNDS` | 402 | Payer balance is less than the requested amount. |
| `PAYMENT_ERROR` | `BALANCE_SHORTFALL` | 402 | Specific detail code for the shortfall amount. |
| `RATE_LIMIT_ERROR` | `RATE_LIMIT_EXCEEDED` | 429 | Global or per-endpoint rate limit breached. |
| `RATE_LIMIT_ERROR` | `ENDPOINT_RATE_LIMIT_EXCEEDED` | 429 | Endpoint-specific rate limit breached. |

---

## 5. Implementation Guidelines

### 5.1 HTTP Status Code Selection

- **400** is NOT used for these cases. Validation issues use **422** (semantically "I understood your request, but it's invalid"). Rate limits use **429**. Insufficient funds use **402**.
- All 4xx responses include a machine-readable error body. Never return a bare status code.

### 5.2 Response Headers

- `Content-Type: application/json` on all error responses.
- `X-Request-Id` echoes the request ID from the error body (supports clients that read headers first).
- `Retry-After` is REQUIRED on all 429 responses (integer seconds).

### 5.3 Field Paths

- Use dot notation: `card.number`, `billing_address.city`.
- Use bracket notation for arrays: `items[0].quantity`.
- Top-level fields: just the field name (`amount`, `currency`).

### 5.4 Security Considerations

- NEVER expose internal system details, stack traces, or database errors in the `message` or `details` fields.
- For insufficient funds, do NOT expose the exact available balance unless the client is the account owner and the API design explicitly allows it.
- Rate limit error messages SHOULD NOT reveal internal thresholds to unauthenticated callers.

### 5.5 Client Retry Strategy

| Error Type | Retryable | Strategy |
|------------|-----------|----------|
| `VALIDATION_ERROR` | No | Fix the request and resubmit. |
| `INSUFFICIENT_FUNDS` | No | Use a different payment method or reduce amount. |
| `RATE_LIMIT_ERROR` | Yes | Wait `Retry-After` seconds, then retry with exponential backoff. |

---

## 6. Design Rationale

- **Consistent envelope:** Every error has the same top-level shape, so clients parse errors uniformly. Dispatch on `error.type` or `error.code`.
- **Details array:** Allows multiple field-level errors in a single response (especially validation), reducing round trips.
- **Separate type vs code:** `type` groups errors for coarse handling (show retry UI vs show form errors). `code` enables fine-grained logic per error.
- **Machine-readable codes:** Always SCREAMING_SNAKE_CASE. Never change existing codes (breaking change); deprecate and add new ones.
- **Human-readable messages:** Safe for UI display. Internationalization can be handled client-side by mapping `code` values.
- **Request ID:** Always present. Enables log correlation and support escalation without exposing internals.
