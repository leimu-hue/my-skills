# API Endpoint Review

## Endpoints Reviewed

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/getUserById?id=123` | Retrieve a user by ID |
| POST | `/api/v1/createNewUser` | Create a new user |

---

## Issues Identified

### 1. Verbs in URL Path — Violates REST Resource Naming Convention

Both endpoints embed **operations** (`getUserById`, `createNewUser`) in the URL. REST treats URLs as **resource identifiers**, not function calls. The HTTP method already conveys the action.

**Current:**
```
GET  /api/v1/getUserById?id=123
POST /api/v1/createNewUser
```

**Recommended:**
```
GET  /api/v1/users/123
POST /api/v1/users
```

**Rationale:** Resources are nouns. `GET /users/123` already means "get user 123" — the verb is redundant. `POST /users` means "create a user in this collection" by HTTP convention.

---

### 2. Resource ID Passed as Query Parameter Instead of Path Parameter

`GET /api/v1/getUserById?id=123` uses a query string for the user ID. Query parameters are for **filtering, sorting, or optional modifiers** — not for identifying a specific resource.

**Current:** `?id=123` (query parameter)
**Recommended:** `/users/123` (path parameter)

**Rationale:** Path parameters express identity (`/users/123` = "the user whose id is 123"). Query parameters express optional criteria (`/users?status=active` = "users filtered by status"). This distinction is a core REST principle and affects caching, routing, and API documentation.

---

### 3. camelCase in URL Segments — Inconsistent with HTTP Conventions

URL path segments `getUserById` and `createNewUser` use camelCase. HTTP URLs are conventionally **lowercase kebab-case** or plain lowercase nouns.

**Current:** `/api/v1/getUserById`
**Recommended:** `/api/v1/users`

**Rationale:** Kebab-case (`/user-profiles`) or simple lowercase nouns (`/users`) are case-insensitive-friendly and universally preferred in API style guides (Google, Microsoft, Heroku, Stripe).

---

## Summary of Recommended Changes

| Current | Recommended | Issue |
|---------|-------------|-------|
| `GET /api/v1/getUserById?id=123` | `GET /api/v1/users/123` | Verb in URL; ID in query string |
| `POST /api/v1/createNewUser` | `POST /api/v1/users` | Verb in URL; redundant naming |

## Additional Recommendations (Beyond the Two Endpoints)

- **Use plural nouns consistently** for collection resources (`/users`, `/orders`).
- **Return proper HTTP status codes:** `201 Created` with `Location` header for POST, `404 Not Found` for missing users.
- **Versioning is good** — `/v1` is correctly applied. Keep it.
- **Consider related endpoints** following the same pattern:
  - `GET /api/v1/users` — list users
  - `GET /api/v1/users/123` — get one user
  - `PUT /api/v1/users/123` — full update
  - `PATCH /api/v1/users/123` — partial update
  - `DELETE /api/v1/users/123` — delete user
