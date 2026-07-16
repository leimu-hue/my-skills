# E-Commerce API Design

## Overview

RESTful API for an e-commerce system supporting product catalog management, order placement, order status updates, and order history retrieval.

**Base URL:** `https://api.example.com/v1`

**Authentication:** Bearer token via `Authorization` header.

```
Authorization: Bearer <token>
```

---

## Resources

### Product
```json
{
  "id": "prod_abc123",
  "name": "Wireless Headphones",
  "description": "Noise-cancelling over-ear headphones",
  "sku": "WH-1000XM5",
  "price": {
    "amount": 29999,
    "currency": "USD"
  },
  "inventory_count": 150,
  "category": "electronics",
  "image_url": "https://cdn.example.com/products/wh-1000xm5.jpg",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-06-01T14:22:00Z"
}
```

### Order
```json
{
  "id": "ord_xyz789",
  "customer_id": "cust_456",
  "status": "confirmed",
  "items": [
    {
      "id": "item_001",
      "product_id": "prod_abc123",
      "product_name": "Wireless Headphones",
      "quantity": 2,
      "unit_price": {
        "amount": 29999,
        "currency": "USD"
      },
      "subtotal": {
        "amount": 59998,
        "currency": "USD"
      }
    }
  ],
  "total": {
    "amount": 59998,
    "currency": "USD"
  },
  "shipping_address": {
    "line1": "123 Main St",
    "line2": "Apt 4B",
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "country": "US"
  },
  "status_history": [
    {
      "status": "pending",
      "timestamp": "2024-06-10T09:00:00Z",
      "note": null
    },
    {
      "status": "confirmed",
      "timestamp": "2024-06-10T09:05:00Z",
      "note": "Payment verified"
    }
  ],
  "created_at": "2024-06-10T09:00:00Z",
  "updated_at": "2024-06-10T09:05:00Z"
}
```

---

## Endpoints

### Products

#### List Products

```
GET /products
```

**Query Parameters:**

| Parameter   | Type    | Description                          |
|-------------|---------|--------------------------------------|
| `category`  | string  | Filter by category                   |
| `min_price` | integer | Minimum price in smallest currency unit |
| `max_price` | integer | Maximum price in smallest currency unit |
| `q`         | string  | Search products by name/description  |
| `sort`      | string  | Sort field: `name`, `price`, `created_at` |
| `order`     | string  | Sort direction: `asc`, `desc` (default: `asc`) |
| `page`      | integer | Page number (default: `1`)           |
| `per_page`  | integer | Items per page (default: `20`, max: `100`) |

**Response `200 OK`:**

```json
{
  "data": [
    {
      "id": "prod_abc123",
      "name": "Wireless Headphones",
      "description": "Noise-cancelling over-ear headphones",
      "sku": "WH-1000XM5",
      "price": {
        "amount": 29999,
        "currency": "USD"
      },
      "inventory_count": 150,
      "category": "electronics",
      "image_url": "https://cdn.example.com/products/wh-1000xm5.jpg",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-06-01T14:22:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 87,
    "total_pages": 5
  }
}
```

#### Get Product

```
GET /products/:id
```

**Response `200 OK`:**

```json
{
  "data": {
    "id": "prod_abc123",
    "name": "Wireless Headphones",
    "description": "Noise-cancelling over-ear headphones",
    "sku": "WH-1000XM5",
    "price": {
      "amount": 29999,
      "currency": "USD"
    },
    "inventory_count": 150,
    "category": "electronics",
    "image_url": "https://cdn.example.com/products/wh-1000xm5.jpg",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-06-01T14:22:00Z"
  }
}
```

**Error `404 Not Found`:**

```json
{
  "error": {
    "code": "not_found",
    "message": "Product not found"
  }
}
```

---

### Orders

#### Place Order

```
POST /orders
```

**Request Body:**

```json
{
  "items": [
    {
      "product_id": "prod_abc123",
      "quantity": 2
    },
    {
      "product_id": "prod_def456",
      "quantity": 1
    }
  ],
  "shipping_address": {
    "line1": "123 Main St",
    "line2": "Apt 4B",
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "country": "US"
  }
}
```

**Response `201 Created`:**

```json
{
  "data": {
    "id": "ord_xyz789",
    "customer_id": "cust_456",
    "status": "pending",
    "items": [
      {
        "id": "item_001",
        "product_id": "prod_abc123",
        "product_name": "Wireless Headphones",
        "quantity": 2,
        "unit_price": {
          "amount": 29999,
          "currency": "USD"
        },
        "subtotal": {
          "amount": 59998,
          "currency": "USD"
        }
      },
      {
        "id": "item_002",
        "product_id": "prod_def456",
        "product_name": "USB-C Cable",
        "quantity": 1,
        "unit_price": {
          "amount": 1299,
          "currency": "USD"
        },
        "subtotal": {
          "amount": 1299,
          "currency": "USD"
        }
      }
    ],
    "total": {
      "amount": 61297,
      "currency": "USD"
    },
    "shipping_address": {
      "line1": "123 Main St",
      "line2": "Apt 4B",
      "city": "Springfield",
      "state": "IL",
      "postal_code": "62704",
      "country": "US"
    },
    "status_history": [
      {
        "status": "pending",
        "timestamp": "2024-06-10T09:00:00Z",
        "note": null
      }
    ],
    "created_at": "2024-06-10T09:00:00Z",
    "updated_at": "2024-06-10T09:00:00Z"
  }
}
```

**Error `422 Unprocessable Entity`:**

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Request validation failed",
    "details": [
      {
        "field": "items[0].quantity",
        "message": "Quantity must be at least 1"
      }
    ]
  }
}
```

**Error `409 Conflict`** (insufficient inventory):

```json
{
  "error": {
    "code": "insufficient_inventory",
    "message": "Not enough inventory for product prod_abc123. Available: 0, requested: 2"
  }
}
```

#### Get Order

```
GET /orders/:id
```

**Response `200 OK`:**

```json
{
  "data": {
    "id": "ord_xyz789",
    "customer_id": "cust_456",
    "status": "confirmed",
    "items": [
      {
        "id": "item_001",
        "product_id": "prod_abc123",
        "product_name": "Wireless Headphones",
        "quantity": 2,
        "unit_price": {
          "amount": 29999,
          "currency": "USD"
        },
        "subtotal": {
          "amount": 59998,
          "currency": "USD"
        }
      }
    ],
    "total": {
      "amount": 59998,
      "currency": "USD"
    },
    "shipping_address": {
      "line1": "123 Main St",
      "line2": "Apt 4B",
      "city": "Springfield",
      "state": "IL",
      "postal_code": "62704",
      "country": "US"
    },
    "status_history": [
      {
        "status": "pending",
        "timestamp": "2024-06-10T09:00:00Z",
        "note": null
      },
      {
        "status": "confirmed",
        "timestamp": "2024-06-10T09:05:00Z",
        "note": "Payment verified"
      }
    ],
    "created_at": "2024-06-10T09:00:00Z",
    "updated_at": "2024-06-10T09:05:00Z"
  }
}
```

#### Update Order Status

```
PATCH /orders/:id/status
```

Dedicated sub-resource for status transitions rather than a generic PATCH on the full order. This makes intent explicit and allows targeted authorization.

**Request Body:**

```json
{
  "status": "shipped",
  "note": "Shipped via FedEx, tracking number 123456789"
}
```

**Valid status transitions:**

```
pending → confirmed → processing → shipped → delivered
pending → cancelled
confirmed → cancelled
processing → cancelled
shipped → returned
delivered → returned
```

**Response `200 OK`:**

```json
{
  "data": {
    "id": "ord_xyz789",
    "status": "shipped",
    "status_history": [
      {
        "status": "pending",
        "timestamp": "2024-06-10T09:00:00Z",
        "note": null
      },
      {
        "status": "confirmed",
        "timestamp": "2024-06-10T09:05:00Z",
        "note": "Payment verified"
      },
      {
        "status": "shipped",
        "timestamp": "2024-06-11T14:30:00Z",
        "note": "Shipped via FedEx, tracking number 123456789"
      }
    ],
    "updated_at": "2024-06-11T14:30:00Z"
  }
}
```

**Error `422 Unprocessable Entity`** (invalid transition):

```json
{
  "error": {
    "code": "invalid_status_transition",
    "message": "Cannot transition from 'delivered' to 'pending'",
    "details": {
      "current_status": "delivered",
      "requested_status": "pending",
      "allowed_transitions": ["returned"]
    }
  }
}
```

#### List Order History

```
GET /orders
```

**Query Parameters:**

| Parameter     | Type    | Description                                 |
|---------------|---------|---------------------------------------------|
| `status`      | string  | Filter by status (`pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `returned`) |
| `from_date`   | string  | ISO 8601 start date filter                  |
| `to_date`     | string  | ISO 8601 end date filter                    |
| `sort`        | string  | Sort field: `created_at`, `total`, `status` |
| `order`       | string  | Sort direction: `asc`, `desc` (default: `desc`) |
| `page`        | integer | Page number (default: `1`)                  |
| `per_page`    | integer | Items per page (default: `20`, max: `100`)  |

**Response `200 OK`:**

```json
{
  "data": [
    {
      "id": "ord_xyz789",
      "customer_id": "cust_456",
      "status": "delivered",
      "items": [
        {
          "id": "item_001",
          "product_id": "prod_abc123",
          "product_name": "Wireless Headphones",
          "quantity": 2,
          "unit_price": {
            "amount": 29999,
            "currency": "USD"
          },
          "subtotal": {
            "amount": 59998,
            "currency": "USD"
          }
        }
      ],
      "total": {
        "amount": 59998,
        "currency": "USD"
      },
      "created_at": "2024-06-10T09:00:00Z",
      "updated_at": "2024-06-15T11:20:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 3,
    "total_pages": 1
  }
}
```

**Note:** The list endpoint returns orders without `status_history` and `shipping_address` to keep payloads small. Use `GET /orders/:id` for full detail.

---

## Order Items (Sub-Resource)

#### List Order Items

```
GET /orders/:id/items
```

**Response `200 OK`:**

```json
{
  "data": [
    {
      "id": "item_001",
      "product_id": "prod_abc123",
      "product_name": "Wireless Headphones",
      "quantity": 2,
      "unit_price": {
        "amount": 29999,
        "currency": "USD"
      },
      "subtotal": {
        "amount": 59998,
        "currency": "USD"
      }
    },
    {
      "id": "item_002",
      "product_id": "prod_def456",
      "product_name": "USB-C Cable",
      "quantity": 1,
      "unit_price": {
        "amount": 1299,
        "currency": "USD"
      },
      "subtotal": {
        "amount": 1299,
        "currency": "USD"
      }
    }
  ]
}
```

#### Get Order Item

```
GET /orders/:id/items/:item_id
```

**Response `200 OK`:**

```json
{
  "data": {
    "id": "item_001",
    "product_id": "prod_abc123",
    "product_name": "Wireless Headphones",
    "quantity": 2,
    "unit_price": {
      "amount": 29999,
      "currency": "USD"
    },
    "subtotal": {
      "amount": 59998,
      "currency": "USD"
    }
  }
}
```

---

## Error Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "string",
    "message": "Human-readable description",
    "details": []
  }
}
```

### Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `200` | OK | Successful GET, PATCH |
| `201` | Created | Successful POST that creates a resource |
| `204` | No Content | Successful DELETE |
| `400` | Bad Request | Malformed JSON or missing required fields |
| `401` | Unauthorized | Missing or invalid authentication |
| `403` | Forbidden | Authenticated but insufficient permissions |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Business logic conflict (e.g., insufficient inventory) |
| `422` | Unprocessable Entity | Validation failure or invalid state transition |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server failure |

---

## Design Decisions

1. **Prices as integers** in smallest currency unit (cents) to avoid floating-point issues.
2. **`PATCH /orders/:id/status`** as a dedicated endpoint rather than a generic PATCH on `/orders/:id`. Status transitions have distinct business rules and authorization policies; a dedicated endpoint makes this explicit and prevents accidental field updates.
3. **Status history** is maintained as an append-only log on each order, providing a full audit trail.
4. **Order items are read-only sub-resources.** Once an order is placed, items cannot be modified—only the order status can change.
5. **Pagination** uses `page`/`per_page` with totals in a `pagination` envelope, keeping list responses predictable.
6. **List vs. detail payloads differ.** The order list omits `status_history` and `shipping_address` to reduce payload size; the detail endpoint includes everything.
7. **Consistent envelope** — all single-resource responses use `{ "data": {...} }`, all collections use `{ "data": [...], "pagination": {...} }`.
8. **Error responses** always include a machine-readable `code` alongside a human-readable `message`, with optional `details` for field-level validation errors.
