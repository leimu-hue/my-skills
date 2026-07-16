# 基础

所有 API 设计决策的基本原则。

## 隔离关注点

保持请求/响应生命周期各部分分离：

- **路径** → 资源身份
- **正文** → 内容载荷
- **头** → 元数据

查询参数可用于边缘场景，但优先使用头（更灵活）。

## Accepts 头要求版本控制

每个请求必须显式指定 API 版本：

```
Accept: application/vnd.heroku+json; version=3
```

不要使用默认版本（未来难以更改）。

## 支持 ETags 缓存

所有响应包含 `ETag` 头，标识资源版本。

客户端使用 `If-None-Match` 头检查缓存新鲜度。

## 提供 Request-Id

每个响应包含 `Request-Id` 头（UUID）。

支持跨客户端、服务器和后端服务的追踪。

## 用 Range 头分页

使用 `Range` 头拆分大响应：

```
Range: items=0-24
```

响应包含 `Content-Range` 显示总数和返回子集。
