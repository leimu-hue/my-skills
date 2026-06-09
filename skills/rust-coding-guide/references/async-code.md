# 异步代码

## 避免阻塞操作

```rust
// ❌ 在 async 上下文中阻塞——会饿死其他任务
async fn bad_async() {
    let data = std::fs::read_to_string("file.txt").unwrap();  // 阻塞！
    std::thread::sleep(Duration::from_secs(1));  // 阻塞！
}

// ✅ 使用异步 API
async fn good_async() -> Result<String> {
    let data = tokio::fs::read_to_string("file.txt").await?;
    tokio::time::sleep(Duration::from_secs(1)).await;
    Ok(data)
}

// ✅ 如果必须使用阻塞操作，用 spawn_blocking
async fn with_blocking() -> Result<Data> {
    let result = tokio::task::spawn_blocking(|| {
        // 这里可以安全地进行阻塞操作
        expensive_cpu_computation()
    }).await?;
    Ok(result)
}
```

## Mutex 和 .await

```rust
// ❌ 跨 .await 持有 std::sync::Mutex——可能死锁
async fn bad_lock(mutex: &std::sync::Mutex<Data>) {
    let guard = mutex.lock().unwrap();
    async_operation().await;  // 持锁等待！
    process(&guard);
}

// ✅ 方案1：最小化锁范围
async fn good_lock_scoped(mutex: &std::sync::Mutex<Data>) {
    let data = {
        let guard = mutex.lock().unwrap();
        guard.clone()  // 立即释放锁
    };
    async_operation().await;
    process(&data);
}

// ✅ 方案2：使用 tokio::sync::Mutex（可跨 await）
async fn good_lock_tokio(mutex: &tokio::sync::Mutex<Data>) {
    let guard = mutex.lock().await;
    async_operation().await;  // OK: tokio Mutex 设计为可跨 await
    process(&guard);
}

// 💡 选择指南：
// - std::sync::Mutex：低竞争、短临界区、不跨 await
// - tokio::sync::Mutex：需要跨 await、高竞争场景
```

## 异步 trait 方法

```rust
// ❌ async trait 方法的陷阱（旧版本）
#[async_trait]
trait BadRepository {
    async fn find(&self, id: i64) -> Option<Entity>;  // 隐式 Box
}

// ✅ Rust 1.75+：原生 async trait 方法
trait Repository {
    async fn find(&self, id: i64) -> Option<Entity>;

    // 返回具体 Future 类型以避免 allocation
    fn find_many(&self, ids: &[i64]) -> impl Future<Output = Vec<Entity>> + Send;
}

// ✅ 对于需要 dyn 的场景
trait DynRepository: Send + Sync {
    fn find(&self, id: i64) -> Pin<Box<dyn Future<Output = Option<Entity>> + Send + '_>>;
}
```
