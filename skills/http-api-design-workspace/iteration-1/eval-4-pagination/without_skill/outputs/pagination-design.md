# Pagination Design for List Endpoints

## Overview

When a list endpoint could return thousands of records, pagination is essential to:
- Keep response payloads manageable
- Ensure consistent response times
- Reduce server and database load
- Provide a better client experience

This document defines pagination conventions for RESTful APIs.

---

## Pagination Strategy

### Recommended: Cursor-Based Pagination

For most use cases, **cursor-based pagination** (also called keyset pagination) is recommended over offset-based pagination because it:

- Performs consistently regardless of dataset size (no `OFFSET` degradation)
- Provides stable results even when records are inserted or deleted between requests
- Scales linearly with data growth

### When to Use Offset-Based Pagination

Offset-based pagination (`?offset=20&limit=20`) is acceptable when:
- The dataset is small and bounded (hundreds, not thousands)
- Clients need random access to specific pages (e.g., "go to page 5")
- The data is a static snapshot (e.g., a report export)

---

## Request Parameters

### Cursor-Based Pagination

| Parameter | Type    | Default | Description                                      |
|-----------|---------|---------|--------------------------------------------------|
| `cursor`  | string  | —       | Opaque cursor from a previous response           |
| `limit`   | integer | 20      | Number of records per page (max 100)             |
| `direction`| string | `next`  | Direction of pagination: `next` or `prev`        |

**Example request:**
```
GET /api/v1/users?limit=25&cursor=eyJpZCI6MTAwfQ
```

### Offset-Based Pagination (Alternative)

| Parameter | Type    | Default | Description                                      |
|-----------|---------|---------|--------------------------------------------------|
| `offset`  | integer | 0       | Number of records to skip                        |
| `limit`   | integer | 20      | Number of records per page (max 100)             |

**Example request:**
```
GET /api/v1/users?offset=40&limit=20
```

### Limit Constraints

- **Default:** 20 if not specified
- **Minimum:** 1
- **Maximum:** 100
- If a client sends `limit=0` or a negative value, return `400 Bad Request`
- If a client sends `limit` > maximum, clamp to the maximum (or return `400` with a message)

---

## Response Envelope

### Standard Envelope Structure

All paginated list endpoints MUST return a consistent envelope:

```json
{
  "data": [
    { "id": "abc-123", "name": "Alice" },
    { "id": "def-456", "name": "Bob" }
  ],
  "pagination": {
    "has_more": true,
    "next_cursor": "eyJpZCI6MTAwfQ",
    "prev_cursor": null,
    "total_count": 5847
  }
}
```

### Pagination Object Fields

| Field          | Type    | Description                                                   |
|----------------|---------|---------------------------------------------------------------|
| `has_more`     | boolean | `true` if there are more results beyond the current page      |
| `next_cursor`  | string  | Cursor to fetch the next page; `null` if on the last page     |
| `prev_cursor`  | string  | Cursor to fetch the previous page; `null` if on the first page|
| `total_count`  | integer | Total number of matching records (optional, see note)         |

> **Note on `total_count`:** Including total count requires a separate `COUNT(*)` query which can be expensive on large tables. Consider making it optional via a `?include_total=true` query parameter, or omit it entirely when the dataset is very large.

---

## Response Headers

Paginated responses SHOULD include the following HTTP headers for clients that prefer header-based pagination (e.g., Link headers per RFC 8288):

| Header             | Example Value                                                        | Description                           |
|--------------------|----------------------------------------------------------------------|---------------------------------------|
| `Link`             | `<https://api.example.com/users?cursor=abc>; rel="next"`            | RFC 8288 links for next/prev pages    |
| `X-Total-Count`    | `5847`                                                               | Total number of matching records      |
| `X-Page-Count`     | `293`                                                                | Total number of pages (if calculable) |
| `X-Per-Page`       | `20`                                                                 | The page size used for this response  |

### Link Header Format

```
Link: <https://api.example.com/api/v1/users?limit=20&cursor=eyJpZCI6MTAwfQ>; rel="next",
      <https://api.example.com/api/v1/users?limit=20&cursor=eyJpZCI6MTB9>; rel="prev"
```

---

## Status Codes

| Code  | When to Use                                                             |
|-------|-------------------------------------------------------------------------|
| `200` | Successful response, results returned (may be an empty array)           |
| `400` | Invalid pagination parameters (bad cursor, limit out of range, etc.)    |
| `422` | Cursor is valid but refers to a resource the client cannot access       |
| `500` | Internal server error during query execution                            |

### Error Responses for Invalid Pagination

**Bad cursor:**
```json
{
  "error": {
    "code": "INVALID_CURSOR",
    "message": "The provided cursor is invalid or has expired.",
    "details": {
      "param": "cursor",
      "value": "malformed-cursor"
    }
  }
}
```
**Status:** `400 Bad Request`

**Limit out of range:**
```json
{
  "error": {
    "code": "INVALID_LIMIT",
    "message": "Limit must be between 1 and 100.",
    "details": {
      "param": "limit",
      "value": 500,
      "min": 1,
      "max": 100
    }
  }
}
```
**Status:** `400 Bad Request`

---

## Empty Results

When a request matches zero records, return `200 OK` with an empty array:

```json
{
  "data": [],
  "pagination": {
    "has_more": false,
    "next_cursor": null,
    "prev_cursor": null,
    "total_count": 0
  }
}
```

---

## Full Examples

### First Page Request

```
GET /api/v1/users?limit=3 HTTP/1.1
Host: api.example.com
Authorization: Bearer <token>
Accept: application/json
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/json
X-Total-Count: 7
X-Per-Page: 3
Link: <https://api.example.com/api/v1/users?limit=3&cursor=dXNlcjoz>; rel="next"
```

```json
{
  "data": [
    { "id": "user:1", "name": "Alice", "email": "alice@example.com" },
    { "id": "user:2", "name": "Bob", "email": "bob@example.com" },
    { "id": "user:3", "name": "Charlie", "email": "charlie@example.com" }
  ],
  "pagination": {
    "has_more": true,
    "next_cursor": "dXNlcjoz",
    "prev_cursor": null,
    "total_count": 7
  }
}
```

### Second Page Request

```
GET /api/v1/users?limit=3&cursor=dXNlcjoz HTTP/1.1
Host: api.example.com
Authorization: Bearer <token>
Accept: application/json
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/json
X-Total-Count: 7
X-Per-Page: 3
Link: <https://api.example.com/api/v1/users?limit=3&cursor=dXNlcjo2>; rel="next",
      <https://api.example.com/api/v1/users?limit=3&cursor=dXNlcjE>; rel="prev"
```

```json
{
  "data": [
    { "id": "user:4", "name": "Diana", "email": "diana@example.com" },
    { "id": "user:5", "name": "Eve", "email": "eve@example.com" },
    { "id": "user:6", "name": "Frank", "email": "frank@example.com" }
  ],
  "pagination": {
    "has_more": true,
    "next_cursor": "dXNlcjo2",
    "prev_cursor": "dXNlcjE",
    "total_count": 7
  }
}
```

### Last Page Request

```
GET /api/v1/users?limit=3&cursor=dXNlcjo2 HTTP/1.1
Host: api.example.com
Authorization: Bearer <token>
Accept: application/json
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/json
X-Total-Count: 7
X-Per-Page: 3
Link: <https://api.example.com/api/v1/users?limit=3&cursor=dXNlcjQ>; rel="prev"
```

```json
{
  "data": [
    { "id": "user:7", "name": "Grace", "email": "grace@example.com" }
  ],
  "pagination": {
    "has_more": false,
    "next_cursor": null,
    "prev_cursor": "dXNlcjQ",
    "total_count": 7
  }
}
```

---

## Best Practices

1. **Cursor design:** Cursors MUST be opaque strings. Clients should not parse or construct them. Encode the sort key (usually the primary key or created_at timestamp) in a format like base64.

2. **Consistent sort order:** Always apply a deterministic sort (e.g., `ORDER BY created_at DESC, id DESC`) so cursor-based pagination produces stable, non-duplicate results.

3. **Graceful cursor expiry:** Cursors SHOULD expire after a reasonable period (e.g., 24 hours). Return `400` with a clear message when an expired cursor is used.

4. **Rate limiting headers:** Combine pagination headers with rate limit headers (`X-RateLimit-*`) for complete response metadata.

5. **Documentation:** Document the default and maximum `limit` values in your API reference so clients can request optimal page sizes.

6. **Avoid deep offset pages:** If you must use offset-based pagination, warn clients that `offset` values beyond a threshold (e.g., 10,000) may be slow or blocked. Provide cursor-based pagination as the alternative.

7. **Idempotency:** Pagination requests are idempotent `GET` operations. Caching is safe if responses include appropriate `Cache-Control` headers.
