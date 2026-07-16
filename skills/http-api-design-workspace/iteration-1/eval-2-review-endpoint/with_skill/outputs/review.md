# API Endpoint Review

## Endpoints Under Review

| # | Endpoint |
|---|----------|
| 1 | `GET /api/v1/getUserById?id=123` |
| 2 | `POST /api/v1/createNewUser` |

---

## Issues Identified

### 1. URL encodes actions instead of resource identity

**Severity: High**

Both endpoints embed the *action* in the URL (`getUserById`, `createNewUser`). This is an RPC-style pattern, not RESTful resource design. URLs should name the **resource**, while the HTTP method expresses the action.

| Current | Problem |
|---------|---------|
| `GET /api/v1/getUserById?id=123` | "getUserById" is an action, not a resource name |
| `POST /api/v1/createNewUser` | "createNewUser" is an action; `POST` already means create |

**Recommendation:**

```
GET    /api/v1/users/{id}    → fetch a user
POST   /api/v1/users         → create a user
```

The full set of operations on users becomes a predictable, uniform interface:

```
GET    /api/v1/users              → list users
POST   /api/v1/users              → create user
GET    /api/v1/users/{id}         → read user
PATCH  /api/v1/users/{id}         → update user
DELETE /api/v1/users/{id}         → delete user
```

### 2. Resource name is singular, not plural

**Severity: Medium**

`getUserById` and `createNewUser` use singular "User". Resources represent collections and should use **plural nouns** (`/users`). A single user is accessed by ID within that collection (`/users/{id}`).

### 3. Path is not lowercase with hyphens

**Severity: Low**

CamelCase (`getUserById`, `createNewUser`) violates the convention. Paths must be lowercase with hyphens for multi-word segments (though here the fix is to remove the action names entirely and use `/users`).

### 4. User ID passed as query parameter instead of path segment

**Severity: Medium**

`GET /api/v1/getUserById?id=123` puts the resource identifier in the query string. Path segments are for **resource identity**; query parameters are for filtering, sorting, or pagination. The ID belongs in the path:

```
GET /api/v1/users/123
```

### 5. Version in URL path instead of Accept header

**Severity: Medium**

`/api/v1/` embeds versioning in the URL. The recommended approach is to version via the `Accept` header:

```
Accept: application/vnd.mycompany+json; version=1
```

This keeps the URL stable and makes version negotiation explicit. URL versioning is acceptable as a pragmatic compromise, but the header approach is preferred per the Heroku conventions.

### 6. Missing structured error response format

**Severity: Medium**

No error response contract is defined. Errors should return a consistent structure:

```json
{
  "id": "not_found",
  "message": "User not found.",
  "url": "https://docs.service.com/errors/not-found"
}
```

With fields: `id` (machine-readable code), `message` (human-readable), `url` (optional docs link).

### 7. Missing required response headers

**Severity: Medium**

The following headers should be present on every response:

| Header | Purpose |
|--------|---------|
| `Request-Id` | UUID for distributed tracing |
| `ETag` | Cache validation per resource |
| `RateLimit-Remaining` | Informs client of quota status |
| `Content-Type` | Always `application/json` |

### 8. No response body contract defined for success cases

**Severity: Medium**

Success responses should follow these rules:

- **GET (single):** Return full user object with `id` (UUID), `created_at`, `updated_at`, and nested foreign keys.
- **POST (create):** Return `201 Created` with full resource in body and `Location` header pointing to the new resource.

Example user response:

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "name": "alice",
  "email": "alice@example.com",
  "organization": {
    "id": "fedcba98-7654-3210-fedc-ba9876543210"
  },
  "created_at": "2026-07-16T12:00:00Z",
  "updated_at": "2026-07-16T12:00:00Z"
}
```

### 9. No mention of TLS enforcement

**Severity: Medium**

All endpoints must be served over HTTPS. Non-TLS requests should be rejected or return `403 Forbidden` (avoid redirects, which expose data in the first request).

---

## Summary of Recommended Changes

### Before

```
GET  /api/v1/getUserById?id=123
POST /api/v1/createNewUser
```

### After

```
GET    /users/{user_id}     → 200 OK (full user object)
POST   /users               → 201 Created (full user object + Location header)
```

With:

- Versioning via `Accept: application/vnd.mycompany+json; version=1`
- `Request-Id`, `ETag`, `RateLimit-Remaining` on all responses
- Structured error format with `id`, `message`, `url`
- UUIDs for resource identifiers
- ISO8601 UTC timestamps (`created_at`, `updated_at`)
- TLS enforced, no HTTP

### Review Checklist

| Check | Status |
|-------|--------|
| TLS enforced | Not specified — needs enforcement |
| Version in Accept header | Uses URL path — switch to header |
| Plural resource names | Uses action verbs — change to `/users` |
| Lowercase paths with hyphens | Uses camelCase — change to lowercase |
| UUID identifiers | Uses numeric `123` — switch to UUID |
| Proper status codes | Not specified — use 200 for GET, 201 for POST |
| Structured error responses | Missing — add standard error format |
| ETag caching headers | Missing |
| Request-Id tracing | Missing |
| Rate limit headers | Missing |
| ISO8601 timestamps | Not specified — add `created_at`/`updated_at` |
| Nested foreign keys | Not specified — nest as objects |
| Minified JSON default | Not specified |
