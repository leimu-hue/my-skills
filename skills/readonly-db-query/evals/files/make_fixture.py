#!/usr/bin/env python3
"""生成 SQLite 测试夹具数据库，供本地验证与 eval 使用。

用法：
    python make_fixture.py <输出路径.db>

创建一个电商示例库：customers / orders / order_items / products，
并插入确定性数据（无随机、无时间依赖），保证测试可复现。
"""

from __future__ import annotations

import os
import sqlite3
import sys

SCHEMA = """
CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    city TEXT NOT NULL,
    vip INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    stock INTEGER NOT NULL
);
CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
"""

CUSTOMERS = [
    (1, "张伟", "zhangwei@example.com", "广州", 1, "2024-01-05"),
    (2, "李娜", "lina@example.com", "深圳", 0, "2024-02-11"),
    (3, "王强", "wangqiang@example.com", "上海", 1, "2024-03-02"),
    (4, "刘洋", "liuyang@example.com", "北京", 0, "2024-03-19"),
    (5, "陈静", "chenjing@example.com", "广州", 0, "2024-04-08"),
    (6, "赵磊", "zhaolei@example.com", "成都", 1, "2024-05-22"),
]

PRODUCTS = [
    (1, "SKU-1001", "无线键盘", 12900, 42),
    (2, "SKU-1002", "机械鼠标", 8900, 15),
    (3, "SKU-1003", "27寸显示器", 159900, 7),
    (4, "SKU-1004", "USB-C 扩展坞", 34900, 0),
    (5, "SKU-1005", "降噪耳机", 99900, 23),
]

ORDERS = [
    (1001, 1, "paid", 21800, "2024-05-01"),
    (1002, 2, "pending", 12900, "2024-05-02"),
    (1003, 3, "shipped", 159900, "2024-05-03"),
    (1004, 3, "paid", 34800, "2024-05-05"),
    (1005, 4, "cancelled", 8900, "2024-05-06"),
    (1006, 6, "paid", 99900, "2024-05-07"),
    (1007, 6, "paid", 179800, "2024-05-08"),
    (1008, 1, "refunded", 34900, "2024-05-09"),
    (1009, 2, "paid", 12900, "2024-05-10"),
    (1010, 5, "pending", 159900, "2024-05-11"),
]

ORDER_ITEMS = [
    (1, 1001, 1, 1, 12900),
    (2, 1001, 2, 1, 8900),
    (3, 1002, 1, 1, 12900),
    (4, 1003, 3, 1, 159900),
    (5, 1004, 4, 1, 34900),
    (6, 1005, 2, 1, 8900),
    (7, 1006, 5, 1, 99900),
    (8, 1007, 5, 1, 99900),
    (9, 1007, 1, 1, 12900),
    (10, 1007, 2, 1, 8900),
    (11, 1007, 3, 1, 89900),
    (12, 1008, 4, 1, 34900),
    (13, 1009, 1, 1, 12900),
    (14, 1010, 3, 1, 159900),
]


def build(path: str) -> None:
    if os.path.exists(path):
        os.remove(path)
    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA)
        conn.executemany("INSERT INTO customers VALUES (?,?,?,?,?,?)", CUSTOMERS)
        conn.executemany("INSERT INTO products VALUES (?,?,?,?,?)", PRODUCTS)
        conn.executemany("INSERT INTO orders VALUES (?,?,?,?,?)", ORDERS)
        conn.executemany("INSERT INTO order_items VALUES (?,?,?,?,?)", ORDER_ITEMS)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python make_fixture.py <输出路径.db>", file=sys.stderr)
        sys.exit(2)
    build(sys.argv[1])
    print(f"已生成夹具: {sys.argv[1]}")
