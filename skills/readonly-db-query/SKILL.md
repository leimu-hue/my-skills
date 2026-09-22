---
name: readonly-db-query
description: 通过统一的只读 CLI 脚本查询 SQLite / MySQL / PostgreSQL 数据库并把结果以结构化 JSON 返回，支持列库、列表、看表结构、跑 SELECT。只要用户提到"查数据库""跑一条 SQL""查某张表的数据""看看这条记录在不在""统计一下某表的数量""这个库有哪些表""表结构是什么"，即使没有明说"只读"，不管数据库是本地 SQLite 文件还是远程 MySQL/PostgreSQL，都应立即使用本技能。凡是涉及 INSERT/UPDATE/DELETE/DROP 等写操作或 DDL 的请求，也必须走本技能——它会在执行前明确拒绝并说明原因，不要绕开技能直接连库。
---

# 只读数据库查询

用固定的 CLI 脚本执行所有数据库操作，把"我能查库"变成"我有一条可复现、可审计、绝对不会误写数据的查询通道"。

## 为什么用脚本而不是临时拼代码

直接 `pymysql.connect(...)` 或 `sqlite3.connect(...)` 当然也能查，但每次都要现写驱动代码、现处理连接串、现拼结果格式，而且**没有任何只读保护**——一次手滑的 `UPDATE` 就写进生产库了。这个技能把连接管理、只读校验、行数限额、JSON 输出都固化成一份脚本，让每次查询的结果结构和安全边界都一致，也让失败时的错误信息可预测。

脚本路径（相对本技能目录）：`scripts/dbcli.py`。

## 只读是硬约束，靠三层保障

**任何时候都不要绕开 `scripts/dbcli.py` 去直连数据库执行写操作。** 如果用户请求写数据（`INSERT`/`UPDATE`/`DELETE`/`DROP`/`ALTER`/`TRUNCATE` 等），正确做法是：说明本工具只读、给出被拒绝的原因，并建议用户使用数据库客户端或专门的写通道——而不是想办法执行它。

`dbcli.py` 自身用三层防护确保只读，任何一层拦截都会以退出码 3 拒绝：

1. **SQL 白名单**：语句必须以 `SELECT` / `SHOW` / `DESCRIBE` / `DESC` / `EXPLAIN` / `WITH` / `TABLE` / `VALUES` 开头（SQLite 另允许只读 `PRAGMA`）。
2. **词法拦截**：剥离注释与字符串字面量后再扫描关键字，命中 `INSERT`、`UPDATE`、`DELETE`、`DROP` 等一律拒绝；同时拒绝多语句（分号分隔）、`SELECT ... INTO`、`FOR UPDATE`、`LOCK IN SHARE MODE`、带赋值的 `PRAGMA`。
3. **会话只读**：连上后立刻设置只读会话（SQLite `PRAGMA query_only=ON`；MySQL `START TRANSACTION READ ONLY`；PostgreSQL `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`）。即使前两层被绕过，数据库自身也会拒绝写入。

配合数据库账号本身只授 `SELECT` 权限，效果更好。

## 配置：从会话项目里读多个数据库

优先读配置文件，这样可以在同一个项目里定义多个命名数据库，并通过 `--db <名称>` 切换。脚本从当前工作目录**向上逐级查找**：`dbcli.yaml` → `.dbcli.yaml` → `.pi/dbcli.yaml`。

配置文件格式见 `dbcli.example.yaml`；最小示例：

```yaml
default: shop
databases:
  shop:
    driver: sqlite
    path: ./data/shop.db
  report_pg:
    driver: postgresql
    host: pg.internal
    port: 5432
    user: analyst
    password: ${DB_PG_PASSWORD}   # 支持 ${ENV_VAR} 引用环境变量
    database: analytics
  shop_mysql:
    driver: mysql
    host: 10.0.0.12
    port: 3306
    user: readonly_user
    password: ${DB_SHOP_PASSWORD}
    database: shop
```

- `--config <路径>` 可显式指定配置文件；`--db <名称>` 选择库，不传则用 `default`。
- **环境变量兜底**：若找不到配置文件，可用 `DB_DRIVER` / `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `DB_PATH` 定义单个连接（名称为 `env`）。
- **`--url` 直连**：`sqlite:///abs/path.db`、`mysql://user:pass@host:3306/db`、`postgresql://user:pass@host/db`，此时忽略配置文件。

## 命令

脚本统一入口为 `python scripts/dbcli.py <子命令> [选项]`。所有子命令都支持 `--config` / `--db` / `--url` / `--max-rows` / `--timeout-ms` / `--format json|table`。

| 子命令 | 用途 | 关键参数 |
| --- | --- | --- |
| `list` | 列出配置里的数据库（密码只显示 `has_password`） | `--config` |
| `query` | 执行一条只读 SQL | `--sql "..."` 或 `--sql-file path.sql` |
| `tables` | 列出当前库的表与视图 | — |
| `describe <表名>` | 查看某张表的结构 | 位置参数：表名 |
| `ping` | 测试连接并确认只读会话已生效 | — |

常见调用：

```bash
# 有哪些库可用
python scripts/dbcli.py list

# 直接跑一条 SELECT（默认输出 JSON）
python scripts/dbcli.py query --db shop --sql "SELECT id, name FROM customers LIMIT 10"

# SQL 写在文件里，避免 shell 转义问题
python scripts/dbcli.py query --db shop --sql-file ./reports/q1.sql

# 看表结构 / 列表
python scripts/dbcli.py describe orders --db shop
python scripts/dbcli.py tables --db report_pg

# 人类可读的表格输出
python scripts/dbcli.py query --db shop --sql "SELECT status, COUNT(*) FROM orders GROUP BY status" --format table
```

`query` 的 JSON 输出固定包含：`database`、`driver`、`sql`、`columns`、`rows`、`row_count`，以及 `meta`（含 `truncated`、`max_rows`、`elapsed_ms`、`read_only`）。**当 `meta.truncated` 为 `true`**，说明结果被 `--max-rows` 截断，需要聚合、加 `WHERE` 收窄或调大 `--max-rows` 后再取。

## 工作方式

1. **先确认目标库**：不确定有哪些库时先跑 `list`；不确定表名先跑 `tables`，不确定字段先跑 `describe <表>`。这比凭猜测写 SQL 更省事。
2. **默认 `--max-rows` 为 100**：查询明细时保持小额度；确需全量聚合时用 SQL 的 `COUNT`/`SUM`/`GROUP BY` 在库内算完，而不是把大结果集拉回来。
3. **SQL 复杂或含特殊字符时用 `--sql-file`**，避免 shell 引号转义问题。
4. **解读退出码**：`0` 成功；`2` 用法/配置错误（如库不存在、缺字段）；`3` 命中只读防护；`4` 缺少驱动（按 `requirements.txt` 安装）；`5` 数据库运行期错误（连接失败、SQL 语法错等）。错误以 JSON 输出到 stdout，字段为 `error` 与 `message`。
5. **驱动缺失时不要改用别的写法连库**：按提示安装即可（MySQL→`PyMySQL`，PostgreSQL→`psycopg[binary]`，SQLite 用标准库无需安装）。

## 依赖

按需安装（详见 `requirements.txt`）：SQLite 用 Python 标准库，无需安装；MySQL 需 `PyMySQL`；PostgreSQL 需 `psycopg[binary]`；读取 YAML 配置需 `PyYAML`。

## 测试夹具

`evals/files/make_fixture.py` 可生成一个确定性的 SQLite 示例库（customers / products / orders / order_items），用于本地验证脚本行为：

```bash
python evals/files/make_fixture.py ./shop.db
python scripts/dbcli.py query --url sqlite:///$(pwd)/shop.db --sql "SELECT COUNT(*) FROM orders"
```
