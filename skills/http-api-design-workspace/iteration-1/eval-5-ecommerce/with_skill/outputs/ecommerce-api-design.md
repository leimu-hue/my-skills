# E-Commerce API Design

**Maturity:** development
**Base URL:** `https://api.shop.example.com`
**Version:** 1

All endpoints require TLS. Reject non-TLS requests with `403 Forbidden`.

---

## Authentication

All requests require a Bearer token:

```
Authorization: Bearer <token>
```

Obtain tokens via the OAuth2 flow at `https://auth.shop.example.com/token`.

---

## Request Format

Every request MUST include:

```
Accept: application/vnd.shop+json; version=1
Content-Type: application/json
```

---

## Response Headers

Every response includes:

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `Request-Id` | UUID for tracing |
| `ETag` | Resource version for caching |
| `RateLimit-Remaining` | Remaining requests in window |

---

## Pagination

Large collections use the `Range` header:

```
Range: items=0-24
```

Response includes `Content-Range`:

```
Content-Range: items 0-24/130
```

---

## Error Format

All errors follow a consistent structure:

```json
{"id":"validation_failed","message":"The request body contains invalid parameters.","url":"https://docs.shop.example.com/errors/validation_failed"}
```

Fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Machine-readable error code |
| `message` | string | Human-readable description |
| `url` | string | Optional documentation link |

### Error IDs

| ID | HTTP Status | Description |
|----|-------------|-------------|
| `unauthorized` | 401 | Missing or invalid authentication |
| `forbidden` | 403 | Insufficient permissions |
| `not_found` | 404 | Resource does not exist |
| `validation_failed` | 422 | Invalid request parameters |
| `rate_limit` | 429 | Rate limit exceeded |
| `internal_error` | 500 | Unexpected server failure |
| `order_not_cancellable` | 422 | Order cannot be cancelled in its current status |
| `insufficient_stock` | 422 | Requested quantity exceeds available stock |

---

## Resources

### Product

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Wireless Keyboard",
  "description": "Ergonomic wireless keyboard with backlight",
  "sku": "WK-100-BK",
  "price": {
    "amount": 5999,
    "currency": "USD"
  },
  "stock": 250,
  "category": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Peripherals"
  },
  "status": "active",
  "created_at": "2026-01-15T08:30:00Z",
  "updated_at": "2026-06-20T14:22:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Unique product identifier |
| `name` | string | Product display name |
| `description` | string | Full product description |
| `sku` | string | Stock keeping unit |
| `price.amount` | integer | Price in smallest currency unit (cents) |
| `price.currency` | string | ISO 4217 currency code |
| `stock` | integer | Available inventory count |
| `category` | object | Nested category reference (id + name) |
| `status` | string | `active`, `draft`, or `archived` |
| `created_at` | string | ISO8601 UTC creation timestamp |
| `updated_at` | string | ISO8601 UTC last update timestamp |

---

### Order

```json
{
  "id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567",
  "status": "pending",
  "customer": {
    "id": "c3d4e5f6-a7b8-9012-cdef-345678901234"
  },
  "items": [
    {
      "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
      "product": {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Wireless Keyboard",
        "sku": "WK-100-BK"
      },
      "quantity": 2,
      "unit_price": {
        "amount": 5999,
        "currency": "USD"
      },
      "subtotal": {
        "amount": 11998,
        "currency": "USD"
      }
    }
  ],
  "total": {
    "amount": 11998,
    "currency": "USD"
  },
  "shipping_address": {
    "line1": "742 Evergreen Terrace",
    "line2": null,
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "country": "US"
  },
  "placed_at": "2026-07-10T09:15:00Z",
  "updated_at": "2026-07-10T09:15:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Unique order identifier |
| `status` | string | Order lifecycle status |
| `customer` | object | Nested customer reference |
| `items` | array | Line items in the order |
| `total` | object | Order total in smallest currency unit |
| `shipping_address` | object | Delivery address |
| `placed_at` | string | ISO8601 UTC order placement timestamp |
| `updated_at` | string | ISO8601 UTC last update timestamp |

#### Order Status Values

| Status | Description |
|--------|-------------|
| `pending` | Order placed, awaiting confirmation |
| `confirmed` | Order confirmed and being prepared |
| `shipped` | Order dispatched to carrier |
| `delivered` | Order received by customer |
| `cancelled` | Order cancelled |

Valid transitions:

```
pending → confirmed → shipped → delivered
pending → cancelled
confirmed → cancelled
```

---

### Order Item

```json
{
  "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
  "order": {
    "id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567"
  },
  "product": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Wireless Keyboard",
    "sku": "WK-100-BK"
  },
  "quantity": 2,
  "unit_price": {
    "amount": 5999,
    "currency": "USD"
  },
  "subtotal": {
    "amount": 11998,
    "currency": "USD"
  },
  "created_at": "2026-07-10T09:15:00Z",
  "updated_at": "2026-07-10T09:15:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Unique item identifier |
| `order` | object | Parent order reference |
| `product` | object | Nested product reference (id, name, sku) |
| `quantity` | integer | Number of units ordered |
| `unit_price` | object | Price per unit at time of order |
| `subtotal` | object | `unit_price` × `quantity` |
| `created_at` | string | ISO8601 UTC creation timestamp |
| `updated_at` | string | ISO8601 UTC last update timestamp |

---

## Endpoints

---

### List Products

Retrieve a paginated list of products.

```
GET /products
```

#### Request Headers

| Header | Required | Value |
|--------|----------|-------|
| `Accept` | yes | `application/vnd.shop+json; version=1` |
| `Range` | no | `items=0-24` (default: `items=0-24`) |
| `If-None-Match` | no | ETag from prior response for conditional fetch |

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (`active`, `draft`, `archived`) |
| `category_id` | uuid | Filter by category |
| `name` | string | Partial match on product name |

#### Response: 200 OK

```
Content-Range: items 0-2/5
ETag: "products-a1b2c3d4"
```

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Wireless Keyboard",
    "description": "Ergonomic wireless keyboard with backlight",
    "sku": "WK-100-BK",
    "price": {"amount": 5999, "currency": "USD"},
    "stock": 250,
    "category": {"id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "name": "Peripherals"},
    "status": "active",
    "created_at": "2026-01-15T08:30:00Z",
    "updated_at": "2026-06-20T14:22:00Z"
  },
  {
    "id": "e5f6a7b8-c9d0-1234-ef56-7890abcdef12",
    "name": "USB-C Hub",
    "description": "7-in-1 USB-C hub with HDMI output",
    "sku": "UCH-700-GR",
    "price": {"amount": 3499, "currency": "USD"},
    "stock": 180,
    "category": {"id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "name": "Peripherals"},
    "status": "active",
    "created_at": "2026-02-20T11:00:00Z",
    "updated_at": "2026-06-20T14:22:00Z"
  },
  {
    "id": "f6a7b8c9-d0e1-2345-f678-90abcdef1234",
    "name": "Monitor Stand",
    "description": "Adjustable aluminum monitor stand",
    "sku": "MS-200-SV",
    "price": {"amount": 4500, "currency": "USD"},
    "stock": 95,
    "category": {"id": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "name": "Accessories"},
    "status": "active",
    "created_at": "2026-03-10T16:45:00Z",
    "updated_at": "2026-07-01T09:00:00Z"
  }
]
```

#### Response: 304 Not Modified

Returned when `If-None-Match` matches the current ETag. Empty body.

#### Example

```bash
curl -s https://api.shop.example.com/products?status=active \
  -H "Accept: application/vnd.shop+json; version=1" \
  -H "Range: items=0-24"
```

---

### Get Product

Retrieve a single product by ID.

```
GET /products/{product_id}
```

#### Response: 200 OK

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Wireless Keyboard",
  "description": "Ergonomic wireless keyboard with backlight",
  "sku": "WK-100-BK",
  "price": {"amount": 5999, "currency": "USD"},
  "stock": 250,
  "category": {"id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "name": "Peripherals"},
  "status": "active",
  "created_at": "2026-01-15T08:30:00Z",
  "updated_at": "2026-06-20T14:22:00Z"
}
```

#### Response: 404 Not Found

```json
{"id": "not_found", "message": "Product not found.", "url": "https://docs.shop.example.com/errors/not_found"}
```

#### Example

```bash
curl -s https://api.shop.example.com/products/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Accept: application/vnd.shop+json; version=1"
```

---

### Create Product

Create a new product. Requires admin scope.

```
POST /products
```

#### Request Body

```json
{
  "name": "Ergonomic Mouse",
  "description": "Vertical ergonomic mouse with adjustable DPI",
  "sku": "EM-300-BK",
  "price": {"amount": 3999, "currency": "USD"},
  "stock": 500,
  "category_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "active"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Product display name |
| `description` | string | yes | Full product description |
| `sku` | string | yes | Stock keeping unit (unique) |
| `price.amount` | integer | yes | Price in smallest currency unit |
| `price.currency` | string | yes | ISO 4217 currency code |
| `stock` | integer | yes | Initial inventory count |
| `category_id` | uuid | yes | Category this product belongs to |
| `status` | string | no | Defaults to `draft` |

#### Response: 201 Created

```
Location: /products/g7h8i9j0-k1l2-3456-mnop-789012345678
```

```json
{
  "id": "g7h8i9j0-k1l2-3456-mnop-789012345678",
  "name": "Ergonomic Mouse",
  "description": "Vertical ergonomic mouse with adjustable DPI",
  "sku": "EM-300-BK",
  "price": {"amount": 3999, "currency": "USD"},
  "stock": 500,
  "category": {"id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "name": "Peripherals"},
  "status": "active",
  "created_at": "2026-07-15T10:00:00Z",
  "updated_at": "2026-07-15T10:00:00Z"
}
```

#### Response: 422 Unprocessable Entity

```json
{"id": "validation_failed", "message": "SKU 'EM-300-BK' is already in use.", "url": "https://docs.shop.example.com/errors/validation_failed"}
```

#### Example

```bash
curl -s -X POST https://api.shop.example.com/products \
  -H "Accept: application/vnd.shop+json; version=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Ergonomic Mouse","description":"Vertical ergonomic mouse with adjustable DPI","sku":"EM-300-BK","price":{"amount":3999,"currency":"USD"},"stock":500,"category_id":"f47ac10b-58cc-4372-a567-0e02b2c3d479","status":"active"}'
```

---

### Update Product

Partially update an existing product. Requires admin scope.

```
PATCH /products/{product_id}
```

#### Request Body

Only include fields to change:

```json
{
  "price": {"amount": 4999, "currency": "USD"},
  "stock": 300
}
```

#### Response: 200 OK

Returns the full updated product resource.

```json
{
  "id": "g7h8i9j0-k1l2-3456-mnop-789012345678",
  "name": "Ergonomic Mouse",
  "description": "Vertical ergonomic mouse with adjustable DPI",
  "sku": "EM-300-BK",
  "price": {"amount": 4999, "currency": "USD"},
  "stock": 300,
  "category": {"id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "name": "Peripherals"},
  "status": "active",
  "created_at": "2026-07-15T10:00:00Z",
  "updated_at": "2026-07-16T12:30:00Z"
}
```

#### Response: 422 Unprocessable Entity

```json
{"id": "validation_failed", "message": "Stock cannot be negative.", "url": "https://docs.shop.example.com/errors/validation_failed"}
```

---

### Place Order

Create a new order with one or more items. Validates stock availability synchronously.

```
POST /orders
```

#### Request Body

```json
{
  "customer_id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
  "items": [
    {
      "product_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "quantity": 2
    },
    {
      "product_id": "e5f6a7b8-c9d0-1234-ef56-7890abcdef12",
      "quantity": 1
    }
  ],
  "shipping_address": {
    "line1": "742 Evergreen Terrace",
    "line2": null,
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "country": "US"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customer_id` | uuid | yes | Placing customer |
| `items` | array | yes | At least one item required |
| `items[].product_id` | uuid | yes | Product to order |
| `items[].quantity` | integer | yes | Must be > 0 |
| `shipping_address` | object | yes | Delivery address |
| `shipping_address.line1` | string | yes | Street address |
| `shipping_address.line2` | string | no | Apartment, suite, etc. |
| `shipping_address.city` | string | yes | City |
| `shipping_address.state` | string | yes | State or province |
| `shipping_address.postal_code` | string | yes | Postal code |
| `shipping_address.country` | string | yes | ISO 3166-1 alpha-2 country code |

#### Response: 201 Created

```
Location: /orders/b8c9d0e1-f2a3-4567-89ab-cdef01234567
```

```json
{
  "id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567",
  "status": "pending",
  "customer": {"id": "c3d4e5f6-a7b8-9012-cdef-345678901234"},
  "items": [
    {
      "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
      "product": {"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "name": "Wireless Keyboard", "sku": "WK-100-BK"},
      "quantity": 2,
      "unit_price": {"amount": 5999, "currency": "USD"},
      "subtotal": {"amount": 11998, "currency": "USD"}
    },
    {
      "id": "e5f6a7b8-c9d0-1234-abcd-567890123456",
      "product": {"id": "e5f6a7b8-c9d0-1234-ef56-7890abcdef12", "name": "USB-C Hub", "sku": "UCH-700-GR"},
      "quantity": 1,
      "unit_price": {"amount": 3499, "currency": "USD"},
      "subtotal": {"amount": 3499, "currency": "USD"}
    }
  ],
  "total": {"amount": 15497, "currency": "USD"},
  "shipping_address": {
    "line1": "742 Evergreen Terrace",
    "line2": null,
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "country": "US"
  },
  "placed_at": "2026-07-10T09:15:00Z",
  "updated_at": "2026-07-10T09:15:00Z"
}
```

#### Response: 422 Unprocessable Entity

Insufficient stock:

```json
{"id": "insufficient_stock", "message": "Product 'WK-100-BK' has only 1 unit in stock, but 2 were requested.", "url": "https://docs.shop.example.com/errors/insufficient_stock"}
```

Invalid customer:

```json
{"id": "validation_failed", "message": "Customer not found.", "url": "https://docs.shop.example.com/errors/validation_failed"}
```

#### Example

```bash
curl -s -X POST https://api.shop.example.com/orders \
  -H "Accept: application/vnd.shop+json; version=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"customer_id":"c3d4e5f6-a7b8-9012-cdef-345678901234","items":[{"product_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","quantity":2}],"shipping_address":{"line1":"742 Evergreen Terrace","line2":null,"city":"Springfield","state":"IL","postal_code":"62704","country":"US"}}'
```

---

### Get Order

Retrieve a single order by ID.

```
GET /orders/{order_id}
```

#### Response: 200 OK

```json
{
  "id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567",
  "status": "confirmed",
  "customer": {"id": "c3d4e5f6-a7b8-9012-cdef-345678901234"},
  "items": [
    {
      "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
      "product": {"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "name": "Wireless Keyboard", "sku": "WK-100-BK"},
      "quantity": 2,
      "unit_price": {"amount": 5999, "currency": "USD"},
      "subtotal": {"amount": 11998, "currency": "USD"}
    }
  ],
  "total": {"amount": 11998, "currency": "USD"},
  "shipping_address": {
    "line1": "742 Evergreen Terrace",
    "line2": null,
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "country": "US"
  },
  "placed_at": "2026-07-10T09:15:00Z",
  "updated_at": "2026-07-10T10:30:00Z"
}
```

#### Response: 404 Not Found

```json
{"id": "not_found", "message": "Order not found.", "url": "https://docs.shop.example.com/errors/not_found"}
```

---

### List Order History

Retrieve a paginated list of orders with optional filters. Customers see only their own orders; admins see all.

```
GET /orders
```

#### Request Headers

| Header | Required | Value |
|--------|----------|-------|
| `Accept` | yes | `application/vnd.shop+json; version=1` |
| `Range` | no | `items=0-24` |
| `If-None-Match` | no | ETag from prior response |

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `customer_id` | uuid | Filter by customer (admin only; customers auto-scoped) |
| `status` | string | Filter by status (`pending`, `confirmed`, `shipped`, `delivered`, `cancelled`) |
| `placed_after` | string | ISO8601 datetime — orders placed after this time |
| `placed_before` | string | ISO8601 datetime — orders placed before this time |

#### Response: 200 OK

```
Content-Range: items 0-1/2
ETag: "orders-x9y8z7w6"
```

```json
[
  {
    "id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567",
    "status": "delivered",
    "customer": {"id": "c3d4e5f6-a7b8-9012-cdef-345678901234"},
    "items": [
      {
        "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
        "product": {"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "name": "Wireless Keyboard", "sku": "WK-100-BK"},
        "quantity": 2,
        "unit_price": {"amount": 5999, "currency": "USD"},
        "subtotal": {"amount": 11998, "currency": "USD"}
      }
    ],
    "total": {"amount": 11998, "currency": "USD"},
    "shipping_address": {
      "line1": "742 Evergreen Terrace",
      "line2": null,
      "city": "Springfield",
      "state": "IL",
      "postal_code": "62704",
      "country": "US"
    },
    "placed_at": "2026-06-28T14:00:00Z",
    "updated_at": "2026-07-05T11:00:00Z"
  },
  {
    "id": "i9j0k1l2-m3n4-5678-opqr-901234567890",
    "status": "shipped",
    "customer": {"id": "c3d4e5f6-a7b8-9012-cdef-345678901234"},
    "items": [
      {
        "id": "j0k1l2m3-n4o5-6789-pqrs-012345678901",
        "product": {"id": "f6a7b8c9-d0e1-2345-f678-90abcdef1234", "name": "Monitor Stand", "sku": "MS-200-SV"},
        "quantity": 1,
        "unit_price": {"amount": 4500, "currency": "USD"},
        "subtotal": {"amount": 4500, "currency": "USD"}
      }
    ],
    "total": {"amount": 4500, "currency": "USD"},
    "shipping_address": {
      "line1": "742 Evergreen Terrace",
      "line2": null,
      "city": "Springfield",
      "state": "IL",
      "postal_code": "62704",
      "country": "US"
    },
    "placed_at": "2026-07-08T16:30:00Z",
    "updated_at": "2026-07-12T08:45:00Z"
  }
]
```

#### Response: 304 Not Modified

Returned when `If-None-Match` matches the current ETag. Empty body.

#### Example

```bash
curl -s "https://api.shop.example.com/orders?status=shipped&placed_after=2026-07-01T00:00:00Z" \
  -H "Accept: application/vnd.shop+json; version=1" \
  -H "Range: items=0-24" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Update Order Status (Confirm)

Transition an order from `pending` to `confirmed`.

```
POST /orders/{order_id}/actions/confirm
```

#### Request Body

Empty `{}`.

#### Response: 200 OK

Returns the full order with updated status.

```json
{
  "id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567",
  "status": "confirmed",
  "customer": {"id": "c3d4e5f6-a7b8-9012-cdef-345678901234"},
  "items": [
    {
      "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
      "product": {"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "name": "Wireless Keyboard", "sku": "WK-100-BK"},
      "quantity": 2,
      "unit_price": {"amount": 5999, "currency": "USD"},
      "subtotal": {"amount": 11998, "currency": "USD"}
    }
  ],
  "total": {"amount": 11998, "currency": "USD"},
  "shipping_address": {
    "line1": "742 Evergreen Terrace",
    "line2": null,
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "country": "US"
  },
  "placed_at": "2026-07-10T09:15:00Z",
  "updated_at": "2026-07-10T10:30:00Z"
}
```

#### Response: 422 Unprocessable Entity

Invalid transition:

```json
{"id": "validation_failed", "message": "Order cannot be confirmed from status 'shipped'.", "url": "https://docs.shop.example.com/errors/validation_failed"}
```

---

### Update Order Status (Ship)

Transition an order from `confirmed` to `shipped`.

```
POST /orders/{order_id}/actions/ship
```

#### Request Body

```json
{
  "carrier": "UPS",
  "tracking_number": "1Z999AA10123456784"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `carrier` | string | yes | Shipping carrier name |
| `tracking_number` | string | yes | Carrier tracking number |

#### Response: 200 OK

Returns the full order with updated status.

#### Response: 422 Unprocessable Entity

```json
{"id": "validation_failed", "message": "Order cannot be shipped from status 'pending'. Must be 'confirmed'.", "url": "https://docs.shop.example.com/errors/validation_failed"}
```

---

### Update Order Status (Deliver)

Transition an order from `shipped` to `delivered`.

```
POST /orders/{order_id}/actions/deliver
```

#### Request Body

Empty `{}`.

#### Response: 200 OK

Returns the full order with updated status.

---

### Cancel Order

Cancel an order. Only allowed from `pending` or `confirmed` status. Restores product stock.

```
POST /orders/{order_id}/actions/cancel
```

#### Request Body

```json
{
  "reason": "Customer requested cancellation"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | no | Cancellation reason for records |

#### Response: 200 OK

Returns the full order with `status` set to `cancelled`.

```json
{
  "id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567",
  "status": "cancelled",
  "customer": {"id": "c3d4e5f6-a7b8-9012-cdef-345678901234"},
  "items": [
    {
      "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
      "product": {"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "name": "Wireless Keyboard", "sku": "WK-100-BK"},
      "quantity": 2,
      "unit_price": {"amount": 5999, "currency": "USD"},
      "subtotal": {"amount": 11998, "currency": "USD"}
    }
  ],
  "total": {"amount": 11998, "currency": "USD"},
  "shipping_address": {
    "line1": "742 Evergreen Terrace",
    "line2": null,
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "country": "US"
  },
  "placed_at": "2026-07-10T09:15:00Z",
  "updated_at": "2026-07-10T11:00:00Z"
}
```

#### Response: 422 Unprocessable Entity

```json
{"id": "order_not_cancellable", "message": "Order in status 'shipped' cannot be cancelled.", "url": "https://docs.shop.example.com/errors/order_not_cancellable"}
```

---

### List Order Items

Retrieve all items for a specific order.

```
GET /orders/{order_id}/items
```

#### Response: 200 OK

```json
[
  {
    "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
    "order": {"id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567"},
    "product": {"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "name": "Wireless Keyboard", "sku": "WK-100-BK"},
    "quantity": 2,
    "unit_price": {"amount": 5999, "currency": "USD"},
    "subtotal": {"amount": 11998, "currency": "USD"},
    "created_at": "2026-07-10T09:15:00Z",
    "updated_at": "2026-07-10T09:15:00Z"
  },
  {
    "id": "e5f6a7b8-c9d0-1234-abcd-567890123456",
    "order": {"id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567"},
    "product": {"id": "e5f6a7b8-c9d0-1234-ef56-7890abcdef12", "name": "USB-C Hub", "sku": "UCH-700-GR"},
    "quantity": 1,
    "unit_price": {"amount": 3499, "currency": "USD"},
    "subtotal": {"amount": 3499, "currency": "USD"},
    "created_at": "2026-07-10T09:15:00Z",
    "updated_at": "2026-07-10T09:15:00Z"
  }
]
```

#### Response: 404 Not Found

```json
{"id": "not_found", "message": "Order not found.", "url": "https://docs.shop.example.com/errors/not_found"}
```

---

### Get Order Item

Retrieve a single item from an order.

```
GET /orders/{order_id}/items/{item_id}
```

#### Response: 200 OK

```json
{
  "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
  "order": {"id": "b8c9d0e1-f2a3-4567-89ab-cdef01234567"},
  "product": {"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "name": "Wireless Keyboard", "sku": "WK-100-BK"},
  "quantity": 2,
  "unit_price": {"amount": 5999, "currency": "USD"},
  "subtotal": {"amount": 11998, "currency": "USD"},
  "created_at": "2026-07-10T09:15:00Z",
  "updated_at": "2026-07-10T09:15:00Z"
}
```

#### Response: 404 Not Found

```json
{"id": "not_found", "message": "Order item not found.", "url": "https://docs.shop.example.com/errors/not_found"}
```

---

## Endpoint Summary

| Method | Path | Description | Status Codes |
|--------|------|-------------|--------------|
| `GET` | `/products` | List products | 200, 304, 401, 429 |
| `GET` | `/products/{product_id}` | Get product | 200, 401, 404, 429 |
| `POST` | `/products` | Create product | 201, 401, 403, 422, 429 |
| `PATCH` | `/products/{product_id}` | Update product | 200, 401, 403, 404, 422, 429 |
| `GET` | `/orders` | List orders / order history | 200, 304, 401, 429 |
| `GET` | `/orders/{order_id}` | Get order | 200, 401, 404, 429 |
| `POST` | `/orders` | Place order | 201, 401, 422, 429 |
| `POST` | `/orders/{order_id}/actions/confirm` | Confirm order | 200, 401, 403, 404, 422, 429 |
| `POST` | `/orders/{order_id}/actions/ship` | Ship order | 200, 401, 403, 404, 422, 429 |
| `POST` | `/orders/{order_id}/actions/deliver` | Deliver order | 200, 401, 403, 404, 422, 429 |
| `POST` | `/orders/{order_id}/actions/cancel` | Cancel order | 200, 401, 403, 404, 422, 429 |
| `GET` | `/orders/{order_id}/items` | List order items | 200, 401, 404, 429 |
| `GET` | `/orders/{order_id}/items/{item_id}` | Get order item | 200, 401, 404, 429 |
