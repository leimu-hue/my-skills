# Pagination Design for List Endpoints

Design guide for paginating collection endpoints that may return thousands of records, following Heroku Platform API conventions.

## Mechanism: Range Header Pagination

Use the HTTP `Range` header for pagination. This aligns with standard HTTP semantics for partial content and keeps query parameters free for filtering.

### Request

The client specifies the desired range of items:

```
GET /apps HTTP/1.1
Accept: application/vnd.heroku+json; version=3
Range: items=0-24
```

- Range is **zero-indexed** and **inclusive** on both ends.
- `items=0-24` returns items at positions 0 through 24 (25 items).
- The server MAY enforce a maximum page size (e.g., 200). If the client requests a range exceeding the max, the server returns the maximum allowed.

### Response: 206 Partial Content

When the `Range` header is present and valid, return `206 Partial Content` with a `Content-Range` header:

```
HTTP/1.1 206 Partial Content
Content-Type: application/vnd.heroku+json; version=3
Content-Range: items 0-24/327
Request-Id: 7b23f5e0-a1b4-4c3d-9e8f-6a7b8c9d0e1f
ETag: "pagination-range-0-24"
```

`Content-Range` format: `items <first>-<last>/<total>`

- `<first>`: index of the first item returned
- `<last>`: index of the last item returned
- `<total>`: total number of items available (or `*` if unknown)

### Response: 200 OK (No Range Header)

If the client omits the `Range` header, return `200 OK` with all items (up to server maximum) and include `Content-Range` for discoverability:

```
HTTP/1.1 200 OK
Content-Type: application/vnd.heroku+json; version=3
Content-Range: items 0-24/327
Request-Id: 7b23f5e0-a1b4-4c3d-9e8f-6a7b8c9d0e1f
```

## Response Headers

Every paginated response MUST include these headers:

| Header | Purpose | Example |
|--------|---------|---------|
| `Content-Range` | Indicates returned range and total count | `items 0-24/327` |
| `Request-Id` | Tracing UUID | `7b23f5e0-a1b4-4c3d-9e8f-6a7b8c9d0e1f` |
| `ETag` | Cache key for this range | `"pagination-range-0-24"` |
| `RateLimit-Remaining` | Rate limit status | `4500` |
| `Content-Type` | Versioned JSON | `application/vnd.heroku+json; version=3` |

## Response Body

Return an array of full resource objects:

```json
[
  {
    "id": "01234567-89ab-cdef-0123-456789abcdef",
    "name": "demoapp",
    "created_at": "2012-01-01T12:00:00Z",
    "updated_at": "2012-01-01T13:00:00Z"
  },
  {
    "id": "12345678-9abc-def0-1234-56789abcdef0",
    "name": "staging-app",
    "created_at": "2012-02-01T12:00:00Z",
    "updated_at": "2012-02-01T13:00:00Z"
  }
]
```

- Return **full resource representations** (not partial objects).
- Return `[]` when the collection is empty, never `null`.
- JSON is **minified** by default (no pretty-print).

## Status Codes

| Status | When |
|--------|------|
| `200 OK` | Valid request, no `Range` header provided |
| `206 Partial Content` | Valid `Range` header, partial result returned |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Authenticated but insufficient permissions |
| `416 Range Not Satisfiable` | Range start exceeds total item count |
| `422 Unprocessable Entity` | Malformed `Range` header value |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Server-side failure |

### 416 Range Not Satisfiable

When the requested range start exceeds the total count (e.g., requesting `items=500-524` when only 327 items exist):

```
HTTP/1.1 416 Range Not Satisfiable
Content-Range: items */327
```

```json
{
  "id": "range_not_satisfiable",
  "message": "The requested range start 500 exceeds total item count 327.",
  "url": "https://docs.service.com/pagination"
}
```

### 422 Malformed Range

When the `Range` header value is invalid (e.g., `Range: items=abc`):

```json
{
  "id": "invalid_range",
  "message": "Range header must follow format: items=<first>-<last>",
  "url": "https://docs.service.com/pagination"
}
```

## Client Navigation Patterns

### Sequential Forward

```
GET /apps           → Range: items=0-24      → Content-Range: items 0-24/327
GET /apps           → Range: items=25-49     → Content-Range: items 25-49/327
GET /apps           → Range: items=50-74     → Content-Range: items 50-74/327
```

Detect end of collection when `last == total - 1` or the returned array length is less than the requested page size.

### Fetch All (Iterative)

```bash
export TOKEN=... # acquire from dashboard

# First page
curl -is -H "Range: items=0-99" -H "Accept: application/vnd.heroku+json; version=3" \
  https://$TOKEN@service.com/apps

# Next page (adjust range based on Content-Range)
curl -is -H "Range: items=100-199" -H "Accept: application/vnd.heroku+json; version=3" \
  https://$TOKEN@service.com/apps
```

### With Filtering

Range pagination composes with query parameters:

```
GET /apps?owner=alice HTTP/1.1
Range: items=0-24
```

The `Content-Range` total reflects items matching the filter, not the entire collection.

## Caching

Use `ETag` + `If-None-Match` for conditional requests:

```
GET /apps HTTP/1.1
Range: items=0-24
If-None-Match: "pagination-range-0-24"
```

```
HTTP/1.1 304 Not Modified
Content-Range: items 0-24/327
ETag: "pagination-range-0-24"
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pagination style | `Range` header | Follows HTTP standards; keeps query params for filtering |
| Index base | Zero-based | Consistent with `Content-Range` spec (RFC 7233) |
| Default page size | 25 | Balances response size and request count |
| Max page size | 200 | Prevents unbounded responses |
| Empty results | `[]` | Never `null`; consistent with response type rules |
| Identifiers | UUID | Globally unique, no sequential leak |
| Timestamps | ISO8601 UTC | Required on all resource responses |

## Anti-Patterns to Avoid

1. **Offset-based via query params** (`?page=5&per_page=25`): Inconsistent under concurrent inserts/deletes; rows shift between pages.
2. **Cursor-based as sole mechanism**: Non-standard; forces opaque tokens that break caching and composability.
3. **Returning null for empty collections**: Use `[]` instead.
4. **Omitting total count**: Clients cannot compute total pages or progress.
5. **Pretty-printing by default**: Increases payload size; offer via `?pretty=true` or Accept header.
