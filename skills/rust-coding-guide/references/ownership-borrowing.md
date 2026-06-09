# 所有权与借用

## 避免不必要的 clone()

```rust
// ❌ clone() 是"Rust 的胶带"——用于绕过借用检查器
fn bad_process(data: &Data) -> Result<()> {
    let owned = data.clone();  // 为什么需要 clone？
    expensive_operation(owned)
}

// ✅ 审查时问：clone 是否必要？能否用借用？
fn good_process(data: &Data) -> Result<()> {
    expensive_operation(data)  // 传递引用
}

// ✅ 如果确实需要 clone，添加注释说明原因
fn justified_clone(data: &Data) -> Result<()> {
    // Clone needed: data will be moved to spawned task
    let owned = data.clone();
    tokio::spawn(async move {
        process(owned).await
    });
    Ok(())
}
```

## Arc<Mutex<T>> 的使用

```rust
// ❌ Arc<Mutex<T>> 可能隐藏不必要的共享状态
struct BadService {
    cache: Arc<Mutex<HashMap<String, Data>>>,  // 真的需要共享？
}

// ✅ 考虑是否需要共享，或者设计可以避免
struct GoodService {
    cache: HashMap<String, Data>,  // 单一所有者
}

// ✅ 如果确实需要并发访问，考虑更好的数据结构
use dashmap::DashMap;

struct ConcurrentService {
    cache: DashMap<String, Data>,  // 更细粒度的锁
}
```

## Cow (Copy-on-Write) 模式

```rust
use std::borrow::Cow;

// ❌ 总是分配新字符串
fn bad_process_name(name: &str) -> String {
    if name.is_empty() {
        "Unknown".to_string()  // 分配
    } else {
        name.to_string()  // 不必要的分配
    }
}

// ✅ 使用 Cow 避免不必要的分配
fn good_process_name(name: &str) -> Cow<'_, str> {
    if name.is_empty() {
        Cow::Borrowed("Unknown")  // 静态字符串，无分配
    } else {
        Cow::Borrowed(name)  // 借用原始数据
    }
}

// ✅ 只在需要修改时才分配
fn normalize_name(name: &str) -> Cow<'_, str> {
    if name.chars().any(|c| c.is_uppercase()) {
        Cow::Owned(name.to_lowercase())  // 需要修改，分配
    } else {
        Cow::Borrowed(name)  // 无需修改，借用
    }
}
```
