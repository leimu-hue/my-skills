# Blog Platform API Design

Base URL: `https://api.blogplatform.com`

All requests MUST use TLS. Non-TLS requests are rejected.

## Authentication

All endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtain tokens via `POST /login` (see [Login](#create-session)).

## Versioning

Every request MUST include the API version in the `Accept` header:

```
Accept: application/vnd.blogplatform+json; version=1
```

## Common Headers

### Request Headers

```
Accept: application/vnd.blogplatform+json; version=1
Content-Type: application/json
Authorization: Bearer <token>
```

### Response Headers

Every response includes:

```
Content-Type: application/json
Request-Id: <uuid>
RateLimit-Remaining: <count>
```

Resource responses also include:

```
ETag: "<resource-version>"
```

## Pagination

Large collections use the `Range` header:

```
Range: items=0-24
```

Response includes `Content-Range` showing total count and returned subset:

```
Content-Range: items 0-24/137
```

## Error Format

All errors return a consistent structure:

```json
{"id":"validation_failed","message":"Title is required.","url":"https://docs.blogplatform.com/errors/validation_failed"}
```

Fields:
- `id` — machine-readable error code
- `message` — human-readable description
- `url` — optional documentation link

## Stability

This API is at **production** stability level. No breaking changes within version 1.

---

## Resources

### User

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "username": "alice",
  "email": "alice@example.com",
  "display_name": "Alice Johnson",
  "bio": "Writer and developer.",
  "avatar_url": "https://cdn.blogplatform.com/avatars/a1b2c3d4.jpg",
  "post_count": 42,
  "created_at": "2025-06-01T09:00:00Z",
  "updated_at": "2025-07-10T14:30:00Z"
}
```

### Post

```json
{
  "id": "f7e8d9c0-b1a2-3456-7890-abcdef123456",
  "title": "Getting Started with REST APIs",
  "slug": "getting-started-with-rest-apis",
  "body": "REST APIs are...",
  "status": "published",
  "author": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "username": "alice"
  },
  "tags": ["api", "rest", "tutorial"],
  "comment_count": 5,
  "published_at": "2025-07-01T10:00:00Z",
  "created_at": "2025-06-28T08:00:00Z",
  "updated_at": "2025-07-01T10:00:00Z"
}
```

### Comment

```json
{
  "id": "12345678-abcd-ef01-2345-6789abcdef01",
  "body": "Great article!",
  "author": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "username": "bob"
  },
  "post": {
    "id": "f7e8d9c0-b1a2-3456-7890-abcdef123456"
  },
  "parent_id": null,
  "created_at": "2025-07-02T11:00:00Z",
  "updated_at": "2025-07-02T11:00:00Z"
}
```

---

## Endpoints

### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List users |
| POST | `/users` | Register a new user |
| GET | `/users/{user_id}` | Get a user |
| PATCH | `/users/{user_id}` | Update a user |
| DELETE | `/users/{user_id}` | Delete a user |

### Posts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/posts` | List posts |
| POST | `/posts` | Create a post |
| GET | `/posts/{post_id}` | Get a post |
| PATCH | `/posts/{post_id}` | Update a post |
| DELETE | `/posts/{post_id}` | Delete a post |
| POST | `/posts/{post_id}/actions/publish` | Publish a draft |
| POST | `/posts/{post_id}/actions/unpublish` | Unpublish to draft |

### Posts by User

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/{user_id}/posts` | List posts by a user |

### Comments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/posts/{post_id}/comments` | List comments on a post |
| POST | `/posts/{post_id}/comments` | Create a comment on a post |
| GET | `/comments/{comment_id}` | Get a comment |
| PATCH | `/comments/{comment_id}` | Update a comment |
| DELETE | `/comments/{comment_id}` | Delete a comment |

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Create session |
| DELETE | `/login` | Destroy session |

---

## Detailed Endpoint Reference

### List Users

```
GET /users
```

**Request:**

```bash
curl -s https://api.blogplatform.com/users \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "username": "alice",
    "email": "alice@example.com",
    "display_name": "Alice Johnson",
    "bio": "Writer and developer.",
    "avatar_url": "https://cdn.blogplatform.com/avatars/a1b2c3d4.jpg",
    "post_count": 42,
    "created_at": "2025-06-01T09:00:00Z",
    "updated_at": "2025-07-10T14:30:00Z"
  }
]
```

### Register User

```
POST /users
```

**Request:**

```bash
curl -s -X POST https://api.blogplatform.com/users \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"s3cureP@ss"}'
```

**Response:** `201 Created`

```json
{"id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","username":"alice","email":"alice@example.com","display_name":null,"bio":null,"avatar_url":null,"post_count":0,"created_at":"2025-06-01T09:00:00Z","updated_at":"2025-06-01T09:00:00Z"}
```

### Get User

```
GET /users/{user_id}
```

**Request:**

```bash
curl -s https://api.blogplatform.com/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

```json
{"id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","username":"alice","email":"alice@example.com","display_name":"Alice Johnson","bio":"Writer and developer.","avatar_url":"https://cdn.blogplatform.com/avatars/a1b2c3d4.jpg","post_count":42,"created_at":"2025-06-01T09:00:00Z","updated_at":"2025-07-10T14:30:00Z"}
```

### Update User

```
PATCH /users/{user_id}
```

**Request:**

```bash
curl -s -X PATCH https://api.blogplatform.com/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"display_name":"Alice J.","bio":"Full-stack developer and blogger."}'
```

**Response:** `200 OK`

Returns the full updated user resource.

### Delete User

```
DELETE /users/{user_id}
```

**Request:**

```bash
curl -s -X DELETE https://api.blogplatform.com/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns the deleted user resource.

### List Posts

```
GET /posts
```

**Request:**

```bash
curl -s "https://api.blogplatform.com/posts" \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns an array of post resources with nested `author` object.

### Create Post

```
POST /posts
```

**Request:**

```bash
curl -s -X POST https://api.blogplatform.com/posts \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Getting Started with REST APIs","body":"REST APIs are the backbone of modern web services. In this post we explore best practices for designing clean, consistent APIs.","tags":["api","rest","tutorial"]}'
```

**Response:** `201 Created`

```json
{"id":"f7e8d9c0-b1a2-3456-7890-abcdef123456","title":"Getting Started with REST APIs","slug":"getting-started-with-rest-apis","body":"REST APIs are the backbone of modern web services. In this post we explore best practices for designing clean, consistent APIs.","status":"draft","author":{"id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","username":"alice"},"tags":["api","rest","tutorial"],"comment_count":0,"published_at":null,"created_at":"2025-07-15T08:00:00Z","updated_at":"2025-07-15T08:00:00Z"}
```

**Notes:**
- New posts are created with `status: "draft"` by default.
- `slug` is auto-generated from the title.
- `author` is derived from the authenticated user — not a request parameter.
- Returns `201 Created` because a new resource is created.

### Get Post

```
GET /posts/{post_id}
```

**Request:**

```bash
curl -s https://api.blogplatform.com/posts/f7e8d9c0-b1a2-3456-7890-abcdef123456 \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns the full post resource.

### Update Post

```
PATCH /posts/{post_id}
```

**Request:**

```bash
curl -s -X PATCH https://api.blogplatform.com/posts/f7e8d9c0-b1a2-3456-7890-abcdef123456 \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"REST API Design: A Practical Guide","tags":["api","rest","guide"]}'
```

**Response:** `200 OK`

Returns the full updated post resource.

### Delete Post

```
DELETE /posts/{post_id}
```

**Request:**

```bash
curl -s -X DELETE https://api.blogplatform.com/posts/f7e8d9c0-b1a2-3456-7890-abcdef123456 \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns the deleted post resource.

### Publish Post

```
POST /posts/{post_id}/actions/publish
```

**Request:**

```bash
curl -s -X POST https://api.blogplatform.com/posts/f7e8d9c0-b1a2-3456-7890-abcdef123456/actions/publish \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns the post with `status` changed to `"published"` and `published_at` set to the current timestamp.

### Unpublish Post

```
POST /posts/{post_id}/actions/unpublish
```

**Request:**

```bash
curl -s -X POST https://api.blogplatform.com/posts/f7e8d9c0-b1a2-3456-7890-abcdef123456/actions/unpublish \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns the post with `status` changed to `"draft"`.

### List Posts by User

```
GET /users/{user_id}/posts
```

**Request:**

```bash
curl -s https://api.blogplatform.com/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890/posts \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns an array of post resources by the specified user.

### List Comments on Post

```
GET /posts/{post_id}/comments
```

**Request:**

```bash
curl -s https://api.blogplatform.com/posts/f7e8d9c0-b1a2-3456-7890-abcdef123456/comments \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns an array of comment resources on the specified post.

### Create Comment

```
POST /posts/{post_id}/comments
```

**Request:**

```bash
curl -s -X POST https://api.blogplatform.com/posts/f7e8d9c0-b1a2-3456-7890-abcdef123456/comments \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"body":"Great article! Very helpful for beginners."}'
```

**Response:** `201 Created`

```json
{"id":"12345678-abcd-ef01-2345-6789abcdef01","body":"Great article! Very helpful for beginners.","author":{"id":"b2c3d4e5-f6a7-8901-bcde-f12345678901","username":"bob"},"post":{"id":"f7e8d9c0-b1a2-3456-7890-abcdef123456"},"parent_id":null,"created_at":"2025-07-02T11:00:00Z","updated_at":"2025-07-02T11:00:00Z"}
```

**Notes:**
- `author` is derived from the authenticated user.
- `post` is derived from the URL path.
- `parent_id` is optional; set it to reply to another comment.

### Get Comment

```
GET /comments/{comment_id}
```

**Request:**

```bash
curl -s https://api.blogplatform.com/comments/12345678-abcd-ef01-2345-6789abcdef01 \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns the full comment resource.

### Update Comment

```
PATCH /comments/{comment_id}
```

**Request:**

```bash
curl -s -X PATCH https://api.blogplatform.com/comments/12345678-abcd-ef01-2345-6789abcdef01 \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"body":"Updated: Great article! Learned a lot about REST conventions."}'
```

**Response:** `200 OK`

Returns the full updated comment resource.

### Delete Comment

```
DELETE /comments/{comment_id}
```

**Request:**

```bash
curl -s -X DELETE https://api.blogplatform.com/comments/12345678-abcd-ef01-2345-6789abcdef01 \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

Returns the deleted comment resource.

### Create Session

```
POST /login
```

**Request:**

```bash
curl -s -X POST https://api.blogplatform.com/login \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"s3cureP@ss"}'
```

**Response:** `200 OK`

```json
{"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","user":{"id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","username":"alice","email":"alice@example.com"}}
```

### Destroy Session

```
DELETE /login
```

**Request:**

```bash
curl -s -X DELETE https://api.blogplatform.com/login \
  -H "Accept: application/vnd.blogplatform+json; version=1" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `200 OK`

```json
{}
```

---

## Status Code Summary

| Code | Meaning | Used When |
|------|---------|-----------|
| 200 | OK | Successful GET, PATCH, DELETE, POST action |
| 201 | Created | Successful POST that creates a resource (user, post, comment) |
| 202 | Accepted | Async operations (not used in v1) |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Authenticated user lacks permission (e.g., editing another user's post) |
| 422 | Unprocessable Entity | Valid request but invalid parameters (missing title, invalid email, etc.) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server failure |

## Error Examples

**401 Unauthorized:**

```json
{"id":"unauthorized","message":"Authentication token is missing or invalid.","url":"https://docs.blogplatform.com/errors/unauthorized"}
```

**403 Forbidden:**

```json
{"id":"forbidden","message":"You do not have permission to delete this post.","url":"https://docs.blogplatform.com/errors/forbidden"}
```

**422 Validation Failed:**

```json
{"id":"validation_failed","message":"Title is required and must be between 1 and 255 characters.","url":"https://docs.blogplatform.com/errors/validation_failed"}
```

**429 Rate Limited:**

```json
{"id":"rate_limit","message":"Account reached its API rate limit.","url":"https://docs.blogplatform.com/errors/rate_limit"}
```

---

## Design Decisions

### Why nested `author` instead of `author_id`?

Foreign keys are represented as nested objects (`"author": {"id": "...", "username": "..."}`) rather than flat IDs. This allows the server to inline related data without changing the response structure, and clients can access the author's username without a follow-up request.

### Why `POST .../actions/publish` instead of `PATCH` with `status`?

Publishing and unpublishing are side-effecting transitions (they set `published_at`, trigger notifications, etc.), not simple field updates. The `/actions/:action` pattern makes this explicit and allows the server to enforce transition rules without conflating them with generic field patches.

### Why minified JSON by default?

Minified responses reduce payload size. Clients can request pretty-printed output via query parameter `?pretty=true` during development.

### Why `comments/{comment_id}` at root level?

Comments are accessed via `/posts/{post_id}/comments` when scoped to a post, but individual comments are retrieved at `/comments/{comment_id}` to avoid deep nesting (`/posts/{post_id}/comments/{comment_id}` → 3 levels). This follows the "minimize path nesting" principle.

### Why UUID identifiers?

UUIDs are globally unique, enabling distributed ID generation without coordination. They prevent enumeration attacks and avoid leaking sequential resource counts.
