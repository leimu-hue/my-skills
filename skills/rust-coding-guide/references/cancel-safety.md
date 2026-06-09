# 取消安全性

## 什么是取消安全

```rust
// 当一个 Future 在 .await 点被 drop 时，它处于什么状态？
// 取消安全的 Future：可以在任何 await 点安全取消
// 取消不安全的 Future：取消可能导致数据丢失或不一致状态

// ❌ 取消不安全的例子
async fn cancel_unsafe(conn: &mut Connection) -> Result<()> {
    let data = receive_data().await;  // 如果这里被取消...
    conn.send_ack().await;  // ...确认永远不会发送，数据可能丢失
    Ok(())
}

// ✅ 取消安全的版本
async fn cancel_safe(conn: &mut Connection) -> Result<()> {
    // 使用事务或原子操作确保一致性
    let transaction = conn.begin_transaction().await?;
    let data = receive_data().await;
    transaction.commit_with_ack(data).await?;  // 原子操作
    Ok(())
}
```

## select! 中的取消安全

```rust
use tokio::select;

// ❌ 在 select! 中使用取消不安全的 Future
async fn bad_select(stream: &mut TcpStream) {
    let mut buffer = vec![0u8; 1024];
    loop {
        select! {
            // read_exact 不是取消安全的：timeout 先完成时，
            // 已经读进 buffer 的部分字节会随 Future 一起丢弃
            result = stream.read_exact(&mut buffer) => {
                result?;
                handle_data(&buffer);
            }
            _ = tokio::time::sleep(Duration::from_secs(5)) => {
                println!("Timeout");
            }
        }
    }
}

// ✅ 使用取消安全的 API
async fn good_select(stream: &mut TcpStream) {
    let mut buffer = vec![0u8; 1024];
    loop {
        select! {
            // read 是取消安全的：被取消时未读取的数据仍留在流中
            // 真的需要按定长读取时，把 read_exact 丢到单独的 task 里，
            // 这里 select! 它的 JoinHandle，取消就不会丢字节
            result = stream.read(&mut buffer) => {
                match result {
                    Ok(0) => break,  // EOF
                    Ok(n) => handle_data(&buffer[..n]),
                    Err(e) => return Err(e),
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(5)) => {
                println!("Timeout, retrying...");
            }
        }
    }
}

// ✅ 使用 tokio::pin! 确保 Future 可以安全重用
async fn pinned_select() {
    let sleep = tokio::time::sleep(Duration::from_secs(10));
    tokio::pin!(sleep);

    loop {
        select! {
            _ = &mut sleep => {
                println!("Timer elapsed");
                break;
            }
            data = receive_data() => {
                process(data).await;
                // sleep 继续倒计时，不会重置
            }
        }
    }
}
```

## 文档化取消安全性

```rust
/// Reads a complete message from the stream.
///
/// # Cancel Safety
///
/// This method is **not** cancel safe. If cancelled while reading,
/// partial data may be lost and the stream state becomes undefined.
/// Use `read_message_cancel_safe` if cancellation is expected.
async fn read_message(stream: &mut TcpStream) -> Result<Message> {
    let len = stream.read_u32().await?;
    let mut buffer = vec![0u8; len as usize];
    stream.read_exact(&mut buffer).await?;
    Ok(Message::from_bytes(&buffer))
}

/// Reads a message with cancel safety.
///
/// # Cancel Safety
///
/// This method is cancel safe. If cancelled, any partial data
/// is preserved in the internal buffer for the next call.
async fn read_message_cancel_safe(reader: &mut BufferedReader) -> Result<Message> {
    reader.read_message_buffered().await
}
```
