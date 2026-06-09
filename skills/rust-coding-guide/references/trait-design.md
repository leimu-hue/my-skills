# Trait 设计

## 避免过度抽象

```rust
// ❌ 过度抽象——不是 Java，不需要 Interface 一切
trait Processor { fn process(&self); }
trait Handler { fn handle(&self); }
trait Manager { fn manage(&self); }  // Trait 过多

// ✅ 只在需要多态时创建 trait
// 具体类型通常更简单、更快
struct DataProcessor {
    config: Config,
}

impl DataProcessor {
    fn process(&self, data: &Data) -> Result<Output> {
        // 直接实现
    }
}
```

## Trait 对象 vs 泛型

```rust
// ❌ 不必要的 trait 对象（动态分发）
fn bad_process(handler: &dyn Handler) {
    handler.handle();  // 虚表调用
}

// ✅ 使用泛型（静态分发，可内联）
fn good_process<H: Handler>(handler: &H) {
    handler.handle();  // 可能被内联
}

// ✅ trait 对象适用场景：异构集合
fn store_handlers(handlers: Vec<Box<dyn Handler>>) {
    // 需要存储不同类型的 handlers
}

// ✅ 使用 impl Trait 返回类型
fn create_handler() -> impl Handler {
    ConcreteHandler::new()
}
```
