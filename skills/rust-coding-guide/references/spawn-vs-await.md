# spawn vs await

## 何时使用 spawn

```rust
// ❌ 不必要的 spawn——增加开销，失去结构化并发
async fn bad_unnecessary_spawn() {
    let handle = tokio::spawn(async {
        simple_operation().await
    });
    handle.await.unwrap();  // 为什么不直接 await？
}

// ✅ 直接 await 简单操作
async fn good_direct_await() {
    simple_operation().await;
}

// ✅ spawn 用于真正的并行执行
async fn good_parallel_spawn() {
    let task1 = tokio::spawn(fetch_from_service_a());
    let task2 = tokio::spawn(fetch_from_service_b());

    // 两个请求并行执行
    let (result1, result2) = tokio::try_join!(task1, task2)?;
}

// ✅ spawn 用于后台任务（fire-and-forget）
async fn good_background_spawn() {
    // 启动后台任务，不等待完成
    tokio::spawn(async {
        cleanup_old_sessions().await;
        log_metrics().await;
    });

    // 继续执行其他工作
    handle_request().await;
}
```

## spawn 的 'static 要求

```rust
// ❌ spawn 的 Future 必须是 'static
async fn bad_spawn_borrow(data: &Data) {
    tokio::spawn(async {
        process(data).await;  // Error: `data` 不是 'static
    });
}

// ✅ 方案1：克隆数据
async fn good_spawn_clone(data: &Data) {
    let owned = data.clone();
    tokio::spawn(async move {
        process(&owned).await;
    });
}

// ✅ 方案2：使用 Arc 共享
async fn good_spawn_arc(data: Arc<Data>) {
    let data = Arc::clone(&data);
    tokio::spawn(async move {
        process(&data).await;
    });
}

// ✅ 方案3：使用作用域任务（tokio-scoped 或 async-scoped）
async fn good_scoped_spawn(data: &Data) {
    // 假设使用 async-scoped crate
    async_scoped::scope(|s| async {
        s.spawn(async {
            process(data).await;  // 可以借用
        });
    }).await;
}
```

## JoinHandle 错误处理

```rust
// ❌ 忽略 spawn 的错误
async fn bad_ignore_spawn_error() {
    let handle = tokio::spawn(async {
        risky_operation().await
    });
    let _ = handle.await;  // 忽略了 panic 和错误
}

// ✅ 正确处理 JoinHandle 结果
async fn good_handle_spawn_error() -> Result<()> {
    let handle = tokio::spawn(async {
        risky_operation().await
    });

    match handle.await {
        Ok(Ok(result)) => {
            // 任务成功完成
            process_result(result);
            Ok(())
        }
        Ok(Err(e)) => {
            // 任务内部错误
            Err(e.into())
        }
        Err(join_err) => {
            // 任务 panic 或被取消
            if join_err.is_panic() {
                error!("Task panicked: {:?}", join_err);
            }
            Err(anyhow!("Task failed: {}", join_err))
        }
    }
}
```

## 结构化并发 vs spawn

```rust
// ✅ 优先使用 join!（结构化并发）
async fn structured_concurrency() -> Result<(A, B, C)> {
    // 所有任务在同一个作用域内
    // 如果任何一个失败，其他的会被取消
    tokio::try_join!(
        fetch_a(),
        fetch_b(),
        fetch_c()
    )
}

// ✅ 使用 spawn 时考虑任务生命周期
struct TaskManager {
    handles: Vec<JoinHandle<()>>,
}

impl TaskManager {
    async fn shutdown(self) {
        // 优雅关闭：等待所有任务完成
        for handle in self.handles {
            if let Err(e) = handle.await {
                error!("Task failed during shutdown: {}", e);
            }
        }
    }

    async fn abort_all(self) {
        // 强制关闭：取消所有任务
        for handle in self.handles {
            handle.abort();
        }
    }
}
```
