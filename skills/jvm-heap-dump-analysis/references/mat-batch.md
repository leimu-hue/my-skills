# Eclipse MAT 批处理速查

官方文档：
- 批处理：[tasks/batch.html](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/tasks/batch.html)
- 单查询报告：[reference/inspections/query_report.html](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/reference/inspections/query_report.html)
- OQL：[tasks/queryingheapobjects.html](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/tasks/queryingheapobjects.html)
- 获取堆转储（各种 dump 来源与区别）：[tasks/acquiringheapdump.html](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/tasks/acquiringheapdump.html)

## 两种启动方式

**方式 A：官方脚本**（安装目录里）

```bash
./mat/ParseHeapDump.sh  my.hprof org.eclipse.mat.api:suspects     # Linux / macOS
.\mat\ParseHeapDump.bat my.hprof org.eclipse.mat.api:suspects     # Windows
```

缺点：`-Xmx` 来自 `MemoryAnalyzer.ini`（默认 1024m），改它要动安装目录。

**方式 B：直接调 Eclipse launcher**（推荐，能独立控制堆）

```bash
java -Xmx10g -XX:MaxMetaspaceSize=1g \
     --add-exports=java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED \
     -jar plugins/org.eclipse.equinox.launcher_1.6.900.v20240613-2009.jar \
     -consoleLog -nosplash -data <独立 workspace> \
     -application org.eclipse.mat.api.parse <dump> [参数] [报告]
```

`--add-exports` 是 MAT 1.16 在 JDK 17+ 上读取 `.class` 常量池所必需的——安装目录的 `MemoryAnalyzer.ini` 里本来就带着它，自己拼命令行时别漏。

## 报告名

| 报告 | 内容 |
|---|---|
| `org.eclipse.mat.api:suspects` | 泄漏嫌疑，按占用百分比排序 |
| `org.eclipse.mat.api:overview` | 堆总览 + 类直方图 + Top Consumers + 线程总览 |
| `org.eclipse.mat.api:top_components` | 按组件（classloader/包/类）拆分的占用 |
| `org.eclipse.mat.api:compare` | 两个 dump 对比，配合 `-snapshot2=<dump2>` |
| `org.eclipse.mat.api:suspects2` | 与基线对比找新增泄漏，配合 `-baseline=<dump2>` |
| `org.eclipse.mat.api:query` | 跑单条查询，配合 `-command=` |

输出是 `<dump>_<Report>.zip`，解压后看 `index.html`；加 `-unzip` 可直接展开。

## 解析与输出参数

| 参数 | 作用 |
|---|---|
| `-keep_unreachable_objects` | 保留不可达对象。要分析"堆里为什么这么多垃圾"时用，但索引会变大、变慢。**内存不足时不要用**：实测 80M 对象 / 6 GB 可用内存会在 "Marking reachable objects" 阶段长时间 GC 抖动，11 分钟无进展；改用 `HprofComposition` 全量扫描 + `live_vs_dead.py` 更省内存 |
| `-snapshot_identifier=#1` | 一个文件里有多个快照时选一个 |
| `-limit=N` | 表格最多输出 N 行（默认有限制，看不全时调大） |
| `-format=csv\|txt\|html` | 输出格式，**批量取数用 csv** |
| `-unzip` | 就地解压报告 |
| `-output=` / `-redact=` / `-map=` | 导出脱敏副本（`org.eclipse.mat.hprof:export`） |
| `-discard_ratio=` / `-discard_pattern=` | 超大 dump 采样丢弃（实验特性） |

## 单查询报告（最有用的一条路径）

```bash
# 类直方图，CSV
java ... -application org.eclipse.mat.api.parse my.hprof \
     -command=histogram -format=csv -unzip -limit=50 org.eclipse.mat.api:query
# → my_Query/pages/Query_Command2.csv
```

已验证可用的 `-command`：
- `histogram` — 类直方图（Class Name / Objects / Shallow Heap）
- `oql "<语句>"` — 任意 OQL

其他 MAT 查询（如 dominator tree、retained set）的 `-command` 写法与 GUI 查询浏览器里输入的一致，但参数形式未被逐一验证，用之前先用 `histogram` 打通链路。

### OQL 在批处理里的写法

```bash
# Linux/macOS
./mat/ParseHeapDump.sh my.hprof "-command=oql \"SELECT * FROM java.lang.String s\"" org.eclipse.mat.api:query

# Windows cmd（双引号需要多层转义，官方示例用 7 个反斜杠）
.\mat\ParseHeapDump.bat my.hprof "-command=oql \\\"SELECT * FROM java.lang.String s\\\"" org.eclipse.mat.api:query
```

**在 PowerShell / Python 里按单个 argv 传参时可以少转义**（不经过 cmd.exe 解析），本技能脚本就是这么做的：

```bash
python scripts/mat_analyze.py oql my.hprof --select "SELECT s.@objectId AS id, s.@retainedHeapSize AS retained FROM com.foo.Bar s"
```

已验证的 OQL 属性：
- `s.@objectId` — 对象 id（可再喂给其它查询或 MAT GUI）
- `s.@retainedHeapSize` — 精确 retained（走 dominator tree，比直方图准）

注意：OQL 语句里再出现双引号或反斜杠会非常脆弱，遇到解析失败不要死磕转义，换成 `histogram` 或直接在 MAT GUI 里执行。

## 报告里的数字怎么读

- `Used heap dump`：**活对象**大小。MAT 索引时已移除不可达对象，所以它永远小于 dump 文件。
- Class Histogram 的 `Retained Heap`：class 级近似值，带 `>=`，**不可求和**。要精确值用 OQL 的 `@retainedHeapSize`。
- Leak Suspects 的 `Shortest Paths`：只说明"存在这条路径"，经常绕到 classloader，不能当引用关系证据。真正的持有关系看 `Accumulated Objects in Dominator Tree`。
