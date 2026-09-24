#!/usr/bin/env python3
"""readonly-db-query CLI —— 只读数据库查询工具。

设计目标：
- 确定性：所有查询走同一个入口，输出稳定的 JSON 结构，便于 Agent 解析与复现。
- 只读：三层防护（SQL 白名单 / 词法拦截 / 数据库会话只读），任何一层拦截即拒绝执行。
- 多库：从项目配置文件读取多个命名数据库连接；环境变量作为兜底。

支持驱动：sqlite / mysql / postgresql。

子命令：
- init   首次使用：根据 --url 或连接参数生成配置文件 dbcli.yaml
- list   列出配置里的数据库
- query  执行只读 SQL
- tables 列出表/视图
- describe 查看表结构
- ping   测试连接与只读会话

退出码：
  0  成功
  2  用法错误 / 配置错误
  3  被只读防护拦截
  4  驱动缺失
  5  数据库错误
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - PyYAML 通常已随环境提供
    yaml = None

CONFIG_FILENAMES = ("dbcli.yaml", ".dbcli.yaml", os.path.join(".pi", "dbcli.yaml"))

# 允许作为「语句首关键字」的只读命令。
READONLY_LEADERS = {
    "select",
    "show",
    "describe",
    "desc",
    "explain",
    "with",
    "table",
    "values",
}

# 明确禁止的关键字（出现在任何非注释/非字符串位置即拒绝）。
FORBIDDEN_KEYWORDS = {
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "create",
    "truncate",
    "replace",
    "merge",
    "grant",
    "revoke",
    "call",
    "exec",
    "execute",
    "rename",
    "comment",
    "lock",
    "unlock",
    "attach",
    "detach",
    "vacuum",
    "analyze",
    "reindex",
    "copy",
    "load",
    "set",
    "begin",
    "commit",
    "rollback",
    "savepoint",
    "use",
    "kill",
    "shutdown",
    "install",
    "uninstall",
}

# 允许的只读 PRAGMA（SQLite）。
READONLY_PRAGMAS = {
    "table_info",
    "table_list",
    "table_xinfo",
    "index_list",
    "index_info",
    "foreign_key_list",
    "database_list",
    "compile_options",
    "collation_list",
    "function_list",
    "module_list",
    "pragma_list",
    "query_only",
    "schema_version",
    "user_version",
    "encoding",
    "page_size",
    "page_count",
    "freelist_count",
    "journal_mode",
    "integrity_check",
    "quick_check",
}

DEFAULT_MAX_ROWS = 100
DEFAULT_TIMEOUT_MS = 30_000


class UsageError(Exception):
    """通过 argparse 语义抛出的用法/配置错误。"""


class ReadOnlyViolation(Exception):
    """SQL 命中只读防护。"""


class DriverMissing(Exception):
    """缺少所需数据库驱动。"""


# --------------------------------------------------------------------------- #
# SQL 安全解析
# --------------------------------------------------------------------------- #

def _strip_sql_noise(sql: str) -> str:
    """移除注释与字符串字面量，只保留结构性 token，便于安全检查。

    我们不改动原始 SQL（仍然原样发送给数据库），只是构造一份"干净"副本用于
    词法判断，避免把字符串里的 'delete' 误判为写操作。
    """
    out: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        two = sql[i : i + 2]
        # 行注释
        if two == "--":
            j = sql.find("\n", i)
            i = n if j == -1 else j + 1
            out.append(" ")
            continue
        # 块注释 /* ... */
        if two == "/*":
            j = sql.find("*/", i + 2)
            i = n if j == -1 else j + 2
            out.append(" ")
            continue
        # 单引号字符串（支持 '' 转义）
        if ch == "'":
            i += 1
            while i < n:
                if sql[i] == "'":
                    if i + 1 < n and sql[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            out.append(" '' ")
            continue
        # 双引号 / 反引号标识符：保留内容（列名可能含关键字），用空格包围
        if ch in ('"', "`"):
            quote = ch
            i += 1
            while i < n and sql[i] != quote:
                i += 1
            i += 1
            out.append(" IDENT ")
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _split_statements(clean_sql: str) -> list[str]:
    """按分号拆分语句；只有末尾一个空分号是合法的。"""
    parts = [p for p in clean_sql.split(";")]
    non_empty = [p for p in parts if p.strip()]
    if len(non_empty) > 1:
        raise ReadOnlyViolation(
            "检测到多条语句（分号分隔）。只读工具一次只允许执行一条语句。"
        )
    return non_empty


def _check_read_only(sql: str) -> str:
    """三层防护中的前两层：词法白名单 + 关键字拦截。

    返回规范化后的 SQL（去除首尾空白），供执行与展示使用。原始大小写不变。
    """
    stripped = sql.strip()
    if not stripped:
        raise ReadOnlyViolation("SQL 为空。")

    clean = _strip_sql_noise(sql)
    statements = _split_statements(clean)
    if not statements:
        raise ReadOnlyViolation("SQL 为空或仅包含注释。")

    stmt = statements[0]

    # 提取首个标识性关键字。WITH ... SELECT 的 CTE 也会以 WITH 开头，允许。
    leader_match = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)", stmt)
    leader = leader_match.group(1).lower() if leader_match else ""

    if leader == "pragma":
        return _check_pragma(stripped, stmt)

    if leader not in READONLY_LEADERS:
        raise ReadOnlyViolation(
            f"语句类型 '{leader or '?'}' 不在只读白名单内。"
            f"只允许: {', '.join(sorted(READONLY_LEADERS))}（SQLite 另允许只读 PRAGMA）。"
        )

    # 关键字拦截：扫描干净副本里的每个 token。
    tokens = re.findall(r"[A-Za-z_][A-Za-z0-9_]*", stmt)
    lowered = {t.lower() for t in tokens}
    hit = lowered & FORBIDDEN_KEYWORDS
    if hit:
        raise ReadOnlyViolation(
            f"SQL 含被禁止的关键字: {', '.join(sorted(hit))}。本工具只允许读操作。"
        )

    # SELECT ... INTO / INTO OUTFILE 属于写操作或落盘。
    if re.search(r"\binto\b", stmt, re.IGNORECASE):
        raise ReadOnlyViolation("检测到 INTO 子句（可能写入表或文件），已拒绝。")

    # FOR UPDATE / LOCK IN SHARE MODE 会加锁，视为非只读。
    if re.search(r"\bfor\s+update\b|\block\s+in\s+share\s+mode\b", stmt, re.IGNORECASE):
        raise ReadOnlyViolation("检测到加锁子句（FOR UPDATE / LOCK IN SHARE MODE），已拒绝。")

    return stripped


def _check_pragma(original: str, clean_stmt: str) -> str:
    """只读 PRAGMA 白名单。写型 PRAGMA（如 journal_mode=WAL）会被拒绝。"""
    m = re.match(r"\s*pragma\s+(?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*)", clean_stmt, re.IGNORECASE)
    name = m.group(1).lower() if m else ""
    if name not in READONLY_PRAGMAS:
        raise ReadOnlyViolation(
            f"PRAGMA '{name or '?'}' 不在只读白名单内，可能修改数据库状态，已拒绝。"
        )
    # PRAGMA xxx = yyy 形式属于写入。
    if "=" in clean_stmt:
        raise ReadOnlyViolation("带赋值（=）的 PRAGMA 会修改连接/库状态，已拒绝。")
    return original.strip()


# --------------------------------------------------------------------------- #
# 配置
# --------------------------------------------------------------------------- #

@dataclass
class DbConfig:
    name: str
    driver: str
    options: dict[str, Any] = field(default_factory=dict)

    def display(self) -> dict[str, Any]:
        """对外展示的连接信息，隐去密码。"""
        safe = {k: v for k, v in self.options.items() if k != "password"}
        safe["has_password"] = "password" in self.options
        return {"name": self.name, "driver": self.driver, **safe}


def _find_config_file(explicit: str | None, start: str | None = None) -> str | None:
    """从 start（默认 cwd）向上逐级查找配置文件。"""
    if explicit:
        if not os.path.isfile(explicit):
            raise UsageError(f"指定的配置文件不存在: {explicit}")
        return os.path.abspath(explicit)

    current = os.path.abspath(start or os.getcwd())
    while True:
        for filename in CONFIG_FILENAMES:
            candidate = os.path.join(current, filename)
            if os.path.isfile(candidate):
                return candidate
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def _config_from_env() -> dict[str, DbConfig]:
    """环境变量兜底：DB_DRIVER / DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / DB_PATH。"""
    driver = os.environ.get("DB_DRIVER")
    if not driver:
        return {}
    options: dict[str, Any] = {}
    mapping = {
        "host": "DB_HOST",
        "port": "DB_PORT",
        "user": "DB_USER",
        "password": "DB_PASSWORD",
        "database": "DB_NAME",
        "path": "DB_PATH",
    }
    for key, env in mapping.items():
        value = os.environ.get(env)
        if value is not None:
            options[key] = int(value) if key == "port" and value.isdigit() else value
    if "port" not in options and driver in ("mysql", "postgresql"):
        options["port"] = 3306 if driver == "mysql" else 5432
    return {"env": DbConfig(name="env", driver=driver, options=options)}


def _config_from_url(url: str) -> DbConfig:
    """--url 直接连接串：sqlite:///path 或 mysql://user:pass@host:port/db。"""
    m = re.match(r"^([A-Za-z0-9_+]+)://(.*)$", url)
    if not m:
        raise UsageError(f"无法解析连接串: {url}")
    scheme, rest = m.group(1).lower(), m.group(2)
    if scheme in ("sqlite", "sqlite3"):
        # sqlite:///abs/path 或 sqlite://relative
        path = rest[2:] if rest.startswith("//") else rest
        path = path.lstrip("/") if not os.path.isabs(path) else path
        if rest.startswith("///"):
            path = "/" + rest[3:]
        return DbConfig(name="url", driver="sqlite", options={"path": path})

    if scheme in ("mysql", "mariadb", "postgresql", "postgres"):
        driver = "mysql" if scheme in ("mysql", "mariadb") else "postgresql"
        creds, _, hostpart = rest.rpartition("@")
        user, _, password = creds.partition(":") if creds else ("", "", "")
        hostport, _, database = hostpart.partition("/")
        host, _, port = hostport.partition(":")
        options: dict[str, Any] = {"host": host or "localhost", "database": database}
        if user:
            options["user"] = user
        if password:
            options["password"] = password
        options["port"] = int(port) if port.isdigit() else (3306 if driver == "mysql" else 5432)
        return DbConfig(name="url", driver=driver, options=options)

    raise UsageError(f"不支持的连接串协议: {scheme}")


_ENV_REF = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def _expand_env(value: Any) -> Any:
    """展开值里的 ${ENV_VAR} 引用，便于配置里避免明文写密码。

    未定义的环境变量替换为空串（多数情况下会让连接失败并给出清晰报错，
    比保留字面量 ${...} 更早暴露问题）。非字符串原样返回。
    """
    if isinstance(value, str):
        return _ENV_REF.sub(lambda m: os.environ.get(m.group(1), ""), value)
    return value


def load_config(explicit: str | None = None) -> tuple[dict[str, DbConfig], str | None, str | None]:
    """加载配置，返回 (databases, default_name, config_path)。"""
    path = _find_config_file(explicit)
    if path is None:
        databases = _config_from_env()
        default = next(iter(databases), None)
        return databases, default, None

    if yaml is None:
        raise UsageError("读取 YAML 配置需要 PyYAML，请先安装：pip install pyyaml")

    with open(path, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    if not isinstance(raw, dict):
        raise UsageError(f"配置文件格式错误（顶层应为映射）: {path}")

    entries = raw.get("databases") or {}
    if not isinstance(entries, dict) or not entries:
        raise UsageError(f"配置文件缺少 'databases' 段: {path}")

    databases: dict[str, DbConfig] = {}
    for name, cfg in entries.items():
        if not isinstance(cfg, dict):
            raise UsageError(f"数据库 '{name}' 的配置应为映射: {path}")
        driver = str(cfg.get("driver", "")).lower()
        if not driver:
            raise UsageError(f"数据库 '{name}' 缺少 'driver' 字段: {path}")
        options = {k: _expand_env(v) for k, v in cfg.items() if k != "driver"}
        databases[name] = DbConfig(name=name, driver=driver, options=options)

    default = raw.get("default")
    if default is not None and default not in databases:
        raise UsageError(f"default 指向不存在的数据库 '{default}': {path}")

    env_databases = _config_from_env()
    databases.update(env_databases)
    return databases, default, path


# --------------------------------------------------------------------------- #
# 驱动适配层
# --------------------------------------------------------------------------- #

class Connection:
    """统一的只读连接封装。"""

    def __init__(self, config: DbConfig, timeout_ms: int):
        self.config = config
        self.timeout_ms = timeout_ms
        self.driver = config.driver
        self._conn = None
        self.placeholder = "%s"

    def __enter__(self) -> "Connection":
        self._connect()
        self._enforce_session_read_only()
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def _connect(self) -> None:
        opts = self.config.options
        if self.driver == "sqlite":
            import sqlite3

            path = opts.get("path") or opts.get("database")
            if not path:
                raise UsageError(f"数据库 '{self.config.name}' 缺少 'path'（SQLite 文件路径）。")
            if path != ":memory:" and not os.path.exists(path):
                raise UsageError(f"SQLite 文件不存在: {path}")
            self._conn = sqlite3.connect(path)
            self.placeholder = "?"
        elif self.driver == "mysql":
            try:
                import pymysql
            except ImportError as exc:
                raise DriverMissing("MySQL 需要 PyMySQL，请安装：pip install pymysql") from exc
            self._conn = pymysql.connect(
                host=opts.get("host", "localhost"),
                port=int(opts.get("port", 3306)),
                user=opts.get("user"),
                password=opts.get("password"),
                database=opts.get("database"),
                connect_timeout=max(1, int(opts.get("connect_timeout", 10))),
                read_timeout=max(1, self.timeout_ms // 1000),
                charset=opts.get("charset", "utf8mb4"),
                cursorclass=pymysql.cursors.Cursor,
            )
        elif self.driver == "postgresql":
            try:
                import psycopg  # type: ignore
            except ImportError:
                try:
                    import psycopg2 as psycopg  # type: ignore
                except ImportError as exc:
                    raise DriverMissing(
                        "PostgreSQL 需要 psycopg，请安装：pip install 'psycopg[binary]'"
                    ) from exc
            self._conn = psycopg.connect(
                host=opts.get("host", "localhost"),
                port=int(opts.get("port", 5432)),
                user=opts.get("user"),
                password=opts.get("password"),
                dbname=opts.get("database"),
                connect_timeout=max(1, int(opts.get("connect_timeout", 10))),
            )
        else:
            raise UsageError(f"不支持的驱动: {self.driver}")

    def _enforce_session_read_only(self) -> None:
        """第三层防护：让数据库自己拒绝写操作，防止绕过词法检查。"""
        cur = self._conn.cursor()
        try:
            if self.driver == "sqlite":
                cur.execute("PRAGMA query_only = ON")
            elif self.driver == "mysql":
                # 只读事务；随后每条语句都在该事务内执行。
                cur.execute("SET SESSION TRANSACTION READ ONLY")
                cur.execute("START TRANSACTION READ ONLY")
            elif self.driver == "postgresql":
                cur.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        finally:
            cur.close()

    def execute(self, sql: str, max_rows: int) -> dict[str, Any]:
        cur = self._conn.cursor()
        start = time.perf_counter()
        try:
            cur.execute(sql)
            if cur.description is None:
                # 只读语句理论上都应有结果集；这里兜底。
                columns: list[str] = []
                rows: list[list[Any]] = []
                truncated = False
            else:
                columns = [d[0] for d in cur.description]
                fetched = cur.fetchmany(max_rows + 1)
                truncated = len(fetched) > max_rows
                rows = [list(_normalize(v)) for v in fetched[:max_rows]]
        finally:
            elapsed_ms = round((time.perf_counter() - start) * 1000, 3)
            cur.close()
        return {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "truncated": truncated,
            "elapsed_ms": elapsed_ms,
        }

    def list_tables(self) -> list[str]:
        if self.driver == "sqlite":
            sql = "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
        elif self.driver == "mysql":
            sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name"
        else:
            sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        result = self.execute(sql, DEFAULT_MAX_ROWS * 10)
        return [str(r[0]) for r in result["rows"]]

    def describe(self, table: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_.]+", table):
            raise UsageError(f"表名包含非法字符: {table}")
        if self.driver == "sqlite":
            sql = f"PRAGMA table_info({table})"
        elif self.driver == "mysql":
            sql = f"SHOW COLUMNS FROM {table}"
        else:
            sql = (
                "SELECT column_name, data_type, is_nullable, column_default "
                "FROM information_schema.columns "
                f"WHERE table_schema = 'public' AND table_name = '{table}' "
                "ORDER BY ordinal_position"
            )
        return self.execute(sql, DEFAULT_MAX_ROWS * 10)

    def close(self) -> None:
        if self._conn is not None:
            try:
                if self.driver == "mysql":
                    try:
                        self._conn.rollback()  # 结束只读事务
                    except Exception:
                        pass
                self._conn.close()
            finally:
                self._conn = None


def _normalize(value: Any) -> Any:
    """把不可 JSON 序列化的值转成稳定表示。"""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (bytes, bytearray)):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.hex()
    if isinstance(value, (list, tuple)):
        return [_normalize(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _normalize(v) for k, v in value.items()}
    return str(value)


# --------------------------------------------------------------------------- #
# 输出
# --------------------------------------------------------------------------- #

def emit(payload: dict[str, Any], fmt: str, stream=sys.stdout) -> None:
    if fmt == "json":
        json.dump(payload, stream, ensure_ascii=False, indent=2, default=str)
        stream.write("\n")
    elif fmt == "table":
        _emit_table(payload, stream)
    else:
        raise UsageError(f"未知输出格式: {fmt}")


def _emit_table(payload: dict[str, Any], stream) -> None:
    columns = payload.get("columns") or []
    rows = payload.get("rows") or []
    if not columns:
        stream.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        return
    widths = [len(str(c)) for c in columns]
    for row in rows:
        for i, cell in enumerate(row):
            if i < len(widths):
                widths[i] = max(widths[i], len(str(cell)))
    header = " | ".join(str(c).ljust(widths[i]) for i, c in enumerate(columns))
    stream.write(header + "\n")
    stream.write("-+-".join("-" * w for w in widths) + "\n")
    for row in rows:
        stream.write(" | ".join(str(c).ljust(widths[i]) for i, c in enumerate(row)) + "\n")
    meta = payload.get("meta", {})
    suffix = "（已截断）" if meta.get("truncated") else ""
    stream.write(f"\n{payload.get('row_count', 0)} 行{suffix}\n")


# --------------------------------------------------------------------------- #
# 子命令
# --------------------------------------------------------------------------- #

def _resolve_database(databases: dict[str, DbConfig], name: str | None, default: str | None) -> DbConfig:
    if not databases:
        raise UsageError(
            "未找到任何数据库配置（既没有 dbcli.yaml，也没有 DB_DRIVER 环境变量，也没传 --url）。"
            "请先准备连接信息（数据库类型 sqlite/mysql/postgresql、主机与端口、账号、密码、库名；"
            "SQLite 只需文件路径），然后生成配置文件："
            "python scripts/dbcli.py init --url 'mysql://user:pass@host:3306/dbname' "
            "（或 init --driver mysql --host ... --user ... --password-env ... --database ...），"
            "也可以临时用 --url 直连。"
        )
    chosen = name or default
    if chosen is None:
        if len(databases) == 1:
            chosen = next(iter(databases))
        else:
            available = ", ".join(sorted(databases))
            raise UsageError(
                f"配置中有多个数据库（{available}）且未指定要查哪一个。"
                "请先确认目标库再用 --db <名称> 执行，或在配置文件中设置 default；"
                "不要逐个库盲目执行。"
            )
    if chosen not in databases:
        raise UsageError(f"未知数据库 '{chosen}'。可用: {', '.join(sorted(databases))}")
    return databases[chosen]


def cmd_list(args: argparse.Namespace) -> int:
    databases, default, path = load_config(args.config)
    payload = {
        "config_path": path,
        "default": default,
        "databases": [databases[n].display() for n in databases],
        "count": len(databases),
    }
    if not databases:
        payload["hint"] = (
            "未找到任何数据库配置。向用户索取连接信息（类型、host:port、账号、密码、库名，"
            "SQLite 则是文件路径）后运行 init 生成配置文件，或用 --url 直连；"
            "不要自行在项目里搜索连接串或凭据。"
        )
    emit(payload, args.format)
    return 0


def _yaml_scalar(value: Any) -> str:
    """把值序列化成安全的 YAML 标量（必要时加单引号）。"""
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    text = str(value)
    if text == "" or text != text.strip() or any(c in text for c in ":#{}[]&*!|>'\"%@`,"):
        return "'" + text.replace("'", "''") + "'"
    return text


def cmd_init(args: argparse.Namespace) -> int:
    """首次使用：根据连接串或分项参数生成 dbcli.yaml。"""
    out_path = os.path.abspath(args.output)

    if args.url:
        cfg = _config_from_url(args.url)
        driver = cfg.driver
        name = args.name or ("local" if driver == "sqlite" else "main")
        options = dict(cfg.options)
    elif args.driver:
        driver = args.driver.lower()
        options = {}
        if driver == "sqlite":
            if not args.path:
                raise UsageError("SQLite 需要 --path 指定数据库文件路径（或直接用 --url sqlite:///path）。")
            options["path"] = args.path
        else:
            if not args.host or not args.database:
                raise UsageError(f"{driver} 需要 --host 与 --database（建议同时提供账号密码）。")
            options["host"] = args.host
            options["port"] = int(args.port) if args.port else (3306 if driver == "mysql" else 5432)
            if args.user:
                options["user"] = args.user
            if args.password:
                options["password"] = args.password
            elif args.password_env:
                options["password"] = "${" + args.password_env + "}"
            options["database"] = args.database
        name = args.name or ("local" if driver == "sqlite" else "main")
    else:
        raise UsageError(
            "缺少连接信息。请提供 --url（如 mysql://user:pass@host:3306/dbname），"
            "或 --driver 加对应参数（mysql/postgresql: --host --port --user --password/--password-env --database；"
            "sqlite: --path）。这些信息需向用户确认，不要自行猜测。"
        )

    if os.path.exists(out_path) and not args.force:
        raise UsageError(f"配置文件已存在: {out_path}。确认要覆盖请加 --force。")

    lines = [f"default: {name}", "", "databases:", f"  {name}:", f"    driver: {driver}"]
    for key, value in options.items():
        lines.append(f"    {key}: {_yaml_scalar(value)}")
    lines.append("")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    payload = {
        "config_path": out_path,
        "default": name,
        "database": {
            "name": name,
            "driver": driver,
            **{k: v for k, v in options.items() if k != "password"},
            "has_password": "password" in options,
        },
        "next_step": "python scripts/dbcli.py ping",
    }
    emit(payload, args.format)
    return 0


def _open(args: argparse.Namespace) -> tuple[Connection, DbConfig, str | None]:
    if args.url:
        databases = {"url": _config_from_url(args.url)}
        default = "url"
        path = None
    else:
        databases, default, path = load_config(args.config)
    config = _resolve_database(databases, args.db, default)
    conn = Connection(config, args.timeout_ms)
    return conn, config, path


def cmd_query(args: argparse.Namespace) -> int:
    sql = args.sql
    if args.sql_file:
        with open(args.sql_file, "r", encoding="utf-8") as fh:
            sql = fh.read()
    if not sql:
        raise UsageError("缺少 SQL。请使用 --sql 或 --sql-file。")

    safe_sql = _check_read_only(sql)

    conn, config, path = _open(args)
    with conn:
        result = conn.execute(safe_sql, args.max_rows)

    payload = {
        "database": config.name,
        "driver": config.driver,
        "sql": safe_sql,
        "columns": result["columns"],
        "rows": result["rows"],
        "row_count": result["row_count"],
        "meta": {
            "truncated": result["truncated"],
            "max_rows": args.max_rows,
            "elapsed_ms": result["elapsed_ms"],
            "read_only": True,
        },
    }
    emit(payload, args.format)
    return 0


def cmd_tables(args: argparse.Namespace) -> int:
    conn, config, _ = _open(args)
    with conn:
        tables = conn.list_tables()
    emit({"database": config.name, "driver": config.driver, "tables": tables, "count": len(tables)}, args.format)
    return 0


def cmd_describe(args: argparse.Namespace) -> int:
    conn, config, _ = _open(args)
    with conn:
        result = conn.describe(args.table)
    payload = {
        "database": config.name,
        "driver": config.driver,
        "table": args.table,
        "columns": result["columns"],
        "rows": result["rows"],
        "row_count": result["row_count"],
        "meta": {"elapsed_ms": result["elapsed_ms"], "read_only": True},
    }
    emit(payload, args.format)
    return 0


def cmd_ping(args: argparse.Namespace) -> int:
    conn, config, _ = _open(args)
    with conn:
        probe = conn.execute(_ping_sql(config.driver), 1)
    emit({"database": config.name, "driver": config.driver, "ok": True, "read_only": True, "probe": probe["rows"]}, args.format)
    return 0


def _ping_sql(driver: str) -> str:
    if driver == "sqlite":
        return "SELECT 1"
    if driver == "mysql":
        return "SELECT 1"
    return "SELECT 1"


# --------------------------------------------------------------------------- #
# 入口
# --------------------------------------------------------------------------- #

def _add_connection_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", help="配置文件路径（默认从当前目录向上查找 dbcli.yaml）")
    parser.add_argument("--db", help="数据库名称（配置中的键）")
    parser.add_argument("--url", help="直接连接串，覆盖配置文件")
    parser.add_argument("--max-rows", type=int, default=DEFAULT_MAX_ROWS, help=f"最大返回行数（默认 {DEFAULT_MAX_ROWS}）")
    parser.add_argument("--timeout-ms", type=int, default=DEFAULT_TIMEOUT_MS, help=f"查询超时（毫秒，默认 {DEFAULT_TIMEOUT_MS}）")
    parser.add_argument("--format", choices=("json", "table"), default="json", help="输出格式（默认 json）")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dbcli.py",
        description="只读数据库查询 CLI（sqlite / mysql / postgresql）",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="首次使用：生成配置文件 dbcli.yaml")
    p_init.add_argument("--output", default="dbcli.yaml", help="输出路径（默认 ./dbcli.yaml）")
    p_init.add_argument("--force", action="store_true", help="覆盖已存在的配置文件")
    p_init.add_argument("--url", help="连接串，直接转换为一条数据库配置")
    p_init.add_argument("--driver", choices=("sqlite", "mysql", "postgresql"), help="驱动类型（不用 --url 时必填）")
    p_init.add_argument("--name", help="数据库名称（配置里的键，默认 sqlite=local / 其他=main）")
    p_init.add_argument("--host", help="主机地址")
    p_init.add_argument("--port", type=int, help="端口")
    p_init.add_argument("--user", help="账号")
    p_init.add_argument("--password", help="明文密码（建议改用 --password-env，避免落盘）")
    p_init.add_argument("--password-env", help="把密码写成 ${ENV_VAR} 引用，值从环境变量读取")
    p_init.add_argument("--database", help="数据库名")
    p_init.add_argument("--path", help="SQLite 文件路径")
    p_init.add_argument("--format", choices=("json", "table"), default="json")
    p_init.set_defaults(func=cmd_init)

    p_list = sub.add_parser("list", help="列出配置中的数据库")
    p_list.add_argument("--config", help="配置文件路径")
    p_list.add_argument("--format", choices=("json", "table"), default="json")
    p_list.set_defaults(func=cmd_list)

    p_query = sub.add_parser("query", help="执行只读 SQL")
    p_query.add_argument("--sql", help="SQL 语句")
    p_query.add_argument("--sql-file", help="从文件读取 SQL")
    _add_connection_args(p_query)
    p_query.set_defaults(func=cmd_query)

    p_tables = sub.add_parser("tables", help="列出表/视图")
    _add_connection_args(p_tables)
    p_tables.set_defaults(func=cmd_tables)

    p_desc = sub.add_parser("describe", help="查看表结构")
    p_desc.add_argument("table", help="表名")
    _add_connection_args(p_desc)
    p_desc.set_defaults(func=cmd_describe)

    p_ping = sub.add_parser("ping", help="测试连接与只读会话")
    _add_connection_args(p_ping)
    p_ping.set_defaults(func=cmd_ping)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except ReadOnlyViolation as exc:
        emit({"error": "read_only_violation", "message": str(exc)}, args.format)
        return 3
    except DriverMissing as exc:
        emit({"error": "driver_missing", "message": str(exc)}, args.format)
        return 4
    except UsageError as exc:
        emit({"error": "usage_error", "message": str(exc)}, args.format)
        return 2
    except Exception as exc:  # 数据库或其他运行期错误
        emit({"error": "database_error", "message": f"{type(exc).__name__}: {exc}"}, args.format)
        return 5


if __name__ == "__main__":
    sys.exit(main())
