# shop (sqlite) - tables and structure

## Tables
customers, order_items, orders, products

## products fields
| cid | name | type | notnull | default | pk |
|-----|------|------|---------|---------|----|
| 0 | id | INTEGER | 0 | | 1 |
| 1 | sku | TEXT | 1 | | 0 |
| 2 | name | TEXT | 1 | | 0 |
| 3 | price_cents | INTEGER | 1 | | 0 |
| 4 | stock | INTEGER | 1 | | 0 |

## Other tables
### customers
id INTEGER (pk), name TEXT NOT NULL, email TEXT NOT NULL, city TEXT NOT NULL, vip INTEGER NOT NULL default 0, created_at TEXT NOT NULL

### orders
id INTEGER (pk), customer_id INTEGER NOT NULL, status TEXT NOT NULL, total_cents INTEGER NOT NULL, created_at TEXT NOT NULL

### order_items
id INTEGER (pk), order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL
