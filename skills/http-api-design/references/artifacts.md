# 工件

文档和 Schema 标准。

## 提供机器可读 JSON Schema

使用 [prmd](https://github.com/interagent/prmd) 管理 Schema。

验证：

```bash
prmd verify schema.json
```

## 提供人类可读文档

用 `prmd doc` 生成 Markdown 文档。

概述应涵盖：

- 认证（获取和使用令牌）
- API 稳定性和版本控制
- 常见请求/响应头
- 错误序列化格式
- 多语言使用示例

## 提供可执行示例

示例应可直接复制粘贴：

```bash
export TOKEN=... # 从控制台获取
curl -is https://$TOKEN@service.com/users
```

prmd 自动生成每个端点的示例。

## 描述稳定性

标注 API/端点成熟度：

- `prototype` — 实验性，可能变更
- `development` — 趋于稳定，可能有破坏性变更
- `production` — 稳定，此版本无破坏性变更

破坏性变更：递增版本号，创建新 API 版本。
