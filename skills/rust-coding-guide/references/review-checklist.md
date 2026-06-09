# Rust Review Checklist

## 编译器不能捕获的问题

**业务逻辑正确性**
- [ ] 边界条件处理正确
- [ ] 状态机转换完整
- [ ] 并发场景下的竞态条件

**API 设计**
- [ ] 公共 API 难以误用
- [ ] 类型签名清晰表达意图
- [ ] 错误类型粒度合适

## 所有权与借用

- [ ] clone() 是有意为之，文档说明了原因
- [ ] Arc<Mutex<T>> 真的需要共享状态吗？
- [ ] RefCell 的使用有正当理由
- [ ] 生命周期不过度复杂
- [ ] 考虑使用 Cow 避免不必要的分配

## Unsafe 代码（最重要）

- [ ] 每个 unsafe 块有 SAFETY 注释
- [ ] unsafe fn 有 `# Safety` 文档节
- [ ] 解释了为什么是安全的，不只是做什么
- [ ] 列出了必须维护的不变量
- [ ] unsafe 边界尽可能小
- [ ] 考虑过是否有 safe 替代方案

## 异步/并发

- [ ] 没有在 async 中阻塞（std::fs、thread::sleep）
- [ ] 没有跨 .await 持有 std::sync 锁
- [ ] spawn 的任务满足 'static
- [ ] 锁的获取顺序一致
- [ ] Channel 缓冲区大小合理

## 取消安全性

- [ ] select! 中的 Future 是取消安全的
- [ ] 文档化了 async 函数的取消安全性
- [ ] 取消不会导致数据丢失或不一致状态
- [ ] 使用 tokio::pin! 正确处理需要重用的 Future

## spawn vs await

- [ ] spawn 只用于真正需要并行的场景
- [ ] 简单操作直接 await，不要 spawn
- [ ] spawn 的 JoinHandle 结果被正确处理
- [ ] 考虑任务的生命周期和关闭策略
- [ ] 优先使用 join!/try_join! 进行结构化并发

## 错误处理

- [ ] 库：thiserror 定义结构化错误
- [ ] 应用：anyhow + context
- [ ] 没有生产代码 unwrap/expect
- [ ] 错误消息对调试有帮助
- [ ] must_use 返回值被处理
- [ ] 使用 `#[source]` 保留错误链

## 性能

- [ ] 避免不必要的 collect()
- [ ] 大数据传引用
- [ ] 字符串用 with_capacity 或 write!
- [ ] impl Trait vs Box<dyn Trait> 选择合理
- [ ] 热路径避免分配
- [ ] 考虑使用 Cow 减少克隆

## 模块组织

- [ ] 新建模块使用 `模块名.rs` + 同名目录，不使用 `mod.rs`
- [ ] 同一层级不混用旧方式（`mod.rs`）与新方式
- [ ] 无子模块时直接用单文件，不建多余目录
- [ ] 深层嵌套模块同样遵守扁平化命名规则

## 代码质量

- [ ] cargo clippy 零警告
- [ ] cargo fmt 格式化
- [ ] 文档注释完整
- [ ] 测试覆盖边界条件
- [ ] 公共 API 有文档示例
