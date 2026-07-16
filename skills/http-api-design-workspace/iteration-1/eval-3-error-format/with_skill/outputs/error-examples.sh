# Payment API Error Examples — Executable

All examples assume:
- Base URL: `https://api.payments.example.com`
- API version: `application/vnd.payments+json; version=1`
- Auth token obtained from the dashboard

```bash
export TOKEN=<your-api-token>
export BASE=https://api.payments.example.com
```

## Validation Error — Missing Fields

```bash
curl -is https://$TOKEN@$BASE/payments \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.payments+json; version=1" \
  -d '{"currency": "USD"}'
```

Expected:
```json
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json
Request-Id: a]1b2c3d4-e5f6-7890-abcd-ef1234567890
RateLimit-Remaining: 499

{"id":"invalid_params","message":"Request contains invalid parameters.","url":"https://docs.payments.example.com/errors/invalid_params","errors":[{"id":"missing_field","message":"Amount is required.","url":"https://docs.payments.example.com/errors/missing_field"},{"id":"missing_field","message":"Source account is required.","url":"https://docs.payments.example.com/errors/missing_field"}]}
```

## Validation Error — Invalid Values

```bash
curl -is https://$TOKEN@$BASE/payments \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.payments+json; version=1" \
  -d '{"amount": -50, "currency": "us", "source": "acct_abc123", "destination": "acct_def456"}'
```

Expected:
```json
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json
Request-Id: b2c3d4e5-f6a7-8901-bcde-f12345678901
RateLimit-Remaining: 498

{"id":"invalid_params","message":"Request contains invalid parameters.","url":"https://docs.payments.example.com/errors/invalid_params","errors":[{"id":"invalid_value","message":"Amount must be greater than zero.","url":"https://docs.payments.example.com/errors/invalid_value"},{"id":"invalid_format","message":"Currency must be a 3-letter ISO 4217 code.","url":"https://docs.payments.example.com/errors/invalid_format"}]}
```

## Insufficient Funds

```bash
curl -is https://$TOKEN@$BASE/payments \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.payments+json; version=1" \
  -d '{"amount": 10000, "currency": "USD", "source": "acct_abc123", "destination": "acct_def456"}'
```

Expected:
```json
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json
Request-Id: c3d4e5f6-a7b8-9012-cdef-123456789012
RateLimit-Remaining: 497

{"id":"insufficient_funds","message":"Source account has insufficient funds for this transaction.","url":"https://docs.payments.example.com/errors/insufficient_funds"}
```

## Rate Limited

```bash
# Repeat rapidly until rate limit triggers:
curl -is https://$TOKEN@$BASE/payments \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.payments+json; version=1" \
  -d '{"amount": 100, "currency": "USD", "source": "acct_abc123", "destination": "acct_def456"}'
```

Expected:
```json
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Request-Id: d4e5f6a7-b8c9-0123-defa-234567890123
RateLimit-Remaining: 0
Retry-After: 30

{"id":"rate_limit","message":"Account reached its API rate limit.","url":"https://docs.payments.example.com/errors/rate-limits"}
```
