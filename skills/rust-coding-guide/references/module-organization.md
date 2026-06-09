# 模块组织方式

> Rust 2018 edition 起，官方推荐用扁平化的文件命名取代 `mod.rs`，使目录结构更直观、文件名更易辨识。

## 旧方式 vs 新方式

### 旧方式（`mod.rs`，Rust 2015 遗留，不再推荐）

```
src/
├── lib.rs
└── network/
    ├── mod.rs          ← 模块入口，文件名无法直接看出所属模块
    ├── server.rs
    └── client.rs
```

```rust
// src/network/mod.rs
pub mod server;
pub mod client;
```

**问题：**
- 打开多个 tab 时全是 `mod.rs`，难以辨识对应模块
- 文件搜索时 `mod.rs` 命中多个结果，定位困难
- 与 Rust 2018+ 的路径系统不一致

### 新方式（Rust 2018+，推荐）

```
src/
├── lib.rs
├── network.rs           ← 模块入口，文件名即模块名
└── network/
    ├── server.rs
    └── client.rs
```

```rust
// src/network.rs
pub mod server;
pub mod client;
```

**优点：**
- 文件名直接体现模块名，tab 和搜索结果一目了然
- 与 `use crate::network::server` 路径完全对应
- 官方推荐，rust-analyzer 等工具完整支持

---

## 规则说明

### 新建模块统一使用 `模块名.rs`

```rust
// ❌ 旧方式：使用 mod.rs
// src/auth/mod.rs
pub mod token;
pub mod session;

// ✅ 新方式：模块名.rs + 同名目录
// src/auth.rs
pub mod token;
pub mod session;
```

目录对比：

```
# ❌ 旧方式
src/auth/
├── mod.rs
├── token.rs
└── session.rs

# ✅ 新方式
src/
├── auth.rs
└── auth/
    ├── token.rs
    └── session.rs
```

### 无子模块时直接用单文件

```rust
// 无子模块的模块，直接用单文件即可
// src/config.rs（不需要 src/config/mod.rs 或 src/config/ 目录）
pub struct Config { /* ... */ }
```

### 深层嵌套同样适用

```
src/
├── lib.rs
├── api.rs               ← api 模块入口
└── api/
    ├── v1.rs            ← api::v1 模块入口
    ├── v1/
    │   ├── users.rs
    │   └── orders.rs
    ├── v2.rs            ← api::v2 模块入口
    └── v2/
        ├── users.rs
        └── orders.rs
```

```rust
// src/api.rs
pub mod v1;
pub mod v2;

// src/api/v1.rs
pub mod users;
pub mod orders;
```

### `lib.rs` / `main.rs` 保持不变

`lib.rs` 和 `main.rs` 是 crate 根，不受此规则影响：

```rust
// src/lib.rs（crate 根，保持原样）
pub mod network;
pub mod auth;
pub mod config;
```

---

## 迁移旧项目

将已有 `mod.rs` 迁移到新方式只需两步：

```bash
# 1. 将 mod.rs 重命名为 模块名.rs，并移到上级目录
mv src/network/mod.rs src/network.rs

# 2. 子模块文件保持不动（仍在 src/network/ 目录下）
```

内容无需任何改动，`pub mod server;` 等声明在新路径下同样生效。

---

## 常见违规场景

```
# ❌ 新增模块时创建了 mod.rs
src/payment/
├── mod.rs        ← 不应新建 mod.rs
├── gateway.rs
└── refund.rs

# ✅ 正确做法
src/
├── payment.rs    ← 模块入口
└── payment/
    ├── gateway.rs
    └── refund.rs
```

## 注意事项

- `cargo new` 和 `cargo init` 生成的项目模板已采用新方式
- 两种方式不能在同一模块层级混用，否则会触发编译错误 `E0761`
- 旧项目迁移时，整个模块树应统一切换，不要逐步替换
