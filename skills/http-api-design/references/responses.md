# 响应

响应结构、状态码和错误处理。

## 返回适当的状态码

| 码 | 含义 | 场景 |
|------|------|------|
| 200 | OK | GET，同步 POST/DELETE/PUT |
| 201 | Created | POST 或 PUT 创建新资源。包含 `Location` 头 |
| 202 | Accepted | 异步 POST/PUT/DELETE |
| 206 | Partial Content | GET 带 Range 头 |
| 401 | Unauthorized | 用户未认证 |
| 403 | Forbidden | 用户无权限 |
| 422 | Unprocessable Entity | 请求合法但参数无效 |
| 429 | Too Many Requests | 限流 |
| 500 | Internal Server Error | 服务端错误 |

## 提供完整资源

200 和 201 响应返回完整资源表示。

`PUT` 和 `DELETE` 返回完整对象：

```json
// DELETE /apps/1f9b/domains/0fd4
// 200 OK
{
  "created_at": "2012-01-01T12:00:00Z",
  "hostname": "subdomain.example.com",
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "updated_at": "2012-01-01T12:00:00Z"
}
```

202 响应返回空体：

```json
// DELETE /apps/1f9b/dynos/05bd
// 202 Accepted
{}
```

## 提供资源 UUID

每个资源都有 `id` 属性。优先使用 UUID。

不要使用自动递增 ID（非全局唯一）。

格式：小写 8-4-4-4-12：

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef"
}
```

## 提供标准时间戳

默认包含 `created_at` 和 `updated_at`：

```json
{
  "created_at": "2012-01-01T12:00:00Z",
  "updated_at": "2012-01-01T13:00:00Z"
}
```

时间戳无意义的资源可省略。

## 嵌套外键关系

外键引用使用嵌套对象：

**正确：**
```json
{
  "name": "service-production",
  "owner": {
    "id": "5d8201b0..."
  }
}
```

**错误：**
```json
{
  "name": "service-production",
  "owner_id": "5d8201b0..."
}
```

允许内联相关数据而不改变结构：

```json
{
  "name": "service-production",
  "owner": {
    "id": "5d8201b0...",
    "email": "alice@heroku.com"
  }
}
```

**规则：** 只提供外键（id/slug/email）或完整记录。不要部分子集（导致不一致）。

## 生成结构化错误

错误响应**必须**使用扁平结构，**不要**用 `{error: {...}}` 包装：

```json
// 429 Too Many Requests
{
  "id": "rate_limit",
  "message": "账号已达 API 限流上限。",
  "url": "https://docs.service.com/rate-limits"
}
```

字段：
- `id` — 机器可读错误码，小写下划线
- `message` — 人类可读描述，可直接展示给用户
- `url` — 可选文档链接

**错误示例：**

```json
// 422 验证错误
{
  "id": "invalid_params",
  "message": "请求包含无效参数。",
  "errors": [
    {"id": "missing_field", "message": "名称为必填项。"},
    {"id": "invalid_format", "message": "邮箱格式不正确。"}
  ]
}

// 401 未认证
{"id": "unauthorized", "message": "未提供有效的认证令牌。"}

// 403 无权限
{"id": "forbidden", "message": "您无权访问此资源。"}

// 404 未找到
{"id": "not_found", "message": "请求的资源不存在。"}
```

为客户端文档化所有可能的错误 ID。

## 显示限流状态

每个响应包含 `RateLimit-Remaining` 头。

使用令牌桶算法进行限流。

## 标准响应类型

JSON 类型规则：

| 类型 | 可接受值 | 备注 |
|------|----------|------|
| String | string, null | |
| Boolean | true, false | 不可为 null |
| Number | number, null | 精度 >15 位用字符串 |
| Array | array | 空时返回 `[]` 而非 null |
| Object | object, null | |

## UTC 时间用 ISO8601

只接受和返回 UTC 时间：

```json
{
  "finished_at": "2012-01-01T12:00:00Z"
}
```

## JSON 保持压缩

默认响应为压缩格式（不美化）：

```json
{"beta":false,"email":"alice@heroku.com","id":"01234567-89ab-cdef-0123-456789abcdef"}
```

可选美化通过查询参数或 Accept 头：

```
?pretty=true
Accept: application/vnd.heroku+json; version=3; indent=4;
```
