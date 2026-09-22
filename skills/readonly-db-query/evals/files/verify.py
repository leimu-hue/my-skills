#!/usr/bin/env python3
"""对 dbcli.py 做一次完整的只读行为自检，全部为可编程断言。

用法：
    python verify.py            # 使用临时目录自建夹具
    python verify.py <工作目录>  # 指定目录

输出每条断言 PASS/FAIL，结尾给出汇总；任一失败则退出码为 1。
这个脚本既是本地开发的自检工具，也可作为评估里"程序化断言"的复用实现。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_ROOT = os.path.dirname(os.path.dirname(HERE))  # evals/files -> 技能根目录
CLI = os.path.join(SKILL_ROOT, "scripts", "dbcli.py")

results: list[tuple[str, bool, str]] = []


def check(name: str, passed: bool, evidence: str = "") -> None:
    results.append((name, passed, evidence))


def run(workdir: str, *args: str, env: dict | None = None) -> tuple[int, str]:
    full_env = dict(os.environ)
    if env:
        full_env.update(env)
    proc = subprocess.run(
        [sys.executable, CLI, *args],
        cwd=workdir,
        capture_output=True,
        text=True,
        env=full_env,
    )
    return proc.returncode, proc.stdout


def main() -> int:
    if len(sys.argv) == 2:
        workdir = os.path.abspath(sys.argv[1])
        os.makedirs(workdir, exist_ok=True)
        subprocess.run([sys.executable, os.path.join(HERE, "setup_project.py"), workdir], check=True)
    else:
        workdir = tempfile.mkdtemp(prefix="dbcli_verify_")
        subprocess.run([sys.executable, os.path.join(HERE, "setup_project.py"), workdir], check=True)

    # 1. 连接与只读会话
    code, out = run(workdir, "ping", "--db", "shop")
    check("ping 成功且声明只读", code == 0 and json.loads(out).get("read_only") is True, out[:200])

    # 2. 列表
    code, out = run(workdir, "tables", "--db", "shop")
    tables = json.loads(out).get("tables", []) if code == 0 else []
    check("tables 列出 4 张表", code == 0 and set(tables) == {"customers", "products", "orders", "order_items"}, str(tables))

    # 3. 只读 SELECT
    code, out = run(workdir, "query", "--db", "shop", "--sql", "SELECT COUNT(*) FROM orders")
    rows = json.loads(out).get("rows", []) if code == 0 else []
    check("SELECT 聚合返回正确计数", code == 0 and rows == [[10]], str(rows))

    # 4. WITH ... SELECT 允许
    code, out = run(workdir, "query", "--db", "shop", "--sql", "WITH t AS (SELECT 1 AS x) SELECT * FROM t")
    check("WITH...SELECT 允许", code == 0, out[:200])

    # 5. 只读 PRAGMA 允许
    code, out = run(workdir, "query", "--db", "shop", "--sql", "PRAGMA table_info(customers)")
    check("只读 PRAGMA 允许", code == 0, out[:200])

    # 6. 字符串字面量里的 'delete' 不误伤
    code, out = run(workdir, "query", "--db", "shop", "--sql", "SELECT 'delete' AS w FROM customers LIMIT 1")
    check("字符串字面量含关键字不误伤", code == 0, out[:200])

    # 7-11. 写操作必须被拒绝（退出码 3）
    for sql in [
        "DELETE FROM customers",
        "UPDATE customers SET vip=1",
        "INSERT INTO customers VALUES (99,'x','x','x',0,'2024')",
        "DROP TABLE orders",
        "TRUNCATE TABLE orders",
    ]:
        code, out = run(workdir, "query", "--db", "shop", "--sql", sql)
        check(f"拒绝写操作: {sql[:30]}", code == 3, f"exit={code}")

    # 12. 多语句拒绝
    code, out = run(workdir, "query", "--db", "shop", "--sql", "SELECT 1; DROP TABLE orders")
    check("拒绝多语句", code == 3, f"exit={code}")

    # 13. INTO / FOR UPDATE 拒绝
    code, _ = run(workdir, "query", "--db", "shop", "--sql", "SELECT * FROM customers INTO OUTFILE '/x'")
    check("拒绝 SELECT...INTO", code == 3, f"exit={code}")
    code, _ = run(workdir, "query", "--db", "shop", "--sql", "SELECT * FROM customers FOR UPDATE")
    check("拒绝 FOR UPDATE", code == 3, f"exit={code}")

    # 14. 写型 PRAGMA 拒绝
    code, _ = run(workdir, "query", "--db", "shop", "--sql", "PRAGMA journal_mode=WAL")
    check("拒绝写型 PRAGMA", code == 3, f"exit={code}")

    # 15. max-rows 截断
    code, out = run(workdir, "query", "--db", "shop", "--sql", "SELECT * FROM customers ORDER BY id", "--max-rows", "3")
    meta = json.loads(out).get("meta", {}) if code == 0 else {}
    check("max-rows 截断标记正确", code == 0 and meta.get("truncated") is True, str(meta))

    # 16. 未知库报用法错误（退出码 2）
    code, out = run(workdir, "query", "--db", "nope", "--sql", "SELECT 1")
    check("未知库返回用法错误", code == 2, f"exit={code}")

    # 17. postgres 驱动缺失或连接失败时给出结构化错误，且不改用其他方式
    code, out = run(workdir, "ping", "--db", "report_pg")
    payload = json.loads(out) if out.strip().startswith("{") else {}
    check("postgres 不可用时结构化报错", code in (4, 5) and payload.get("error") in ("driver_missing", "database_error"), f"exit={code} {payload.get('error')}")

    # 18. 环境变量兜底
    code, out = run(workdir, "tables", "--db", "env", env={
        "DB_DRIVER": "sqlite",
        "DB_PATH": os.path.join(workdir, "shop.db"),
    })
    check("环境变量兜底可连库", code == 0 and len(json.loads(out).get("tables", [])) == 4, out[:120])

    # 19. --url 直连
    url = "sqlite:///" + os.path.join(workdir, "shop.db").replace("\\", "/")
    code, out = run(workdir, "query", "--url", url, "--sql", "SELECT COUNT(*) FROM products")
    rows = json.loads(out).get("rows", []) if code == 0 else []
    check("--url 直连可用", code == 0 and rows == [[5]], str(rows))

    # 20. 数据库未被改动（读操作后计数不变）
    code, out = run(workdir, "query", "--db", "shop", "--sql", "SELECT COUNT(*) FROM customers")
    rows = json.loads(out).get("rows", []) if code == 0 else []
    check("全部测试后数据未被改动", code == 0 and rows == [[6]], str(rows))

    # 汇总
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    for name, ok, evidence in results:
        mark = "PASS" if ok else "FAIL"
        line = f"[{mark}] {name}"
        if not ok:
            line += f"  <- {evidence}"
        print(line)
    print(f"\n{passed}/{total} 通过")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
