# 性能

## 避免不必要的 collect()

```rust
// ❌ 不必要的 collect——中间分配
fn bad_sum(items: &[i32]) -> i32 {
    items.iter()
        .filter(|x| **x > 0)
        .collect::<Vec<_>>()  // 不必要！
        .iter()
        .sum()
}

// ✅ 惰性迭代
fn good_sum(items: &[i32]) -> i32 {
    items.iter().filter(|x| **x > 0).copied().sum()
}
```

## 字符串拼接

```rust
// ❌ 字符串拼接在循环中重复分配
fn bad_concat(items: &[&str]) -> String {
    let mut s = String::new();
    for item in items {
        s = s + item;  // 每次都重新分配！
    }
    s
}

// ✅ 预分配或用 join
fn good_concat(items: &[&str]) -> String {
    items.join("")
}

// ✅ 使用 with_capacity 预分配
fn good_concat_capacity(items: &[&str]) -> String {
    let total_len: usize = items.iter().map(|s| s.len()).sum();
    let mut result = String::with_capacity(total_len);
    for item in items {
        result.push_str(item);
    }
    result
}

// ✅ 使用 write! 宏
use std::fmt::Write;

fn good_concat_write(items: &[&str]) -> String {
    let mut result = String::new();
    for item in items {
        write!(result, "{}", item).unwrap();
    }
    result
}
```

## 避免不必要的分配

```rust
// ❌ 不必要的 Vec 分配
fn bad_check_any(items: &[Item]) -> bool {
    let filtered: Vec<_> = items.iter()
        .filter(|i| i.is_valid())
        .collect();
    !filtered.is_empty()
}

// ✅ 使用迭代器方法
fn good_check_any(items: &[Item]) -> bool {
    items.iter().any(|i| i.is_valid())
}

// ❌ String::from 用于静态字符串
fn bad_static() -> String {
    String::from("error message")  // 运行时分配
}

// ✅ 返回 &'static str
fn good_static() -> &'static str {
    "error message"  // 无分配
}
```
