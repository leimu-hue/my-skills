#!/usr/bin/env python3
"""为测试准备一个可用的数据库环境。

在一个目标目录里：
  1. 生成 SQLite 夹具库 shop.db（内容见 make_fixture.py）
  2. 写入 dbcli.yaml，配置两个库：
     - shop     : sqlite，指向 shop.db（默认库）
     - report_pg: postgresql，指向一个不存在的本地实例（用于验证驱动缺失/连接失败的处理）

用法：
    python setup_project.py <目标目录>

这样评估提示里提到"项目根目录下有 dbcli.yaml""还有个 postgres"时，
环境是真实可复现的，不依赖外部服务。
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_fixture import build  # noqa: E402

CONFIG = """\
default: shop

databases:
  shop:
    driver: sqlite
    path: ./shop.db

  report_pg:
    driver: postgresql
    host: 127.0.0.1
    port: 55432
    user: analyst
    password: analyst
    database: analytics
    connect_timeout: 2
"""


def setup(target: str) -> None:
    os.makedirs(target, exist_ok=True)
    db_path = os.path.join(target, "shop.db")
    build(db_path)
    config_path = os.path.join(target, "dbcli.yaml")
    with open(config_path, "w", encoding="utf-8") as fh:
        fh.write(CONFIG)
    print(f"已准备: {db_path}")
    print(f"已准备: {config_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python setup_project.py <目标目录>", file=sys.stderr)
        sys.exit(2)
    setup(sys.argv[1])
