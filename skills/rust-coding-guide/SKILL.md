---
name: rust-coding-guide
description: Use when writing, modifying, or reviewing Rust code. Covers ownership/borrowing, unsafe code, async/concurrency, cancel safety, error handling, performance, trait design, and module organization — for both authoring new code and conducting code reviews.
license: MIT
---

# Rust 编码与审查指南

Rust 编译器能捕获内存安全问题，但编写和审查代码时都需要关注编译器无法检测的问题——业务逻辑、API 设计、性能、取消安全性和可维护性。

## 核心规则

> 完整规则说明与代码示例见对应 references 文件

1. **clone() 必须有正当理由** — 编写时优先用借用，审查时问是否必要，必要时注释说明原因
2. **unsafe 代码必须有完整安全文档** — 每个 unsafe 块有 SAFETY 注释，unsafe fn 有 `# Safety` 文档节
3. **async 上下文禁止阻塞操作** — 使用异步 API 或 `spawn_blocking`，不跨 `.await` 持有 `std::sync` 锁
4. **`select!` 中的 Future 必须取消安全** — 取消不会导致数据丢失或不一致状态
5. **spawn 只用于真正需要并行的场景** — 简单操作直接 await，`JoinHandle` 结果必须正确处理
6. **库用 thiserror，应用用 anyhow** — 使用 `context` 保留错误链，不在生产代码 `unwrap`/`expect`
7. **避免不必要的分配** — 惰性迭代代替 `collect()`，预分配字符串，`Cow` 减少克隆
8. **Trait 设计克制** — 只在需要多态时创建 trait，优先泛型（静态分发）而非 trait 对象
9. **模块组织禁用 `mod.rs`** — Rust 2018+ 统一用 `模块名.rs` + 同名目录，避免 `mod.rs` 导致的文件辨识困难

## 工作方式

1. 编译器能捕获的问题交给编译器，编写和审查时都关注编译器无法检测的逻辑、设计、安全问题
2. 每个 unsafe 必须解释：为什么安全？什么不变量？
3. async 函数确认取消安全性，尤其是在 `select!` 和超时场景中
4. 错误类型区分库（thiserror）和应用（anyhow），错误上下文完整
5. 性能关键路径关注分配、clone、collect，热路径避免不必要开销
6. Trait 不过度抽象，泛型优先于 trait 对象

## 常见违规点

- `clone()` 无正当理由，用于绕过借用检查器
- unsafe 块缺少 SAFETY 注释，unsafe fn 缺少 `# Safety` 文档
- async 上下文使用 `std::fs`、`thread::sleep` 等阻塞 API
- 跨 `.await` 持有 `std::sync::Mutex`
- `select!` 中使用取消不安全的 Future（如 `read_exact`）
- 不必要的 `tokio::spawn`，简单操作应直接 await
- spawn 的 `JoinHandle` 结果被忽略（`let _ = handle.await`）
- 库代码使用 `anyhow::Result`
- 错误上下文被吞掉（`map_err(|_| ...)`）
- 不必要的 `collect()` 导致中间分配
- 循环中字符串拼接未预分配
- 生产代码使用 `unwrap`/`expect`
- `Arc<Mutex<T>>` 滥用，未考虑是否有更简单的单一所有者设计
- Trait 过度抽象，不是所有东西都需要 trait
- 新建子模块仍使用 `mod.rs`，未采用 Rust 2018+ 的扁平化模块文件组织

## 参考文件

深入某一领域时优先查阅对应文档：

- `./references/ownership-borrowing.md`：所有权与借用（clone、Arc<Mutex>、Cow）
- `./references/unsafe-code.md`：Unsafe 代码审查（SAFETY 注释、FFI、性能关键路径）
- `./references/async-code.md`：异步代码（阻塞操作、Mutex 与 await、async trait）
- `./references/cancel-safety.md`：取消安全性（select!、tokio::pin!、文档化）
- `./references/spawn-vs-await.md`：spawn vs await（并行、'static 要求、JoinHandle、结构化并发）
- `./references/error-handling.md`：错误处理（thiserror vs anyhow、上下文、错误类型设计）
- `./references/performance.md`：性能（collect、字符串拼接、分配优化）
- `./references/trait-design.md`：Trait 设计（过度抽象、trait 对象 vs 泛型）
- `./references/module-organization.md`：模块组织方式（禁用 `mod.rs`，采用 Rust 2018+ 扁平化结构）
- `./references/review-checklist.md`：完整审查清单

## 输出要求

安静应用规范，不输出多余套话。生成代码时把注释直接写进代码，仅说明真正影响本次修改的规则。
