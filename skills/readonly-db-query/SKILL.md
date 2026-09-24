---
name: readonly-db-query
description: 通过统一的只读 CLI 脚本查询 SQLite / MySQL / PostgreSQL 数据库并把结果以结构化 JSON 返回，支持列库、列表、看表结构、跑 SELECT。只要用户提到"查数据库""跑一条 SQL""查某张表的数据""看看这条记录在不在""统计一下某表的数量""这个库有哪些表""表结构是什么"，即使没有明说"只读"，不管数据库是本地 SQLite 文件还是远程 MySQL/PostgreSQL，都应立即使用本技能。凡是涉及 INSERT/UPDATE/DELETE/DROP 等写操作或 DDL 的请求，也必须走本技能——它会在执行前明确拒绝并说明原因，不要绕开技能直接连库。
---

# 只读数据库查询

所有数据库操作都通过 `scripts/dbcli.py`（相对本技能目录）执行。不要自己写 `pymysql.connect` / `sqlite3.connect` 直连，也不要为了让写操作跑通换别的连法。

## 写操作：拒绝，别想办法绕

用户要写数据（`INSERT` / `UPDATE` / `DELETE` / `DROP` / `ALTER` / `TRUNCATE` 等）时，你只做三件事：说明本工具只读、给出拒绝原因、建议他用数据库客户端或有写权限的通道。

脚本有三层拦截（SQL 白名单、关键字扫描、数据库只读会话），命中任何一层都以退出码 3 返回 `read_only_violation`。这是你要转达给用户的结果，不是待突破的障碍。

## 第一次用：先拿到连接信息

**以用户项目的目录为 cwd 执行**：`python <技能目录>/scripts/dbcli.py list`。配置查找从 cwd 向上逐级走，cd 到技能目录里跑会看不到项目配置，别这么干。

返回 `count: 0` 或带 `hint` 字段，说明这个项目还没配过数据库。此时立刻停下，按下面来：

1. **不要自己找凭据。** 别翻 `application.yml`、`.env`、`.pi/` 目录，别 `grep jdbc:mysql`，翻到了也不许拿来连库。用户没给的地址和账号，就是不能用。
2. **一次问齐**：数据库类型（sqlite / mysql / postgresql）、主机和端口（SQLite 是库文件路径）、账号、密码、库名。缺哪项问哪项，密码不许编。
3. 用 `init` 生成 `./dbcli.yaml`，密码放环境变量，别写明文：

```bash
# 有完整连接串
python scripts/dbcli.py init --url "mysql://user:pass@10.0.0.12:3306/shop" --name shop

# 分项填，密码走环境变量
python scripts/dbcli.py init --driver mysql --host 10.0.0.12 --port 3306 \
  --user readonly --password-env DB_SHOP_PASSWORD --database shop --name shop

# SQLite 只要路径
python scripts/dbcli.py init --driver sqlite --path ./data/shop.db --name local
```

4. 提醒用户把环境变量设好，然后 `ping` 验证连通。配置文件已存在时 `init` 不覆盖，用户明确要覆盖才加 `--force`。
5. 用户只想临时查一次、不愿落盘，就用 `--url` 直连，不生成配置。

## 多个库：让用户挑，别全查

配置里有多个库、用户又没说查哪个时，先 `list` 把候选列出来（名称、驱动、主机、库名），问清要查哪一个，拿到答复再加 `--db` 执行。

不要挨个库连一遍，也不要同一条 SQL 在所有库上跑一遍。用户明确说"所有库都查"，才逐个 `--db` 执行。

没设 `default` 又没传 `--db` 时，脚本以退出码 2 报错并列出可用库名。照报错让用户挑，不要自己定一个。

## 配置文件

从当前目录向上逐级找 `dbcli.yaml` → `.dbcli.yaml` → `.pi/dbcli.yaml`。格式参考技能目录下的 `dbcli.example.yaml`：

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
    password: ${DB_PG_PASSWORD}   # ${ENV_VAR} 从环境变量取值
    database: analytics
```

- `--db <名称>` 选库。只有一个库可以省；多个库要有 `default` 或显式 `--db`。
- `--config <路径>` 指定配置文件；`--url` 直连并忽略配置文件。
- 没有配置文件时，可用 `DB_DRIVER` / `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `DB_PATH` 配一个库（名为 `env`）。

## 子命令

入口是 `python scripts/dbcli.py <子命令>`。查询类子命令（`query` / `tables` / `describe` / `ping`）都支持 `--config` / `--db` / `--url` / `--max-rows` / `--timeout-ms` / `--format json|table`；`list` 支持 `--config` / `--format`。

| 子命令 | 用途 | 关键参数 |
| --- | --- | --- |
| `init` | 生成配置文件 `dbcli.yaml` | `--url` 或 `--driver` + 连接参数；`--force` 覆盖 |
| `list` | 列出配置里的数据库（密码只显示 `has_password`） | `--config` |
| `query` | 执行一条只读 SQL | `--sql "..."` 或 `--sql-file path.sql` |
| `tables` | 列出当前库的表与视图 | — |
| `describe <表名>` | 查看某张表的结构 | 位置参数：表名 |
| `ping` | 测试连接与只读会话 | — |

```bash
python scripts/dbcli.py list
python scripts/dbcli.py query --db shop --sql "SELECT id, name FROM customers LIMIT 10"
python scripts/dbcli.py query --db shop --sql-file ./reports/q1.sql
python scripts/dbcli.py describe orders --db shop
python scripts/dbcli.py tables --db report_pg
# 要给用户看表格时
python scripts/dbcli.py query --db shop --sql "SELECT status, COUNT(*) FROM orders GROUP BY status" --format table
```

`query` 返回固定字段：`database`、`driver`、`sql`、`columns`、`rows`、`row_count`、`meta`。`meta.truncated` 为 `true` 表示结果被 `--max-rows` 截断：改用 `COUNT` / `GROUP BY` 在库里算完、加 `WHERE` 收窄，或者调大 `--max-rows`，再取数。

## 执行要点

1. 不确定有哪些库先 `list`，不确定表名先 `tables`，不确定字段先 `describe <表>`，别凭猜写 SQL。`list` 报无配置就走“第一次用”流程：问用户要信息，别自己去仓库里搜。
2. `--max-rows` 默认 100。要统计就在 SQL 里算完（`COUNT` / `SUM` / `GROUP BY`），别把大结果集往回拉。
3. SQL 长或含特殊字符，写进文件用 `--sql-file`。
4. 退出码：`0` 成功；`2` 用法或配置错（库不存在、缺参数）；`3` 被只读防护拦下；`4` 缺驱动，按提示安装（MySQL→`PyMySQL`，PostgreSQL→`psycopg[binary]`，SQLite 不用装；完整清单见 `requirements.txt`）；`5` 数据库运行期错误（连不上、SQL 语法错）。错误以 JSON 输出到 stdout，字段是 `error` 和 `message`。
5. 报缺驱动就装，不要换一种写法自己连。
