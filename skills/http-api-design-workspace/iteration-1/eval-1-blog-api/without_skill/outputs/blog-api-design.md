# Blog Platform REST API Design

## Base URL

```
https://api.blogplatform.com/v1
```

All endpoints are relative to this base URL. Responses use `Content-Type: application/json`.

---

## Resources & URL Structure

| Resource       | Collection URL              | Item URL                          |
|----------------|-----------------------------|-----------------------------------|
| Users          | `GET /users`                | `GET /users/{userId}`             |
| Posts          | `GET /posts`                | `GET /posts/{postId}`             |
| Comments       | `GET /posts/{postId}/comments` | `GET /posts/{postId}/comments/{commentId}` |

---

## Authentication

All write endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

---

## Endpoints

### Users

| Method | URL                    | Description               | Auth Required |
|--------|------------------------|---------------------------|---------------|
| POST   | `/users`               | Register a new user       | No            |
| GET    | `/users/{userId}`      | Get user profile          | No            |
| PATCH  | `/users/{userId}`      | Update user profile       | Yes (owner)   |
| DELETE | `/users/{userId}`      | Delete user account       | Yes (owner)   |
| GET    | `/users/{userId}/posts`| Get posts by a user       | No            |

### Posts

| Method | URL                          | Description              | Auth Required |
|--------|------------------------------|--------------------------|---------------|
| GET    | `/posts`                     | List all posts           | No            |
| POST   | `/posts`                     | Create a new post        | Yes           |
| GET    | `/posts/{postId}`            | Get a single post        | No            |
| PATCH  | `/posts/{postId}`            | Update a post            | Yes (author)  |
| DELETE | `/posts/{postId}`            | Delete a post            | Yes (author)  |
| GET    | `/posts/{postId}/comments`   | List comments on a post  | No            |
| POST   | `/posts/{postId}/comments`   | Add a comment to a post  | Yes           |

### Comments

| Method | URL                                          | Description              | Auth Required |
|--------|----------------------------------------------|--------------------------|---------------|
| GET    | `/posts/{postId}/comments/{commentId}`       | Get a single comment     | No            |
| PATCH  | `/posts/{postId}/comments/{commentId}`       | Update a comment         | Yes (author)  |
| DELETE | `/posts/{postId}/comments/{commentId}`       | Delete a comment         | Yes (author)  |

---

## Query Parameters

### `GET /posts` — List Posts

| Parameter  | Type   | Default | Description                          |
|------------|--------|---------|--------------------------------------|
| `page`     | int    | 1       | Page number (1-based)                |
| `per_page` | int    | 20      | Items per page (max 100)             |
| `author`   | string | —       | Filter by author user ID             |
| `tag`      | string | —       | Filter by tag (exact match)          |
| `sort`     | string | `created_at` | Sort field (`created_at`, `updated_at`, `title`) |
| `order`    | string | `desc`  | Sort order (`asc`, `desc`)           |

---

## Status Codes

| Code | Meaning                  | Used When                                      |
|------|--------------------------|------------------------------------------------|
| 200  | OK                       | Successful GET, PATCH                          |
| 201  | Created                  | Successful POST that creates a resource        |
| 204  | No Content               | Successful DELETE                              |
| 400  | Bad Request              | Invalid JSON, missing required fields          |
| 401  | Unauthorized             | Missing or invalid authentication token        |
| 403  | Forbidden                | Authenticated but not authorized               |
| 404  | Not Found                | Resource does not exist                        |
| 409  | Conflict                 | Duplicate resource (e.g., email already taken) |
| 422  | Unprocessable Entity     | Validation errors on input fields              |
| 429  | Too Many Requests        | Rate limit exceeded                            |
| 500  | Internal Server Error    | Unexpected server failure                      |

---

## Common Response Envelope

### Single Resource

```json
{
  "data": {
    "type": "post",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "attributes": { ... },
    "relationships": { ... },
    "links": {
      "self": "/posts/550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

### Collection

```json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 142,
    "total_pages": 8
  },
  "links": {
    "self": "/posts?page=1&per_page=20",
    "next": "/posts?page=2&per_page=20",
    "prev": null
  }
}
```

### Error

```json
{
  "error": {
    "status": "422",
    "title": "Validation Failed",
    "detail": "The request body contains invalid fields.",
    "errors": [
      {
        "field": "title",
        "code": "required",
        "message": "Title is required."
      }
    ]
  }
}
```

---

## Example: Create a New Post

### Request

```http
POST /v1/posts HTTP/1.1
Host: api.blogplatform.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "data": {
    "type": "post",
    "attributes": {
      "title": "Getting Started with REST APIs",
      "body": "REST (Representational State Transfer) is an architectural style for designing networked applications...",
      "tags": ["api", "rest", "tutorial"],
      "status": "published"
    }
  }
}
```

### Validation Rules

| Field   | Type     | Required | Constraints                           |
|---------|----------|----------|---------------------------------------|
| `title` | string   | Yes      | 1–255 characters                      |
| `body`  | string   | Yes      | 1–50,000 characters                   |
| `tags`  | string[] | No       | Max 10 tags, each 1–50 characters     |
| `status`| string   | No       | `draft` (default) or `published`      |

### Success Response — `201 Created`

```http
HTTP/1.1 201 Created
Content-Type: application/json
Location: /v1/posts/550e8400-e29b-41d4-a716-446655440000

{
  "data": {
    "type": "post",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "attributes": {
      "title": "Getting Started with REST APIs",
      "body": "REST (Representational State Transfer) is an architectural style for designing networked applications...",
      "tags": ["api", "rest", "tutorial"],
      "status": "published",
      "created_at": "2026-07-16T10:30:00Z",
      "updated_at": "2026-07-16T10:30:00Z",
      "comment_count": 0
    },
    "relationships": {
      "author": {
        "data": {
          "type": "user",
          "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        },
        "links": {
          "related": "/v1/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        }
      }
    },
    "links": {
      "self": "/v1/posts/550e8400-e29b-41d4-a716-446655440000",
      "author": "/v1/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "comments": "/v1/posts/550e8400-e29b-41d4-a716-446655440000/comments"
    }
  }
}
```

### Error Responses

#### Missing Title — `422 Unprocessable Entity`

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json

{
  "error": {
    "status": "422",
    "title": "Validation Failed",
    "detail": "Request body contains validation errors.",
    "errors": [
      {
        "field": "title",
        "code": "required",
        "message": "Title is required."
      }
    ]
  }
}
```

#### Title Too Long — `422 Unprocessable Entity`

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json

{
  "error": {
    "status": "422",
    "title": "Validation Failed",
    "detail": "Request body contains validation errors.",
    "errors": [
      {
        "field": "title",
        "code": "too_long",
        "message": "Title must be at most 255 characters."
      }
    ]
  }
}
```

#### Unauthenticated — `401 Unauthorized`

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": {
    "status": "401",
    "title": "Unauthorized",
    "detail": "Authentication token is missing or invalid."
  }
}
```

---

## Example: List Posts

### Request

```http
GET /v1/posts?page=1&per_page=2&tag=api&sort=created_at&order=desc HTTP/1.1
Host: api.blogplatform.com
```

### Response — `200 OK`

```json
{
  "data": [
    {
      "type": "post",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "attributes": {
        "title": "Getting Started with REST APIs",
        "body": "REST (Representational State Transfer) is an architectural style...",
        "tags": ["api", "rest", "tutorial"],
        "status": "published",
        "created_at": "2026-07-16T10:30:00Z",
        "updated_at": "2026-07-16T10:30:00Z",
        "comment_count": 3
      },
      "relationships": {
        "author": {
          "data": { "type": "user", "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
        }
      },
      "links": {
        "self": "/v1/posts/550e8400-e29b-41d4-a716-446655440000"
      }
    },
    {
      "type": "post",
      "id": "660f9500-f3ac-52e5-b827-557766551111",
      "attributes": {
        "title": "API Versioning Strategies",
        "body": "When building APIs, choosing the right versioning strategy...",
        "tags": ["api", "versioning", "best-practices"],
        "status": "published",
        "created_at": "2026-07-15T08:15:00Z",
        "updated_at": "2026-07-15T09:00:00Z",
        "comment_count": 7
      },
      "relationships": {
        "author": {
          "data": { "type": "user", "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901" }
        }
      },
      "links": {
        "self": "/v1/posts/660f9500-f3ac-52e5-b827-557766551111"
      }
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 2,
    "total": 12,
    "total_pages": 6
  },
  "links": {
    "self": "/v1/posts?page=1&per_page=2&tag=api",
    "next": "/v1/posts?page=2&per_page=2&tag=api",
    "prev": null
  }
}
```

---

## Example: Create a Comment on a Post

### Request

```http
POST /v1/posts/550e8400-e29b-41d4-a716-446655440000/comments HTTP/1.1
Host: api.blogplatform.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "data": {
    "type": "comment",
    "attributes": {
      "body": "Great article! Very clear explanation of REST principles."
    }
  }
}
```

### Success Response — `201 Created`

```json
{
  "data": {
    "type": "comment",
    "id": "770a0600-a4bc-63f6-c938-668877662222",
    "attributes": {
      "body": "Great article! Very clear explanation of REST principles.",
      "created_at": "2026-07-16T11:00:00Z",
      "updated_at": "2026-07-16T11:00:00Z"
    },
    "relationships": {
      "post": {
        "data": { "type": "post", "id": "550e8400-e29b-41d4-a716-446655440000" }
      },
      "author": {
        "data": { "type": "user", "id": "c3d4e5f6-a7b8-9012-cdef-123456789012" }
      }
    },
    "links": {
      "self": "/v1/posts/550e8400-e29b-41d4-a716-446655440000/comments/770a0600-a4bc-63f6-c938-668877662222",
      "post": "/v1/posts/550e8400-e29b-41d4-a716-446655440000",
      "author": "/v1/users/c3d4e5f6-a7b8-9012-cdef-123456789012"
    }
  }
}
```

---

## Summary

| Resource  | Endpoints | Methods                  |
|-----------|-----------|--------------------------|
| Users     | 5         | GET, POST, PATCH, DELETE |
| Posts     | 5         | GET, POST, PATCH, DELETE |
| Comments  | 3         | GET, PATCH, DELETE       |
| **Total** | **13**    |                          |

Design principles:
- Resources use plural nouns (`/users`, `/posts`, `/comments`)
- Nested resources reflect ownership hierarchy (`/posts/{id}/comments`)
- UUIDs used as resource identifiers
- Consistent JSON envelope with `data`, `meta`, `links`
- Pagination via `page` and `per_page` query parameters
- Author ID extracted from auth token on write operations
- 201 + Location header on successful resource creation
- 204 No Content on successful deletion
- Structured error responses with field-level detail
