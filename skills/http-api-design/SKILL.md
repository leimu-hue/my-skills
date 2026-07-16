---
name: http-api-design
description: 设计和审查 HTTP+JSON API，遵循 Heroku 风格的成熟规范。当用户提到 API 设计、REST API、HTTP 端点、API 审查、端点命名、状态码、JSON 响应格式、API 版本控制、错误处理、分页，或要创建/重构 Web API 时触发。也适用于 API 设计问题、最佳实践，或审查现有 API 代码。即使用户只提到"接口设计"、"接口规范"、"写个 API"、"设计后端接口"也应触发。
---

# HTTP API 设计指南

设计一致、结构良好的 HTTP+JSON API 的技能。

来源：Heroku Platform API 规范。

## 使用场景

- 设计新的 API 端点
- 审查现有 API 代码的一致性
- 重构 API 结构
- 回答 API 设计问题
- 生成 API 文档模板

## 核心流程

1. 确定资源类型（单例 vs 集合）
2. 应用命名规范（复数名词、小写）
3. 选择合适的 HTTP 方法（GET/POST/PUT/DELETE）
4. 设计响应结构
5. 选择状态码
6. 添加元数据头

## 快速参考

### URL 结构

```
# 集合
GET    /resources          → 列表
POST   /resources          → 创建
GET    /resources/:id      → 读取
PUT    /resources/:id      → 更新（或创建，见下方说明）
DELETE /resources/:id      → 删除

# 操作（状态变更等非 CRUD 行为）
POST   /resources/:id/actions/:action

# 嵌套（最小化深度）
/orgs/:org_id/apps
/apps/:app_id/dynos
/dynos/:dyno_id
```

### PUT 的双重语义

PUT 根据资源是否存在返回不同状态码：

- 资源已存在 → 更新 → `200 OK`（返回完整资源）
- 资源不存在 → 创建 → `201 Created`（返回完整资源 + `Location` 头）

如果只需创建、不允许覆盖已有资源，用 `POST`。

### 操作端点（Actions）

当行为不是简单 CRUD 时，用 `actions` 子路径：

```
POST /orders/{id}/actions/confirm      → 确认订单
POST /orders/{id}/actions/cancel       → 取消订单
POST /posts/{id}/actions/publish       → 发布文章
POST /posts/{id}/actions/archive       → 归档文章
POST /servers/{id}/actions/restart     → 重启服务器
```

集合级操作：

```
POST /actions/restart/servers          → 重启所有服务器
POST /actions/expire/sessions          → 过期所有会话
```

### 状态码

| 码 | 场景 |
|------|------|
| 200 | GET，同步 POST/DELETE/PUT 更新 |
| 201 | POST 或 PUT 创建新资源 |
| 202 | 异步 POST/PUT/DELETE |
| 206 | 部分 GET（Range 头） |
| 401 | 未认证 |
| 403 | 无权限 |
| 422 | 参数无效 |
| 429 | 限流 |
| 500 | 服务端错误 |

### 必需头

```
# 请求
Accept: application/vnd.api+json; version=1
Content-Type: application/json

# 响应
Content-Type: application/json
ETag: "resource-version"
Request-Id: <uuid>
RateLimit-Remaining: <count>
```

### 响应体规则

- `id` 字段用 UUID：`"id": "01234567-89ab-cdef-0123-456789abcdef"`
- 包含时间戳：`created_at`、`updated_at`（ISO8601 UTC）
- 嵌套外键：`"owner": {"id": "..."}` 而非 `"owner_id": "..."`
- 200/201 返回完整资源
- 202 返回空 `{}`
- JSON 压缩（默认不美化）
- 空数组 `[]` 而非 `null`

### 错误格式（必须用此结构）

错误响应**必须**使用扁平的 `{id, message, url}` 结构，**不要**用 `{error: {...}}` 包装：

```json
{
  "id": "rate_limit",
  "message": "账号已达 API 限流上限。",
  "url": "https://docs.service.com/rate-limits"
}
```

字段说明：
- `id` — 机器可读错误码，小写下划线
- `message` — 人类可读描述，可直接展示给用户
- `url` — 可选，指向错误文档的链接

多个验证错误时，在顶层加 `errors` 数组：

```json
{
  "id": "invalid_params",
  "message": "请求包含无效参数。",
  "url": "https://docs.service.com/errors/invalid_params",
  "errors": [
    {"id": "missing_field", "message": "名称为必填项。"},
    {"id": "invalid_format", "message": "邮箱格式不正确。"}
  ]
}
```

### 命名规范

- 路径：小写 + 连字符（`/app-setups`）
- 属性：小写 + 下划线（`service_class`）
- 资源：复数名词（`/users`、`/apps`）
- 单例：单数（`/status`）

## 完整示例

创建文章的完整请求/响应：

```bash
curl -X POST https://api.example.com/posts \
  -H "Accept: application/vnd.api+json; version=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"入门指南","body":"这是正文内容...","tags":["tutorial"]}'
```

成功响应 `201 Created`：

```json
{
  "id": "f7e8d9c0-b1a2-3456-7890-abcdef123456",
  "title": "入门指南",
  "slug": "ru-men-zhi-nan",
  "body": "这是正文内容...",
  "tags": ["tutorial"],
  "status": "draft",
  "author": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "username": "alice"
  },
  "created_at": "2026-07-16T10:30:00Z",
  "updated_at": "2026-07-16T10:30:00Z"
}
```

错误响应 `422 Unprocessable Entity`：

```json
{
  "id": "invalid_params",
  "message": "请求包含无效参数。",
  "errors": [
    {"id": "missing_field", "message": "标题为必填项。"}
  ]
}
```

## 详细规则

阅读 `references/` 获取完整指南：

- `foundations.md` — 版本控制、缓存、分页
- `requests.md` — URL 设计、方法、请求体格式
- `responses.md` — 状态码、响应结构、错误处理
- `artifacts.md` — 文档、Schema、示例

## 审查清单

审查现有 API 时检查：

- [ ] 版本在 Accept 头中
- [ ] 资源名用复数
- [ ] 路径小写加连字符
- [ ] UUID 标识符
- [ ] 正确的状态码（200/201/202）
- [ ] 错误格式为扁平 `{id, message, url}`
- [ ] ETag 缓存头
- [ ] Request-Id 追踪
- [ ] 限流头
- [ ] ISO8601 时间戳
- [ ] 嵌套外键
- [ ] JSON 压缩输出
