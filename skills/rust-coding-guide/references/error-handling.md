# 错误处理

## 库 vs 应用的错误类型

```rust
// ❌ 库代码用 anyhow——调用者无法 match 错误
pub fn parse_config(s: &str) -> anyhow::Result<Config> { ... }

// ✅ 库用 thiserror，应用用 anyhow
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("invalid syntax at line {line}: {message}")]
    Syntax { line: usize, message: String },
    #[error("missing required field: {0}")]
    MissingField(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub fn parse_config(s: &str) -> Result<Config, ConfigError> { ... }
```

## 保留错误上下文

```rust
// ❌ 吞掉错误上下文
fn bad_error() -> Result<()> {
    operation().map_err(|_| anyhow!("failed"))?;  // 原始错误丢失
    Ok(())
}

// ✅ 使用 context 保留错误链
fn good_error() -> Result<()> {
    operation().context("failed to perform operation")?;
    Ok(())
}

// ✅ 使用 with_context 进行懒计算
fn good_error_lazy() -> Result<()> {
    operation()
        .with_context(|| format!("failed to process file: {}", filename))?;
    Ok(())
}
```

## 错误类型设计

```rust
// ✅ 使用 #[source] 保留错误链
#[derive(Debug, thiserror::Error)]
pub enum ServiceError {
    #[error("database error")]
    Database(#[source] sqlx::Error),

    #[error("network error: {message}")]
    Network {
        message: String,
        #[source]
        source: reqwest::Error,
    },

    #[error("validation failed: {0}")]
    Validation(String),
}

// ✅ 为常见转换实现 From
impl From<sqlx::Error> for ServiceError {
    fn from(err: sqlx::Error) -> Self {
        ServiceError::Database(err)
    }
}
```
