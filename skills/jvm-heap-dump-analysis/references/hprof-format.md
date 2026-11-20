# HPROF 二进制格式与易错点

只有在需要分析**不可达对象**（MAT 会丢弃它们）时才需要读这层。日常分析直接用 MAT；确实要自己流式扫描时，用 `scripts/HprofComposition.java`，不要从零写。

写入端实现可参考 OpenJDK：<https://github.com/openjdk/jdk/blob/master/src/hotspot/share/runtime/heapDumper.cpp>（`HprofTag` 与 `writeHeapDumpHeader` 等函数定义了下面所有结构）。

## 文件头

```
"JAVA PROFILE 1.0.2\0"   // 以 \0 结尾的字符串，长度不固定（别硬编码 19 字节以外的假设）
u4  identifier size       // 4 或 8
u8  timestamp (ms)
```

之后是连续的记录：`u1 tag` + `u4 time` + `u4 length` + `length` 字节内容。

## 顶层记录标签

| tag | 记录 | 内容 |
|---|---|---|
| 0x01 | STRING | id + 字符串字节 |
| 0x02 | LOAD_CLASS | u4 classSerial + id classObjId + u4 stackSerial + id classNameStringId |
| 0x04 | STACK_FRAME | 固定 4 或 8 字节 × 若干 |
| 0x05 | STACK_TRACE | u4 serial + u4 threadSerial + u4 nFrames + nFrames × id |
| 0x0C | HEAP_DUMP | 老格式的堆段 |
| 0x1C | HEAP_DUMP_SEGMENT | 现代 JVM 用的堆段 |
| 0x2C | HEAP_DUMP_END | 堆段结束 |

堆段内部是子记录，按下面的表逐条解析。

## 堆段子记录（只列常用的）

| tag | 子记录 | 布局 |
|---|---|---|
| 0x20 | CLASS_DUMP | id, u4 stack, **6 个 id**(super/loader/signers/PD/reserved/reserved), u4 instanceSize, u2 cpN + 变长表, u2 staticN + 表, u2 instN + 表 |
| 0x21 | INSTANCE_DUMP | id, u4 stack, id classObjId, u4 nbytes, nbytes 字节 |
| 0x22 | OBJECT_ARRAY_DUMP | id, u4 stack, u4 nElems, **id arrayClassId**, nElems × id |
| 0x23 | PRIMITIVE_ARRAY_DUMP | id, u4 stack, u4 nElems, u1 type, 数据 |
| 0xFE | HEAP_DUMP_INFO | u4 heapId, id heapNameId |
| 0xFF | ROOT_UNKNOWN | id |
| 0x01 | ROOT_JNI_GLOBAL | id + id |
| 0x02/0x03 | ROOT_JNI_LOCAL / ROOT_JAVA_FRAME | id + u4 + u4 |
| 0x04 | ROOT_NATIVE_STACK | id + u4 |
| 0x05 | ROOT_STICKY_CLASS | id |
| 0x07 | ROOT_MONITOR_USED | id |
| 0x08 | ROOT_THREAD_OBJECT | id + u4 + u4 |

原始类型编号：4=boolean(1B)、5=char(2B)、6=float(4B)、7=double(8B)、8=byte(1B)、9=short(2B)、10=int(4B)、11=long(8B)。

## 五个必踩的坑

这些坑会让解析器在第 60 MB 左右开始错位，然后报 "unknown sub-record"，症状看起来像文件损坏。

**1. STRING 记录没有内嵌长度字段。**
很多资料写的是 `id + u4 length + bytes`，但 HotSpot 实际写的是 `id + bytes`，字符串长度 = 记录长度 − idSize。按资料多读 4 字节会立刻错位。

**2. CLASS_DUMP 的常量池是变长表，不是定长。**
必须逐条读 `u2 index + u1 type + value`；`type == 2` 时 value 是 id，否则按基本类型长度跳过。按"每个条目 1 字节"跳过会一路错下去。

**3. 静态字段带值，实例字段不带值。**
- 静态字段：`id nameStringId + u1 type + value`（type==2 时 value 是 id）
- 实例字段：`id nameStringId + u1 type` — **到此为止，没有 value**

这条最隐蔽：实例字段类型为 2（对象引用）非常常见，如果照着静态字段的写法多读一个 id，每个对象字段都会多吞 8 字节。

**4. 字段名是 8 字节 id，不是 u2。**
`id nameStringId` 在 64 位 dump 里是 8 字节。写成 `readUnsignedShort()` 会稳定错位。

**5. OBJECT_ARRAY_DUMP 的类 id 是数组类，不是元素类。**
记录里的 `arrayClassId` 指向 `[Ljava.lang.Object;` 这样的**数组类**。如果当成元素类再拼一层 `[L...;`，所有 `Object[]` 都会被写成 `Object[][]`（`java.lang.Object[][]` 与 `java.lang.Object[]` 在 MAT 直方图里是两个独立条目）。这个错误不会让解析崩溃，只会让统计结果错一格——实测中它把 324 万个 `Object[]` 误标成了 `Object[][]`，直接搞错垃圾榜第一名。打印类名时用描述符递归转源码形式（`[Ljava.lang.String;` → `java.lang.String[]`、`[[I` → `int[][]`）。

## 大小口径

- `INSTANCE_DUMP.nbytes` 和数组的数据长度**不含对象头**。
- **HPROF 里的 id 固定 8 字节，而压缩指针堆里引用只占 4 字节。** 所以 `payload` 是"文件记录字节"，不是堆字节：对象数组每多一个元素就多算 4 字节，带引用字段的实例也被放大。实测同一份 dump：HPROF payload 折算 4,224 MiB，MAT 口径只有 3,086 MiB，差 37%。
- 要报"堆内对象总大小"，用 MAT 的两个数相加：`Used heap dump`（活对象 shallow）+ 索引日志 `Removed N unreachable objects using X bytes`。HPROF 扫描只用于对象计数与相对构成。
- 要把类名解析出来，需要两遍扫描：第一遍收集 `LOAD_CLASS` 的 classObjId→nameId，第二遍才把 STRING 与 classObjId 对上。

## 判断 dump 的质量

- 全量对象数 ≫ 活对象数 → dump 未经过 GC，包含垃圾，可以用来分析分配构成。
- 全量对象数 ≈ 活对象数 → dump 是在 GC 后抓的（典型的 `-XX:+HeapDumpOnOutOfMemoryError`），此时"分配风暴"这条解释不成立。
