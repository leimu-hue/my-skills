---
name: jvm-heap-dump-analysis
description: 分析 Java 堆转储（.hprof / heap dump / 堆转储），回答"内存到底被谁占了"和"这次重启是不是内存导致的"。用 Eclipse MAT 批处理加全量 HPROF 扫描，按固定顺序取数：dump 元信息 → 活对象 → 分配构成 → 顶占 → 判定，不靠肉眼翻 HTML。用户提供 .hprof 文件、要求分析 heap dump / 堆转储 / MAT 报告时使用，哪怕只说"帮我看看这个 dump"。只有"内存高 / OOM / pod 重启 / GC 压力"这类现象、没有堆转储文件时，先向用户索要 dump，同时按日志或监控技能排查，不要仅凭本技能臆测。
---

# JVM 堆转储分析

堆转储分析最容易犯的错不是看不懂，而是**顺序错**：一上来就翻 leak suspects，看到 30% 就断言泄漏，结果那 30% 是常驻缓存；或者拿 dump 文件大小当堆使用量，得出"快 OOM 了"的结论，其实活对象只占 20%。

所以这个技能固定一条取数路径。每步都产出可核对的事实，下一节只在前一节的事实上做判断。

## 0. 先给 dump 分类（30 秒，决定后面怎么读）

| 线索 | 含义 |
|---|---|
| 文件名 `java_pid<pid>.hprof` | JVM 自己写的：`-XX:+HeapDumpOnOutOfMemoryError` 或 Ctrl+Break。**这类 dump 基本可以确认发生过 Java OOM** |
| 文件名带 IP/时间戳，如 `heap_dump_10.129.63.122_1795088997000.hprof` | APM agent（ARMS/arms、SkyWalking 等）或运维平台抓的。**没有 OOM 证据**，可能只是内存报警触发 |
| 文件名 `heapdump-<ts>.hprof` / 自定义 | 手工 `jmap` / `jcmd`，看是谁在什么时候执行的 |

采集方式决定一件事：**dump 里有没有垃圾对象**。JVM 自动的 OOM dump 是在 GC 之后抓的，几乎全是活对象；agent/手工 dump 往往不强制 GC，会带上大量不可达对象。这一点后面第 4 步要用。

同时把这几个配置扒出来，缺了就去部署仓库/环境变量/Apollo 找，**不要猜**：

```bash
grep -rn -- "-Xmx\|-Xms\|MaxRAMPercentage\|HeapDump" Dockerfile* *.sh start*.sh k8s/ deploy/ 2>/dev/null
```

## 1. 固定探测顺序

```
Step 0  事实基线（不跑 MAT）   文件大小 / Xmx / Xms / 容器 memory limit
Step 1  索引                   一次，后续复用
Step 2  三份报告               suspects / overview / top_components
Step 3  活对象直方图           histogram CSV，按 shallow 排序
Step 4  全量扫描（含垃圾）     回答"dump 那一刻堆里是什么"
Step 5  对头号嫌疑做精确查询   OQL 取 retained / 计数
Step 6  判定 + 输出
```

不要跳步。特别是 Step 4 之前不要下结论：Step 3 看到的是 GC 之后活下来的东西，它无法区分"泄漏"和"分配高峰"。

## 2. 环境准备（这一步最容易浪费时间）

MAT 的默认配置对真实 dump 完全不够用，先跑一次自检：

```bash
python <skill>/scripts/mat_analyze.py env <dump>
```

它会打印 MAT 目录、launcher、JDK 版本和自动计算的 `-Xmx`。三条硬性约束：

- **JDK 17~21**（17 和 21 已实测）。更高版本的 OSGi 与字节码兼容性没验证过，别拿它冒险；机器上装了多个 JDK 就显式传 `--java`，脚本也会自动优先挑 17~21。
- **堆不能小**。`MemoryAnalyzer.ini` 默认 `-Xmx1024m`，几 GB 的 dump 会 OOM 或慢到无法接受。脚本按 `dump 大小 × 1.6`（下限 3g、上限物理内存 70%）给 `-Xmx`。
- **不要让 MAT 用默认 workspace**。`-data` 指向 dump 旁边的独立目录，避免和你机器上 GUI 版抢锁。

如果 `env` 报 "no java found" 或版本不符，先解决环境，别急着调参数。

## 3. 索引与三份报告

```bash
python <skill>/scripts/mat_analyze.py index   <dump>     # 只建索引
python <skill>/scripts/mat_analyze.py reports <dump>     # 建索引 + 跑三份报告并解压
```

索引会在 dump 旁边生成一组 `*.index`（体积约等于 dump 的一半以上），**建一次就够**，后续查询会复用，第二次跑通常只要十几秒。

三份报告各司其职，不要只跑其中一份：

| 报告 | 回答什么 |
|---|---|
| `org.eclipse.mat.api:suspects` | MAT 自动挑出的"问题嫌疑"，按占用百分比排序 |
| `org.eclipse.mat.api:overview` | 堆总量、对象数、类直方图、Top Consumers、线程总览 |
| `org.eclipse.mat.api:top_components` | 按组件（classloader / 包 / 类）拆分的占用 |

报告是 zip，`reports` 子命令会解压好并打印 `index.html` 路径。要在终端里读，用：

```bash
python <skill>/scripts/mat_analyze.py text <report-dir 或 .zip>
```

## 4. 只用四个数读报告

`overview` 的 **Heap Dump Overview** 里有：

- `Used heap dump` = **活对象总大小**（不是堆使用量，MAT 已经把不可达对象删了）
- `Number of objects` = 活对象数
- JVM 版本

**Leak Suspects** 只取两样：百分比 + 占比最大的那个类。它给的"Shortest Paths"经常绕到 classloader，路径本身不可信，能用的只有"谁占了百分之多少"。

**Top Consumers** 里看 `Biggest Top-Level Dominator`，那才是真正压着内存的那棵树。

表里的 `First 10 of N objects` 中，N 是**顶层支配者个数**，不是实例总数。要知道某个类有多少实例，回直方图取（实测同一 dump：`ConnectionImpl` 在 Top Consumers 显示 50，直方图才是 247；把 50 当实例数会得出"幻影引用是连接数的 4.3 倍"这类错结论）。

**Class Histogram**：**按 Shallow Heap 排序用，不要按 Retained Heap 求和**。MAT 在类直方图里给的 Retained 是 class 级的近似值，带 `>=` 前缀，同一批对象会被多层统计，加起来的数没有意义。要精确 retained 就走第 6 步的 OQL。

## 5. 全量扫描：dump 那一刻堆里到底是什么

MAT 索引时会把不可达对象删掉，所以直方图只反映活对象。判断"泄漏还是分配风暴"，必须看**含垃圾的全量构成**：

```bash
java <skill>/scripts/HprofComposition.java <dump> --top 25 --csv composition.csv
```

单文件源码，JDK 11+ 直接跑，不需要编译，也不需要 MAT；5 GB 的 dump 约 10~30 秒。

扫描输出是**按类**的：实例类给 `java.lang.String`，数组类给 `java.lang.String[]`、`int[][]` 这类源码形式，方便和 MAT 直方图对齐。

**垃圾总量有两个口径，别混用**：MAT 索引日志里的 `Removed N unreachable objects using X bytes` 是权威值，优先引用；`全量 − 活对象` 适合按类拆分。两者约有 2% 的口径差，报告里要说明用的是哪一个。

逐类拆分需要 join 两张表，手工做极易出错：

```bash
# 1) 活对象直方图（CSV，写到 dump 旁的 *_Query/pages/）
python <skill>/scripts/mat_analyze.py query <dump> --command histogram --limit 100000
# 2) 全量扫描（CSV）
java <skill>/scripts/HprofComposition.java <dump> --csv composition.csv
# 3) 按类对齐，算出每一类的垃圾
python <skill>/scripts/live_vs_dead.py --live hist.csv --total composition.csv --top 30
```

`live_vs_dead.py` 统一两边的类名，输出 total / live / dead 三列，并把只在 MAT 侧出现的类单列出来——那通常意味着类名没对上，值得看一眼。

**数组类名的坑**：`Object[]` 和 `Object[][]` 是两个不同的类。HPROF 的 `OBJECT_ARRAY_DUMP` 存的是**数组类**的 id，不是元素类的 id；如果按元素类再包一层 `[L...;`，所有 `Object[]` 都会被写成 `Object[][]`（实测 324 万个 `Object[]`、存活 61.6 万个，被错标成只有 9 个实例的 `Object[][]`，垃圾榜直接错位）。join 之前先确认 `--live` 里 `java.lang.Object[]` 的存活数能和 `--total` 对上。

怎么读：

| 现象 | 结论 |
|---|---|
| 活对象 ≈ 总对象 | 真泄漏：东西一直活着，GC 拿不走 |
| 总对象远大于活对象（活/总 < 40%） | 分配风暴：堆被瞬间打满后大部分变成垃圾，问题在分配速率不在引用 |
| 某个类占比异常且全是垃圾（如 `TimerTask$Sentinel`、`byte[]`、`Object[]`） | 定位到具体的分配源，去代码里找对应写法 |
| 出现 `Finalizer`、`WeakHashMap$Entry` 巨量 | 弱引用 / finalize 相关的回收滞后 |

**`object_payload_bytes` 不是堆字节。** 它统计的是 HPROF 记录里的字面字节，而 HPROF 的 id 固定 8 字节、压缩指针堆里引用只占 4 字节——对象数组和带引用字段的实例会被系统性放大（本 dump 实测放大 1.3~1.5 倍）。要回答「dump 时堆里占了多少」，只认 MAT 的两个数：

```
堆内对象总大小 = 活对象 shallow（Overview 的 Used heap dump）
              + 索引日志的 Removed N unreachable objects using X bytes
```

HPROF 全量扫描只用来回答「对象数量」和「相对构成」，不要拿它的 MB 去和 Xmx 比。按类排序时，`byte[]` / 基本类型数组的 payload 与堆口径接近，对象数组和普通实例会偏高。

## 6. 精确探测（机器可读，不要靠肉眼）

MAT 支持在批处理里跑单条查询并输出 CSV：

```bash
# 类直方图（活对象，Shallow Heap 精确）
python <skill>/scripts/mat_analyze.py query <dump> --command histogram --limit 50

# 某个类的每个实例占多少 retained（精确，走 dominator tree）
python <skill>/scripts/mat_analyze.py oql <dump> --select \
  "SELECT s.@objectId AS id, s.@retainedHeapSize AS retained FROM com.mysql.cj.jdbc.ConnectionImpl s"
```

已验证可用的属性：`@objectId`、`@retainedHeapSize`。OQL 里带引号或反斜杠在 Windows 上很容易被转义吃掉，遇到解析失败就退回 `histogram` 或直接在 MAT GUI 里粘贴语句——不要在这一步反复试转义。

**连接数要和池容量交叉核对**：`ConnectionImpl` 的实例数如果明显大于各连接池 `maximumPoolSize` 之和，说明存在池外直连或连接未归还，这比"连接多"这个现象本身更有指向性。

```bash
python <skill>/scripts/mat_analyze.py query <dump> --command histogram --limit 100000 \
  | Select-String -Pattern 'ConnectionImpl|HikariPool|PoolEntry'
```

（Linux/macOS 用 `grep -E`。）

想按对象数量而不是大小找问题时，把 `histogram` 的结果按 `Objects` 列排序，往往比按内存更能看出异常（几百万个同类型小对象几乎总是 bug）。

## 7. 判定：重启到底是哪一种

三种完全不同的原因，证据链不一样：

| 结论 | 需要的证据 | 反证 |
|---|---|---|
| **Java OOM** | dump 来自 `java_pid*.hprof`；活对象接近 `-Xmx`；Leak Suspects 充满整个堆 | 活对象远小于堆上限 → 不是 OOM |
| **容器 OOMKilled** | `kubectl describe pod` 里 `Last State: Terminated, Reason: OOMKilled`；容器 memory limit < 估算 RSS | 没有 OOMKilled 记录 |
| **探针超时 / 被驱逐** | 重启前后有 GC 长停顿、CPU 打满、liveness 失败事件 | GC 日志正常 |

RSS 不要靠感觉，按这个算：

```
RSS ≈ Xmx（若 Xms=Xmx 则为恒定值）
    + Metaspace（MaxMetaspaceSize，通常 0.5~0.8G）
    + ReservedCodeCacheSize（常见 256m）
    + 线程数 × 1M 栈（实际按触碰页算，通常 0.2~0.4G）
    + DirectByteBuffer / Netty / 各 agent（ARMS、OTel 都很吃）
    + GC 自身结构（约堆的 2%）
```

线程数取类直方图里 `java.lang.Thread` 的实例数，不要用 Thread Overview 的行数——后者只列部分线程（实测同一 dump 出现 190 / 323 / 379 三个值，只有直方图口径与 JVM 实际线程数对得上）。

**用 limit 反推预算，比估算 RSS 更直接**：`limit − Xmx` 就是全部非堆的额度，先拿 JVM 自己声明的上限去比。例如 limit 6Gi、堆 5g：`6,144 − 5,120 = 1,024 MiB` 可用非堆，而 `MaxMetaspaceSize 800 + ReservedCodeCacheSize 256 = 1,056 MiB` 已经超了——不必估线程和 direct buffer 就能判定"参数与 limit 不匹配"。

把预算拆成"可核算"和"不可测"两栏：可核算 = 堆 + Metaspace + CodeCache + 线程栈（按 1 MB/线程给上限）；不可测 = agent 本地内存、DirectByteBuffer（没设 `-XX:MaxDirectMemorySize` 时默认上限等于 Xmx，是最容易被忽略的出口）、G1 结构。结论里只对可核算部分给硬数字，不可测部分说明需要 NMT 才能定量。

**`-Xms == -Xmx` 是最常见的坑**：进程启动就吃满 Xmx，跟业务负载无关。5G 堆 + 非堆 ≈ 6.5G RSS，容器 limit 给 6Gi 就必然被杀。这种情况下的正确结论是"参数与 limit 不匹配"，不是"内存泄漏"。

拿不到 limit 和重启原因时，**明确说"需要 k8s 事件才能定论"**，不要用堆数据去推断 OOMKill。

## 8. 输出模板

固定用这个结构，先结论后证据：

```markdown
## 结论
<一句话：是不是内存导致 / 谁占了多少>

## 事实
| 项 | 数值 | 来源 |
（活对象大小、对象数、Xmx、Xms、文件大小、容器 limit）

## 占用明细
（常驻与临时分开列，不要混成一张表）
| 占用方（常驻/活对象） | 大小 | 占比 | 依据 |
| 占用方（临时/垃圾） | 对象数 | 大小 | 依据 |

## 判定依据
（为什么是这个结论，列出反证）

## 建议
（按"改配置 → 改代码 → 观测"排序，每条给出具体参数或类名）
```

## 9. 不要做的事

这些都是实际踩过、会浪费大量时间的路径：

- **不要用默认 `-Xmx1024m` 跑 MAT**，几 GB 的 dump 会直接失败或慢到不可用。
- **不要试图在 OSGi 之外调 MAT 的 Java API**。`SnapshotFactory` 依赖 Eclipse 扩展注册表，standalone 一定 NPE。要么用批处理 application，要么用报告。
- **不要用 Java 24/25 跑 MAT 1.16**（未验证），先降到 21。
- **不要把 Class Histogram 的 Retained 列相加**，那是 class 级近似值（`>=`）。
- **不要把 leak suspect 的 "Shortest Path" 当引用链**，它会绕到 classloader，看起来什么都有。
- **不在低内存机器上开 `-keep_unreachable_objects`**。它会让 MAT 在 "Marking reachable objects" 阶段长时间 GC 抖动（实测 80M 对象 / 6 GB 可用内存：11 分钟无进展），最后还是要退回"全量扫描 − 活对象"的算法。
- **不要用 dump 文件大小当堆使用量**，里面还有对象头和记录头；也不要把 `Used heap dump` 当堆水位，那是活对象。
- **不要用原始类名字符串直接 join 两张表**。数组类在 MAT 与 HPROF 里的写法差一层，手工对齐会把 `Object[]` 认成 `Object[][]`。用 `live_vs_dead.py`。
- **不要在 dump 里找"谁调用了 delete"这类业务问题**，堆里只有状态没有时序。
- **不要自己写 HPROF 解析器**（除非必须分析垃圾对象）。要用就直接用 `HprofComposition.java`，格式细节见 `references/hprof-format.md`。

## 参考

- `references/mat-batch.md` — MAT 批处理参数、报告名、OQL 用法与官方链接
- `references/hprof-format.md` — HPROF 记录格式与五个易错点（写解析器时必看）
- `scripts/mat_analyze.py` — MAT 驱动（自检 / 索引 / 报告 / 查询 / HTML 转文本）
- `scripts/HprofComposition.java` — 全量对象构成扫描（含不可达对象）
- `scripts/live_vs_dead.py` — 把 MAT 活对象直方图与全量扫描按类对齐，算出逐类垃圾
